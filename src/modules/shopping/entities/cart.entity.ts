import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { Account } from '../../identity/entities/account.entity';
import { CartItem } from './cart-item.entity';

@Entity('carts')
export class Cart extends AuditableEntity {
  @Column({ name: 'account_id', type: 'uuid', unique: true })
  accountId!: string;

  @OneToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @OneToMany(() => CartItem, (item) => item.cart)
  items!: CartItem[];
}
