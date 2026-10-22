import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { SellerReferralCode } from './seller-referral-code.entity';

@Entity('referral_clicks')
@Index(['referralCodeId', 'clickedAt'])
@Index(['sessionId'])
export class ReferralClick extends UuidEntity {
  @Column({ name: 'referral_code_id', type: 'uuid' })
  referralCodeId!: string;

  @Column({ name: 'session_id', type: 'varchar', length: 255 })
  sessionId!: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  referrer?: string | null;

  @Column({
    name: 'clicked_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  clickedAt!: Date;

  @ManyToOne(() => SellerReferralCode)
  @JoinColumn({ name: 'referral_code_id' })
  referralCode!: SellerReferralCode;
}
