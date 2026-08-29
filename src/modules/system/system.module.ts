import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportCodeRequest } from '../automation/entities/support-code-request.entity';
import { Order } from '../commerce/entities/order.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { Account } from '../identity/entities/account.entity';
import { IdentityModule } from '../identity/identity.module';
import { ProductView } from '../shopping/entities/product-view.entity';
import { AdminSystemController } from './controllers/admin-system.controller';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { AuditService } from './services/audit.service';
import { IdempotencyService } from './services/idempotency.service';
import { OutboxService } from './services/outbox.service';
import { SystemQueryService } from './services/system-query.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutboxEvent,
      SystemSetting,
      AdminAuditLog,
      IdempotencyRecord,
      // Read-only repositories cho thống kê/dashboard.
      Order,
      Account,
      InventoryItem,
      ProductView,
      SupportCodeRequest,
    ]),
    // Cung cấp JwtService (qua JwtModule) và repo AuthSession (qua TypeOrmModule)
    // cho JwtAuthGuard dùng trong AdminSystemController.
    IdentityModule,
  ],
  controllers: [AdminSystemController],
  providers: [
    AuditService,
    IdempotencyService,
    OutboxService,
    SystemQueryService,
  ],
  exports: [TypeOrmModule, AuditService, IdempotencyService, OutboxService],
})
export class SystemModule {}
