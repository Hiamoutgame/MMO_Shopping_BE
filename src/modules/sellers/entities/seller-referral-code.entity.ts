import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { SellerProfile } from './seller-profile.entity';

@Entity('seller_referral_codes')
@Index(['code'], { unique: true })
@Index(['sellerId', 'isActive'])
export class SellerReferralCode extends SoftDeletableEntity {
  @Column({ name: 'seller_id', type: 'uuid' })
  sellerId!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  code!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount!: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @ManyToOne(() => SellerProfile)
  @JoinColumn({ name: 'seller_id' })
  seller!: SellerProfile;
}
