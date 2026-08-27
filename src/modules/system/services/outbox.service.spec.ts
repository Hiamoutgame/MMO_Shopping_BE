import { ConflictException } from '@nestjs/common';
import { OutboxService } from './outbox.service';

const INPUT = {
  aggregateType: 'SupportCodeRequest',
  aggregateId: 'req-1',
  eventType: 'SUPPORT_CODE_PAID',
  payload: { a: 1, b: 2 },
};

describe('OutboxService', () => {
  it('enqueues a new event', async () => {
    const save = jest
      .fn()
      .mockImplementation((d: Record<string, unknown>) =>
        Promise.resolve({ id: 'evt-1', ...d }),
      );
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((d: Record<string, unknown>) => d),
      save,
    };
    const service = new OutboxService();
    const event = await service.enqueue(
      { getRepository: jest.fn().mockReturnValue(repo) } as never,
      { ...INPUT, idempotencyKey: 'key-1' },
    );
    expect(event.id).toBe('evt-1');
    expect(save).toHaveBeenCalled();
  });

  it('returns existing event for same idempotency key and same content', async () => {
    const existing = {
      id: 'evt-1',
      aggregateType: INPUT.aggregateType,
      aggregateId: INPUT.aggregateId,
      eventType: INPUT.eventType,
      payload: { b: 2, a: 1 },
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = new OutboxService();
    const event = await service.enqueue(
      { getRepository: jest.fn().mockReturnValue(repo) } as never,
      { ...INPUT, idempotencyKey: 'key-1' },
    );
    expect(event.id).toBe('evt-1');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects same idempotency key with different content', async () => {
    const existing = {
      id: 'evt-1',
      aggregateType: INPUT.aggregateType,
      aggregateId: INPUT.aggregateId,
      eventType: INPUT.eventType,
      payload: { a: 999 },
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = new OutboxService();
    await expect(
      service.enqueue(
        { getRepository: jest.fn().mockReturnValue(repo) } as never,
        { ...INPUT, idempotencyKey: 'key-1' },
      ),
    ).rejects.toThrow(ConflictException);
  });
});
