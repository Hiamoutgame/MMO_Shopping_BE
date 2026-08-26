import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoService } from '../../common/crypto/crypto.service';
import { IdentityModule } from '../identity/identity.module';
import { SystemModule } from '../system/system.module';
import {
  AdminFinanceController,
  FinanceController,
} from './controllers/finance.controller';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { FinanceService } from './services/finance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, PaymentTransaction, WalletTransaction]),
    IdentityModule,
    SystemModule,
  ],
  controllers: [FinanceController, AdminFinanceController],
  providers: [FinanceService, CryptoService],
  exports: [TypeOrmModule, FinanceService],
})
export class FinanceModule {}
