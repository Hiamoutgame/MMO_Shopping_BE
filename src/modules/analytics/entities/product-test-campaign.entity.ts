import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { Product } from '../../catalog/entities/product.entity';
import { Season } from '../../seasons/entities/season.entity';
import { TestCampaignStatus } from '../enums/test-campaign-status.enum';

@Entity('product_test_campaigns')
@Index(['productId', 'status'])
@Index(['seasonId'])
export class ProductTestCampaign extends SoftDeletableEntity {
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'season_id', type: 'uuid', nullable: true })
  seasonId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'test_budget', type: 'numeric', precision: 19, scale: 4 })
  testBudget!: string;

  @Column({ name: 'test_quantity', type: 'int' })
  testQuantity!: number;

  @Column({ name: 'cost_per_unit', type: 'numeric', precision: 19, scale: 4 })
  costPerUnit!: string;

  @Column({ name: 'sold_quantity', type: 'int', default: 0 })
  soldQuantity!: number;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  revenue!: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  profit!: string;

  @Column({
    type: 'enum',
    enum: TestCampaignStatus,
    default: TestCampaignStatus.TESTING,
  })
  status!: TestCampaignStatus;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate?: Date | null;

  @Column({ type: 'text', nullable: true })
  conclusions?: string | null;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ManyToOne(() => Season, { nullable: true })
  @JoinColumn({ name: 'season_id' })
  season?: Season | null;
}
