import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { slugify } from '../../../common/utils/slug';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { InventoryStatus } from '../../inventory/enums/inventory-status.enum';
import { AuditService } from '../../system/services/audit.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';
import { CreateProductDto, UpdateProductDto } from '../dto/product.dto';
import { CreateVariantDto, UpdateVariantDto } from '../dto/variant.dto';
import {
  QueryAdminCategoryDto,
  QueryCategoryDto,
} from '../dto/query-category.dto';
import {
  QueryAdminProductDto,
  QueryProductDto,
} from '../dto/query-product.dto';
import { Category } from '../entities/category.entity';
import { ProductCategory } from '../entities/product-category.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { Product } from '../entities/product.entity';
import { CategoryStatus } from '../enums/category-status.enum';
import { FulfillmentType } from '../enums/fulfillment-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import { CatalogQueryService } from './catalog-query.service';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(ProductCategory)
    private readonly productCategoryRepository: Repository<ProductCategory>,
    private readonly dataSource: DataSource,
    private readonly catalogQuery: CatalogQueryService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // PUBLIC CATEGORY
  // ---------------------------------------------------------------------------

  async listPublicCategories(query: QueryCategoryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const includeChildren = query.includeChildren === true;

    // Chỉ giữ category có toàn bộ ancestor chain active và chưa soft-delete.
    const visibleIds = await this.loadVisibleCategoryIds();
    if (!visibleIds.length) {
      return { items: [], total: 0, page, pageSize, totalPages: 0 };
    }

    const qb = this.categoryRepository
      .createQueryBuilder('category')
      .where('category.id IN (:...visibleIds)', { visibleIds });

    if (query.parentId) {
      qb.andWhere('category.parentId = :parentId', {
        parentId: query.parentId,
      });
    } else {
      qb.andWhere('category.parentId IS NULL');
    }

    qb.orderBy('category.name', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    const childrenMap = includeChildren
      ? await this.loadChildrenMap(items.map((c) => c.id))
      : new Map<string, Category[]>();

    return {
      items: items.map((category) =>
        this.serializeCategory(
          category,
          includeChildren ? childrenMap : undefined,
        ),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private async loadVisibleCategoryIds(): Promise<string[]> {
    const raw = (await this.dataSource.query(`
      WITH RECURSIVE active_tree AS (
        SELECT id FROM categories
        WHERE parent_id IS NULL AND is_active = true AND deleted_at IS NULL
        UNION ALL
        SELECT c.id FROM categories c
        JOIN active_tree at ON c.parent_id = at.id
        WHERE c.is_active = true AND c.deleted_at IS NULL
      )
      SELECT id FROM active_tree
    `)) as unknown as { id: string }[];
    return raw.map((row) => row.id);
  }

  private async loadChildrenMap(
    parentIds: string[],
  ): Promise<Map<string, Category[]>> {
    if (!parentIds.length) {
      return new Map();
    }
    const children = await this.categoryRepository.find({
      where: { parentId: In(parentIds), isActive: true },
      order: { name: 'ASC' },
    });
    const map = new Map<string, Category[]>();
    for (const child of children) {
      const list = map.get(child.parentId as string) || [];
      list.push(child);
      map.set(child.parentId as string, list);
    }
    return map;
  }

  // ---------------------------------------------------------------------------
  // PUBLIC PRODUCT
  // ---------------------------------------------------------------------------

  async listPublicProducts(query: QueryProductDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    // V1 strict in-stock: chỉ bán được khi có variant AUTO active + inventory AVAILABLE.
    if (query.inStock === false) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    const subQuery = this.dataSource
      .createQueryBuilder()
      .select('DISTINCT pv.product_id', 'product_id')
      .from(ProductVariant, 'pv')
      .innerJoin(
        InventoryItem,
        'inv',
        'inv.product_variant_id = pv.id AND inv.status = :invStatus',
      )
      .where('pv.deleted_at IS NULL')
      .andWhere('pv.status = :variantStatus')
      .andWhere('pv.fulfillment_type = :fulfillmentType')
      .setParameters({
        invStatus: InventoryStatus.AVAILABLE,
        variantStatus: VariantStatus.ACTIVE,
        fulfillmentType: FulfillmentType.AUTO,
      });

    const qb = this.productRepository
      .createQueryBuilder('product')
      .where('product.deletedAt IS NULL')
      .andWhere('product.status = :productStatus', {
        productStatus: ProductStatus.ACTIVE,
      })
      .andWhere(`product.id IN (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters());

    if (query.categoryId) {
      qb.andWhere(
        'product.id IN (SELECT pc.product_id FROM product_categories pc WHERE pc.category_id = :categoryId)',
        { categoryId: query.categoryId },
      );
    }

    if (query.minPrice || query.maxPrice) {
      qb.andWhere(
        `product.id IN (
          SELECT pv.product_id FROM product_variants pv
          WHERE pv.deleted_at IS NULL
            AND pv.status = 'ACTIVE'
            AND pv.fulfillment_type = 'AUTO'
            AND pv.id IN (SELECT inv.product_variant_id FROM inventory_items inv WHERE inv.status = 'AVAILABLE')
            ${query.minPrice ? 'AND pv.price >= :minPrice' : ''}
            ${query.maxPrice ? 'AND pv.price <= :maxPrice' : ''}
        )`,
      );
      if (query.minPrice) {
        qb.setParameter('minPrice', query.minPrice);
      }
      if (query.maxPrice) {
        qb.setParameter('maxPrice', query.maxPrice);
      }
    }

    qb.orderBy('product.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [products, total] = await qb.getManyAndCount();
    const serialized = await this.serializePublicProducts(products);
    return {
      items: serialized,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getPublicProduct(productId: string) {
    const product = await this.productRepository.findOne({
      where: { id: productId, status: ProductStatus.ACTIVE },
    });
    if (!product) {
      throw this.notFound('Product not found.');
    }
    const [serialized] = await this.serializePublicProducts([product]);
    return serialized;
  }

  private async serializePublicProducts(products: Product[]) {
    if (!products.length) {
      return [];
    }
    const productIds = products.map((p) => p.id);
    const variants = await this.variantRepository.find({
      where: {
        productId: In(productIds),
        status: VariantStatus.ACTIVE,
        fulfillmentType: FulfillmentType.AUTO,
      },
      order: { createdAt: 'ASC' },
    });
    const sellableVariantIds = variants
      .filter((v) => !v.deletedAt)
      .map((v) => v.id);
    const availableMap =
      await this.catalogQuery.countAvailableByVariant(sellableVariantIds);

    const categories = await this.productCategoryRepository.find({
      where: { productId: In(productIds) },
      relations: { category: true },
    });
    const categoryMap = new Map<string, ProductCategory[]>();
    for (const pc of categories) {
      const list = categoryMap.get(pc.productId) || [];
      list.push(pc);
      categoryMap.set(pc.productId, list);
    }

    return products.map((product) => {
      const productVariants = variants.filter(
        (v) => v.productId === product.id && !v.deletedAt,
      );
      const sellable = productVariants.filter(
        (v) => (availableMap.get(v.id) || 0) > 0,
      );
      const pcs = categoryMap.get(product.id) || [];
      const activeCategories = pcs
        .filter(
          (pc) => pc.category && !pc.category.deletedAt && pc.category.isActive,
        )
        .map((pc) => pc.category);

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        imageUrls: product.images,
        status: product.status,
        minPrice: sellable.length ? this.minPrice(sellable) : null,
        totalAvailable: sellable.reduce(
          (sum, v) => sum + (availableMap.get(v.id) || 0),
          0,
        ),
        categories: activeCategories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        })),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    });
  }

  private minPrice(variants: ProductVariant[]): string {
    return variants
      .map((v) => v.price)
      .sort((a, b) => Number(a) - Number(b))[0];
  }

  // ---------------------------------------------------------------------------
  // ADMIN CATEGORY
  // ---------------------------------------------------------------------------

  async listAdminCategories(query: QueryAdminCategoryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.categoryRepository
      .createQueryBuilder('category')
      .where('category.deletedAt IS NULL');

    if (query.search) {
      qb.andWhere(
        '(LOWER(category.name) LIKE LOWER(:search) OR LOWER(category.slug) LIKE LOWER(:search))',
        {
          search: `%${query.search}%`,
        },
      );
    }
    if (query.status) {
      const active = query.status === CategoryStatus.ACTIVE;
      qb.andWhere('category.isActive = :active', { active });
    }
    qb.orderBy('category.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((c) => this.serializeCategory(c)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getAdminCategory(id: string) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw this.notFound('Category not found.');
    }
    return { category: this.serializeCategory(category) };
  }

  async createCategory(
    dto: CreateCategoryDto,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    const slug = await this.resolveCategorySlug(
      dto.slug || dto.name,
      undefined,
    );
    await this.assertCategoryParent(dto.parentId || null, undefined);

    const category = await this.categoryRepository.save(
      this.categoryRepository.create({
        name: dto.name,
        slug,
        parentId: dto.parentId || null,
        isActive: dto.status !== CategoryStatus.INACTIVE,
        description: dto.description || null,
      }),
    );
    await this.auditService.log({
      adminAccountId,
      action: 'CATEGORY_CREATE',
      targetType: 'Category',
      targetId: category.id,
      metadata: this.serializeCategory(category),
      ipAddress,
    });
    return { category: this.serializeCategory(category) };
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw this.notFound('Category not found.');
    }
    const before = this.serializeCategory(category);

    if (dto.name !== undefined) {
      category.name = dto.name;
    }
    if (dto.slug !== undefined) {
      category.slug = await this.resolveCategorySlug(dto.slug, id);
    } else if (dto.name !== undefined && !category.slug) {
      category.slug = await this.resolveCategorySlug(dto.name, id);
    }
    if (dto.parentId !== undefined) {
      await this.assertCategoryParent(dto.parentId || null, id);
      category.parentId = dto.parentId || null;
    }
    if (dto.status !== undefined) {
      category.isActive = dto.status === CategoryStatus.ACTIVE;
    }
    if (dto.description !== undefined) {
      category.description = dto.description;
    }

    const saved = await this.categoryRepository.save(category);
    await this.auditService.log({
      adminAccountId,
      action: 'CATEGORY_UPDATE',
      targetType: 'Category',
      targetId: id,
      metadata: {
        before,
        after: this.serializeCategory(saved),
      },
      ipAddress,
    });
    return { category: this.serializeCategory(saved) };
  }

  async deleteCategory(id: string, adminAccountId: string, ipAddress?: string) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw this.notFound('Category not found.');
    }

    const childCount = await this.categoryRepository.count({
      where: { parentId: id },
    });
    if (childCount > 0) {
      throw new ConflictException({
        success: false,
        data: null,
        message: 'Category còn category con, không thể xóa.',
        errorCode: 'CATEGORY_IN_USE',
      });
    }
    const mappingCount = await this.productCategoryRepository
      .createQueryBuilder('pc')
      .innerJoin('pc.product', 'product')
      .where('pc.categoryId = :categoryId', { categoryId: id })
      .andWhere('product.deletedAt IS NULL')
      .getCount();
    if (mappingCount > 0) {
      throw new ConflictException({
        success: false,
        data: null,
        message: 'Category đang được product sử dụng, không thể xóa.',
        errorCode: 'CATEGORY_IN_USE',
      });
    }

    await this.categoryRepository.softDelete(id);
    await this.auditService.log({
      adminAccountId,
      action: 'CATEGORY_DELETE',
      targetType: 'Category',
      targetId: id,
      metadata: { deletedAt: new Date().toISOString() },
      ipAddress,
    });
    return { deletedAt: new Date().toISOString() };
  }

  private async resolveCategorySlug(raw: string, excludeId?: string) {
    const slug = slugify(raw);
    const existing = await this.categoryRepository.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException({
        success: false,
        data: null,
        message: 'Slug đã tồn tại.',
        errorCode: 'CONFLICT',
      });
    }
    return slug;
  }

  private async assertCategoryParent(
    parentId: string | null,
    excludeId?: string,
  ) {
    if (!parentId) {
      return;
    }
    if (parentId === excludeId) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Category không thể là parent của chính nó.',
        errorCode: 'CATEGORY_CYCLE',
      });
    }
    const parent = await this.categoryRepository.findOne({
      where: { id: parentId },
    });
    if (!parent) {
      throw this.notFound('Parent category not found.');
    }
    if (excludeId) {
      const descendants = await this.loadDescendantIds(excludeId);
      if (descendants.includes(parentId)) {
        throw new BadRequestException({
          success: false,
          data: null,
          message: 'Không thể đặt descendant làm parent (cycle).',
          errorCode: 'CATEGORY_CYCLE',
        });
      }
    }
  }

  private async loadDescendantIds(categoryId: string): Promise<string[]> {
    const result: string[] = [];
    const queue = [categoryId];
    while (queue.length) {
      const current = queue.shift() as string;
      const children = await this.categoryRepository.find({
        where: { parentId: current },
        select: { id: true },
      });
      for (const child of children) {
        result.push(child.id);
        queue.push(child.id);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // ADMIN PRODUCT
  // ---------------------------------------------------------------------------

  async listAdminProducts(query: QueryAdminProductDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.productRepository
      .createQueryBuilder('product')
      .where('product.deletedAt IS NULL');

    if (query.search) {
      qb.andWhere(
        `(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.slug) LIKE LOWER(:search) OR product.id IN (SELECT pv.product_id FROM product_variants pv WHERE LOWER(pv.sku) LIKE LOWER(:search)))`,
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      qb.andWhere('product.status = :status', { status: query.status });
    }
    if (query.categoryId) {
      qb.andWhere(
        'product.id IN (SELECT pc.product_id FROM product_categories pc WHERE pc.category_id = :categoryId)',
        { categoryId: query.categoryId },
      );
    }
    qb.orderBy('product.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return {
      items: await this.serializeAdminProducts(items),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getAdminProduct(id: string) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw this.notFound('Product not found.');
    }
    const [serialized] = await this.serializeAdminProducts([product]);
    return { product: serialized };
  }

  async createProduct(
    dto: CreateProductDto,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    const slug = await this.resolveProductSlug(dto.slug || dto.name, undefined);
    const categoryIds = dto.categoryIds || [];
    await this.assertCategoriesExist(categoryIds);
    if (dto.primaryCategoryId && !categoryIds.includes(dto.primaryCategoryId)) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'primaryCategoryId phải thuộc categoryIds.',
        errorCode: 'PRIMARY_CATEGORY_INVALID',
      });
    }

    const product = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        Product,
        manager.create(Product, {
          name: dto.name,
          slug,
          description: dto.description || null,
          images: dto.imageUrls || null,
          status: dto.status || ProductStatus.DRAFT,
        }),
      );
      await this.replaceProductCategories(
        manager,
        saved.id,
        categoryIds,
        dto.primaryCategoryId || null,
      );
      return saved;
    });

    await this.auditService.log({
      adminAccountId,
      action: 'PRODUCT_CREATE',
      targetType: 'Product',
      targetId: product.id,
      metadata: { id: product.id, name: product.name, slug: product.slug },
      ipAddress,
    });
    const [serialized] = await this.serializeAdminProducts([product]);
    return { product: serialized };
  }

  async updateProduct(
    id: string,
    dto: UpdateProductDto,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw this.notFound('Product not found.');
    }
    const before = await this.getAdminProductSnapshot(id);

    if (dto.name !== undefined) {
      product.name = dto.name;
    }
    if (dto.slug !== undefined) {
      product.slug = await this.resolveProductSlug(dto.slug, id);
    } else if (dto.name !== undefined && !product.slug) {
      product.slug = await this.resolveProductSlug(dto.name, id);
    }
    if (dto.description !== undefined) {
      product.description = dto.description;
    }
    if (dto.imageUrls !== undefined) {
      product.images = dto.imageUrls;
    }
    if (dto.status !== undefined) {
      product.status = dto.status;
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const savedProduct = await manager.save(Product, product);
      if (dto.categoryIds !== undefined) {
        await this.assertCategoriesExist(dto.categoryIds, manager);
        if (
          dto.primaryCategoryId &&
          !dto.categoryIds.includes(dto.primaryCategoryId)
        ) {
          throw new BadRequestException({
            success: false,
            data: null,
            message: 'primaryCategoryId phải thuộc categoryIds.',
            errorCode: 'PRIMARY_CATEGORY_INVALID',
          });
        }
        // primaryCategoryId undefined: giữ primary cũ nếu vẫn thuộc categoryIds mới.
        let primary =
          dto.primaryCategoryId === undefined
            ? await this.getPrimaryCategoryId(id)
            : dto.primaryCategoryId || null;
        if (primary && !dto.categoryIds.includes(primary)) {
          primary = null;
        }
        await this.replaceProductCategories(
          manager,
          savedProduct.id,
          dto.categoryIds,
          primary,
        );
      }
      return savedProduct;
    });

    await this.auditService.log({
      adminAccountId,
      action: 'PRODUCT_UPDATE',
      targetType: 'Product',
      targetId: id,
      metadata: { before, after: await this.getAdminProductSnapshot(id) },
      ipAddress,
    });
    const [serialized] = await this.serializeAdminProducts([saved]);
    return { product: serialized };
  }

  async deleteProduct(id: string, adminAccountId: string, ipAddress?: string) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw this.notFound('Product not found.');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.softDelete(Product, { id });
      await manager.softDelete(ProductVariant, { productId: id });
    });

    await this.auditService.log({
      adminAccountId,
      action: 'PRODUCT_DELETE',
      targetType: 'Product',
      targetId: id,
      metadata: { deletedAt: new Date().toISOString() },
      ipAddress,
    });
    return { deletedAt: new Date().toISOString() };
  }

  private async serializeAdminProducts(products: Product[]) {
    if (!products.length) {
      return [];
    }
    const productIds = products.map((p) => p.id);
    const variants = await this.variantRepository.find({
      where: { productId: In(productIds) },
      order: { createdAt: 'ASC' },
    });
    const activeVariantIds = variants
      .filter((v) => !v.deletedAt)
      .map((v) => v.id);
    const availableMap =
      await this.catalogQuery.countAvailableByVariant(activeVariantIds);
    const pcs = await this.productCategoryRepository.find({
      where: { productId: In(productIds) },
      relations: { category: true },
    });

    return products.map((product) => {
      const productVariants = variants.filter(
        (v) => v.productId === product.id && !v.deletedAt,
      );
      const productPcs = pcs.filter((pc) => pc.productId === product.id);
      const primary = productPcs.find((pc) => pc.isPrimary);
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        imageUrls: product.images,
        status: product.status,
        primaryCategory: primary?.category
          ? {
              id: primary.category.id,
              name: primary.category.name,
              slug: primary.category.slug,
            }
          : null,
        categories: productPcs
          .map((pc) => pc.category)
          .filter((c) => c !== null)
          .map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
        variants: productVariants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.name,
          price: v.price,
          currency: 'VND',
          status: v.status,
          fulfillmentType: v.fulfillmentType,
          warrantyDays: v.warrantyDurationDays,
          availableQuantity: availableMap.get(v.id) || 0,
        })),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    });
  }

  private async getPrimaryCategoryId(
    productId: string,
  ): Promise<string | null> {
    const primary = await this.productCategoryRepository.findOne({
      where: { productId, isPrimary: true },
    });
    return primary?.categoryId || null;
  }

  private async replaceProductCategories(
    manager: EntityManager,
    productId: string,
    categoryIds: string[],
    primaryCategoryId: string | null,
  ) {
    await manager.delete(ProductCategory, { productId });
    if (!categoryIds.length) {
      return;
    }
    const rows = categoryIds.map((categoryId) =>
      manager.create(ProductCategory, {
        productId,
        categoryId,
        isPrimary: categoryId === primaryCategoryId,
      }),
    );
    await manager.save(ProductCategory, rows);
  }

  private async assertCategoriesExist(
    categoryIds: string[],
    manager?: EntityManager,
  ) {
    if (!categoryIds.length) {
      return;
    }
    const repository = manager
      ? manager.getRepository(Category)
      : this.categoryRepository;
    const found = await repository.find({ where: { id: In(categoryIds) } });
    if (found.length !== new Set(categoryIds).size) {
      throw this.notFound('Một hoặc nhiều category không tồn tại.');
    }
  }

  private async resolveProductSlug(raw: string, excludeId?: string) {
    const slug = slugify(raw);
    const existing = await this.productRepository.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException({
        success: false,
        data: null,
        message: 'Slug đã tồn tại.',
        errorCode: 'CONFLICT',
      });
    }
    return slug;
  }

  // ---------------------------------------------------------------------------
  // ADMIN VARIANT
  // ---------------------------------------------------------------------------

  async createVariant(
    productId: string,
    dto: CreateVariantDto,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });
    if (!product) {
      throw this.notFound('Product not found.');
    }
    if ((dto.currency || 'VND').toUpperCase() !== 'VND') {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Chỉ chấp nhận VND.',
        errorCode: 'CURRENCY_NOT_SUPPORTED',
      });
    }
    this.assertPrice(dto.price);
    await this.assertSkuUnique(dto.sku);

    const variant = await this.variantRepository.save(
      this.variantRepository.create({
        productId,
        sku: dto.sku,
        name: dto.name,
        price: dto.price,
        fulfillmentType: dto.fulfillmentType,
        status: dto.status || VariantStatus.ACTIVE,
        warrantyDurationDays: dto.warrantyDays ?? null,
      }),
    );
    await this.auditService.log({
      adminAccountId,
      action: 'VARIANT_CREATE',
      targetType: 'ProductVariant',
      targetId: variant.id,
      metadata: { id: variant.id, productId, sku: variant.sku },
      ipAddress,
    });
    return { variant: this.serializeVariant(variant) };
  }

  async updateVariant(
    id: string,
    dto: UpdateVariantDto,
    adminAccountId: string,
    ipAddress?: string,
  ) {
    const variant = await this.variantRepository.findOne({ where: { id } });
    if (!variant) {
      throw this.notFound('Variant not found.');
    }
    const before = this.serializeVariant(variant);

    if (dto.name !== undefined) {
      variant.name = dto.name;
    }
    if (dto.price !== undefined) {
      this.assertPrice(dto.price);
      variant.price = dto.price;
    }
    if (dto.status !== undefined) {
      variant.status = dto.status;
    }
    if (dto.fulfillmentType !== undefined) {
      variant.fulfillmentType = dto.fulfillmentType;
    }
    if (dto.warrantyDays !== undefined) {
      variant.warrantyDurationDays = dto.warrantyDays ?? null;
    }

    const saved = await this.variantRepository.save(variant);
    await this.auditService.log({
      adminAccountId,
      action: 'VARIANT_UPDATE',
      targetType: 'ProductVariant',
      targetId: id,
      metadata: { before, after: this.serializeVariant(saved) },
      ipAddress,
    });
    return { variant: this.serializeVariant(saved) };
  }

  async deleteVariant(id: string, adminAccountId: string, ipAddress?: string) {
    const variant = await this.variantRepository.findOne({ where: { id } });
    if (!variant) {
      throw this.notFound('Variant not found.');
    }
    await this.variantRepository.softDelete(id);
    await this.auditService.log({
      adminAccountId,
      action: 'VARIANT_DELETE',
      targetType: 'ProductVariant',
      targetId: id,
      metadata: { deletedAt: new Date().toISOString() },
      ipAddress,
    });
    return { deletedAt: new Date().toISOString() };
  }

  private async assertSkuUnique(sku: string) {
    const existing = await this.variantRepository.findOne({
      where: { sku },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException({
        success: false,
        data: null,
        message: 'SKU đã tồn tại.',
        errorCode: 'CONFLICT',
      });
    }
  }

  private assertPrice(price: string) {
    if (!/^\d+(\.\d+)?$/.test(price) || Number(price) < 0) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Price phải là decimal string không âm.',
        errorCode: 'VALIDATION_ERROR',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // SERIALIZERS & HELPERS
  // ---------------------------------------------------------------------------

  private serializeCategory(
    category: Category,
    childrenMap?: Map<string, Category[]>,
  ): Record<string, unknown> {
    const children = childrenMap?.get(category.id);
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      status: category.isActive
        ? CategoryStatus.ACTIVE
        : CategoryStatus.INACTIVE,
      description: category.description,
      parentId: category.parentId,
      ...(children
        ? { children: children.map((c) => this.serializeCategory(c)) }
        : {}),
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private serializeVariant(variant: ProductVariant) {
    return {
      id: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      name: variant.name,
      price: variant.price,
      currency: 'VND',
      status: variant.status,
      fulfillmentType: variant.fulfillmentType,
      warrantyDays: variant.warrantyDurationDays,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
    };
  }

  private async getAdminProductSnapshot(id: string) {
    const [serialized] = await this.serializeAdminProducts(
      await this.productRepository.find({ where: { id } }),
    );
    return serialized;
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
