import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Season } from './entities/season.entity';
import { SeasonsService } from './services/seasons.service';
import { SeasonsController } from './controllers/seasons.controller';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [TypeOrmModule.forFeature([Season]), IdentityModule],
  providers: [SeasonsService],
  controllers: [SeasonsController],
  exports: [SeasonsService],
})
export class SeasonsModule {}
