import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export enum PaymentCallbackStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export class PaymentCallbackDto {
  @ApiProperty()
  @IsString()
  merchantReference!: string;

  @ApiProperty()
  @IsString()
  providerTransactionId!: string;

  @ApiProperty()
  @IsNumberString()
  amount!: string;

  @ApiProperty()
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ enum: PaymentCallbackStatus })
  @IsEnum(PaymentCallbackStatus)
  status!: PaymentCallbackStatus;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
