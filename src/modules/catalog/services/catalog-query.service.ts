import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { InventoryStatus } from '../../inventory/enums/inventory-status.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import { ProductVariant } from '../entities/product-variant.entity';
import { Product } from '../entities/product.entity';

@Injectable()
export class CatalogQueryService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepository: Repository<InventoryItem>,
  ) {}

  /**
   * Trả product đang ACTIVE, không phụ thuộc tồn kho.
   * Dùng cho favorite/view (không cần stock) và để Inventory có thể
   * nhập stock đầu tiên cho variant của product chưa bán được.
   */
  async getActiveProduct(productId: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId, status: ProductStatus.ACTIVE },
    });
    if (!product) {
      throw new NotFoundException({
        success: false,
        data: null,
        message: 'Product is not available.',
        errorCode: 'PRODUCT_NOT_AVAILABLE',
      });
    }
    return product;
  }

  /**
   * Trả variant đang ACTIVE thuộc product ACTIVE, không phụ thuộc tồn kho.
   * Inventory dùng method này để nhập stock đầu tiên.
   */
  async getActiveVariant(variantId: string): Promise<ProductVariant> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId, status: VariantStatus.ACTIVE },
      relations: { product: true },
    });
    if (!variant || variant.product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException({
        success: false,
        data: null,
        message: 'Product variant is not available.',
        errorCode: 'VARIANT_NOT_AVAILABLE',
      });
    }
    return variant;
  }

  /**
   * Đếm tồn kho AVAILABLE theo từng variant id.
   * Dùng chung cho public list/detail và admin detail.
   */
  async countAvailableByVariant(
    variantIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    if (!variantIds.length) {
      return new Map();
    }
    const repository = manager
      ? manager.getRepository(InventoryItem)
      : this.inventoryRepository;
    const rows = await repository
      .createQueryBuilder('item')
      .select('item.productVariantId', 'productVariantId')
      .addSelect('COUNT(*)', 'available')
      .where('item.productVariantId IN (:...variantIds)', { variantIds })
      .andWhere('item.status = :status', { status: InventoryStatus.AVAILABLE })
      .groupBy('item.productVariantId')
      .getRawMany<{ productVariantId: string; available: string }>();
    return new Map(
      rows.map((row) => [row.productVariantId, Number(row.available)]),
    );
  }
}
