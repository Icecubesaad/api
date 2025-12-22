import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { CalendarProvider } from '@prisma/client';

export class ConnectCalendarDto {
  @ApiProperty({ description: 'Calendar provider', enum: CalendarProvider, example: 'GOOGLE' })
  @IsEnum(CalendarProvider)
  provider: CalendarProvider;

  @ApiProperty({ description: 'OAuth authorization code from provider', example: '4/0AX4XfWh...' })
  @IsString()
  authCode: string;
}

export class CreateCalendarEventDto {
  @ApiProperty({ description: 'Event title/summary', example: 'Team standup meeting' })
  @IsString()
  summary: string;

  @ApiProperty({ description: 'Event description', required: false, example: 'Daily sync with the development team' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ 
    description: 'Start time in ISO format', 
    example: { dateTime: '2025-12-17T09:00:00.000Z' }
  })
  @IsString()
  start: {
    dateTime: string;
  };

  @ApiProperty({ 
    description: 'End time in ISO format',
    example: { dateTime: '2025-12-17T09:30:00.000Z' }
  })
  @IsString()
  end: {
    dateTime: string;
  };
}

export class CalendarAuthUrlResponseDto {
  @ApiProperty({ description: 'OAuth authorization URL' })
  authUrl: string;
}

export class CalendarStatusResponseDto {
  @ApiProperty({ description: 'Connection status per provider', type: 'object' })
  connections: Record<string, { connected: boolean; calendarId?: string }>;
}

