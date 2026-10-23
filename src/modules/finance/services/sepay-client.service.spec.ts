import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { SepayConfig } from '../../../config/sepay.config';
import { CreateDepositDto } from '../dto/create-deposit.dto';
import { SepayClientService } from './sepay-client.service';

const baseConfig: SepayConfig = {
  webhookApiKey: 'webhook-secret',
  apiToken: 'api-token',
  apiBaseUrl: 'https://my.sepay.vn',
  qrBaseUrl: 'https://qr.sepay.vn/img',
  bankCode: 'MBBank',
  accountNumber: '0123456789',
  accountHolder: 'NGUYEN VAN A',
  paymentPrefix: 'MMO',
  autoSyncIntervalMs: 0,
  depositMinAmount: 10000,
  depositMaxAmount: 1_000_000_000,
  depositExpiresMinutes: 30,
  maxPendingDeposits: 5,
};

function makeService(overrides: Partial<SepayConfig> = {}) {
  const config = { ...baseConfig, ...overrides };
  return new SepayClientService({
    get: () => config,
  } as unknown as ConfigService);
}

describe('SepayClientService', () => {
  describe('verifyWebhookAuthorization', () => {
    const service = makeService();

    it('accepts the exact Apikey header SePay sends', () => {
      expect(service.verifyWebhookAuthorization('Apikey webhook-secret')).toBe(
        true,
      );
      expect(service.verifyWebhookAuthorization('apikey webhook-secret')).toBe(
        true,
      );
    });

    it.each([
      undefined,
      '',
      'webhook-secret',
      'Bearer webhook-secret',
      'Apikey wrong',
      'Apikey webhook-secret-extra',
    ])('rejects %p', (header) => {
      expect(service.verifyWebhookAuthorization(header)).toBe(false);
    });

    it('rejects everything when no key is configured', () => {
      const unconfigured = makeService({ webhookApiKey: '' });
      expect(unconfigured.verifyWebhookAuthorization('Apikey ')).toBe(false);
    });
  });

  describe('payment code', () => {
    const service = makeService();

    it('generates prefix + 10 uppercase alphanumerics', () => {
      const codes = new Set(
        Array.from({ length: 200 }, () => service.generatePaymentCode()),
      );
      for (const code of codes) expect(code).toMatch(/^MMO[A-Z0-9]{10}$/);
      expect(codes.size).toBe(200);
    });

    it('prefers SePay detected code, then searches the transfer content', () => {
      expect(service.extractPaymentCode('MMOAB12CD34EF', null)).toBe(
        'MMOAB12CD34EF',
      );
      expect(
        service.extractPaymentCode(
          null,
          'MBVCB.123 mmoab12cd34ef chuyen tien FT2629',
        ),
      ).toBe('MMOAB12CD34EF');
    });

    it('returns null when no full code is present', () => {
      expect(service.extractPaymentCode(null, 'chuyen tien MMOAB12')).toBeNull();
      expect(service.extractPaymentCode(null, null)).toBeNull();
    });
  });

  describe('normalizeWebhookPayload', () => {
    const service = makeService();

    it('maps the documented SePay payload', () => {
      const tx = service.normalizeWebhookPayload({
        id: 92704,
        gateway: 'MBBank',
        transactionDate: '2026-10-23 14:02:37',
        accountNumber: '0123456789',
        code: 'MMOAB12CD34EF',
        content: 'MMOAB12CD34EF nap tien',
        transferType: 'in',
        transferAmount: 50000,
        accumulated: 19077000,
        referenceCode: 'MBVCB.3278907687',
      });
      expect(tx).toMatchObject({
        providerEventId: '92704',
        transferType: 'in',
        amount: '50000.0000',
        code: 'MMOAB12CD34EF',
        referenceCode: 'MBVCB.3278907687',
      });
    });

    it.each([
      {},
      { id: 1 },
      { id: 1, transferAmount: -5 },
      { id: 1, transferAmount: 'abc' },
    ])('rejects malformed payload %p', (body) => {
      expect(() => service.normalizeWebhookPayload(body)).toThrow(
        BadRequestException,
      );
    });
  });

  it('normalizes API rows for incoming and outgoing transfers', () => {
    const service = makeService();
    expect(
      service.normalizeApiTransaction({
        id: '1',
        amount_in: '20000.00',
        amount_out: '0.00',
        transaction_content: 'MMOAB12CD34EF',
      }),
    ).toMatchObject({ transferType: 'in', amount: '20000.0000' });
    expect(
      service.normalizeApiTransaction({
        id: '2',
        amount_in: '0.00',
        amount_out: '15000.00',
      }),
    ).toMatchObject({ transferType: 'out', amount: '15000.0000' });
  });

  it('builds a VietQR image url with exact amount and content', () => {
    const service = makeService();
    const instructions = service.buildInstructions('MMOAB12CD34EF', '50000.0000');
    expect(instructions.amount).toBe('50000');
    const url = new URL(instructions.qrImageUrl);
    expect(url.origin + url.pathname).toBe('https://qr.sepay.vn/img');
    expect(url.searchParams.get('acc')).toBe('0123456789');
    expect(url.searchParams.get('bank')).toBe('MBBank');
    expect(url.searchParams.get('amount')).toBe('50000');
    expect(url.searchParams.get('des')).toBe('MMOAB12CD34EF');
  });
});

describe('CreateDepositDto', () => {
  it.each(['10000', '50000', '1000000000'])('accepts %s', async (amount) => {
    const dto = plainToInstance(CreateDepositDto, { amount });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(['10000.5', '-10000', 'abc', '', '1e6'])(
    'rejects %p',
    async (amount) => {
      const dto = plainToInstance(CreateDepositDto, { amount });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    },
  );
});
