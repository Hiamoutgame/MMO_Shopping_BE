import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CashbackConnectionLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(255)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;
}

export class CashbackTwoFactorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  google2faCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  emailOtpCode?: string;
}

export class CashbackVerifyEmailDto {
  @ApiProperty()
  @IsString()
  @MaxLength(20)
  code!: string;
}

export class CreateCashbackLinkDto {
  @ApiProperty()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url!: string;
}

export class CashbackListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  type?: string;

  @ApiPropertyOptional({ enum: [1, 2] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  level?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  perPage?: number;
}

export class CreateCashbackWithdrawalDto {
  @ApiProperty()
  @IsNumberString()
  amount!: string;

  @ApiProperty({ enum: ['bank', 'wallet', 'momo'] })
  @IsString()
  @IsIn(['bank', 'wallet', 'momo'])
  paymentMethod!: 'bank' | 'wallet' | 'momo';

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  accountNumber!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  accountName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  walletName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  otpCode?: string;
}

export class CashbackWithdrawalOtpDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;
}

export class CreateCashbackPaymentAccountDto {
  @ApiProperty({ enum: ['bank', 'wallet'] })
  @IsString()
  @IsIn(['bank', 'wallet'])
  paymentMethod!: 'bank' | 'wallet';

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  bankName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  accountNumber!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  accountName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
