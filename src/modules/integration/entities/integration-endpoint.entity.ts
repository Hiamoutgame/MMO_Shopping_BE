import { Check, Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { IntegrationAuthType } from '../enums/integration-auth-type.enum';

@Entity('integration_endpoints')
@Check('chk_integration_endpoints_priority', 'priority >= 0')
@Check('chk_integration_endpoints_timeout_ms', 'timeout_ms > 0')
@Index('idx_integration_endpoints_active', ['isActive'])
export class IntegrationEndpoint extends SoftDeletableEntity {
  @Column({ type: 'varchar', length: 100, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'base_url', type: 'varchar', length: 500 })
  baseUrl!: string;

  @Column({ name: 'submit_path', type: 'varchar', length: 255 })
  submitPath!: string;

  @Column({
    name: 'callback_path',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  callbackPath?: string | null;

  @Column({
    name: 'auth_type',
    type: 'enum',
    enum: IntegrationAuthType,
    default: IntegrationAuthType.HMAC,
  })
  authType!: IntegrationAuthType;

  @Column({ name: 'encrypted_credentials', type: 'text', nullable: true })
  encryptedCredentials?: string | null;

  @Column({ name: 'secret_key_version', type: 'int', default: 1 })
  secretKeyVersion!: number;

  @Column({ name: 'timeout_ms', type: 'int', default: 10000 })
  timeoutMs!: number;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;
}
