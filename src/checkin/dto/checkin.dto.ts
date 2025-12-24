import { IsString, IsOptional, IsBoolean, IsEnum, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CheckinFrequency {
  DAILY = 'DAILY',
  WEEKDAYS = 'WEEKDAYS',
  CUSTOM = 'CUSTOM',
}

export class UpdateCheckinPreferencesDto {
  @ApiPropertyOptional({ description: 'Enable/disable daily check-ins' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Check-in time in HH:mm format (24h)', example: '09:00' })
  @IsOptional()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Time must be in HH:mm format' })
  time?: string;

  @ApiPropertyOptional({ description: 'Timezone', example: 'Australia/Sydney' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: CheckinFrequency })
  @IsOptional()
  @IsEnum(CheckinFrequency)
  frequency?: CheckinFrequency;

  @ApiPropertyOptional({ description: 'Days of week (0=Sun, 6=Sat)', example: [1, 2, 3, 4, 5] })
  @IsOptional()
  customDays?: number[];
}

export class CheckinResponseDto {
  @ApiProperty()
  @IsString()
  response: string;

  @ApiPropertyOptional({ description: 'Project ID to associate response with' })
  @IsOptional()
  @IsString()
  projectId?: string;
}

export class CheckinPreferencesResponseDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  time: string;

  @ApiProperty()
  timezone: string;

  @ApiProperty({ enum: CheckinFrequency })
  frequency: CheckinFrequency;

  @ApiPropertyOptional()
  customDays?: number[];

  @ApiPropertyOptional()
  nextScheduledAt?: Date;
}
