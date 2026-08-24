import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from './entities/cart-item.entity';
import { Cart } from './entities/cart.entity';
import { Favorite } from './entities/favorite.entity';
import { ProductView } from './entities/product-view.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart, CartItem, Favorite, ProductView]),
  ],
  exports: [TypeOrmModule],
})
export class ShoppingModule {}
