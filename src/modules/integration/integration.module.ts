import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationEndpoint } from './entities/integration-endpoint.entity';

@Module({
  imports: [TypeOrmModule.forFeature([IntegrationEndpoint])],
  exports: [TypeOrmModule],
})
export class IntegrationModule {}
