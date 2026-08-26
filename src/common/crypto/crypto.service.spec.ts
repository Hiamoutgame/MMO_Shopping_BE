import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    const values: Record<string, string> = {
      INVENTORY_ENCRYPTION_KEY: 'test-encryption-key',
      PAYMENT_CALLBACK_SECRET: 'test-callback-secret',
    };
    service = new CryptoService({
      getOrThrow: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);
  });

  it('encrypts and decrypts inventory payload without exposing plaintext', () => {
    const encrypted = service.encryptJson({
      account: 'abc',
      password: 'secret',
    });
    expect(encrypted).not.toContain('secret');
    expect(service.decryptJson(encrypted)).toEqual({
      account: 'abc',
      password: 'secret',
    });
  });

  it('verifies HMAC signatures with timestamp tolerance', () => {
    const body = Buffer.from(JSON.stringify({ ok: true }));
    const timestamp = Date.now().toString();
    const signature = service.signHmac(body, timestamp);
    expect(service.verifyHmac(body, timestamp, signature)).toBe(true);
    expect(service.verifyHmac(body, timestamp, 'bad')).toBe(false);
  });
});
