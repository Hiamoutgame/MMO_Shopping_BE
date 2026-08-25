import { Check, Column, Entity, Index } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { OutboxEventStatus } from '../enums/outbox-event-status.enum';

@Entity('outbox_events')
@Check('chk_outbox_events_attempts', 'attempts >= 0')
@Index('idx_outbox_events_status_not_before', ['status', 'notBefore'])
@Index('uq_outbox_events_idempotency_key', ['idempotencyKey'], {
  unique: true,
  where: 'idempotency_key IS NOT NULL',
})
export class OutboxEvent extends AuditableEntity {
  @Column({ name: 'aggregate_type', type: 'varchar', length: 100 })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 120 })
  eventType!: string;

  @Column({
    type: 'enum',
    enum: OutboxEventStatus,
    default: OutboxEventStatus.PENDING,
  })
  status!: OutboxEventStatus;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  idempotencyKey?: string | null;

  @Column({ name: 'not_before', type: 'timestamptz', nullable: true })
  notBefore?: Date | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;
}
