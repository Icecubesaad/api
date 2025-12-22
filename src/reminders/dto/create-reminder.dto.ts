import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReminderStatus } from '@prisma/client';

export class CreateReminderDto {
  @ApiProperty({ 
    description: 'Reminder title - SAVE THE REMINDER ID FROM RESPONSE!', 
    example: 'Follow up on meeting' 
  })
  @IsString()
  title: string;

  @ApiProperty({ 
    description: '⚠️ PASTE YOUR PROJECT ID HERE', 
    example: 'PASTE_PROJECT_ID_HERE' 
  })
  @IsString()
  projectId: string;

  @ApiProperty({ 
    description: 'Due date (tomorrow)', 
    example: '2025-12-17T14:00:00.000Z' 
  })
  @IsDateString()
  dueAt: string;
}

export class UpdateReminderDto {
  @ApiPropertyOptional({ description: 'Reminder title', example: 'Submit final project proposal' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Due date/time in ISO format', example: '2025-12-21T14:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ description: 'Reminder status', enum: ReminderStatus, example: 'COMPLETED' })
  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;
} 