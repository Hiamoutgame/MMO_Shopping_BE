import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChungSucCampaign } from './entities/chung-suc-campaign.entity';
import { ChungSucParticipant } from './entities/chung-suc-participant.entity';
import { ChungSucService } from './services/chung-suc.service';
import { ChungSucController } from './controllers/chung-suc.controller';
import { Product } from '../catalog/entities/product.entity';
import { IdentityModule } from '../identity/identity.module';
import { PricingModule } from '../pricing/pricing.module';
import { CryptoService } from '../../common/crypto/crypto.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChungSucCampaign, ChungSucParticipant, Product]),
    IdentityModule,
    PricingModule,
  ],
  providers: [ChungSucService, CryptoService],
  controllers: [ChungSucController],
  exports: [ChungSucService],
})
export class ChungSucModule {}
