import { Check, Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { Account } from '../../identity/entities/account.entity';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentTransactionStatus } from '../enums/payment-transaction-status.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { Wallet } from './wallet.entity';

@Entity('payment_transactions')
@Check('chk_payment_transactions_amount', 'amount > 0')
@Unique('uq_payment_transactions_provider_tx', [
  'provider',
  'providerTransactionId',
])
export class PaymentTransaction extends AuditableEntity {
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet!: Wallet;

  @Column({ type: 'enum', enum: PaymentProvider })
  provider!: PaymentProvider;

  @Column({
    name: 'provider_transaction_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerTransactionId?: string | null;

  @Column({
    name: 'merchant_reference',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  merchantReference!: string;

  @Column({ type: 'enum', enum: PaymentType })
  type!: PaymentType;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    default: PaymentTransactionStatus.PENDING,
  })
  status!: PaymentTransactionStatus;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  idempotencyKey!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;
}
