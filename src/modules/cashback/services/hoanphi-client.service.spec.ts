import { ConfigService } from '@nestjs/config';
import {
  HoanPhiClientService,
  HoanPhiProviderError,
} from './hoanphi-client.service';

describe('HoanPhiClientService', () => {
  const originalFetch = global.fetch;
  const service = new HoanPhiClientService(
    new ConfigService({
      HOANPHI_API_BASE_URL: 'https://provider.test/api/v1/openapi/',
      HOANPHI_TIMEOUT_MS: 1000,
    }),
  );

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends bearer token and returns provider data', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: { balance: 1000 } }),
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(
      service.request('GET', '/account', { token: 'secret' }),
    ).resolves.toEqual({
      balance: 1000,
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://provider.test/api/v1/openapi/account');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer secret',
    );
  });

  it('maps provider failures without returning response internals', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          success: false,
          code: 'UNAUTHENTICATED',
          message: 'Token expired',
        }),
    }) as typeof fetch;

    await expect(service.request('GET', '/account')).rejects.toEqual(
      expect.objectContaining<Partial<HoanPhiProviderError>>({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Token expired',
      }),
    );
  });
});
