import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({ example: 'refresh-token-value' })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}
