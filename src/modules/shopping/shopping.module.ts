import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { IdentityModule } from '../identity/identity.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ShoppingController } from './controllers/shopping.controller';
import { CartItem } from './entities/cart-item.entity';
import { Cart } from './entities/cart.entity';
import { Favorite } from './entities/favorite.entity';
import { ProductView } from './entities/product-view.entity';
import { ShoppingService } from './services/shopping.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cart,
      CartItem,
      Favorite,
      ProductView,
      InventoryItem,
    ]),
    CatalogModule,
    IdentityModule,
  ],
  controllers: [ShoppingController],
  providers: [ShoppingService, OptionalJwtAuthGuard],
  exports: [TypeOrmModule, ShoppingService],
})
export class ShoppingModule {}
