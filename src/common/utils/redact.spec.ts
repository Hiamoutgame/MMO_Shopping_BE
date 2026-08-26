import { redactSecrets } from './redact';

describe('redactSecrets', () => {
  it('redacts sensitive keys recursively', () => {
    expect(
      redactSecrets({
        metadata: { ok: true },
        encryptedPayload: 'cipher',
        nested: { signature: 'abc' },
      }),
    ).toEqual({
      metadata: { ok: true },
      encryptedPayload: '[REDACTED]',
      nested: { signature: '[REDACTED]' },
    });
  });
});
