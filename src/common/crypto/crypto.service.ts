import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

@Injectable()
export class CryptoService {
  constructor(private readonly configService: ConfigService) {}

  encryptJson(value: unknown): string {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decryptJson<T = unknown>(payload: string): T {
    const [version, iv, tag, encrypted] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || !encrypted) {
      throw new BadRequestException('Invalid encrypted payload');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  }

  signHmac(body: Buffer | string, timestamp: string, secret?: string): string {
    return createHmac('sha256', secret || this.callbackSecret())
      .update(`${timestamp}.`)
      .update(body)
      .digest('hex');
  }

  verifyHmac(
    body: Buffer | string,
    timestamp: string | undefined,
    signature: string | undefined,
    toleranceMs = 5 * 60 * 1000,
  ): boolean {
    if (!timestamp || !signature) {
      return false;
    }

    const time = Number(timestamp);
    if (!Number.isFinite(time) || Math.abs(Date.now() - time) > toleranceMs) {
      return false;
    }

    return this.signHmac(body, timestamp) === signature;
  }

  private encryptionKey(): Buffer {
    const raw = this.configService.getOrThrow<string>(
      'INVENTORY_ENCRYPTION_KEY',
    );
    return createHmac('sha256', raw).update('inventory').digest();
  }

  private callbackSecret(): string {
    return this.configService.getOrThrow<string>('PAYMENT_CALLBACK_SECRET');
  }
}
