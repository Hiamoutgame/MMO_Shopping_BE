import { CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UuidEntity } from './uuid.entity';

export abstract class AuditableEntity extends UuidEntity {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
