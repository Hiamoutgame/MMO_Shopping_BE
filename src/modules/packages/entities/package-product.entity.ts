import { Column, Entity, JoinColumn, ManyToOne, Index } from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Package } from './package.entity';
import { Product } from '../../catalog/entities/product.entity';

@Entity('package_products')
@Index(['packageId'])
@Index(['productId'])
export class PackageProduct extends UuidEntity {
  @Column({ name: 'package_id', type: 'uuid' })
  packageId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @ManyToOne(() => Package)
  @JoinColumn({ name: 'package_id' })
  package!: Package;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;
}
