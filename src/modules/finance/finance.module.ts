import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoService } from '../../common/crypto/crypto.service';
import { IdentityModule } from '../identity/identity.module';
import { SystemModule } from '../system/system.module';
import {
  AdminFinanceController,
  FinanceController,
  SepayWebhookController,
} from './controllers/finance.controller';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { DepositService } from './services/deposit.service';
import { FinanceService } from './services/finance.service';
import { SepayClientService } from './services/sepay-client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      PaymentTransaction,
      WalletTransaction,
      PaymentWebhookEvent,
    ]),
    IdentityModule,
    SystemModule,
  ],
  controllers: [
    FinanceController,
    SepayWebhookController,
    AdminFinanceController,
  ],
  providers: [
    FinanceService,
    DepositService,
    SepayClientService,
    CryptoService,
  ],
  exports: [TypeOrmModule, FinanceService],
})
export class FinanceModule {}
