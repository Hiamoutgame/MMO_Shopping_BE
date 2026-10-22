import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { Season } from '../../seasons/entities/season.entity';
import { Product } from '../../catalog/entities/product.entity';
import { CampaignStatus } from '../enums/campaign-status.enum';

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
