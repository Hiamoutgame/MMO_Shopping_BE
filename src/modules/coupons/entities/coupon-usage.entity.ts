import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Voucher } from '../../commerce/entities/voucher.entity';
import { Account } from '../../identity/entities/account.entity';
import { Order } from '../../commerce/entities/order.entity';

@Entity('coupon_usages')
@Index(['voucherId', 'accountId'])
@Index(['voucherId', 'usedAt'])
@Index(['accountId', 'usedAt'])
export class CouponUsage extends UuidEntity {
  @Column({ name: 'voucher_id', type: 'uuid' })
  voucherId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 19, scale: 4 })
  discountAmount!: string;

  @Column({ name: 'used_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  usedAt!: Date;

  @ManyToOne(() => Voucher)
  @JoinColumn({ name: 'voucher_id' })
  voucher!: Voucher;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order!: Order;
}
