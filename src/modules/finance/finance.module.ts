import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoService } from '../../common/crypto/crypto.service';
import { IdentityModule } from '../identity/identity.module';
import { SystemModule } from '../system/system.module';
import {
  AdminFinanceController,
  FinanceController,
} from './controllers/finance.controller';
import {
  AdminSepayController,
  SepayDepositController,
  SepayWebhookController,
} from './controllers/sepay.controller';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { SepayTransaction } from './entities/sepay-transaction.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { FinanceService } from './services/finance.service';
import { SepayReconcileService } from './services/sepay-reconcile.service';
import { SepayService } from './services/sepay.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      PaymentTransaction,
      WalletTransaction,
      SepayTransaction,
    ]),
    IdentityModule,
    SystemModule,
  ],
  controllers: [
    FinanceController,
    AdminFinanceController,
    SepayDepositController,
    SepayWebhookController,
    AdminSepayController,
  ],
  providers: [
    FinanceService,
    CryptoService,
    SepayService,
    SepayReconcileService,
  ],
  exports: [TypeOrmModule, FinanceService],
})
export class FinanceModule {}
