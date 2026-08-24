import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { ProductCategory } from './product-category.entity';

@Entity('categories')
@Index('idx_categories_parent_id', ['parentId'])
export class Category extends SoftDeletableEntity {
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId?: string | null;

  @ManyToOne(() => Category, (cat) => cat.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent?: Category | null;

  @OneToMany(() => Category, (cat) => cat.parent)
  children!: Category[];

  @OneToMany(() => ProductCategory, (pc) => pc.category)
  productCategories!: ProductCategory[];

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  slug!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  description?: string | null;
}
