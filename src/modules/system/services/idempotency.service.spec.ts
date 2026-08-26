import { ConflictException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  it('returns replay for completed records with same hash', async () => {
    const record = {
      id: 'id-1',
      scope: 'checkout',
      key: 'key-1',
      requestHash: 'same',
      status: 'COMPLETED',
      responseBody: { order: { id: 'order-1' } },
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(record),
    };
    const service = new IdempotencyService({} as never);
    const result = await service.begin(
      { getRepository: jest.fn().mockReturnValue(repository) } as never,
      'checkout',
      'key-1',
      'same',
      'account-1',
    );
    expect(result.state).toBe('REPLAY');
  });

  it('rejects a reused key with a different request hash', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue({
        scope: 'checkout',
        key: 'key-1',
        requestHash: 'old',
        status: 'COMPLETED',
      }),
    };
    const service = new IdempotencyService({} as never);
    await expect(
      service.begin(
        { getRepository: jest.fn().mockReturnValue(repository) } as never,
        'checkout',
        'key-1',
        'new',
        'account-1',
      ),
    ).rejects.toThrow(ConflictException);
  });
});
