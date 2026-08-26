import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class CreateInventoryItemDto {
  @ApiProperty()
  @IsUUID()
  productVariantId!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
