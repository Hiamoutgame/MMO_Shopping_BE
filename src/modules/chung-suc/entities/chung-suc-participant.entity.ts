import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { ChungSucCampaign } from './chung-suc-campaign.entity';
import { Account } from '../../identity/entities/account.entity';
import { Order } from '../../commerce/entities/order.entity';

@Entity('chung_suc_participants')
@Index(['campaignId', 'accountId'])
@Index(['campaignId', 'joinedAt'])
export class ChungSucParticipant extends UuidEntity {
  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null;

  @Column({ name: 'invite_code', type: 'varchar', length: 100, nullable: true })
  inviteCode?: string | null;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'joined_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  joinedAt!: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @ManyToOne(() => ChungSucCampaign)
  @JoinColumn({ name: 'campaign_id' })
  campaign!: ChungSucCampaign;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'order_id' })
  order?: Order | null;
}
