import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RegisterFcmTokenDto {
  @ApiProperty({ description: 'Firebase Cloud Messaging token' })
  @IsString()
  token: string;
}

export class FcmTokenResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;
}

