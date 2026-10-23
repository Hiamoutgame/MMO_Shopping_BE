import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { Product } from '../../catalog/entities/product.entity';
import { Account } from '../../identity/entities/account.entity';

@Entity('price_history')
@Index(['productId', 'changedAt'])
@Index(['priceType', 'changedAt'])
export class PriceHistory extends SoftDeletableEntity {
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'price_type', type: 'varchar', length: 50 })
  priceType!: string;

  @Column({ name: 'old_price', type: 'numeric', precision: 19, scale: 4 })
  oldPrice!: string;

  @Column({ name: 'new_price', type: 'numeric', precision: 19, scale: 4 })
  newPrice!: string;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy!: string;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({
    name: 'changed_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  changedAt!: Date;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'changed_by' })
  admin!: Account;
}
