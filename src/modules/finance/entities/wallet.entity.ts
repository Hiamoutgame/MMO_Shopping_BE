import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  VersionColumn,
} from 'typeorm';
import { AuditableEntity } from '../../../common/base/auditable.entity';
import { Account } from '../../identity/entities/account.entity';
import { WalletTransaction } from './wallet-transaction.entity';

@Entity('wallets')
@Check('chk_wallets_balance', 'balance >= 0')
export class Wallet extends AuditableEntity {
  @Column({ name: 'account_id', type: 'uuid', unique: true })
  accountId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ type: 'char', length: 3, default: 'VND' })
  currency: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: '0' })
  balance: string;

  @VersionColumn({ name: 'version', default: 0 })
  version: number;

  @OneToMany(() => WalletTransaction, (tx) => tx.wallet)
  transactions: WalletTransaction[];
}
