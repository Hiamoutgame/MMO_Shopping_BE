import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { SepayTransactionStatus } from '../enums/sepay-transaction-status.enum';

export class CreateSepayDepositDto {
  // Số nguyên VND. Mức tối thiểu kiểm tra ở service theo cấu hình.
  @ApiProperty({ example: '50000' })
  @IsString()
  @Matches(/^[1-9]\d{0,11}$/, {
    message: 'amount must be a whole number of VND',
  })
  amount!: string;
}

export class QuerySepayTransactionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SepayTransactionStatus })
  @IsOptional()
  @IsEnum(SepayTransactionStatus)
  status?: SepayTransactionStatus;
}

export enum SepayResolveAction {
  CREDIT_ACCOUNT = 'CREDIT_ACCOUNT',
  IGNORE = 'IGNORE',
}

export class ResolveSepayTransactionDto {
  @ApiProperty({ enum: SepayResolveAction })
  @IsEnum(SepayResolveAction)
  action!: SepayResolveAction;

  // Tài khoản được cộng tiền khi action = CREDIT_ACCOUNT: id hoặc email.
  @ApiPropertyOptional()
  @ValidateIf(
    (o: ResolveSepayTransactionDto) =>
      o.action === SepayResolveAction.CREDIT_ACCOUNT && !o.accountEmail,
  )
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  accountEmail?: string;

  // Bắt buộc ghi lý do để truy vết.
  @ApiProperty()
  @IsString()
  @Length(3, 500)
  note!: string;
}
