import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsString,
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

  @IsString()
  DB_HOST!: string;

  @IsNumber()
  DB_PORT!: number;

  @IsString()
  DB_USERNAME!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsString()
  DB_DATABASE!: string;

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
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  // console.log('validated config:', validatedConfig);

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
