import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { CatalogQueryService } from '../../catalog/services/catalog-query.service';
import { AuditService } from '../../system/services/audit.service';
import { CreateInventoryItemDto } from '../dto/create-inventory-item.dto';
import { QueryInventoryItemsDto } from '../dto/query-inventory-items.dto';
import { UpdateInventoryItemDto } from '../dto/update-inventory-item.dto';
import { InventoryItem } from '../entities/inventory-item.entity';
import { InventoryStatus } from '../enums/inventory-status.enum';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepository: Repository<InventoryItem>,
    private readonly cryptoService: CryptoService,
    private readonly catalogQueryService: CatalogQueryService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryInventoryItemsDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.inventoryRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.productVariant', 'variant')
      .orderBy('item.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query.status) {
      qb.andWhere('item.status = :status', { status: query.status });
    }
    if (query.productVariantId) {
      qb.andWhere('item.productVariantId = :productVariantId', {
        productVariantId: query.productVariantId,
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((item) => this.toAdminResponse(item)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const item = await this.inventoryRepository.findOne({
      where: { id },
      relations: { productVariant: true },
    });
    if (!item) {
      throw this.notFound();
    }
    return this.toAdminResponse(item);
  }

  async create(
    dto: CreateInventoryItemDto,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    await this.catalogQueryService.getActiveVariant(dto.productVariantId);
    const item = await this.inventoryRepository.save(
      this.inventoryRepository.create({
        productVariantId: dto.productVariantId,
        encryptedPayload: this.cryptoService.encryptJson(dto.payload),
        encryptionKeyVersion: 1,
        metadata: dto.metadata || null,
        status: InventoryStatus.AVAILABLE,
      }),
    );
    await this.auditService.log({
      adminAccountId,
      action: 'INVENTORY_CREATE',
      targetType: 'InventoryItem',
      targetId: item.id,
      metadata: { productVariantId: dto.productVariantId },
      ipAddress,
    });
    return { inventoryItem: this.toAdminResponse(item) };
  }

  async update(
    id: string,
    dto: UpdateInventoryItemDto,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    const item = await this.inventoryRepository.findOne({ where: { id } });
    if (!item) {
      throw this.notFound();
    }

    if (dto.productVariantId) {
      await this.catalogQueryService.getActiveVariant(dto.productVariantId);
      item.productVariantId = dto.productVariantId;
    }
    if (dto.payload) {
      item.encryptedPayload = this.cryptoService.encryptJson(dto.payload);
      item.encryptionKeyVersion = 1;
    }
    if (dto.metadata !== undefined) {
      item.metadata = dto.metadata;
    }
    if (dto.status && dto.status !== item.status) {
      this.assertTransition(item.status, dto.status);
      item.status = dto.status;
      item.soldAt =
        dto.status === InventoryStatus.SOLD ? new Date() : item.soldAt;
    }

    const saved = await this.inventoryRepository.save(item);
    await this.auditService.log({
      adminAccountId,
      action: 'INVENTORY_UPDATE',
      targetType: 'InventoryItem',
      targetId: saved.id,
      metadata: {
        status: saved.status,
        productVariantId: saved.productVariantId,
      },
      ipAddress,
    });
    return { inventoryItem: this.toAdminResponse(saved) };
  }

  async reserveForOrderItem(
    manager: EntityManager,
    productVariantId: string,
    orderItemId: string,
  ): Promise<InventoryItem> {
    const item = await manager
      .getRepository(InventoryItem)
      .createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.product_variant_id = :productVariantId', {
        productVariantId,
      })
      .andWhere('item.status = :status', { status: InventoryStatus.AVAILABLE })
      .orderBy('item.createdAt', 'ASC')
      .getOne();

    if (!item) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Inventory is not available.',
        errorCode: 'INVENTORY_NOT_AVAILABLE',
      });
    }

    item.status = InventoryStatus.RESERVED;
    item.orderItemId = orderItemId;
    item.reservedUntil = new Date(Date.now() + 10 * 60 * 1000);
    return manager.save(InventoryItem, item);
  }

  async sellReserved(
    manager: EntityManager,
    inventoryItemId: string,
    orderItemId: string,
  ): Promise<InventoryItem> {
    const item = await manager.findOne(InventoryItem, {
      where: { id: inventoryItemId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !item ||
      item.status !== InventoryStatus.RESERVED ||
      item.orderItemId !== orderItemId
    ) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Reserved inventory is not sellable.',
        errorCode: 'INVENTORY_NOT_SELLABLE',
      });
    }

    item.status = InventoryStatus.SOLD;
    item.soldAt = new Date();
    item.reservedUntil = null;
    return manager.save(InventoryItem, item);
  }

  decryptDeliveryPayload(item: InventoryItem): unknown {
    return this.cryptoService.decryptJson(item.encryptedPayload);
  }

  private assertTransition(from: InventoryStatus, to: InventoryStatus) {
    const allowed: Record<InventoryStatus, InventoryStatus[]> = {
      [InventoryStatus.AVAILABLE]: [
        InventoryStatus.RESERVED,
        InventoryStatus.VOID,
      ],
      [InventoryStatus.RESERVED]: [InventoryStatus.SOLD, InventoryStatus.VOID],
      [InventoryStatus.SOLD]: [],
      [InventoryStatus.VOID]: [],
    };
    if (!allowed[from].includes(to)) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: `Invalid inventory transition ${from} -> ${to}.`,
        errorCode: 'INVALID_INVENTORY_TRANSITION',
      });
    }
  }

  private notFound() {
    return new NotFoundException({
      success: false,
      data: null,
      message: 'Inventory item not found.',
      errorCode: 'NOT_FOUND',
    });
  }

  private toAdminResponse(item: InventoryItem) {
    return {
      id: item.id,
      productVariantId: item.productVariantId,
      orderItemId: item.orderItemId,
      status: item.status,
      reservedUntil: item.reservedUntil,
      soldAt: item.soldAt,
      metadata: item.metadata || null,
      encryptionKeyVersion: item.encryptionKeyVersion,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
