import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { FulfillmentType } from '../enums/fulfillment-type.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import { Product } from './product.entity';

@Entity('product_variants')
@Check('chk_product_variants_price', 'price >= 0')
@Index('idx_product_variants_product_id', ['productId'])
export class ProductVariant extends SoftDeletableEntity {
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.variants)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  price!: string;

  @Column({ name: 'fulfillment_type', type: 'enum', enum: FulfillmentType })
  fulfillmentType!: FulfillmentType;

  @Column({ type: 'enum', enum: VariantStatus, default: VariantStatus.ACTIVE })
  status!: VariantStatus;

  @Column({ type: 'jsonb', nullable: true })
  attributes?: Record<string, any> | null;

  @Column({ name: 'duration_days', type: 'int', nullable: true })
  durationDays?: number | null;
}
