import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Product } from '../../catalog/entities/product.entity';
import { Account } from '../../identity/entities/account.entity';

@Entity('product_views')
@Index('idx_product_views_product_id', ['productId'])
@Index('idx_product_views_account_id', ['accountId'])
export class ProductView extends UuidEntity {
  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId?: string | null;

  @ManyToOne(() => Account, { nullable: true })
  @JoinColumn({ name: 'account_id' })
  account?: Account | null;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'session_id', type: 'varchar', length: 100, nullable: true })
  sessionId?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  source?: string | null;

  @CreateDateColumn({ name: 'viewed_at', type: 'timestamptz' })
  viewedAt!: Date;
}
