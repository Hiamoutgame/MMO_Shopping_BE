import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { Product } from '../../catalog/entities/product.entity';

@Entity('cost_tiers')
@Index(['productId', 'isActive'])
@Index(['productId', 'quantityFrom'])
export class CostTier extends SoftDeletableEntity {
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'quantity_from', type: 'int' })
  quantityFrom!: number;

  @Column({ name: 'quantity_to', type: 'int', nullable: true })
  quantityTo?: number | null;

  @Column({ name: 'cost_per_unit', type: 'numeric', precision: 19, scale: 4 })
  costPerUnit!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;
}
