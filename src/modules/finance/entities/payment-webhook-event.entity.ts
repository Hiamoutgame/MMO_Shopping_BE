import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentWebhookEventStatus } from '../enums/payment-webhook-event-status.enum';
import { PaymentTransaction } from './payment-transaction.entity';
import { WalletTransaction } from './wallet-transaction.entity';

/**
 * Nhật ký bất biến của từng giao dịch ngân hàng nhà cung cấp báo về.
 * UNIQUE(provider, provider_event_id) là chốt chặn chống cộng tiền hai lần
 * khi SePay retry webhook hoặc sync lại cùng giao dịch.
 */
@Entity('payment_webhook_events')
@Unique('uq_payment_webhook_events_provider_event', [
  'provider',
  'providerEventId',
])
@Index('idx_payment_webhook_events_status', ['status'])
export class PaymentWebhookEvent extends AuditableEntity {
  @Column({ type: 'enum', enum: PaymentProvider })
  provider!: PaymentProvider;

  @Column({ name: 'provider_event_id', type: 'varchar', length: 100 })
  providerEventId!: string;

  @Column({ type: 'varchar', length: 20 })
  source!: 'WEBHOOK' | 'SYNC';

  @Column({
    type: 'enum',
    enum: PaymentWebhookEventStatus,
    default: PaymentWebhookEventStatus.RECEIVED,
  })
  status!: PaymentWebhookEventStatus;

  @Column({ name: 'transfer_type', type: 'varchar', length: 10 })
  transferType!: string;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount!: string;

  @Column({ name: 'payment_code', type: 'varchar', length: 50, nullable: true })
  paymentCode?: string | null;

  @Column({ type: 'text', nullable: true })
  content?: string | null;

  @Column({
    name: 'reference_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  referenceCode?: string | null;

  @Column({
    name: 'account_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  accountNumber?: string | null;

  @Column({
    name: 'transaction_date',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  transactionDate?: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 60, nullable: true })
  reason?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ name: 'delivery_count', type: 'int', default: 1 })
  deliveryCount!: number;

  @Column({ name: 'payment_transaction_id', type: 'uuid', nullable: true })
  paymentTransactionId?: string | null;

  @ManyToOne(() => PaymentTransaction, { nullable: true })
  @JoinColumn({ name: 'payment_transaction_id' })
  paymentTransaction?: PaymentTransaction | null;

  @Column({ name: 'wallet_transaction_id', type: 'uuid', nullable: true })
  walletTransactionId?: string | null;

  @ManyToOne(() => WalletTransaction, { nullable: true })
  @JoinColumn({ name: 'wallet_transaction_id' })
  walletTransaction?: WalletTransaction | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy?: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date | null;

  @Column({ name: 'last_received_at', type: 'timestamptz' })
  lastReceivedAt!: Date;
}
