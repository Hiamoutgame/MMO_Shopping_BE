import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceRule } from './entities/price-rule.entity';
import { PriceTier } from './entities/price-tier.entity';
import { PriceHistory } from './entities/price-history.entity';
import { PriceEngineService } from './services/price-engine.service';
import { PricingController } from './controllers/pricing.controller';
import { Product } from '../catalog/entities/product.entity';
import { Account } from '../identity/entities/account.entity';
import { Package } from '../packages/entities/package.entity';
import { Voucher } from '../commerce/entities/voucher.entity';
import { SellerReferralCode } from '../sellers/entities/seller-referral-code.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PriceRule,
      PriceTier,
      PriceHistory,
      Product,
      Account,
      Package,
      Voucher,
      SellerReferralCode,
    ]),
  ],
  providers: [PriceEngineService],
  controllers: [PricingController],
  exports: [PriceEngineService],
})
export class PricingModule {}
