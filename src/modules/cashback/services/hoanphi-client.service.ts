import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ProviderEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
}

export class HoanPhiProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

@Injectable()
export class HoanPhiClientService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(configService: ConfigService) {
    this.baseUrl = configService
      .getOrThrow<string>('HOANPHI_API_BASE_URL')
      .replace(/\/+$/, '');
    this.timeoutMs = configService.get<number>('HOANPHI_TIMEOUT_MS') ?? 10000;
  }

  async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: {
      token?: string;
      body?: Record<string, unknown>;
      query?: Record<string, string | number>;
    } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.token
            ? { Authorization: `Bearer ${options.token}` }
            : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      let payload: ProviderEnvelope<T> | undefined;
      try {
        payload = (await response.json()) as ProviderEnvelope<T>;
      } catch {
        payload = undefined;
      }

      if (!response.ok || !payload?.success) {
        throw new HoanPhiProviderError(
          response.ok ? 400 : response.status,
          payload?.message || 'Dịch vụ hoàn phí từ chối yêu cầu.',
          payload?.code,
        );
      }
      return payload.data as T;
    } catch (error) {
      if (error instanceof HoanPhiProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HoanPhiProviderError(
          504,
          'Dịch vụ hoàn phí phản hồi quá thời gian.',
          'CASHBACK_TIMEOUT',
        );
      }
      throw new HoanPhiProviderError(
        502,
        'Không thể kết nối dịch vụ hoàn phí.',
        'CASHBACK_PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
