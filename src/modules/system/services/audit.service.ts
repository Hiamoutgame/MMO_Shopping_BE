import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { redactSecrets } from '../../../common/utils/redact';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';

interface AuditInput {
  adminAccountId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  manager?: EntityManager;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly auditRepository: Repository<AdminAuditLog>,
  ) {}

  async log(input: AuditInput): Promise<void> {
    const repository = input.manager
      ? input.manager.getRepository(AdminAuditLog)
      : this.auditRepository;

    await repository.save(
      repository.create({
        adminAccountId: input.adminAccountId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId || null,
        metadata: input.metadata
          ? (redactSecrets(input.metadata) as Record<string, unknown>)
          : null,
        ipAddress: input.ipAddress || null,
      }),
    );
  }
}
