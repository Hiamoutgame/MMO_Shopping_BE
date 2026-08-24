import { Column, Entity, OneToMany } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/base/soft-deletable.entity';
import { Account } from './account.entity';

@Entity('roles')
export class Role extends SoftDeletableEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @OneToMany(() => Account, (account) => account.role)
  accounts: Account[];
}
