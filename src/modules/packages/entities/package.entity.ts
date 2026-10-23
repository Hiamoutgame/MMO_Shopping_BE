import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { Season } from '../../seasons/entities/season.entity';

@Entity('packages')
@Index(['seasonId', 'isActive'])
@Index(['isActive', 'sortOrder'])
export class Package extends SoftDeletableEntity {
  @Column({ name: 'season_id', type: 'uuid', nullable: true })
  seasonId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'display_price', type: 'numeric', precision: 19, scale: 4 })
  displayPrice!: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 19, scale: 4 })
  unitPrice!: string;

  @Column({ name: 'applicable_roles', type: 'jsonb' })
  applicableRoles!: string[];

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
  startDate?: Date | null;

  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @ManyToOne(() => Season, { nullable: true })
  @JoinColumn({ name: 'season_id' })
  season?: Season | null;
}
