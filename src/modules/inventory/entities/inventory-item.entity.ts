import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { ProductVariant } from '../../catalog/entities/product-variant.entity';
import { OrderItem } from '../../commerce/entities/order-item.entity';
import { InventoryStatus } from '../enums/inventory-status.enum';

@Entity('inventory_items')
@Index('idx_inventory_items_product_variant_id', ['productVariantId'])
@Index('idx_inventory_items_status', ['status'])
@Index('idx_inventory_items_order_item_id', ['orderItemId'])
export class InventoryItem extends AuditableEntity {
  @Column({ name: 'product_variant_id', type: 'uuid' })
  productVariantId!: string;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'product_variant_id' })
  productVariant!: ProductVariant;

  @Column({ name: 'order_item_id', type: 'uuid', nullable: true })
  orderItemId?: string | null;

  @ManyToOne(() => OrderItem, { nullable: true })
  @JoinColumn({ name: 'order_item_id' })
  orderItem?: OrderItem | null;

  @Column({ name: 'encrypted_payload', type: 'text' })
  encryptedPayload!: string;

  @Column({ name: 'encryption_key_version', type: 'int', default: 1 })
  encryptionKeyVersion!: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: InventoryStatus,
    default: InventoryStatus.AVAILABLE,
  })
  status!: InventoryStatus;

  @Column({ name: 'reserved_until', type: 'timestamptz', nullable: true })
  reservedUntil?: Date | null;

  @Column({ name: 'sold_at', type: 'timestamptz', nullable: true })
  soldAt?: Date | null;
}
