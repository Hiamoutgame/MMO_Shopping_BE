import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Account } from '../../identity/entities/account.entity';

@Entity('admin_audit_logs')
@Index('idx_admin_audit_logs_admin_account_id', ['adminAccountId'])
@Index('idx_admin_audit_logs_target', ['targetType', 'targetId'])
export class AdminAuditLog extends UuidEntity {
  @Column({ name: 'admin_account_id', type: 'uuid' })
  adminAccountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'admin_account_id' })
  adminAccount!: Account;

  @Column({ type: 'varchar', length: 120 })
  action!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 100 })
  targetType!: string;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
