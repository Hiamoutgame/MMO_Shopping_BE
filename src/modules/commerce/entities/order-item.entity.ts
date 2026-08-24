import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { ProductVariant } from '../../catalog/entities/product-variant.entity';
import { Order } from './order.entity';

@Entity('order_items')
@Check('chk_order_items_unit_price', 'unit_price >= 0')
@Check('chk_order_items_quantity', 'quantity > 0')
@Check(
  'chk_order_items_total_amount',
  'total_amount = unit_price * quantity',
)
@Index('idx_order_items_order_id', ['orderId'])
export class OrderItem extends AuditableEntity {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'product_variant_id', type: 'uuid' })
  productVariantId: string;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'product_variant_id' })
  productVariant: ProductVariant;

  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  productName: string;

  @Column({ name: 'variant_name', type: 'varchar', length: 255 })
  variantName: string;

  @Column({ type: 'varchar', length: 100 })
  sku: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 19, scale: 4 })
  unitPrice: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'total_amount', type: 'numeric', precision: 19, scale: 4 })
  totalAmount: string;
}
