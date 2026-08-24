import { Column, Entity, Index, OneToMany } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductCategory } from './product-category.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('products')
@Index('idx_products_status', ['status'])
export class Product extends SoftDeletableEntity {
  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants!: ProductVariant[];

  @OneToMany(() => ProductCategory, (pc) => pc.product)
  productCategories!: ProductCategory[];

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status!: ProductStatus;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  images?: string[] | null;
}
