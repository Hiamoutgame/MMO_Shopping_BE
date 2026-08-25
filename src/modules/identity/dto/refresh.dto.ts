import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ example: 'refresh-token-value' })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token la bat buoc.' })
  refreshToken!: string;
}
