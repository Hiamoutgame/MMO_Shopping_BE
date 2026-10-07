import { Column, Entity, JoinColumn, OneToOne, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { Account } from '../../identity/entities/account.entity';
import { SellerApprovalStatus } from '../enums/seller-approval-status.enum';

@Entity('seller_profiles')
@Index(['accountId'])
@Index(['approvalStatus'])
export class SellerProfile extends SoftDeletableEntity {
  @Column({ name: 'account_id', type: 'uuid', unique: true })
  accountId!: string;

  @Column({ name: 'business_name', type: 'varchar', length: 255, nullable: true })
  businessName?: string | null;

  @Column({ name: 'business_type', type: 'varchar', length: 100, nullable: true })
  businessType?: string | null;

  @Column({ name: 'tax_id', type: 'varchar', length: 50, nullable: true })
  taxId?: string | null;

  @Column({
    name: 'approval_status',
    type: 'enum',
    enum: SellerApprovalStatus,
    default: SellerApprovalStatus.PENDING,
  })
  approvalStatus!: SellerApprovalStatus;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string | null;

  @Column({ name: 'commission_rate', type: 'numeric', precision: 5, scale: 2, nullable: true })
  commissionRate?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @OneToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;
}
