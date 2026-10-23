import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { Product } from '../../catalog/entities/product.entity';
import { Season } from '../../seasons/entities/season.entity';

@Entity('purchase_batches')
@Index(['productId', 'purchaseDate'])
@Index(['seasonId'])
export class PurchaseBatch extends SoftDeletableEntity {
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'season_id', type: 'uuid', nullable: true })
  seasonId?: string | null;

  @Column({ name: 'batch_number', type: 'varchar', length: 100 })
  batchNumber!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'cost_per_unit', type: 'numeric', precision: 19, scale: 4 })
  costPerUnit!: string;

  @Column({ name: 'total_cost', type: 'numeric', precision: 19, scale: 4 })
  totalCost!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  supplier?: string | null;

  @Column({ name: 'purchase_date', type: 'date' })
  purchaseDate!: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ManyToOne(() => Season, { nullable: true })
  @JoinColumn({ name: 'season_id' })
  season?: Season | null;
}
