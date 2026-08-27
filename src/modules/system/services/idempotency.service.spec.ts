import { ConflictException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

type Repo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  findOneOrFail: jest.Mock;
};

function repoWith(record: Record<string, unknown> | null): Repo {
  return {
    findOne: jest.fn().mockResolvedValue(record),
    create: jest.fn().mockImplementation((d: Record<string, unknown>) => d),
    save: jest
      .fn()
      .mockImplementation((d: Record<string, unknown>) => Promise.resolve(d)),
    findOneOrFail: jest.fn(),
  };
}

function managerWith(repo: Repo) {
  return { getRepository: jest.fn().mockReturnValue(repo) } as never;
}

describe('IdempotencyService', () => {
  it('returns replay for completed records with same hash and account', async () => {
    const repo = repoWith({
      id: 'id-1',
      scope: 'checkout',
      key: 'key-1',
      accountId: 'account-1',
      requestHash: 'same',
      status: 'COMPLETED',
      responseBody: { order: { id: 'order-1' } },
    });
    const service = new IdempotencyService({} as never);
    const result = await service.begin(
      managerWith(repo),
      'checkout',
      'key-1',
      'same',
      'account-1',
    );
    expect(result.state).toBe('REPLAY');
  });

  it('rejects a reused key with a different request hash', async () => {
    const repo = repoWith({
      scope: 'checkout',
      key: 'key-1',
      accountId: 'account-1',
      requestHash: 'old',
      status: 'COMPLETED',
    });
    const service = new IdempotencyService({} as never);
    await expect(
      service.begin(managerWith(repo), 'checkout', 'key-1', 'new', 'account-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects same key/hash when account differs', async () => {
    const repo = repoWith({
      scope: 'checkout',
      key: 'key-1',
      accountId: 'account-1',
      requestHash: 'same',
      status: 'COMPLETED',
      responseBody: { order: { id: 'order-1' } },
    });
    const service = new IdempotencyService({} as never);
    await expect(
      service.begin(
        managerWith(repo),
        'checkout',
        'key-1',
        'same',
        'account-2',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('does not replay an in-progress record', async () => {
    const repo = repoWith({
      scope: 'checkout',
      key: 'key-1',
      accountId: 'account-1',
      requestHash: 'same',
      status: 'PROCESSING',
      responseBody: null,
    });
    const service = new IdempotencyService({} as never);
    const result = await service.begin(
      managerWith(repo),
      'checkout',
      'key-1',
      'same',
      'account-1',
    );
    expect(result.state).toBe('NEW');
  });

  it('hash is stable regardless of key order', () => {
    const service = new IdempotencyService({} as never);
    expect(service.hash({ a: 1, b: 2 })).toBe(service.hash({ b: 2, a: 1 }));
  });

  it('creates a new record when none exists', async () => {
    const repo = repoWith(null);
    const service = new IdempotencyService({} as never);
    const result = await service.begin(
      managerWith(repo),
      'checkout',
      'key-1',
      'hash',
      'account-1',
    );
    expect(result.state).toBe('NEW');
    expect(repo.save).toHaveBeenCalled();
  });
});
