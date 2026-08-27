import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { stableStringify } from '../../../common/utils/stable-stringify';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { OutboxEventStatus } from '../enums/outbox-event-status.enum';

export interface OutboxInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
  notBefore?: Date | null;
}

/**
 * Ghi side-effect event trong transaction của nghiệp vụ. Không gọi HTTP bên
 * ngoài; worker (chưa có trong V1) sẽ đọc và xử lý sau khi commit.
 */
@Injectable()
export class OutboxService {
  async enqueue(
    manager: EntityManager,
    input: OutboxInput,
  ): Promise<OutboxEvent> {
    const repository = manager.getRepository(OutboxEvent);

    if (input.idempotencyKey) {
      const existing = await repository.findOne({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (!this.isSameEvent(existing, input)) {
          throw new ConflictException({
            success: false,
            data: null,
            message: 'Idempotency key đã được dùng với nội dung event khác.',
            errorCode: 'IDEMPOTENCY_CONFLICT',
          });
        }
        return existing;
      }
    }

    return repository.save(
      repository.create({
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        status: OutboxEventStatus.PENDING,
        payload: input.payload,
        attempts: 0,
        idempotencyKey: input.idempotencyKey || null,
        notBefore: input.notBefore || null,
      }),
    );
  }

  private isSameEvent(existing: OutboxEvent, input: OutboxInput): boolean {
    return (
      existing.aggregateType === input.aggregateType &&
      existing.aggregateId === input.aggregateId &&
      existing.eventType === input.eventType &&
      stableStringify(existing.payload) === stableStringify(input.payload)
    );
  }
}
