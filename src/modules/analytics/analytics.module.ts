import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfitRecord } from './entities/profit-record.entity';
import { ProductTestCampaign } from './entities/product-test-campaign.entity';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsController } from './controllers/analytics.controller';
import { Order } from '../commerce/entities/order.entity';
import { Product } from '../catalog/entities/product.entity';
import { PurchaseModule } from '../purchase/purchase.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProfitRecord,
      ProductTestCampaign,
      Order,
      Product,
    ]),
    PurchaseModule,
  ],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
