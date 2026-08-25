import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { AuthSession } from './entities/auth-session.entity';
import { Role } from './entities/role.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Account, AuthSession])],
  exports: [TypeOrmModule],
})
export class IdentityModule {}
