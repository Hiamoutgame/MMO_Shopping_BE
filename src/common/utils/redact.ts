const SENSITIVE_KEYS = [
  'payload',
  'encryptedPayload',
  'deliveryPayload',
  'password',
  'passwordHash',
  'refreshToken',
  'token',
  'secret',
  'signature',
  'credentials',
];

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value as Record<string, unknown>).reduce(
    (acc, [key, item]) => {
      acc[key] = SENSITIVE_KEYS.some((secretKey) =>
        key.toLowerCase().includes(secretKey.toLowerCase()),
      )
        ? '[REDACTED]'
        : redactSecrets(item);
      return acc;
    },
    {} as Record<string, unknown>,
  );
}
