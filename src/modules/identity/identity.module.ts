import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminAccountController } from './controllers/admin-account.controller';
import { AdminRoleController } from './controllers/admin-role.controller';
import { AuthController } from './controllers/auth.controller';
import { Account } from './entities/account.entity';
import { AuthSession } from './entities/auth-session.entity';
import { Role } from './entities/role.entity';
import { AccountService } from './services/account.service';
import { AuthService } from './services/auth.service';
import { RoleService } from './services/role.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Account, AuthSession]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn:
            configService.get<
              NonNullable<JwtModuleOptions['signOptions']>['expiresIn']
            >('jwt.expiresIn') || '15m',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, AdminAccountController, AdminRoleController],
  providers: [
    AuthService,
    AccountService,
    RoleService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [TypeOrmModule, AuthService, AccountService, RoleService, JwtModule],
})
export class IdentityModule {}
