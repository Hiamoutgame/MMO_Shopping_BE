import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Voucher } from '../../commerce/entities/voucher.entity';
import { Product } from '../../catalog/entities/product.entity';

@Entity('coupon_products')
@Index(['voucherId'])
@Index(['productId'])
export class CouponProduct extends UuidEntity {
  @Column({ name: 'voucher_id', type: 'uuid' })
  voucherId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Voucher)
  @JoinColumn({ name: 'voucher_id' })
  voucher!: Voucher;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;
}
