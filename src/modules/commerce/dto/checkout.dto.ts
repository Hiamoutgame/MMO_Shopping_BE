import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CheckoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cartId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  voucherCode?: string;
}

export class ValidateVoucherDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cartId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  code!: string;
}
