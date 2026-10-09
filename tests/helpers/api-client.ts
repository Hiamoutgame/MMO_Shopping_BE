import { expect, type APIRequestContext } from '@playwright/test';

export interface ApiResult<T = any> {
  status: number;
  body: T;
}

export interface CallOptions {
  data?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
}

/**
 * Thin wrapper around Playwright's APIRequestContext.
 * Paths are relative to baseURL (http://127.0.0.1:4000/api/), e.g. "v1/auth/me".
 * Never logs tokens or request bodies.
 */
export class ApiClient {
  constructor(
    private readonly ctx: APIRequestContext,
    private readonly token?: string,
  ) {}

  as(token?: string): ApiClient {
    return new ApiClient(this.ctx, token);
  }

  async call<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    options: CallOptions = {},
  ): Promise<ApiResult<T>> {
    const response = await this.ctx.fetch(path.replace(/^\/+/, ''), {
      method,
      data: options.data as any,
      params: options.params,
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(options.headers || {}),
      },
      failOnStatusCode: false,
    });
    const text = await response.text();
    let body: any = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status(), body };
  }

  get<T = any>(path: string, options?: CallOptions) {
    return this.call<T>('GET', path, options);
  }

  post<T = any>(path: string, data?: unknown, options: CallOptions = {}) {
    return this.call<T>('POST', path, { ...options, data });
  }

  patch<T = any>(path: string, data?: unknown, options: CallOptions = {}) {
    return this.call<T>('PATCH', path, { ...options, data });
  }

  delete<T = any>(path: string, options?: CallOptions) {
    return this.call<T>('DELETE', path, options);
  }
}

/** Success envelope used by the documented API contract. */
export function expectEnvelope(result: ApiResult, status: number | number[]) {
  const allowed = Array.isArray(status) ? status : [status];
  expect(allowed, `unexpected status ${result.status}`).toContain(
    result.status,
  );
  expect(result.body).toMatchObject({ success: true, errorCode: null });
  expect(typeof result.body.message).toBe('string');
  expect(result.body.data).toBeDefined();
  return result.body.data;
}

/** Error envelope used by the documented API contract. */
export function expectErrorEnvelope(
  result: ApiResult,
  status: number,
  errorCode?: string,
) {
  expect(result.status).toBe(status);
  expect(result.body).toMatchObject({ success: false, data: null });
  expect(typeof result.body.errorCode).toBe('string');
  if (errorCode) {
    expect(result.body.errorCode).toBe(errorCode);
  }
}

/** New modules return raw entities; old modules wrap them in `data`. */
export function unwrap<T = any>(body: any): T {
  if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

const SENSITIVE_KEYS = [
  'passwordHash',
  'password_hash',
  'refreshTokenHash',
  'refresh_token_hash',
  'encryptedPayload',
  'encrypted_payload',
];

export function expectNoSensitiveFields(body: unknown) {
  const serialized = JSON.stringify(body ?? null);
  for (const key of SENSITIVE_KEYS) {
    expect(serialized, `response leaks "${key}"`).not.toContain(`"${key}"`);
  }
}
