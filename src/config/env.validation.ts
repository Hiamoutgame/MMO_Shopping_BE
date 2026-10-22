import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

function toBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV!: Environment;

  @IsNumber()
  PORT!: number;

  // DATABASE_URL is used by Render (managed Postgres) and Neon.
  // When provided, the individual DB_* fields below are NOT required.
  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  DB_HOST?: string;

  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsNumber()
  DB_PORT?: number;

  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  DB_USERNAME?: string;

  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  DB_PASSWORD?: string;

  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  DB_DATABASE?: string;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  SWAGGER_ENABLED!: boolean;

  @IsString()
  SWAGGER_PATH!: string;

  @IsString()
  SWAGGER_TITLE!: string;

  @IsString()
  SWAGGER_DESCRIPTION!: string;

  @IsString()
  SWAGGER_VERSION!: string;

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN!: string;

  @IsNumber()
  REFRESH_TOKEN_EXPIRES_DAYS!: number;

  @IsString()
  INVENTORY_ENCRYPTION_KEY!: string;

  @IsString()
  PAYMENT_CALLBACK_SECRET!: string;

  @IsString()
  HOANPHI_API_BASE_URL!: string;

  @IsNumber()
  HOANPHI_TIMEOUT_MS!: number;

  @IsString()
  INTEGRATION_ENCRYPTION_KEY!: string;

  // --- SePay (tuỳ chọn; thiếu thì tính năng nạp SePay tắt) ---
  @IsOptional()
  @IsString()
  SEPAY_WEBHOOK_API_KEY?: string;

  @IsOptional()
  @IsString()
  SEPAY_API_TOKEN?: string;

  @IsOptional()
  @IsString()
  SEPAY_API_BASE_URL?: string;

  @IsOptional()
  @IsString()
  SEPAY_BANK_CODE?: string;

  @IsOptional()
  @IsString()
  SEPAY_ACCOUNT_NUMBER?: string;

  @IsOptional()
  @IsString()
  SEPAY_ACCOUNT_HOLDER?: string;

  @IsOptional()
  @Matches(/^[A-Za-z]{2,5}$/)
  SEPAY_PAYMENT_PREFIX?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  SEPAY_MIN_DEPOSIT_AMOUNT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  SEPAY_DEPOSIT_EXPIRES_MINUTES?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  SEPAY_RECONCILE_INTERVAL_SECONDS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  SEPAY_RECONCILE_LOOKBACK_HOURS?: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
