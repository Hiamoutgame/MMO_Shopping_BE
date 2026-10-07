import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChungSucCampaign } from './entities/chung-suc-campaign.entity';
import { ChungSucParticipant } from './entities/chung-suc-participant.entity';
import { ChungSucService } from './services/chung-suc.service';
import { ChungSucController } from './controllers/chung-suc.controller';
import { Product } from '../catalog/entities/product.entity';
import { Account } from '../identity/entities/account.entity';
import { Order } from '../commerce/entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChungSucCampaign,
      ChungSucParticipant,
      Product,
      Account,
      Order,
    ]),
  ],
  providers: [ChungSucService],
  controllers: [ChungSucController],
  exports: [ChungSucService],
})
export class ChungSucModule {}
