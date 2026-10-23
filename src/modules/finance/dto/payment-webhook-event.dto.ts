import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaymentWebhookEventStatus } from '../enums/payment-webhook-event-status.enum';

export class QueryPaymentWebhookEventsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PaymentWebhookEventStatus })
  @IsOptional()
  @IsEnum(PaymentWebhookEventStatus)
  status?: PaymentWebhookEventStatus;

  @ApiPropertyOptional({
    description: 'Mã thanh toán, mã tham chiếu, nội dung',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string;
}

export class ResolvePaymentWebhookEventDto {
  @ApiProperty({ enum: ['CREDIT', 'IGNORE'] })
  @IsIn(['CREDIT', 'IGNORE'])
  action!: 'CREDIT' | 'IGNORE';

  @ApiPropertyOptional({ description: 'Bắt buộc khi action = CREDIT' })
  @ValidateIf((dto: ResolvePaymentWebhookEventDto) => dto.action === 'CREDIT')
  @IsUUID()
  accountId?: string;

  @ApiProperty({ description: 'Lý do xử lý, lưu vào trace và audit log' })
  @IsString()
  @Length(3, 500)
  note!: string;
}

export class SyncSepayTransactionsDto {
  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 168 })
  @IsOptional()
  @IsIn([1, 6, 24, 72, 168])
  sinceHours?: number;
}
