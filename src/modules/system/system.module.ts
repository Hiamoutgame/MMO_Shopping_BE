import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { SystemSetting } from './entities/system-setting.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent, SystemSetting, AdminAuditLog]),
  ],
  exports: [TypeOrmModule],
})
export class SystemModule {}
