import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Order } from '../../commerce/entities/order.entity';
import { Product } from '../../catalog/entities/product.entity';
import { Season } from '../../seasons/entities/season.entity';

@Entity('profit_records')
@Index(['orderId'])
@Index(['productId', 'recordedAt'])
@Index(['seasonId', 'recordedAt'])
@Index(['sellerId', 'recordedAt'])
export class ProfitRecord extends UuidEntity {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'season_id', type: 'uuid', nullable: true })
  seasonId?: string | null;

  @Column({ name: 'seller_id', type: 'uuid', nullable: true })
  sellerId?: string | null;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  revenue!: string;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  cost!: string;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  profit!: string;

  @Column({ name: 'profit_margin', type: 'numeric', precision: 5, scale: 2 })
  profitMargin!: string;

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  recordedAt!: Date;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ManyToOne(() => Season, { nullable: true })
  @JoinColumn({ name: 'season_id' })
  season?: Season | null;
}
