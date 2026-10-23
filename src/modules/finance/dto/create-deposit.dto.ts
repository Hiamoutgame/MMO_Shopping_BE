import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class CreateDepositDto {
  /** Số tiền VND nguyên; min/max kiểm tra ở service theo cấu hình. */
  @ApiProperty({ example: '50000' })
  @Matches(/^\d{1,13}$/, { message: 'amount must be a whole VND number.' })
  amount!: string;
}
