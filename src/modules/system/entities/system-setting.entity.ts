import { Column, Entity } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';

@Entity('system_settings')
export class SystemSetting extends SoftDeletableEntity {
  @Column({ type: 'varchar', length: 120, unique: true })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic!: boolean;
}
