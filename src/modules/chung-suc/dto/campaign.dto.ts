import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { EventVariant } from '../enums/event-variant.enum';

// ValidationPipe toàn cục bật enableImplicitConversion nên "10" sẽ bị ép thành 10
// trước khi validate. Giữ nguyên giá trị gốc để @IsInt từ chối chuỗi.
const RawValue = () =>
  Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  );

// Luật sự kiện dùng chung cho tạo và sửa. Gửi null để bỏ giới hạn;
// bỏ trường khi tạo thì lấy theo preset của biến thể.
export class EventRulesDto {
  @ApiPropertyOptional({
    description: 'Mã mùa sự kiện, VD XAP_XINH_2026',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]{3,64}$/, {
    message: 'eventCode chỉ gồm A-Z, 0-9, dấu gạch dưới (3–64 ký tự)',
  })
  eventCode?: string | null;

  @ApiPropertyOptional({ enum: EventVariant })
  @IsOptional()
  @IsEnum(EventVariant)
  variant?: EventVariant;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @RawValue()
  @IsInt()
  @Min(1)
  helperLimitPerDay?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @RawValue()
  @IsInt()
  @Min(1)
  helperLimitTotal?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @RawValue()
  @IsInt()
  @Min(1)
  ownerLimitPerDay?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @RawValue()
  @IsInt()
  @Min(1)
  ownerLimitTotal?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @RawValue()
  @IsInt()
  @Min(1)
  pointsCap?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @RawValue()
  @IsBoolean()
  dailyReset?: boolean;
}

export class CreateCampaignDto extends EventRulesDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiProperty()
  @RawValue()
  @IsInt()
  @Min(1)
  targetQuantity!: number;

  @ApiProperty()
  @IsISO8601({ strict: true })
  startTime!: string;

  @ApiProperty()
  @IsISO8601({ strict: true })
  endTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  completionConditions?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  rewards?: Record<string, any>;
}

// Không có status/productId/slug: status chỉ đổi qua các endpoint lifecycle.
export class UpdateCampaignDto extends EventRulesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @RawValue()
  @IsInt()
  @Min(1)
  targetQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  completionConditions?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  rewards?: Record<string, any>;
}

export class JoinCampaignDto {
  @ApiProperty({ description: 'Mã mời của khách trong game' })
  // Đọc giá trị gốc như RawValue: implicit conversion ép số/object thành chuỗi
  // ("12345", "[object Object]") trước khi @IsString kịp từ chối.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    return typeof raw === 'string' ? raw.trim() : raw;
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  inviteCode!: string;

  @ApiProperty({ description: 'Số tài khoản hỗ trợ cho mã mời này' })
  @RawValue()
  @IsInt()
  @Min(1)
  quantity!: number;

  // Account tham gia luôn lấy từ JWT; field này chỉ được nhận để từ chối khi
  // client cố tham gia thay account khác.
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
