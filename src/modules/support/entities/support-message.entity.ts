import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { UuidEntity } from '../../../common/base/uuid.entity';
import { Account } from '../../identity/entities/account.entity';
import { SupportMessageSenderType } from '../enums/support-message-sender-type.enum';
import { SupportTicket } from './support-ticket.entity';

@Entity('support_messages')
@Index('idx_support_messages_ticket_id', ['ticketId'])
export class SupportMessage extends UuidEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId!: string;

  @ManyToOne(() => SupportTicket, (ticket) => ticket.messages)
  @JoinColumn({ name: 'ticket_id' })
  ticket!: SupportTicket;

  @Column({ name: 'sender_account_id', type: 'uuid', nullable: true })
  senderAccountId?: string | null;

  @ManyToOne(() => Account, { nullable: true })
  @JoinColumn({ name: 'sender_account_id' })
  senderAccount?: Account | null;

  @Column({
    name: 'sender_type',
    type: 'enum',
    enum: SupportMessageSenderType,
  })
  senderType!: SupportMessageSenderType;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments?: Record<string, unknown>[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
