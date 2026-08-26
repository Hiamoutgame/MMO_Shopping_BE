import { Check, Column, Entity, OneToMany } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { DiscountType } from '../enums/discount-type.enum';
import { Order } from './order.entity';

@Entity('vouchers')
@Check('chk_vouchers_discount_value', 'discount_value >= 0')
@Check('chk_vouchers_ends_at', 'ends_at > starts_at')
@Check(
  'chk_vouchers_minimum_order_amount',
  'minimum_order_amount IS NULL OR minimum_order_amount >= 0',
)
@Check(
  'chk_vouchers_maximum_discount_amount',
  'maximum_discount_amount IS NULL OR maximum_discount_amount >= 0',
)
@Check('chk_vouchers_usage_limit', 'usage_limit >= 0')
@Check('chk_vouchers_per_account_limit', 'per_account_limit >= 0')
@Check('chk_vouchers_used_count', 'used_count >= 0')
@Check(
  'chk_vouchers_percentage_value',
  "discount_type <> 'PERCENTAGE' OR discount_value <= 100",
)
export class Voucher extends SoftDeletableEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: DiscountType,
  })
  discountType!: DiscountType;

  @Column({ name: 'discount_value', type: 'numeric', precision: 19, scale: 4 })
  discountValue!: string;

  @Column({
    name: 'minimum_order_amount',
    type: 'numeric',
    precision: 19,
    scale: 4,
    nullable: true,
  })
  minimumOrderAmount?: string | null;

  @Column({
    name: 'maximum_discount_amount',
    type: 'numeric',
    precision: 19,
    scale: 4,
    nullable: true,
  })
  maximumDiscountAmount?: string | null;

  @Column({ name: 'usage_limit', type: 'int' })
  usageLimit!: number;

  @Column({ name: 'per_account_limit', type: 'int', default: 1 })
  perAccountLimit!: number;

  @Column({ name: 'used_count', type: 'int', default: 0 })
  usedCount!: number;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => Order, (order) => order.voucher)
  orders!: Order[];
}
