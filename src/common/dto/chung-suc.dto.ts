import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsArray,
  IsUUID,
  Min,
  Max,
  IsDateString,
} from 'class-validator';

// ========== Season DTOs ==========
export class CreateSeasonDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @IsDateString()
  @IsNotEmpty()
  endDate!: string;
}

export class UpdateSeasonDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

// ========== Pricing DTOs ==========
export class CalculatePriceDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsUUID()
  @IsOptional()
  accountId?: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsUUID()
  @IsOptional()
  seasonId?: string;

  @IsUUID()
  @IsOptional()
  packageId?: string;

  @IsString()
  @IsOptional()
  couponCode?: string;
}

export class CreatePriceTierDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsUUID()
  @IsOptional()
  seasonId?: string;

  @IsString()
  @IsNotEmpty()
  roleCode!: string;

  @IsNumber()
  @Min(1)
  quantityFrom!: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  quantityTo?: number;

  @IsString()
  @IsNotEmpty()
  unitPrice!: string;
}

export class CreatePriceRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum([
    'SEASONAL',
    'ROLE_BASED',
    'QUANTITY_BASED',
    'PACKAGE',
    'PROMOTIONAL',
  ])
  @IsNotEmpty()
  ruleType!: string;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsBoolean()
  @IsOptional()
  isStackable?: boolean;

  @IsEnum(['PERCENTAGE', 'FIXED_AMOUNT'])
  @IsNotEmpty()
  discountType!: string;

  @IsString()
  @IsNotEmpty()
  discountValue!: string;

  @IsArray()
  @IsOptional()
  applicableProductIds?: string[];

  @IsArray()
  @IsOptional()
  applicableRoles?: string[];

  @IsArray()
  @IsOptional()
  applicableSeasonIds?: string[];

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

// ========== Package DTOs ==========
export class CreatePackageDto {
  @IsUUID()
  @IsOptional()
  seasonId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  displayPrice!: string;

  @IsString()
  @IsNotEmpty()
  unitPrice!: string;

  @IsArray()
  @IsOptional()
  applicableRoles?: string[];

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

export class UpdatePackageDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  quantity?: number;

  @IsString()
  @IsOptional()
  displayPrice?: string;

  @IsString()
  @IsOptional()
  unitPrice?: string;

  @IsArray()
  @IsOptional()
  applicableRoles?: string[];

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ========== Seller DTOs ==========
export class CreateSellerProfileDto {
  @IsUUID()
  @IsNotEmpty()
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  businessName!: string;

  @IsString()
  @IsOptional()
  businessType?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  businessAddress?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  commissionRate?: number;
}

export class UpdateSellerProfileDto {
  @IsString()
  @IsOptional()
  businessName?: string;

  @IsString()
  @IsOptional()
  businessType?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  businessAddress?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  commissionRate?: number;
}

export class CreateReferralCodeDto {
  @IsUUID()
  @IsNotEmpty()
  sellerId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  code!: string;
}

export class TrackReferralClickDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  ipAddress!: string;

  @IsString()
  @IsOptional()
  userAgent?: string;

  @IsString()
  @IsOptional()
  referrerUrl?: string;
}

// ========== Coupon DTOs ==========
export class ValidateCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsUUID()
  @IsNotEmpty()
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  roleCode!: string;

  @IsArray()
  @IsOptional()
  productIds?: string[];

  @IsUUID()
  @IsOptional()
  seasonId?: string;

  @IsUUID()
  @IsOptional()
  packageId?: string;

  @IsString()
  @IsNotEmpty()
  orderTotal!: string;
}

export class RecordCouponUsageDto {
  @IsUUID()
  @IsNotEmpty()
  voucherId!: string;

  @IsUUID()
  @IsNotEmpty()
  accountId!: string;

  @IsUUID()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  discountAmount!: string;
}

// ========== Purchase DTOs ==========
export class CreatePurchaseBatchDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsUUID()
  @IsOptional()
  seasonId?: string;

  @IsString()
  @IsNotEmpty()
  batchNumber!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  costPerUnit!: string;

  @IsString()
  @IsOptional()
  supplier?: string;

  @IsDateString()
  @IsNotEmpty()
  purchaseDate!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateCostTierDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantityFrom!: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  quantityTo?: number;

  @IsString()
  @IsNotEmpty()
  costPerUnit!: string;
}

// ========== Analytics DTOs ==========
export class CreateProfitRecordDto {
  @IsUUID()
  @IsNotEmpty()
  orderId!: string;

  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsUUID()
  @IsOptional()
  seasonId?: string;

  @IsUUID()
  @IsOptional()
  sellerId?: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  revenue!: string;

  @IsString()
  @IsNotEmpty()
  cost!: string;
}

export class CreateTestCampaignDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsUUID()
  @IsOptional()
  seasonId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  testBudget!: string;

  @IsNumber()
  @Min(1)
  testQuantity!: number;

  @IsString()
  @IsNotEmpty()
  costPerUnit!: string;

  @IsDateString()
  @IsNotEmpty()
  startDate!: string;
}
