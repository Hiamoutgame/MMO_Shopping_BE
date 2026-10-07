import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChungSucSeedService } from './chung-suc-seed.service';
import { Season } from '../../modules/seasons/entities/season.entity';
import { ChungSucCampaign } from '../../modules/chung-suc/entities/chung-suc-campaign.entity';
import { Package } from '../../modules/packages/entities/package.entity';
import { PackageProduct } from '../../modules/packages/entities/package-product.entity';
import { PriceTier } from '../../modules/pricing/entities/price-tier.entity';
import { PriceRule } from '../../modules/pricing/entities/price-rule.entity';
import { Voucher } from '../../modules/commerce/entities/voucher.entity';
import { Product } from '../../modules/catalog/entities/product.entity';
import { Account } from '../../modules/identity/entities/account.entity';
import { Role } from '../../modules/identity/entities/role.entity';
import { SellerProfile } from '../../modules/sellers/entities/seller-profile.entity';
import { SellerReferralCode } from '../../modules/sellers/entities/seller-referral-code.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Season,
      ChungSucCampaign,
      Package,
      PackageProduct,
      PriceTier,
      PriceRule,
      Voucher,
      Product,
      Account,
      Role,
      SellerProfile,
      SellerReferralCode,
    ]),
  ],
  providers: [ChungSucSeedService],
  exports: [ChungSucSeedService],
})
export class SeedModule {}
