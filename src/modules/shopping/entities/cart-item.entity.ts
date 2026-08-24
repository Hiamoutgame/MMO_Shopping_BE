import { Check, Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { ProductVariant } from '../../catalog/entities/product-variant.entity';
import { Cart } from './cart.entity';

@Entity('cart_items')
@Check('chk_cart_items_quantity', 'quantity > 0')
@Unique('uq_cart_items_cart_variant', ['cartId', 'productVariantId'])
export class CartItem extends AuditableEntity {
  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart!: Cart;

  @Column({ name: 'product_variant_id', type: 'uuid' })
  productVariantId!: string;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'product_variant_id' })
  productVariant!: ProductVariant;

  @Column({ type: 'int' })
  quantity!: number;
}
