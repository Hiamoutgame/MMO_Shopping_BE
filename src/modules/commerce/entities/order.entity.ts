import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { Account } from '../../identity/entities/account.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderType } from '../enums/order-type.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { OrderItem } from './order-item.entity';
import { Voucher } from './voucher.entity';

@Entity('orders')
@Check('chk_orders_subtotal', 'subtotal >= 0')
@Check('chk_orders_discount_amount', 'discount_amount >= 0')
@Check('chk_orders_discount_not_gt_subtotal', 'discount_amount <= subtotal')
@Check('chk_orders_total_amount', 'total_amount = subtotal - discount_amount')
@Index('idx_orders_account_id', ['accountId'])
@Index('idx_orders_status', ['status'])
export class Order extends AuditableEntity {
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({ name: 'voucher_id', type: 'uuid', nullable: true })
  voucherId?: string | null;

  @ManyToOne(() => Voucher, (voucher) => voucher.orders, { nullable: true })
  @JoinColumn({ name: 'voucher_id' })
  voucher?: Voucher | null;

  @Column({ name: 'order_number', type: 'varchar', length: 32, unique: true })
  orderNumber!: string;

  @Column({
    name: 'order_type',
    type: 'enum',
    enum: OrderType,
    default: OrderType.STANDARD,
  })
  orderType!: OrderType;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus!: PaymentStatus;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  subtotal!: string;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: '0',
  })
  discountAmount!: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 19, scale: 4 })
  totalAmount!: string;

  @Column({ type: 'char', length: 3, default: 'VND' })
  currency!: string;

  @CreateDateColumn({ name: 'placed_at', type: 'timestamptz' })
  placedAt!: Date;

  @OneToMany(() => OrderItem, (item) => item.order)
  items!: OrderItem[];
}
