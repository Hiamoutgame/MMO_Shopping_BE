import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IdentityModule } from '../identity/identity.module';
import {
  CashbackController,
  CashbackPublicController,
} from './controllers/cashback.controller';
import { CashbackConnection } from './entities/cashback-connection.entity';
import { CashbackService } from './services/cashback.service';
import { HoanPhiClientService } from './services/hoanphi-client.service';
import { IntegrationCredentialService } from './services/integration-credential.service';

@Module({
  imports: [TypeOrmModule.forFeature([CashbackConnection]), IdentityModule],
  controllers: [CashbackPublicController, CashbackController],
  providers: [
    CashbackService,
    HoanPhiClientService,
    IntegrationCredentialService,
    JwtAuthGuard,
  ],
  exports: [CashbackService],
})
export class CashbackModule {}
