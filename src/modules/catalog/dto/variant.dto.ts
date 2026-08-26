import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { FulfillmentType } from '../enums/fulfillment-type.enum';
import { VariantStatus } from '../enums/variant-status.enum';

export class CreateVariantDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sku!: string;

  @ApiProperty({ example: 'Liên Quân 100 Vcoin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: '100000', description: 'decimal string không âm' })
  @IsNumberString()
  price!: string;

  @ApiPropertyOptional({ default: 'VND', description: 'Chỉ chấp nhận VND' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string = 'VND';

  @ApiPropertyOptional({ enum: VariantStatus, default: VariantStatus.ACTIVE })
  @IsOptional()
  @IsEnum(VariantStatus)
  status?: VariantStatus;

  @ApiProperty({ enum: FulfillmentType })
  @IsEnum(FulfillmentType)
  fulfillmentType!: FulfillmentType;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  warrantyDays?: number | null;
}

export class UpdateVariantDto {
  @ApiPropertyOptional({ example: 'Liên Quân 100 Vcoin' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: '100000' })
  @IsOptional()
  @IsNumberString()
  price?: string;

  @ApiPropertyOptional({ enum: VariantStatus })
  @IsOptional()
  @IsEnum(VariantStatus)
  status?: VariantStatus;

  @ApiPropertyOptional({ enum: FulfillmentType })
  @IsOptional()
  @IsEnum(FulfillmentType)
  fulfillmentType?: FulfillmentType;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  warrantyDays?: number | null;
}
