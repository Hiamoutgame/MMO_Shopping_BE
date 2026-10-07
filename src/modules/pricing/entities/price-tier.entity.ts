import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { Product } from '../../catalog/entities/product.entity';
import { Season } from '../../seasons/entities/season.entity';

@Entity('price_tiers')
@Index(['productId', 'roleCode', 'isActive'])
@Index(['productId', 'seasonId', 'roleCode'])
export class PriceTier extends SoftDeletableEntity {
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'season_id', type: 'uuid', nullable: true })
  seasonId?: string | null;

  @Column({ name: 'role_code', type: 'varchar', length: 50 })
  roleCode!: string;

  @Column({ name: 'quantity_from', type: 'int' })
  quantityFrom!: number;

  @Column({ name: 'quantity_to', type: 'int', nullable: true })
  quantityTo?: number | null;

  @Column({ name: 'unit_price', type: 'numeric', precision: 19, scale: 4 })
  unitPrice!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ManyToOne(() => Season, { nullable: true })
  @JoinColumn({ name: 'season_id' })
  season?: Season | null;
}
