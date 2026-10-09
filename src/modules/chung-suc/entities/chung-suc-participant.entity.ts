import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { ChungSucCampaign } from './chung-suc-campaign.entity';
import { Account } from '../../identity/entities/account.entity';
import { Order } from '../../commerce/entities/order.entity';
import { ParticipantStatus } from '../enums/participant-status.enum';

@Entity('chung_suc_participants')
@Index(['campaignId', 'accountId'])
@Index(['campaignId', 'joinedAt'])
@Index('idx_chung_suc_participants_status', ['status'])
@Index('uq_chung_suc_participants_open_code', ['campaignId', 'codeHash'], {
  unique: true,
  where: `status IN ('PENDING', 'CHECKING', 'PROCESSING')`,
})
export class ChungSucParticipant extends UuidEntity {
  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash!: string;

  @Column({ name: 'encrypted_code', type: 'text' })
  encryptedCode!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({
    type: 'enum',
    enum: ParticipantStatus,
    enumName: 'chung_suc_participant_status_enum',
    default: ParticipantStatus.PENDING,
  })
  status!: ParticipantStatus;

  @Column({ name: 'unit_price', type: 'numeric', precision: 19, scale: 4 })
  unitPrice!: string;

  @Column({ type: 'char', length: 3, default: 'VND' })
  currency!: string;

  @Column({
    name: 'joined_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  joinedAt!: Date;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt?: Date | null;

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
