import { ConfigService } from '@nestjs/config';
import { IntegrationCredentialService } from './integration-credential.service';

describe('IntegrationCredentialService', () => {
  const service = new IntegrationCredentialService(
    new ConfigService({ INTEGRATION_ENCRYPTION_KEY: 'unit-test-key' }),
  );

  it('encrypts and decrypts credentials without exposing plaintext', () => {
    const encrypted = service.encrypt({ token: 'provider-secret' });
    expect(encrypted).not.toContain('provider-secret');
    expect(service.decrypt(encrypted)).toEqual({ token: 'provider-secret' });
  });

  it('rejects malformed payloads', () => {
    expect(() => service.decrypt('not-valid')).toThrow(
      'Invalid encrypted integration credential',
    );
  });
});
