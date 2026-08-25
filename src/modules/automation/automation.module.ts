import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportCodeRequest } from './entities/support-code-request.entity';
import { SupportDispatch } from './entities/support-dispatch.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SupportCodeRequest, SupportDispatch])],
  exports: [TypeOrmModule],
})
export class AutomationModule {}
