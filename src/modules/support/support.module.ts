import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportMessage } from './entities/support-message.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { WarrantyClaim } from './entities/warranty-claim.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket, SupportMessage, WarrantyClaim]),
  ],
  exports: [TypeOrmModule],
})
export class SupportModule {}
