import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { EntityManager, Repository } from 'typeorm';
import { stableStringify } from '../../../common/utils/stable-stringify';
import { IdempotencyRecord } from '../entities/idempotency-record.entity';

export type IdempotencyState = 'NEW' | 'REPLAY';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyRecord)
    private readonly idempotencyRepository: Repository<IdempotencyRecord>,
  ) {}

  hash(value: unknown): string {
    return createHash('sha256').update(stableStringify(value)).digest('hex');
  }

  async begin(
    manager: EntityManager,
    scope: string,
    key: string,
    requestHash: string,
    accountId?: string | null,
  ): Promise<{ state: IdempotencyState; record: IdempotencyRecord }> {
    const repository = manager.getRepository(IdempotencyRecord);
    let record = await repository.findOne({
      where: { scope, key },
      lock: { mode: 'pessimistic_write' },
    });

    if (!record) {
      record = repository.create({
        scope,
        key,
        accountId: accountId || null,
        requestHash,
        status: 'PROCESSING',
        lockedAt: new Date(),
      });
      try {
        record = await repository.save(record);
        return { state: 'NEW', record };
      } catch {
        record = await repository.findOneOrFail({
          where: { scope, key },
          lock: { mode: 'pessimistic_write' },
        });
      }
    }

    if (record.requestHash !== requestHash) {
      throw new ConflictException({
        success: false,
        data: null,
        message: 'Idempotency key was reused with a different payload.',
        errorCode: 'IDEMPOTENCY_CONFLICT',
      });
    }

    if (record.accountId && accountId && record.accountId !== accountId) {
      throw new ConflictException({
        success: false,
        data: null,
        message: 'Idempotency key belongs to a different account.',
        errorCode: 'IDEMPOTENCY_CONFLICT',
      });
    }

    if (record.status === 'COMPLETED' && record.responseBody) {
      return { state: 'REPLAY', record };
    }

    return { state: 'NEW', record };
  }

  async complete(
    manager: EntityManager,
    record: IdempotencyRecord,
    responseBody: Record<string, unknown>,
  ): Promise<void> {
    record.status = 'COMPLETED';
    record.responseBody = responseBody;
    record.lockedAt = null;
    await manager.getRepository(IdempotencyRecord).save(record);
  }
}
