import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ 
    description: 'Update your display name', 
    example: 'Updated Name' 
  })
  @IsOptional()
  @IsString()
  displayName?: string;
}

// This DTO accepts any key-value pairs for notification preferences
// Swagger documentation is handled in the controller via @ApiBody schema
export class UpdateNotificationPreferencesDto {
  [key: string]: any;
}

