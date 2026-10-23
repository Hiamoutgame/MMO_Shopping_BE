import { Column, Entity } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { SeasonStatus } from '../enums/season-status.enum';

@Entity('seasons')
export class Season extends SoftDeletableEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'banner_url', type: 'varchar', length: 500, nullable: true })
  bannerUrl?: string | null;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate!: Date;

  @Column({
    type: 'enum',
    enum: SeasonStatus,
    default: SeasonStatus.DRAFT,
  })
  status!: SeasonStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;
}
