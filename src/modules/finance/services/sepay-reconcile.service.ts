import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { parseSepayListItem } from '../sepay/sepay-payload';
import { SepayService } from './sepay.service';

export interface ReconcileResult {
  fetched: number;
  created: number;
  duplicates: number;
  byStatus: Record<string, number>;
}

// SePay trả ngày theo giờ Việt Nam, dạng "YYYY-MM-DD HH:mm:ss".
function vietnamTime(date: Date): string {
  const shifted = new Date(date.getTime() + 7 * 3600_000);
  return shifted.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Đối soát: kéo danh sách giao dịch từ API SePay và xử lý như webhook.
 * Bù cho webhook bị lỡ (server tắt, mạng lỗi quá 7 lần retry). Trùng với
 * webhook không sao vì dedupe theo sepay_id.
 */
@Injectable()
export class SepayReconcileService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SepayReconcileService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<ReconcileResult> | null = null;

  // fetch tách ra để unit test thay bằng bản giả.
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  constructor(private readonly sepayService: SepayService) {}

  onModuleInit() {
    const { reconcileIntervalSeconds, apiToken } = this.sepayService.config;
    if (!reconcileIntervalSeconds || !apiToken) return;
    this.timer = setInterval(() => {
      this.reconcile().catch((error: unknown) =>
        this.logger.error('SePay reconcile failed', error as Error),
      );
    }, reconcileIntervalSeconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Chạy một lượt; lượt đang chạy thì dùng lại kết quả của nó. */
  reconcile(): Promise<ReconcileResult> {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async run(): Promise<ReconcileResult> {
    const config = this.sepayService.config;
    if (!config.apiToken) {
      throw new ServiceUnavailableException({
        success: false,
        data: null,
        message: 'Chưa cấu hình SEPAY_API_TOKEN.',
        errorCode: 'SEPAY_NOT_CONFIGURED',
      });
    }
    const params = new URLSearchParams({
      limit: '1000',
      transaction_date_min: vietnamTime(
        new Date(Date.now() - config.reconcileLookbackHours * 3600_000),
      ),
    });
    if (config.accountNumber)
      params.set('account_number', config.accountNumber);

    const response = await this.fetchImpl(
      `${config.apiBaseUrl}/transactions/list?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException({
        success: false,
        data: null,
        message: `SePay API trả HTTP ${response.status}.`,
        errorCode: 'SEPAY_API_ERROR',
      });
    }
    const body = (await response.json()) as { transactions?: unknown[] };
    const items = Array.isArray(body.transactions) ? body.transactions : [];

    const result: ReconcileResult = {
      fetched: items.length,
      created: 0,
      duplicates: 0,
      byStatus: {},
    };
    // Cũ trước mới sau để giao dịch đến trước khớp lệnh nạp trước.
    const parsed = items
      .map(parseSepayListItem)
      .filter((item) => item !== null)
      .sort((a, b) => Number(BigInt(a.sepayId) - BigInt(b.sepayId)));
    for (const item of parsed) {
      const outcome = await this.sepayService.processIncoming(
        item,
        'RECONCILE',
      );
      if (outcome.duplicate) {
        result.duplicates++;
        continue;
      }
      result.created++;
      result.byStatus[outcome.status] =
        (result.byStatus[outcome.status] ?? 0) + 1;
    }
    if (result.created) {
      this.logger.log(
        `SePay reconcile: ${result.created} giao dịch mới ${JSON.stringify(result.byStatus)}`,
      );
    }
    return result;
  }
}
