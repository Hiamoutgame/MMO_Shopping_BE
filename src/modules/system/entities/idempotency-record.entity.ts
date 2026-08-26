import { Column, Entity, Index, Unique } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';

@Entity('idempotency_records')
@Unique('uq_idempotency_records_scope_key', ['scope', 'key'])
@Index('idx_idempotency_records_account_id', ['accountId'])
export class IdempotencyRecord extends AuditableEntity {
  @Column({ type: 'varchar', length: 80 })
  scope!: string;

  @Column({ type: 'varchar', length: 120 })
  key!: string;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId?: string | null;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ type: 'varchar', length: 20, default: 'PROCESSING' })
  status!: string;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody?: Record<string, unknown> | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt?: Date | null;
}
