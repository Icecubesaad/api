import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class RegisterFcmTokenDto {
  @ApiProperty({ description: 'Firebase Cloud Messaging token' })
  @IsString()
  token: string;

  @ApiPropertyOptional({ description: 'Platform: web, android, ios', example: 'android' })
  @IsString()
  @IsOptional()
  platform?: string;
}

export class FcmTokenResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiPropertyOptional({ description: 'Detected or specified platform' })
  platform?: string;
}

