import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Account } from '../../identity/entities/account.entity';
import { Order } from './order.entity';
import { Voucher } from './voucher.entity';

@Entity('voucher_redemptions')
@Index('idx_voucher_redemptions_voucher_account', ['voucherId', 'accountId'])
@Index('uq_voucher_redemptions_order_id', ['orderId'], { unique: true })
export class VoucherRedemption extends UuidEntity {
  @Column({ name: 'voucher_id', type: 'uuid' })
  voucherId!: string;

  @ManyToOne(() => Voucher)
  @JoinColumn({ name: 'voucher_id' })
  voucher!: Voucher;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 19, scale: 4 })
  discountAmount!: string;

  @CreateDateColumn({ name: 'redeemed_at', type: 'timestamptz' })
  redeemedAt!: Date;
}
