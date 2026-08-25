import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { IntegrationEndpoint } from '../../integration/entities/integration-endpoint.entity';
import { SupportDispatchStatus } from '../enums/support-dispatch-status.enum';
import { SupportCodeRequest } from './support-code-request.entity';

@Entity('support_dispatches')
@Check('chk_support_dispatches_sequence', 'sequence >= 0')
@Check('chk_support_dispatches_attempts', 'attempts >= 0')
@Unique('uq_support_dispatches_request_endpoint', ['requestId', 'endpointId'])
@Index('idx_support_dispatches_request_id', ['requestId'])
@Index('idx_support_dispatches_status', ['status'])
@Index('uq_support_dispatches_external_request_id', ['externalRequestId'], {
  unique: true,
  where: 'external_request_id IS NOT NULL',
})
export class SupportDispatch extends AuditableEntity {
  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @ManyToOne(() => SupportCodeRequest, (request) => request.dispatches)
  @JoinColumn({ name: 'request_id' })
  request!: SupportCodeRequest;

  @Column({ name: 'endpoint_id', type: 'uuid' })
  endpointId!: string;

  @ManyToOne(() => IntegrationEndpoint)
  @JoinColumn({ name: 'endpoint_id' })
  endpoint!: IntegrationEndpoint;

  @Column({ type: 'int' })
  sequence!: number;

  @Column({
    type: 'enum',
    enum: SupportDispatchStatus,
    default: SupportDispatchStatus.PENDING,
  })
  status!: SupportDispatchStatus;

  @Column({ type: 'boolean', nullable: true })
  result?: boolean | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({
    name: 'external_request_id',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  externalRequestId?: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date | null;

  @Column({ name: 'callback_received_at', type: 'timestamptz', nullable: true })
  callbackReceivedAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;
}
