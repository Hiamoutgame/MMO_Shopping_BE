import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { InventoryStatus } from '../../inventory/enums/inventory-status.enum';
import { CatalogQueryService } from '../../catalog/services/catalog-query.service';
import { ProductStatus } from '../../catalog/enums/product-status.enum';
import { VariantStatus } from '../../catalog/enums/variant-status.enum';
import { AddCartItemDto, UpdateCartItemDto } from '../dto/cart-item.dto';
import { CreateFavoriteDto } from '../dto/favorite.dto';
import { CreateProductViewDto } from '../dto/product-view.dto';
import { CartItem } from '../entities/cart-item.entity';
import { Cart } from '../entities/cart.entity';
import { Favorite } from '../entities/favorite.entity';
import { ProductView } from '../entities/product-view.entity';

@Injectable()
export class ShoppingService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    @InjectRepository(Favorite)
    private readonly favoriteRepository: Repository<Favorite>,
    @InjectRepository(ProductView)
    private readonly productViewRepository: Repository<ProductView>,
    private readonly dataSource: DataSource,
    private readonly catalogQueryService: CatalogQueryService,
  ) {}

  async getCart(accountId: string) {
    const cart = await this.ensureCart(accountId);
    return { cart: await this.serializeCart(cart.id) };
  }

  async addCartItem(accountId: string, dto: AddCartItemDto) {
    await this.catalogQueryService.getActiveVariant(dto.productVariantId);
    const cart = await this.ensureCart(accountId);

    await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(CartItem, {
        where: { cartId: cart.id, productVariantId: dto.productVariantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (item) {
        item.quantity += dto.quantity;
        await manager.save(CartItem, item);
        return;
      }
      await manager.save(
        CartItem,
        manager.create(CartItem, {
          cartId: cart.id,
          productVariantId: dto.productVariantId,
          quantity: dto.quantity,
        }),
      );
    });

    return { cart: await this.serializeCart(cart.id) };
  }

  async updateCartItem(
    accountId: string,
    cartItemId: string,
    dto: UpdateCartItemDto,
  ) {
    const cart = await this.ensureCart(accountId);
    const item = await this.cartItemRepository.findOne({
      where: { id: cartItemId, cartId: cart.id },
    });
    if (!item) {
      throw this.notFound('Cart item not found.');
    }
    item.quantity = dto.quantity;
    await this.cartItemRepository.save(item);
    return { cart: await this.serializeCart(cart.id) };
  }

  async removeCartItem(accountId: string, cartItemId: string) {
    const cart = await this.ensureCart(accountId);
    const result = await this.cartItemRepository.delete({
      id: cartItemId,
      cartId: cart.id,
    });
    if (!result.affected) {
      throw this.notFound('Cart item not found.');
    }
    return { deleted: true };
  }

  async listFavorites(accountId: string) {
    const favorites = await this.favoriteRepository.find({
      where: { accountId },
      relations: { product: true },
      order: { createdAt: 'DESC' },
    });
    return {
      favorites: favorites.map((favorite) => ({
        id: favorite.id,
        productId: favorite.productId,
        product: favorite.product
          ? {
              id: favorite.product.id,
              name: favorite.product.name,
              slug: favorite.product.slug,
              status: favorite.product.status,
            }
          : null,
        createdAt: favorite.createdAt,
      })),
    };
  }

  async addFavorite(accountId: string, dto: CreateFavoriteDto) {
    const product = await this.catalogQueryService.getActiveProduct(
      dto.productId,
    );
    let favorite = await this.favoriteRepository.findOne({
      where: { accountId, productId: product.id },
    });
    if (!favorite) {
      favorite = await this.favoriteRepository.save(
        this.favoriteRepository.create({ accountId, productId: product.id }),
      );
    }
    return { favorite: { id: favorite.id, productId: favorite.productId } };
  }

  async removeFavorite(accountId: string, productId: string) {
    const result = await this.favoriteRepository.delete({
      accountId,
      productId,
    });
    return { deleted: Boolean(result.affected) };
  }

  async recordProductView(
    dto: CreateProductViewDto,
    accountId?: string | null,
  ) {
    if (!accountId && !dto.sessionId) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'sessionId is required for anonymous product views.',
        errorCode: 'SESSION_REQUIRED',
      });
    }
    await this.catalogQueryService.getActiveProduct(dto.productId);
    const productView = await this.productViewRepository.save(
      this.productViewRepository.create({
        productId: dto.productId,
        accountId: accountId || null,
        sessionId: accountId ? null : dto.sessionId,
        source: dto.source || null,
      }),
    );
    return { productView: { id: productView.id } };
  }

  async getCartForCheckout(manager: EntityManager, accountId: string) {
    const cart = await manager.findOne(Cart, {
      where: { accountId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!cart) {
      throw this.notFound('Cart not found.');
    }
    const items = await manager.find(CartItem, {
      where: { cartId: cart.id },
      relations: { productVariant: { product: true } },
    });
    if (!items.length) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Cart is empty.',
        errorCode: 'EMPTY_CART',
      });
    }
    return { cart, items };
  }

  async clearCart(manager: EntityManager, cartId: string): Promise<void> {
    await manager.delete(CartItem, { cartId });
  }

  async assertCartOwner(accountId: string, cartId: string): Promise<void> {
    const cart = await this.cartRepository.findOne({ where: { id: cartId } });
    if (!cart || cart.accountId !== accountId) {
      throw new ForbiddenException({
        success: false,
        data: null,
        message: 'Cart does not belong to current account.',
        errorCode: 'FORBIDDEN',
      });
    }
  }

  private async ensureCart(accountId: string): Promise<Cart> {
    let cart = await this.cartRepository.findOne({ where: { accountId } });
    if (!cart) {
      cart = await this.cartRepository.save(
        this.cartRepository.create({ accountId }),
      );
    }
    return cart;
  }

  private async serializeCart(cartId: string) {
    const cart = await this.cartRepository.findOne({
      where: { id: cartId },
      relations: { items: { productVariant: { product: true } } },
    });
    if (!cart) {
      throw this.notFound('Cart not found.');
    }

    const availableRows = await this.dataSource
      .getRepository(InventoryItem)
      .createQueryBuilder('inventory')
      .select('inventory.productVariantId', 'productVariantId')
      .addSelect('COUNT(*)', 'available')
      .where('inventory.status = :status', {
        status: InventoryStatus.AVAILABLE,
      })
      .groupBy('inventory.productVariantId')
      .getRawMany<{ productVariantId: string; available: string }>();
    const availableByVariant = new Map(
      availableRows.map((row) => [row.productVariantId, Number(row.available)]),
    );

    return {
      id: cart.id,
      accountId: cart.accountId,
      items: (cart.items || []).map((item) => ({
        id: item.id,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
        availableQuantity: availableByVariant.get(item.productVariantId) || 0,
        isAvailable:
          item.productVariant?.status === VariantStatus.ACTIVE &&
          item.productVariant.product?.status === ProductStatus.ACTIVE &&
          (availableByVariant.get(item.productVariantId) || 0) >= item.quantity,
        variant: item.productVariant
          ? {
              id: item.productVariant.id,
              sku: item.productVariant.sku,
              name: item.productVariant.name,
              price: item.productVariant.price,
              fulfillmentType: item.productVariant.fulfillmentType,
              product: item.productVariant.product
                ? {
                    id: item.productVariant.product.id,
                    name: item.productVariant.product.name,
                    slug: item.productVariant.product.slug,
                  }
                : null,
            }
          : null,
      })),
      updatedAt: cart.updatedAt,
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
