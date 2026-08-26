import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { PaymentProvider } from '../enums/payment-provider.enum';

export class CreateDepositDto {
  @ApiProperty()
  @IsNumberString()
  amount!: string;

  @ApiProperty({ default: 'VND' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string = 'VND';

  @ApiProperty({
    enum: PaymentProvider,
    default: PaymentProvider.BANK_TRANSFER,
  })
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider = PaymentProvider.BANK_TRANSFER;
}
