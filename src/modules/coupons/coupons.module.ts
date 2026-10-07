import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponUsage } from './entities/coupon-usage.entity';
import { CouponProduct } from './entities/coupon-product.entity';
import { CouponSeason } from './entities/coupon-season.entity';
import { CouponPackage } from './entities/coupon-package.entity';
import { CouponsService } from './services/coupons.service';
import { CouponsController } from './controllers/coupons.controller';
import { Voucher } from '../commerce/entities/voucher.entity';
import { Account } from '../identity/entities/account.entity';
import { Order } from '../commerce/entities/order.entity';
import { Product } from '../catalog/entities/product.entity';
import { Season } from '../seasons/entities/season.entity';
import { Package } from '../packages/entities/package.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CouponUsage,
      CouponProduct,
      CouponSeason,
      CouponPackage,
      Voucher,
      Account,
      Order,
      Product,
      Season,
      Package,
    ]),
  ],
  providers: [CouponsService],
  controllers: [CouponsController],
  exports: [CouponsService],
})
export class CouponsModule {}
