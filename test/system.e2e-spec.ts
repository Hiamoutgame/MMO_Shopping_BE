import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Account } from '../src/modules/identity/entities/account.entity';
import { AuthSession } from '../src/modules/identity/entities/auth-session.entity';
import { Role } from '../src/modules/identity/entities/role.entity';
import { AccountStatus } from '../src/modules/identity/enums/account-status.enum';
import { Order } from '../src/modules/commerce/entities/order.entity';
import { OrderStatus } from '../src/modules/commerce/enums/order-status.enum';
import { OrderType } from '../src/modules/commerce/enums/order-type.enum';
import { PaymentStatus } from '../src/modules/commerce/enums/payment-status.enum';
import { AdminAuditLog } from '../src/modules/system/entities/admin-audit-log.entity';
import { OutboxEvent } from '../src/modules/system/entities/outbox-event.entity';
import { OutboxService } from '../src/modules/system/services/outbox.service';

interface StatusMap {
  [status: string]: number;
}

interface SummaryReport {
  period: { from: string; to: string; timezone: string };
  revenue: { gross: string; refunded: string; net: string; currency: string };
  orders: { total: number; paid: number; byStatus: StatusMap };
  users: { total: number; new: number };
  inventory: { total: number; byStatus: StatusMap };
  productViews: { total: number; authenticated: number; anonymous: number };
  supportCodeRequests: { total: number; byStatus: StatusMap };
}

interface ReportResponse {
  data: { summaryReport: SummaryReport };
}

interface OverviewResponse {
  data: {
    overview: {
      last24Hours: { revenue: { net: string } };
      current: { users: { total: number } };
    };
  };
}

interface AuditItem {
  action: string;
  actor: { id: string; email: string } | null;
  metadata: Record<string, unknown> | null;
}

interface AuditResponse {
  data: { items: AuditItem[] };
}

interface ErrorResponse {
  errorCode: string;
}

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('System admin endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let outboxService: OutboxService;
  let jwtService: JwtService;
  let userRole: Role;
  let adminRole: Role;
  let admin: Account;
  let user: Account;
  let unique = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    outboxService = app.get(OutboxService);
    jwtService = app.get(JwtService);

    await dataSource.query(
      'TRUNCATE TABLE "outbox_events", "admin_audit_logs", "idempotency_records", "wallet_transactions", "payment_transactions", "inventory_items", "cart_items", "carts", "voucher_redemptions", "orders", "vouchers", "product_variants", "product_categories", "products", "categories", "support_code_requests", "support_dispatches", "support_messages", "support_tickets", "warranty_claims", "auth_sessions", "accounts", "roles" CASCADE',
    );
    userRole = await dataSource.getRepository(Role).save({
      code: 'USER',
      name: 'User',
    });
    adminRole = await dataSource.getRepository(Role).save({
      code: 'ADMIN',
      name: 'Admin',
    });
    admin = await createAccount(adminRole.id, 'admin');
    user = await createAccount(userRole.id, 'user');
  });

  afterAll(async () => {
    await app.close();
  });

  it('normal user gets 403 on all system endpoints', async () => {
    const token = await signToken(user, 'USER');
    for (const url of [
      '/api/v1/admin/dashboard/overview',
      '/api/v1/admin/reports/summary',
      '/api/v1/admin/audit-logs',
    ]) {
      const res = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(bodyOf<ErrorResponse>(res).errorCode).toBe('FORBIDDEN');
    }
  });

  it('admin gets dashboard and report with paid / partial / full refund data', async () => {
    const now = Date.now();
    await seedOrder({
      total: '100.0000',
      refunded: '0.0000',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      placedAt: new Date(now),
    });
    await seedOrder({
      total: '200.0000',
      refunded: '40.0000',
      status: OrderStatus.PARTIALLY_REFUNDED,
      paymentStatus: PaymentStatus.PAID,
      placedAt: new Date(now),
    });
    await seedOrder({
      total: '50.0000',
      refunded: '50.0000',
      status: OrderStatus.REFUNDED,
      paymentStatus: PaymentStatus.REFUNDED,
      placedAt: new Date(now),
    });
    // PENDING order: không tính vào gross vì paymentStatus PENDING.
    await seedOrder({
      total: '999.0000',
      refunded: '0.0000',
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      placedAt: new Date(now),
    });

    const token = await signToken(admin, 'ADMIN');
    const reportRes = await request(app.getHttpServer())
      .get('/api/v1/admin/reports/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const report = bodyOf<ReportResponse>(reportRes).data.summaryReport;

    // gross = 100 + 200 + 50 (3 paid/refunded), không gồm PENDING.
    expect(report.revenue.gross).toBe('350.0000');
    expect(report.revenue.refunded).toBe('90.0000');
    expect(report.revenue.net).toBe('260.0000');
    expect(report.revenue.currency).toBe('VND');
    expect(report.orders.total).toBe(4);
    expect(report.orders.paid).toBe(3);
    expect(report.orders.byStatus.COMPLETED).toBe(1);
    expect(report.orders.byStatus.PARTIALLY_REFUNDED).toBe(1);
    expect(report.orders.byStatus.REFUNDED).toBe(1);
    expect(report.orders.byStatus.PENDING).toBe(1);
    // zero-fill các status còn lại.
    expect(report.orders.byStatus.CANCELLED).toBe(0);
    expect(report.inventory.byStatus.AVAILABLE).toBeDefined();

    const dashRes = await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const overview = bodyOf<OverviewResponse>(dashRes).data.overview;
    expect(overview.last24Hours.revenue.net).toBe('260.0000');
    expect(overview.current.users.total).toBeGreaterThanOrEqual(2);
  });

  it('report filters [from, to) and defaults to 30 days', async () => {
    const token = await signToken(admin, 'ADMIN');
    const base = Date.now();
    const to = new Date(base + 2 * 86400000);
    const from = new Date(base - 10 * 86400000);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/reports/summary')
      .query({ from: from.toISOString(), to: to.toISOString() })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const report = bodyOf<ReportResponse>(res).data.summaryReport;
    expect(report.period.from).toBe(from.toISOString());
    expect(report.period.to).toBe(to.toISOString());

    // Default (không from/to) → 30 ngày, timezone mặc định.
    const defRes = await request(app.getHttpServer())
      .get('/api/v1/admin/reports/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const defPeriod = bodyOf<ReportResponse>(defRes).data.summaryReport.period;
    expect(defPeriod.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(new Date(defPeriod.to).getTime()).toBeGreaterThan(
      new Date(defPeriod.from).getTime(),
    );

    // to <= from bị từ chối.
    await request(app.getHttpServer())
      .get('/api/v1/admin/reports/summary')
      .query({ from: to.toISOString(), to: from.toISOString() })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('audit list supports filtering, pagination and redacts secrets', async () => {
    const token = await signToken(admin, 'ADMIN');
    await dataSource.getRepository(AdminAuditLog).save([
      {
        adminAccountId: admin.id,
        action: 'ORDER_REFUND',
        targetType: 'Order',
        targetId: '11111111-1111-1111-1111-111111111111',
        metadata: { secret: 'top-secret', signature: 'abc', ok: true },
        ipAddress: '127.0.0.1',
      },
      {
        adminAccountId: admin.id,
        action: 'VOUCHER_CREATE',
        targetType: 'Voucher',
        targetId: null,
        metadata: null,
        ipAddress: '127.0.0.2',
      },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .query({ action: 'ORDER_REFUND', page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const items = bodyOf<AuditResponse>(res).data.items;
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.action).toBe('ORDER_REFUND');
    expect(item.actor?.id).toBe(admin.id);
    expect(item.actor?.email).toBe(admin.email);
    expect(item.metadata?.secret).toBe('[REDACTED]');
    expect(item.metadata?.signature).toBe('[REDACTED]');
    expect(item.metadata?.ok).toBe(true);
    expect(JSON.stringify(item)).not.toContain('top-secret');
  });

  it('empty automation table still reports support-code metrics as 0', async () => {
    const token = await signToken(admin, 'ADMIN');
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/reports/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const supportCode =
      bodyOf<ReportResponse>(res).data.summaryReport.supportCodeRequests;
    expect(supportCode.total).toBe(0);
    expect(supportCode.byStatus.ACTIVE).toBe(0);
    expect(supportCode.byStatus.SUCCESS).toBe(0);
  });

  it('outbox enqueue inside a rolled-back transaction leaves no event', async () => {
    const before = await dataSource.getRepository(OutboxEvent).count();
    await expect(
      dataSource.transaction(async (manager) => {
        await outboxService.enqueue(manager, {
          aggregateType: 'SupportCodeRequest',
          aggregateId: 'req-rollback',
          eventType: 'SUPPORT_CODE_PAID',
          payload: { code: 'X' },
          idempotencyKey: 'rollback-key',
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const after = await dataSource.getRepository(OutboxEvent).count();
    expect(after).toBe(before);
  });

  async function signToken(account: Account, roleCode: string) {
    const session = await dataSource.getRepository(AuthSession).save({
      accountId: account.id,
      refreshTokenHash: `hash-${Date.now()}-${unique}`,
      tokenFamily: `family-${unique}`,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    unique += 1;
    return jwtService.signAsync({
      subject: account.id,
      email: account.email,
      role: roleCode,
      sessionId: session.id,
    });
  }

  async function seedOrder(input: {
    total: string;
    refunded: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    placedAt: Date;
  }) {
    unique += 1;
    return dataSource.getRepository(Order).save({
      accountId: user.id,
      orderNumber: `SYS-${Date.now()}-${unique}`,
      orderType: OrderType.STANDARD,
      status: input.status,
      paymentStatus: input.paymentStatus,
      subtotal: input.total,
      discountAmount: '0.0000',
      totalAmount: input.total,
      refundedAmount: input.refunded,
      currency: 'VND',
      placedAt: input.placedAt,
    });
  }

  async function createAccount(roleId: string, prefix: string) {
    unique += 1;
    return dataSource.getRepository(Account).save({
      roleId,
      email: `${prefix}-${Date.now()}-${unique}@example.com`,
      passwordHash: 'not-used',
      name: prefix,
      status: AccountStatus.ACTIVE,
    });
  }
});
