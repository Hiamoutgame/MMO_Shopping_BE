import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { Season } from '../../seasons/entities/season.entity';
import { Product } from '../../catalog/entities/product.entity';
import { CampaignStatus } from '../enums/campaign-status.enum';
import { EventVariant } from '../enums/event-variant.enum';

@Entity('chung_suc_campaigns')
export class ChungSucCampaign extends SoftDeletableEntity {
  @Column({ name: 'season_id', type: 'uuid', nullable: true })
  seasonId?: string | null;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl?: string | null;

  // Số tài khoản hỗ trợ tối đa cho MỖI mã mời, không phải tổng của campaign.
  @Column({ name: 'target_quantity', type: 'int' })
  targetQuantity!: number;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime!: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime!: Date;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.DRAFT,
  })
  status!: CampaignStatus;

  // Mã nội bộ của mùa sự kiện, VD XAP_XINH_2026.
  @Column({
    name: 'event_code',
    type: 'varchar',
    length: 64,
    unique: true,
    nullable: true,
  })
  eventCode?: string | null;

  @Column({
    type: 'enum',
    enum: EventVariant,
    enumName: 'chung_suc_event_variant_enum',
    default: EventVariant.CUSTOM,
  })
  variant!: EventVariant;

  // Luật sự kiện (xem EventRules). null = không giới hạn.
  @Column({ name: 'helper_limit_per_day', type: 'int', nullable: true })
  helperLimitPerDay!: number | null;

  @Column({ name: 'helper_limit_total', type: 'int', nullable: true })
  helperLimitTotal!: number | null;

  @Column({ name: 'owner_limit_per_day', type: 'int', nullable: true })
  ownerLimitPerDay!: number | null;

  @Column({ name: 'owner_limit_total', type: 'int', nullable: true })
  ownerLimitTotal!: number | null;

  @Column({ name: 'points_cap', type: 'int', nullable: true })
  pointsCap!: number | null;

  @Column({ name: 'daily_reset', type: 'boolean', default: false })
  dailyReset!: boolean;

  @Column({ name: 'completion_conditions', type: 'jsonb', nullable: true })
  completionConditions?: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  rewards?: Record<string, any> | null;

  @ManyToOne(() => Season, { nullable: true })
  @JoinColumn({ name: 'season_id' })
  season?: Season | null;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;
}
