import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
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
