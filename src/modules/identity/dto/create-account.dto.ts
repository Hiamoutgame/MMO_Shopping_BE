import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { AccountStatus } from '../enums/account-status.enum';
import { ACTIVE_ROLE_CODES } from '../../../common/auth/account-role';

export class CreateAccountDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Email khong hop le.' })
  @IsNotEmpty({ message: 'Email la bat buoc.' })
  email!: string;

  @ApiProperty({ example: 'secret123', minLength: 6 })
  @IsString()
  @IsNotEmpty({ message: 'Password la bat buoc.' })
  @MinLength(6, { message: 'Mat khau phai tu 6 ky tu.' })
  password!: string;

  @ApiProperty({ enum: ACTIVE_ROLE_CODES, example: 'USER' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(ACTIVE_ROLE_CODES)
  @IsString()
  @IsNotEmpty({ message: 'roleCode la bat buoc.' })
  roleCode!: string;

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
