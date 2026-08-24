import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Order } from '../../commerce/entities/order.entity';
import { WalletTransactionStatus } from '../enums/wallet-transaction-status.enum';
import { WalletTransactionType } from '../enums/wallet-transaction-type.enum';
import { PaymentTransaction } from './payment-transaction.entity';
import { Wallet } from './wallet.entity';

@Entity('wallet_transactions')
@Check('chk_wallet_transactions_amount', 'amount > 0')
@Check('chk_wallet_transactions_balance_after', 'balance_after >= 0')
@Index('idx_wallet_transactions_wallet_id', ['walletId'])
export class WalletTransaction extends UuidEntity {
  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet!: Wallet;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null;

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'order_id' })
  order?: Order | null;

  @Column({
    name: 'payment_transaction_id',
    type: 'uuid',
    nullable: true,
  })
  paymentTransactionId?: string | null;

  @ManyToOne(() => PaymentTransaction, { nullable: true })
  @JoinColumn({ name: 'payment_transaction_id' })
  paymentTransaction?: PaymentTransaction | null;

  @Column({
    type: 'enum',
    enum: WalletTransactionType,
  })
  type!: WalletTransactionType;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount!: string;

  @Column({ name: 'balance_before', type: 'numeric', precision: 19, scale: 4 })
  balanceBefore!: string;

  @Column({ name: 'balance_after', type: 'numeric', precision: 19, scale: 4 })
  balanceAfter!: string;

  @Column({
    type: 'enum',
    enum: WalletTransactionStatus,
    default: WalletTransactionStatus.COMPLETED,
  })
  status!: WalletTransactionStatus;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
