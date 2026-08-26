import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  addMoney,
  formatMoney,
  minMoney,
  money,
  multiplyMoney,
  subtractMoney,
} from '../../../common/utils/money';
import { FulfillmentType } from '../../catalog/enums/fulfillment-type.enum';
import { ProductStatus } from '../../catalog/enums/product-status.enum';
import { VariantStatus } from '../../catalog/enums/variant-status.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { InventoryService } from '../../inventory/services/inventory.service';
import { ShoppingService } from '../../shopping/services/shopping.service';
import { AuditService } from '../../system/services/audit.service';
import { IdempotencyService } from '../../system/services/idempotency.service';
import { CheckoutDto, ValidateVoucherDto } from '../dto/checkout.dto';
import { QueryOrdersDto, RefundOrderDto } from '../dto/order.dto';
import { CreateVoucherDto, UpdateVoucherDto } from '../dto/voucher.dto';
import { OrderItem } from '../entities/order-item.entity';
import { Order } from '../entities/order.entity';
import { VoucherRedemption } from '../entities/voucher-redemption.entity';
import { Voucher } from '../entities/voucher.entity';
import { DiscountType } from '../enums/discount-type.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderType } from '../enums/order-type.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

@Injectable()
export class CommerceService {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepository: Repository<Voucher>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    private readonly dataSource: DataSource,
    private readonly shoppingService: ShoppingService,
    private readonly financeService: FinanceService,
    private readonly inventoryService: InventoryService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async validateVoucher(accountId: string, dto: ValidateVoucherDto) {
    return this.dataSource.transaction(async (manager) => {
      if (dto.cartId) {
        await this.shoppingService.assertCartOwner(accountId, dto.cartId);
      }
      const { items } = await this.shoppingService.getCartForCheckout(
        manager,
        accountId,
      );
      const subtotal = this.calculateSubtotal(items);
      const result = await this.getVoucherResult(
        manager,
        dto.code,
        accountId,
        subtotal,
        false,
      );
      return { voucher: result };
    });
  }

  async checkout(accountId: string, dto: CheckoutDto, idempotencyKey?: string) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Idempotency-Key header is required.',
        errorCode: 'IDEMPOTENCY_KEY_REQUIRED',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const requestHash = this.idempotencyService.hash(dto);
      const idempotency = await this.idempotencyService.begin(
        manager,
        'checkout',
        idempotencyKey,
        requestHash,
        accountId,
      );
      if (idempotency.state === 'REPLAY') {
        return idempotency.record.responseBody;
      }

      const { cart, items } = await this.shoppingService.getCartForCheckout(
        manager,
        accountId,
      );
      if (dto.cartId && dto.cartId !== cart.id) {
        throw new ForbiddenException(
          'Cart does not belong to current account.',
        );
      }

      for (const item of items) {
        const variant = item.productVariant;
        if (
          !variant ||
          variant.status !== VariantStatus.ACTIVE ||
          variant.product?.status !== ProductStatus.ACTIVE
        ) {
          throw new BadRequestException('Cart contains inactive product.');
        }
        if (variant.fulfillmentType !== FulfillmentType.AUTO) {
          throw new BadRequestException({
            success: false,
            data: null,
            message: 'Only AUTO fulfillment is supported in V1 checkout.',
            errorCode: 'UNSUPPORTED_FULFILLMENT',
          });
        }
      }

      const subtotal = this.calculateSubtotal(items);
      const voucherResult = dto.voucherCode
        ? await this.getVoucherResult(
            manager,
            dto.voucherCode,
            accountId,
            subtotal,
            true,
          )
        : null;
      const discountAmount = voucherResult?.discountAmount || '0.0000';
      const totalAmount = subtractMoney(subtotal, discountAmount);

      const order = await manager.save(
        Order,
        manager.create(Order, {
          accountId,
          voucherId: voucherResult?.id || null,
          orderNumber: this.createOrderNumber(),
          orderType: OrderType.STANDARD,
          status: OrderStatus.COMPLETED,
          paymentStatus: PaymentStatus.PAID,
          subtotal,
          discountAmount,
          totalAmount,
          refundedAmount: '0.0000',
          currency: 'VND',
          idempotencyKey,
        }),
      );

      const savedItems: OrderItem[] = [];
      for (const cartItem of items) {
        const variant = cartItem.productVariant;
        const line = await manager.save(
          OrderItem,
          manager.create(OrderItem, {
            orderId: order.id,
            productVariantId: cartItem.productVariantId,
            productName: variant.product.name,
            variantName: variant.name,
            sku: variant.sku,
            unitPrice: formatMoney(variant.price),
            quantity: cartItem.quantity,
            totalAmount: multiplyMoney(variant.price, cartItem.quantity),
            warrantyExpiresAt: variant.warrantyDurationDays
              ? new Date(Date.now() + variant.warrantyDurationDays * 86400000)
              : null,
          }),
        );
        savedItems.push(line);
        for (let index = 0; index < cartItem.quantity; index += 1) {
          const reserved = await this.inventoryService.reserveForOrderItem(
            manager,
            cartItem.productVariantId,
            line.id,
          );
          await this.inventoryService.sellReserved(
            manager,
            reserved.id,
            line.id,
          );
        }
      }

      if (voucherResult) {
        await manager.save(
          VoucherRedemption,
          manager.create(VoucherRedemption, {
            voucherId: voucherResult.id,
            accountId,
            orderId: order.id,
            discountAmount,
          }),
        );
      }

      await this.financeService.debit(manager, {
        accountId,
        amount: totalAmount,
        currency: 'VND',
        purpose: 'ORDER_PAYMENT',
        idempotencyKey: `checkout:${order.id}`,
        orderId: order.id,
        description: `Order ${order.orderNumber}`,
      });
      await this.shoppingService.clearCart(manager, cart.id);

      const response = {
        order: await this.serializeOrder(
          order,
          savedItems,
          accountId,
          true,
          manager,
        ),
      };
      await this.idempotencyService.complete(
        manager,
        idempotency.record,
        response,
      );
      return response;
    });
  }

  async listOrders(accountId: string, query: QueryOrdersDto) {
    return this.listOrdersInternal({ ...query, accountId });
  }

  async getOrder(accountId: string, id: string) {
    const order = await this.orderRepository.findOne({
      where: { id, accountId },
      relations: { items: true },
    });
    if (!order) {
      throw this.notFound('Order not found.');
    }
    return {
      order: await this.serializeOrder(order, order.items, accountId, true),
    };
  }

  async listAdminOrders(query: QueryOrdersDto) {
    return this.listOrdersInternal(query);
  }

  async getAdminOrder(id: string) {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!order) {
      throw this.notFound('Order not found.');
    }
    return {
      order: await this.serializeOrder(order, order.items, null, false),
    };
  }

  async updateOrderStatus(
    id: string,
    status: OrderStatus,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw this.notFound('Order not found.');
    }
    order.status = status;
    const saved = await this.orderRepository.save(order);
    await this.auditService.log({
      adminAccountId,
      action: 'ORDER_STATUS_UPDATE',
      targetType: 'Order',
      targetId: id,
      metadata: { status },
      ipAddress,
    });
    return { order: await this.serializeOrder(saved, [], null, false) };
  }

  async refundOrder(
    id: string,
    dto: RefundOrderDto,
    idempotencyKey: string | undefined,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }

    return this.dataSource.transaction(async (manager) => {
      const requestHash = this.idempotencyService.hash(dto);
      const idempotency = await this.idempotencyService.begin(
        manager,
        'refund',
        idempotencyKey,
        requestHash,
        null,
      );
      if (idempotency.state === 'REPLAY') {
        return idempotency.record.responseBody;
      }

      const order = await manager.findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw this.notFound('Order not found.');
      }
      if (order.paymentStatus !== PaymentStatus.PAID) {
        throw new BadRequestException('Order is not refundable.');
      }

      const remaining = money(order.totalAmount).minus(order.refundedAmount);
      const refundAmount = dto.amount ? money(dto.amount) : remaining;
      if (refundAmount.lte(0) || refundAmount.gt(remaining)) {
        throw new BadRequestException({
          success: false,
          data: null,
          message: 'Refund amount exceeds refundable balance.',
          errorCode: 'INVALID_REFUND_AMOUNT',
        });
      }

      await this.financeService.refund(manager, {
        accountId: order.accountId,
        amount: formatMoney(refundAmount),
        currency: order.currency,
        orderId: order.id,
        idempotencyKey: `refund:${idempotencyKey}`,
        description: `Refund order ${order.orderNumber}`,
      });

      order.refundedAmount = addMoney(order.refundedAmount, refundAmount);
      const fullyRefunded = money(order.refundedAmount).eq(order.totalAmount);
      order.status = fullyRefunded
        ? OrderStatus.REFUNDED
        : OrderStatus.PARTIALLY_REFUNDED;
      order.paymentStatus = fullyRefunded
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PAID;
      await manager.save(Order, order);
      await this.auditService.log({
        adminAccountId,
        action: 'ORDER_REFUND',
        targetType: 'Order',
        targetId: order.id,
        metadata: { amount: formatMoney(refundAmount), fullyRefunded },
        ipAddress,
        manager,
      });

      const response = {
        order: await this.serializeOrder(order, [], null, false, manager),
      };
      await this.idempotencyService.complete(
        manager,
        idempotency.record,
        response,
      );
      return response;
    });
  }

  async listVouchers(query: QueryOrdersDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const [items, total] = await this.voucherRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return this.paginated(
      items.map((item) => this.serializeVoucher(item)),
      total,
      page,
      pageSize,
    );
  }

  async createVoucher(
    dto: CreateVoucherDto,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    this.assertVoucherDto(dto);
    const voucher = await this.voucherRepository.save(
      this.voucherRepository.create({
        ...dto,
        code: dto.code.toUpperCase(),
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        isActive: dto.isActive ?? true,
        perAccountLimit: dto.perAccountLimit ?? 1,
        minimumOrderAmount: dto.minimumOrderAmount || null,
        maximumDiscountAmount: dto.maximumDiscountAmount || null,
      }),
    );
    await this.auditService.log({
      adminAccountId,
      action: 'VOUCHER_CREATE',
      targetType: 'Voucher',
      targetId: voucher.id,
      metadata: this.serializeVoucher(voucher),
      ipAddress,
    });
    return { voucher: this.serializeVoucher(voucher) };
  }

  async getVoucher(id: string) {
    const voucher = await this.voucherRepository.findOne({ where: { id } });
    if (!voucher) {
      throw this.notFound('Voucher not found.');
    }
    return { voucher: this.serializeVoucher(voucher) };
  }

  async updateVoucher(
    id: string,
    dto: UpdateVoucherDto,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    const voucher = await this.voucherRepository.findOne({ where: { id } });
    if (!voucher) {
      throw this.notFound('Voucher not found.');
    }
    Object.assign(voucher, {
      ...dto,
      code: dto.code ? dto.code.toUpperCase() : voucher.code,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : voucher.startsAt,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : voucher.endsAt,
      minimumOrderAmount:
        dto.minimumOrderAmount !== undefined
          ? dto.minimumOrderAmount
          : voucher.minimumOrderAmount,
      maximumDiscountAmount:
        dto.maximumDiscountAmount !== undefined
          ? dto.maximumDiscountAmount
          : voucher.maximumDiscountAmount,
    });
    this.assertVoucherDto(voucher);
    const saved = await this.voucherRepository.save(voucher);
    await this.auditService.log({
      adminAccountId,
      action: 'VOUCHER_UPDATE',
      targetType: 'Voucher',
      targetId: id,
      metadata: this.serializeVoucher(saved),
      ipAddress,
    });
    return { voucher: this.serializeVoucher(saved) };
  }

  async deleteVoucher(id: string, adminAccountId: string, ipAddress?: string) {
    const voucher = await this.voucherRepository.findOne({ where: { id } });
    if (!voucher) {
      throw this.notFound('Voucher not found.');
    }
    await this.voucherRepository.softDelete(id);
    await this.auditService.log({
      adminAccountId,
      action: 'VOUCHER_DELETE',
      targetType: 'Voucher',
      targetId: id,
      ipAddress,
    });
    return { deleted: true };
  }

  private async getVoucherResult(
    manager: EntityManager,
    code: string,
    accountId: string,
    subtotal: string,
    consume: boolean,
  ) {
    const voucher = await manager.findOne(Voucher, {
      where: { code: code.toUpperCase(), isActive: true },
      lock: consume ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!voucher) {
      throw this.notFound('Voucher not found.');
    }
    const now = new Date();
    if (now < voucher.startsAt || now > voucher.endsAt) {
      throw new BadRequestException('Voucher is not active now.');
    }
    if (
      voucher.minimumOrderAmount &&
      money(subtotal).lt(voucher.minimumOrderAmount)
    ) {
      throw new BadRequestException('Order does not meet voucher minimum.');
    }
    if (voucher.usedCount >= voucher.usageLimit) {
      throw new ConflictException('Voucher usage limit reached.');
    }
    const accountUsage = await manager.count(VoucherRedemption, {
      where: { voucherId: voucher.id, accountId },
    });
    if (accountUsage >= voucher.perAccountLimit) {
      throw new ConflictException('Voucher account limit reached.');
    }

    const rawDiscount =
      voucher.discountType === DiscountType.PERCENTAGE
        ? money(subtotal).times(voucher.discountValue).div(100)
        : money(voucher.discountValue);
    const capped = voucher.maximumDiscountAmount
      ? minMoney(rawDiscount, voucher.maximumDiscountAmount)
      : formatMoney(rawDiscount);
    const discountAmount = minMoney(capped, subtotal);

    if (consume) {
      voucher.usedCount += 1;
      await manager.save(Voucher, voucher);
    }

    return {
      id: voucher.id,
      code: voucher.code,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      discountAmount,
      subtotal,
      totalAmount: subtractMoney(subtotal, discountAmount),
    };
  }

  private calculateSubtotal(
    items: { quantity: number; productVariant: { price: string } }[],
  ) {
    return items.reduce(
      (sum, item) =>
        addMoney(sum, multiplyMoney(item.productVariant.price, item.quantity)),
      '0.0000',
    );
  }

  private async listOrdersInternal(query: QueryOrdersDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .orderBy('order.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.accountId) {
      qb.andWhere('order.accountId = :accountId', {
        accountId: query.accountId,
      });
    }
    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }
    const [items, total] = await qb.getManyAndCount();
    return this.paginated(
      await Promise.all(
        items.map((item) => this.serializeOrder(item, [], null, false)),
      ),
      total,
      page,
      pageSize,
    );
  }

  private async serializeOrder(
    order: Order,
    items: OrderItem[],
    ownerAccountId: string | null,
    includeDelivery: boolean,
    manager?: EntityManager,
  ) {
    const orderItems =
      items.length > 0
        ? items
        : await (manager || this.dataSource).getRepository(OrderItem).find({
            where: { orderId: order.id },
          });
    const responseItems: Record<string, unknown>[] = [];
    for (const item of orderItems) {
      const delivery =
        includeDelivery &&
        ownerAccountId === order.accountId &&
        order.paymentStatus === PaymentStatus.PAID &&
        [OrderStatus.COMPLETED, OrderStatus.PARTIALLY_REFUNDED].includes(
          order.status,
        )
          ? await this.deliveryForOrderItem(item.id, manager)
          : undefined;
      responseItems.push({
        id: item.id,
        productVariantId: item.productVariantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        totalAmount: item.totalAmount,
        warrantyExpiresAt: item.warrantyExpiresAt,
        ...(delivery !== undefined ? { deliveryPayload: delivery } : {}),
      });
    }
    return {
      id: order.id,
      accountId: order.accountId,
      voucherId: order.voucherId,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      refundedAmount: order.refundedAmount,
      currency: order.currency,
      placedAt: order.placedAt,
      items: responseItems,
    };
  }

  private async deliveryForOrderItem(
    orderItemId: string,
    manager?: EntityManager,
  ) {
    const repository = (manager || this.dataSource).getRepository(
      InventoryItem,
    );
    const inventory = await repository.find({
      where: { orderItemId },
      order: { soldAt: 'ASC' },
    });
    return inventory.map((item) =>
      this.inventoryService.decryptDeliveryPayload(item),
    );
  }

  private serializeVoucher(voucher: Voucher) {
    return {
      id: voucher.id,
      code: voucher.code,
      name: voucher.name,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      minimumOrderAmount: voucher.minimumOrderAmount,
      maximumDiscountAmount: voucher.maximumDiscountAmount,
      usageLimit: voucher.usageLimit,
      perAccountLimit: voucher.perAccountLimit,
      usedCount: voucher.usedCount,
      startsAt: voucher.startsAt,
      endsAt: voucher.endsAt,
      isActive: voucher.isActive,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
    };
  }

  private assertVoucherDto(dto: {
    discountType: DiscountType;
    discountValue: string;
    startsAt: Date | string;
    endsAt: Date | string;
  }) {
    if (
      dto.discountType === DiscountType.PERCENTAGE &&
      money(dto.discountValue).gt(100)
    ) {
      throw new BadRequestException('Percentage voucher cannot exceed 100.');
    }
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('Voucher endsAt must be after startsAt.');
    }
  }

  private createOrderNumber() {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD${Date.now()}${suffix}`.slice(0, 32);
  }

  private paginated<T>(
    items: T[],
    total: number,
    page: number,
    pageSize: number,
  ) {
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private notFound(message: string) {
    return new NotFoundException({
      success: false,
      data: null,
      message,
      errorCode: 'NOT_FOUND',
    });
  }
}
