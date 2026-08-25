import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Account } from './account.entity';

@Entity('auth_sessions')
@Index('idx_auth_sessions_account_id', ['accountId'])
@Index('idx_auth_sessions_expires_at', ['expiresAt'])
export class AuthSession extends UuidEntity {
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({
    name: 'refresh_token_hash',
    type: 'varchar',
    length: 255,
    unique: true,
  })
  refreshTokenHash!: string;

  @Column({ name: 'token_family', type: 'varchar', length: 100 })
  tokenFamily!: string;

  @Column({
    name: 'device_label',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  deviceLabel?: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'replaced_by_session_id', type: 'uuid', nullable: true })
  replacedBySessionId?: string | null;

  @Column({ name: 'reuse_detected_at', type: 'timestamptz', nullable: true })
  reuseDetectedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
