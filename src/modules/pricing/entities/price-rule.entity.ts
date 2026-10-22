import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { PriceRuleType } from '../enums/price-rule-type.enum';
import { DiscountType } from '../../commerce/enums/discount-type.enum';

@Entity('price_rules')
@Index(['isActive', 'priority'])
@Index(['ruleType', 'isActive'])
export class PriceRule extends SoftDeletableEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    name: 'rule_type',
    type: 'enum',
    enum: PriceRuleType,
  })
  ruleType!: PriceRuleType;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ name: 'is_stackable', type: 'boolean', default: false })
  isStackable!: boolean;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: DiscountType,
  })
  discountType!: DiscountType;

  @Column({ name: 'discount_value', type: 'numeric', precision: 19, scale: 4 })
  discountValue!: string;

  @Column({ name: 'applicable_roles', type: 'jsonb', nullable: true })
  applicableRoles?: string[] | null;

  @Column({ name: 'applicable_product_ids', type: 'jsonb', nullable: true })
  applicableProductIds?: string[] | null;

  @Column({ name: 'applicable_season_ids', type: 'jsonb', nullable: true })
  applicableSeasonIds?: string[] | null;

  @Column({ name: 'applicable_package_ids', type: 'jsonb', nullable: true })
  applicablePackageIds?: string[] | null;

  @Column({ name: 'minimum_quantity', type: 'int', nullable: true })
  minimumQuantity?: number | null;

  @Column({ name: 'maximum_quantity', type: 'int', nullable: true })
  maximumQuantity?: number | null;

  @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
  startDate?: Date | null;

  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate?: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
