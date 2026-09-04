import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

@Injectable()
export class IntegrationCredentialService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt<T>(payload: string): T {
    const [version, iv, tag, encrypted] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || !encrypted) {
      throw new Error('Invalid encrypted integration credential');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64')),
        decipher.final(),
      ]).toString('utf8'),
    ) as T;
  }

  private key(): Buffer {
    const secret = this.configService.getOrThrow<string>(
      'INTEGRATION_ENCRYPTION_KEY',
    );
    return createHmac('sha256', secret)
      .update('cashback-provider-credentials')
      .digest();
  }
}
