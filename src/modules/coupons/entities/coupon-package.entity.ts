import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Voucher } from '../../commerce/entities/voucher.entity';
import { Package } from '../../packages/entities/package.entity';

@Entity('coupon_packages')
@Index(['voucherId'])
@Index(['packageId'])
export class CouponPackage extends UuidEntity {
  @Column({ name: 'voucher_id', type: 'uuid' })
  voucherId!: string;

  @Column({ name: 'package_id', type: 'uuid' })
  packageId!: string;

  @ManyToOne(() => Voucher)
  @JoinColumn({ name: 'voucher_id' })
  voucher!: Voucher;

  @ManyToOne(() => Package)
  @JoinColumn({ name: 'package_id' })
  package!: Package;
}
