import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { AccountStatus } from '../enums/account-status.enum';

export class UpdateAccountDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Email khong hop le.' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'secret123', minLength: 6 })
  @IsString()
  @IsOptional()
  @MinLength(6, { message: 'Mat khau phai tu 6 ky tu.' })
  password?: string;

  @ApiPropertyOptional({ example: 'USER' })
  @IsString()
  @IsOptional()
  roleCode?: string;

  @ApiPropertyOptional({ example: 'Nguyen Van A' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: AccountStatus, example: AccountStatus.ACTIVE })
  @IsEnum(AccountStatus)
  @IsOptional()
  status?: AccountStatus;
}
