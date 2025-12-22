import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReminderStatus } from '@prisma/client';

export class ReminderResponseDto {
  @ApiProperty({ description: 'Reminder ID (CUID)' })
  id: string;

  @ApiProperty({ description: 'Project ID (CUID)' })
  projectId: string;

  @ApiProperty({ description: 'User ID (CUID)' })
  userId: string;

  @ApiProperty({ description: 'Reminder title' })
  title: string;

  @ApiProperty({ description: 'Due date/time' })
  dueAt: Date;

  @ApiProperty({ description: 'Reminder status', enum: ReminderStatus })
  status: ReminderStatus;

  @ApiPropertyOptional({ description: 'Recurrence pattern (JSON)' })
  recurrenceJson?: any;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

