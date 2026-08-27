import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatMoney } from '../../../common/utils/money';
import { redactSecrets } from '../../../common/utils/redact';
import { SupportCodeRequest } from '../../automation/entities/support-code-request.entity';
import { SupportCodeRequestStatus } from '../../automation/enums/support-code-request-status.enum';
import { Order } from '../../commerce/entities/order.entity';
import { OrderStatus } from '../../commerce/enums/order-status.enum';
import { PaymentStatus } from '../../commerce/enums/payment-status.enum';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { InventoryStatus } from '../../inventory/enums/inventory-status.enum';
import { Account } from '../../identity/entities/account.entity';
import { ProductView } from '../../shopping/entities/product-view.entity';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { ReportQueryDto } from '../dto/report-query.dto';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';
import { computeNetRevenue, zeroFill } from '../report-metrics';
import { resolveReportPeriod } from '../report-period';

const PAID_STATUSES = [PaymentStatus.PAID, PaymentStatus.REFUNDED];
const REPORT_CURRENCY = 'VND';

export interface RangeMetrics {
  revenue: { gross: string; refunded: string; net: string; currency: string };
  orders: { total: number; paid: number; byStatus: Record<string, number> };
  users: { new: number };
  productViews: {
    total: number;
    authenticated: number;
    anonymous: number;
  };
  supportCodeRequests: {
    total: number;
    byStatus: Record<string, number>;
  };
}

/**
 * Read queries cho dashboard/report/audit-log. Không mở transaction dài,
 * không tạo entity tổng hợp. Dữ liệu báo cáo đọc trực tiếp từ bảng giao dịch.
 */
@Injectable()
export class SystemQueryService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepository: Repository<InventoryItem>,
    @InjectRepository(ProductView)
    private readonly productViewRepository: Repository<ProductView>,
    @InjectRepository(SupportCodeRequest)
    private readonly supportCodeRequestRepository: Repository<SupportCodeRequest>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogRepository: Repository<AdminAuditLog>,
  ) {}

  async getSummaryReport(query: ReportQueryDto) {
    const period = resolveReportPeriod(query.from, query.to, query.timezone);
    const metrics = await this.computeRangeMetrics(period.from, period.to);
    const [usersTotal, inventory] = await Promise.all([
      this.accountRepository.count(),
      this.snapshotInventory(),
    ]);

    return {
      summaryReport: {
        period: {
          from: period.from.toISOString(),
          to: period.to.toISOString(),
          timezone: period.timezone,
        },
        revenue: metrics.revenue,
        orders: metrics.orders,
        users: { total: usersTotal, new: metrics.users.new },
        inventory,
        productViews: metrics.productViews,
        supportCodeRequests: metrics.supportCodeRequests,
      },
    };
  }

  async getDashboardOverview() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      last24Hours,
      last30Days,
      usersTotal,
      ordersPending,
      ordersProcessing,
      inventory,
      supportCodeSnapshot,
    ] = await Promise.all([
      this.computeRangeMetrics(dayAgo, now),
      this.computeRangeMetrics(monthAgo, now),
      this.accountRepository.count(),
      this.orderRepository.count({
        where: { status: OrderStatus.PENDING },
      }),
      this.orderRepository.count({
        where: { status: OrderStatus.PROCESSING },
      }),
      this.snapshotInventory(),
      this.snapshotSupportCodeRequests(),
    ]);

    return {
      overview: {
        last24Hours,
        last30Days,
        current: {
          users: { total: usersTotal },
          orders: { pending: ordersPending, processing: ordersProcessing },
          inventory,
          supportCodeRequests: supportCodeSnapshot,
        },
      },
    };
  }

  async listAuditLogs(query: AuditLogQueryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.auditLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.adminAccount', 'admin')
      .orderBy('log.createdAt', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query.actorId) {
      qb.andWhere('log.adminAccountId = :actorId', { actorId: query.actorId });
    }
    if (query.action) {
      qb.andWhere('log.action = :action', { action: query.action });
    }
    if (query.entityType) {
      qb.andWhere('log.targetType = :entityType', {
        entityType: query.entityType,
      });
    }
    if (query.from) {
      qb.andWhere('log.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('log.createdAt < :to', { to: new Date(query.to) });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((log) => this.serializeAuditLog(log)),
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  // -------------------------------------------------------------------------
  // PRIVATE METRICS
  // -------------------------------------------------------------------------

  private async computeRangeMetrics(
    from: Date,
    to: Date,
  ): Promise<RangeMetrics> {
    const [
      revenue,
      ordersTotal,
      ordersPaid,
      ordersByStatus,
      usersNew,
      productViews,
      supportCodeRequests,
    ] = await Promise.all([
      this.computeRevenue(from, to),
      this.orderRepository
        .createQueryBuilder('o')
        .where('o.placedAt >= :from', { from })
        .andWhere('o.placedAt < :to', { to })
        .getCount(),
      this.orderRepository
        .createQueryBuilder('o')
        .where('o.placedAt >= :from', { from })
        .andWhere('o.placedAt < :to', { to })
        .andWhere('o.paymentStatus IN (:...statuses)', {
          statuses: PAID_STATUSES,
        })
        .getCount(),
      this.countOrdersByStatus(from, to),
      this.accountRepository
        .createQueryBuilder('a')
        .where('a.createdAt >= :from', { from })
        .andWhere('a.createdAt < :to', { to })
        .getCount(),
      this.countProductViews(from, to),
      this.countSupportCodeRequests(from, to),
    ]);

    return {
      revenue,
      orders: {
        total: ordersTotal,
        paid: ordersPaid,
        byStatus: ordersByStatus,
      },
      users: { new: usersNew },
      productViews,
      supportCodeRequests,
    };
  }

  private async computeRevenue(from: Date, to: Date) {
    const grossRow = await this.orderRepository
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.totalAmount), 0)', 'gross')
      .where('o.placedAt >= :from', { from })
      .andWhere('o.placedAt < :to', { to })
      .andWhere('o.paymentStatus IN (:...statuses)', {
        statuses: PAID_STATUSES,
      })
      .getRawOne<{ gross: string }>();
    const refundedRow = await this.orderRepository
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.refundedAmount), 0)', 'refunded')
      .where('o.placedAt >= :from', { from })
      .andWhere('o.placedAt < :to', { to })
      .getRawOne<{ refunded: string }>();

    const gross = formatMoney(grossRow?.gross ?? 0);
    const refunded = formatMoney(refundedRow?.refunded ?? 0);
    return {
      gross,
      refunded,
      net: computeNetRevenue(gross, refunded),
      currency: REPORT_CURRENCY,
    };
  }

  private async countOrdersByStatus(from: Date, to: Date) {
    const rows = await this.orderRepository
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('o.placedAt >= :from', { from })
      .andWhere('o.placedAt < :to', { to })
      .groupBy('o.status')
      .getRawMany<{ status: OrderStatus; count: string }>();
    const map = new Map(rows.map((r) => [r.status, Number(r.count)]));
    return zeroFill(Object.values(OrderStatus), map);
  }

  private async countProductViews(from: Date, to: Date) {
    const [total, authenticated] = await Promise.all([
      this.productViewRepository
        .createQueryBuilder('v')
        .where('v.viewedAt >= :from', { from })
        .andWhere('v.viewedAt < :to', { to })
        .getCount(),
      this.productViewRepository
        .createQueryBuilder('v')
        .where('v.viewedAt >= :from', { from })
        .andWhere('v.viewedAt < :to', { to })
        .andWhere('v.accountId IS NOT NULL')
        .getCount(),
    ]);
    return { total, authenticated, anonymous: total - authenticated };
  }

  private async countSupportCodeRequests(from: Date, to: Date) {
    const [total, rows] = await Promise.all([
      this.supportCodeRequestRepository
        .createQueryBuilder('r')
        .where('r.submittedAt >= :from', { from })
        .andWhere('r.submittedAt < :to', { to })
        .getCount(),
      this.supportCodeRequestRepository
        .createQueryBuilder('r')
        .select('r.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('r.submittedAt >= :from', { from })
        .andWhere('r.submittedAt < :to', { to })
        .groupBy('r.status')
        .getRawMany<{ status: SupportCodeRequestStatus; count: string }>(),
    ]);
    const map = new Map(rows.map((r) => [r.status, Number(r.count)]));
    return {
      total,
      byStatus: zeroFill(Object.values(SupportCodeRequestStatus), map),
    };
  }

  private async snapshotInventory() {
    const [total, rows] = await Promise.all([
      this.inventoryRepository.count(),
      this.inventoryRepository
        .createQueryBuilder('i')
        .select('i.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('i.status')
        .getRawMany<{ status: InventoryStatus; count: string }>(),
    ]);
    const map = new Map(rows.map((r) => [r.status, Number(r.count)]));
    return {
      total,
      byStatus: zeroFill(Object.values(InventoryStatus), map),
    };
  }

  private async snapshotSupportCodeRequests() {
    const [total, rows] = await Promise.all([
      this.supportCodeRequestRepository.count(),
      this.supportCodeRequestRepository
        .createQueryBuilder('r')
        .select('r.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('r.status')
        .getRawMany<{ status: SupportCodeRequestStatus; count: string }>(),
    ]);
    const map = new Map(rows.map((r) => [r.status, Number(r.count)]));
    return {
      total,
      byStatus: zeroFill(Object.values(SupportCodeRequestStatus), map),
    };
  }

  private serializeAuditLog(log: AdminAuditLog) {
    const actor = log.adminAccount
      ? {
          id: log.adminAccount.id,
          email: log.adminAccount.email,
          name: log.adminAccount.name,
        }
      : null;
    return {
      id: log.id,
      actor,
      action: log.action,
      entityType: log.targetType,
      entityId: log.targetId,
      metadata: redactSecrets(log.metadata) as Record<string, unknown> | null,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    };
  }
}
