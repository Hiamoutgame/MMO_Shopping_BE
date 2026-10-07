import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Voucher } from '../../commerce/entities/voucher.entity';
import { Season } from '../../seasons/entities/season.entity';

@Entity('coupon_seasons')
@Index(['voucherId'])
@Index(['seasonId'])
export class CouponSeason extends UuidEntity {
  @Column({ name: 'voucher_id', type: 'uuid' })
  voucherId!: string;

  @Column({ name: 'season_id', type: 'uuid' })
  seasonId!: string;

  @ManyToOne(() => Voucher)
  @JoinColumn({ name: 'voucher_id' })
  voucher!: Voucher;

  @ManyToOne(() => Season)
  @JoinColumn({ name: 'season_id' })
  season!: Season;
}
