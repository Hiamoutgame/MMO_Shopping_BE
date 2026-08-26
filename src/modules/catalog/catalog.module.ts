import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { IdentityModule } from '../identity/identity.module';
import { SystemModule } from '../system/system.module';
import { AdminCatalogController } from './controllers/admin-catalog.controller';
import { CatalogController } from './controllers/catalog.controller';
import { Category } from './entities/category.entity';
import { ProductCategory } from './entities/product-category.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { Product } from './entities/product.entity';
import { CatalogQueryService } from './services/catalog-query.service';
import { CatalogService } from './services/catalog.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      Product,
      ProductCategory,
      ProductVariant,
      InventoryItem,
    ]),
    IdentityModule,
    SystemModule,
  ],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogQueryService, CatalogService],
  exports: [TypeOrmModule, CatalogQueryService],
})
export class CatalogModule {}
