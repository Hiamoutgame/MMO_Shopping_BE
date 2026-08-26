import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { AppModule } from '../src/app.module';
import { Category } from '../src/modules/catalog/entities/category.entity';
import { Product } from '../src/modules/catalog/entities/product.entity';
import { ProductVariant } from '../src/modules/catalog/entities/product-variant.entity';
import { FulfillmentType } from '../src/modules/catalog/enums/fulfillment-type.enum';
import { ProductStatus } from '../src/modules/catalog/enums/product-status.enum';
import { VariantStatus } from '../src/modules/catalog/enums/variant-status.enum';
import { CatalogService } from '../src/modules/catalog/services/catalog.service';
import { InventoryItem } from '../src/modules/inventory/entities/inventory-item.entity';
import { InventoryStatus } from '../src/modules/inventory/enums/inventory-status.enum';
import { Account } from '../src/modules/identity/entities/account.entity';
import { Role } from '../src/modules/identity/entities/role.entity';
import { AccountStatus } from '../src/modules/identity/enums/account-status.enum';
import { AdminAuditLog } from '../src/modules/system/entities/admin-audit-log.entity';

describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let catalogService: CatalogService;
  let cryptoService: CryptoService;
  let admin: Account;
  let unique = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    catalogService = app.get(CatalogService);
    cryptoService = app.get(CryptoService);

    await dataSource.query(
      'TRUNCATE TABLE "admin_audit_logs", "idempotency_records", "inventory_items", "product_categories", "product_variants", "products", "categories", "accounts", "roles" CASCADE',
    );
    const adminRole = await dataSource.getRepository(Role).save({
      code: 'ADMIN',
      name: 'Admin',
    });
    admin = await dataSource.getRepository(Account).save({
      roleId: adminRole.id,
      email: `admin-catalog-${Date.now()}@example.com`,
      passwordHash: 'not-used',
      name: 'Admin',
      status: AccountStatus.ACTIVE,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('public list hides draft/inactive/deleted, MANUAL and out-of-stock AUTO', async () => {
    const category = await seedCategory();
    const draft = await seedProduct({
      category,
      status: ProductStatus.DRAFT,
      fulfillment: FulfillmentType.AUTO,
      withStock: true,
    });
    const manual = await seedProduct({
      category,
      status: ProductStatus.ACTIVE,
      fulfillment: FulfillmentType.MANUAL,
      withStock: true,
    });
    const noStock = await seedProduct({
      category,
      status: ProductStatus.ACTIVE,
      fulfillment: FulfillmentType.AUTO,
      withStock: false,
    });
    const sellable = await seedProduct({
      category,
      status: ProductStatus.ACTIVE,
      fulfillment: FulfillmentType.AUTO,
      withStock: true,
    });

    const list = await catalogService.listPublicProducts({});
    const ids = (list.items as { id: string }[]).map((p) => p.id);

    expect(ids).toContain(sellable.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(manual.id);
    expect(ids).not.toContain(noStock.id);
  });

  it('public product aggregates minPrice and totalAvailable', async () => {
    const product = await dataSource.getRepository(Product).save({
      name: `Agg ${unique}`,
      slug: `agg-${unique}`,
      status: ProductStatus.ACTIVE,
      images: ['https://cdn/a.png'],
    });
    await dataSource.getRepository(ProductVariant).save([
      {
        productId: product.id,
        sku: `AGG-A-${unique}`,
        name: 'Cheap',
        price: '100.0000',
        fulfillmentType: FulfillmentType.AUTO,
        status: VariantStatus.ACTIVE,
      },
      {
        productId: product.id,
        sku: `AGG-B-${unique}`,
        name: 'Expensive',
        price: '300.0000',
        fulfillmentType: FulfillmentType.AUTO,
        status: VariantStatus.ACTIVE,
      },
    ]);
    const variants = await dataSource.getRepository(ProductVariant).find({
      where: { productId: product.id },
      order: { sku: 'ASC' },
    });
    await dataSource.getRepository(InventoryItem).save([
      {
        productVariantId: variants[0].id,
        encryptedPayload: cryptoService.encryptJson({ a: 1 }),
        encryptionKeyVersion: 1,
        status: InventoryStatus.AVAILABLE,
      },
      {
        productVariantId: variants[0].id,
        encryptedPayload: cryptoService.encryptJson({ b: 2 }),
        encryptionKeyVersion: 1,
        status: InventoryStatus.AVAILABLE,
      },
      {
        productVariantId: variants[1].id,
        encryptedPayload: cryptoService.encryptJson({ c: 3 }),
        encryptionKeyVersion: 1,
        status: InventoryStatus.AVAILABLE,
      },
    ]);
    unique += 1;

    const detail = (await catalogService.getPublicProduct(product.id)) as {
      minPrice: string;
      totalAvailable: number;
    };
    expect(detail.minPrice).toBe('100.0000');
    expect(detail.totalAvailable).toBe(3);
  });

  it('admin CRUD records audit logs', async () => {
    const before = await dataSource.getRepository(AdminAuditLog).count();
    const category = await catalogService.createCategory(
      { name: `Audit Cat ${unique}` },
      admin.id,
    );
    const after = await dataSource.getRepository(AdminAuditLog).count();
    expect(after).toBeGreaterThan(before);
    expect(category.category).toBeTruthy();
  });

  it('slug and SKU are unique even against soft-deleted records', async () => {
    const name = `Dup ${unique}`;
    const c1 = await catalogService.createCategory({ name }, admin.id);
    await catalogService.deleteCategory(c1.category.id, admin.id);

    await expect(
      catalogService.createCategory({ name }, admin.id),
    ).rejects.toThrow();
  });

  it('category delete is blocked when it has a child', async () => {
    const parent = await catalogService.createCategory(
      { name: `Parent ${unique}` },
      admin.id,
    );
    await catalogService.createCategory(
      { name: `Child ${unique}`, parentId: parent.category.id },
      admin.id,
    );
    await expect(
      catalogService.deleteCategory(parent.category.id, admin.id),
    ).rejects.toThrow();
  });

  async function seedCategory() {
    const category = await dataSource.getRepository(Category).save({
      name: `Cat ${unique}`,
      slug: `cat-${unique}`,
      isActive: true,
    });
    return category;
  }

  async function seedProduct(input: {
    category: Category;
    status: ProductStatus;
    fulfillment: FulfillmentType;
    withStock: boolean;
  }) {
    const product = await dataSource.getRepository(Product).save({
      name: `P ${unique}`,
      slug: `p-${unique}`,
      status: input.status,
    });
    await dataSource.getRepository(ProductVariant).save({
      productId: product.id,
      sku: `SKU-${unique}`,
      name: `V ${unique}`,
      price: '50.0000',
      fulfillmentType: input.fulfillment,
      status: VariantStatus.ACTIVE,
    });
    if (input.withStock) {
      await dataSource.getRepository(InventoryItem).save({
        productVariantId: (
          await dataSource
            .getRepository(ProductVariant)
            .findOneByOrFail({ sku: `SKU-${unique}` })
        ).id,
        encryptedPayload: cryptoService.encryptJson({ x: unique }),
        encryptionKeyVersion: 1,
        status: InventoryStatus.AVAILABLE,
      });
    }
    unique += 1;
    return product;
  }
});
