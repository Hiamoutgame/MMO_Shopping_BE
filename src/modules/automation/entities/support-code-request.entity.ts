import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { Order } from '../../commerce/entities/order.entity';
import { Account } from '../../identity/entities/account.entity';
import { SupportCodeRequestStatus } from '../enums/support-code-request-status.enum';
import { SupportDispatch } from './support-dispatch.entity';

@Entity('support_code_requests')
@Check('chk_support_code_requests_quantity', 'quantity > 0')
@Index('idx_support_code_requests_account_id', ['accountId'])
@Index('idx_support_code_requests_code_hash', ['codeHash'])
@Index('idx_support_code_requests_status', ['status'])
@Index('uq_support_code_requests_order_id', ['orderId'], {
  unique: true,
  where: 'order_id IS NOT NULL',
})
export class SupportCodeRequest extends AuditableEntity {
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null;

  @OneToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'order_id' })
  order?: Order | null;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash!: string;

  @Column({ name: 'encrypted_code', type: 'text' })
  encryptedCode!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({
    type: 'enum',
    enum: SupportCodeRequestStatus,
    default: SupportCodeRequestStatus.ACTIVE,
  })
  status!: SupportCodeRequestStatus;

  @Column({
    name: 'result_flags',
    type: 'boolean',
    array: true,
    default: () => "'{}'",
  })
  resultFlags!: boolean[];

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @OneToMany(() => SupportDispatch, (dispatch) => dispatch.request)
  dispatches!: SupportDispatch[];
}
