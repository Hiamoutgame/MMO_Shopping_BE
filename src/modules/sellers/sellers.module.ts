import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SellerProfile } from './entities/seller-profile.entity';
import { SellerReferralCode } from './entities/seller-referral-code.entity';
import { ReferralClick } from './entities/referral-click.entity';
import { SellersService } from './services/sellers.service';
import { SellersController } from './controllers/sellers.controller';
import { Account } from '../identity/entities/account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SellerProfile,
      SellerReferralCode,
      ReferralClick,
      Account,
    ]),
  ],
  providers: [SellersService],
  controllers: [SellersController],
  exports: [SellersService],
})
export class SellersModule {}
