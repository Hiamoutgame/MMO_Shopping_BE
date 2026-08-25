import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { Wallet } from './entities/wallet.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, PaymentTransaction, WalletTransaction]),
  ],
  exports: [TypeOrmModule],
})
export class FinanceModule {}
