import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { SepayTransactionStatus } from '../enums/sepay-transaction-status.enum';
import { PaymentTransaction } from './payment-transaction.entity';

/**
 * Mỗi giao dịch ngân hàng SePay báo về (webhook hoặc đối soát) lưu đúng một
 * dòng theo `sepay_id`. Unique trên cột này là chốt chống cộng tiền hai lần
 * khi SePay retry webhook.
 */
@Entity('sepay_transactions')
@Index('idx_sepay_transactions_status', ['status'])
export class SepayTransaction extends AuditableEntity {
  @Column({ name: 'sepay_id', type: 'bigint', unique: true })
  sepayId!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  gateway?: string | null;

  @Column({
    name: 'transaction_date',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  transactionDate?: string | null;

  @Column({
    name: 'account_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  accountNumber?: string | null;

  // Mã thanh toán SePay nhận diện được, hoặc mã hệ thống tự tìm trong nội dung.
  @Column({ type: 'varchar', length: 50, nullable: true })
  code?: string | null;

  @Column({ type: 'text', nullable: true })
  content?: string | null;

  @Column({ name: 'transfer_type', type: 'varchar', length: 10 })
  transferType!: string;

  @Column({
    name: 'transfer_amount',
    type: 'numeric',
    precision: 19,
    scale: 4,
  })
  transferAmount!: string;

  @Column({
    name: 'reference_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  referenceCode?: string | null;

  // WEBHOOK hoặc RECONCILE.
  @Column({ type: 'varchar', length: 20 })
  source!: string;

  @Column({
    type: 'enum',
    enum: SepayTransactionStatus,
    enumName: 'sepay_transaction_status_enum',
  })
  status!: SepayTransactionStatus;

  // Lý do không khớp hoặc ghi chú của admin.
  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ name: 'payment_transaction_id', type: 'uuid', nullable: true })
  paymentTransactionId?: string | null;

  @ManyToOne(() => PaymentTransaction, { nullable: true })
  @JoinColumn({ name: 'payment_transaction_id' })
  paymentTransaction?: PaymentTransaction | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy?: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;
}
