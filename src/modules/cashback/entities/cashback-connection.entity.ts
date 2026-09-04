import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { Account } from '../../identity/entities/account.entity';
import { CashbackConnectionStatus } from '../enums/cashback-connection-status.enum';

@Entity('cashback_connections')
@Index('uq_cashback_connections_account_id', ['accountId'], { unique: true })
export class CashbackConnection extends AuditableEntity {
  @Column({ name: 'account_id', type: 'uuid', unique: true })
  accountId!: string;

  @OneToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({
    name: 'provider_user_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerUserId?: string | null;

  @Column({
    name: 'provider_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerEmail?: string | null;

  @Column({ name: 'token_type', type: 'varchar', length: 30, nullable: true })
  tokenType?: string | null;

  @Column({ name: 'encrypted_access_token', type: 'text', nullable: true })
  encryptedAccessToken?: string | null;

  @Column({ name: 'encrypted_challenge', type: 'text', nullable: true })
  encryptedChallenge?: string | null;

  @Column({ name: 'challenge_methods', type: 'jsonb', nullable: true })
  challengeMethods?: string[] | null;

  @Column({ name: 'challenge_expires_at', type: 'timestamptz', nullable: true })
  challengeExpiresAt?: Date | null;

  @Column({
    type: 'enum',
    enum: CashbackConnectionStatus,
    default: CashbackConnectionStatus.DISCONNECTED,
  })
  status!: CashbackConnectionStatus;

  @Column({ name: 'connected_at', type: 'timestamptz', nullable: true })
  connectedAt?: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt?: Date | null;

  @Column({ name: 'reauth_required_at', type: 'timestamptz', nullable: true })
  reauthRequiredAt?: Date | null;
}
