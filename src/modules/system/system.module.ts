import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { AuditService } from './services/audit.service';
import { IdempotencyService } from './services/idempotency.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutboxEvent,
      SystemSetting,
      AdminAuditLog,
      IdempotencyRecord,
    ]),
  ],
  providers: [AuditService, IdempotencyService],
  exports: [TypeOrmModule, AuditService, IdempotencyService],
})
export class SystemModule {}
