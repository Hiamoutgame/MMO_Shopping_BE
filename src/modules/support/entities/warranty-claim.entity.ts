import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { Account } from '../../identity/entities/account.entity';
import { OrderItem } from '../../commerce/entities/order-item.entity';
import { WarrantyClaimStatus } from '../enums/warranty-claim-status.enum';

@Entity('warranty_claims')
@Index('idx_warranty_claims_account_id', ['accountId'])
@Index('idx_warranty_claims_original_inventory_item_id', [
  'originalInventoryItemId',
])
@Index('idx_warranty_claims_status', ['status'])
export class WarrantyClaim extends AuditableEntity {
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({ name: 'order_item_id', type: 'uuid' })
  orderItemId!: string;

  @ManyToOne(() => OrderItem)
  @JoinColumn({ name: 'order_item_id' })
  orderItem!: OrderItem;

  @Column({ name: 'original_inventory_item_id', type: 'uuid' })
  originalInventoryItemId!: string;

  @ManyToOne(() => InventoryItem)
  @JoinColumn({ name: 'original_inventory_item_id' })
  originalInventoryItem!: InventoryItem;

  @Column({
    name: 'replacement_inventory_item_id',
    type: 'uuid',
    nullable: true,
  })
  replacementInventoryItemId?: string | null;

  @ManyToOne(() => InventoryItem, { nullable: true })
  @JoinColumn({ name: 'replacement_inventory_item_id' })
  replacementInventoryItem?: InventoryItem | null;

  @Column({
    type: 'enum',
    enum: WarrantyClaimStatus,
    default: WarrantyClaimStatus.REQUESTED,
  })
  status!: WarrantyClaimStatus;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote?: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date | null;
}
