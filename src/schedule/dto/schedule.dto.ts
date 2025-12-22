import { IsString, IsOptional, IsDateString, IsArray, ValidateNested, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ParsedBlock {
  @ApiProperty({ description: 'Block title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Block description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Start time in RFC3339 format with timezone' })
  @IsDateString()
  startsAt: string; // RFC3339 with timezone

  @ApiProperty({ description: 'End time in RFC3339 format with timezone' })
  @IsDateString()
  endsAt: string; // RFC3339 with timezone

  @ApiPropertyOptional({ description: 'Tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ParseResult {
  @ApiProperty({ description: 'Confidence score (0-1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @ApiProperty({ description: 'Parsed blocks', type: [ParsedBlock] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParsedBlock)
  blocks: ParsedBlock[];

  @ApiPropertyOptional({ description: 'Warnings', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];
}

export class ParsePreview {
  @ApiProperty({ description: 'Upload ID (CUID)' })
  @IsString()
  uploadId: string;

  @ApiProperty({ description: 'Project ID (CUID)' })
  @IsString()
  projectId: string;

  @ApiProperty({ description: 'Schedule date in ISO format' })
  @IsDateString()
  scheduleDate: string; // ISO day

  @ApiProperty({ description: 'Timezone (e.g., "Australia/Sydney")' })
  @IsString()
  tz: string;

  @ApiProperty({ description: 'Parsed blocks', type: [ParsedBlock] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParsedBlock)
  blocks: ParsedBlock[];

  @ApiPropertyOptional({ description: 'Import hash for duplicate detection' })
  @IsOptional()
  @IsString()
  importHash?: string;
}

export class EditedBlock {
  @ApiProperty({ 
    description: 'Task/event title', 
    example: 'Team Meeting' 
  })
  @IsString()
  title: string;

  @ApiPropertyOptional({ 
    description: 'Description', 
    example: 'Daily standup with the team' 
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ 
    description: 'Start time (ISO format)', 
    example: '2025-12-17T09:00:00.000Z' 
  })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ 
    description: 'End time (ISO format)', 
    example: '2025-12-17T09:30:00.000Z' 
  })
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({ 
    description: 'Tags', 
    type: [String],
    example: ['meeting'] 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class CommitScheduleDto {
  @ApiProperty({ 
    description: 'Upload ID (use "manual" for manual schedule creation without PDF)', 
    example: 'manual' 
  })
  @IsString()
  uploadId: string;

  @ApiProperty({ 
    description: '⚠️ PASTE YOUR PROJECT ID HERE', 
    example: 'PASTE_PROJECT_ID_HERE' 
  })
  @IsString()
  projectId: string;

  @ApiProperty({ 
    description: 'Schedule blocks - copy from /schedule/preview or create manually', 
    type: [EditedBlock],
    example: [{
      title: 'Team Meeting',
      description: 'Daily standup',
      startsAt: '2025-12-17T09:00:00.000Z',
      endsAt: '2025-12-17T09:30:00.000Z',
      tags: ['meeting']
    }]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditedBlock)
  blocks: EditedBlock[];

  @ApiPropertyOptional({ 
    description: 'Test mode - no actual creation', 
    default: false,
    example: false 
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({ 
    description: 'Force reimport - delete existing events/reminders first', 
    default: false,
    example: false 
  })
  @IsOptional()
  @IsBoolean()
  forceReimport?: boolean;
}

export class ScheduleImportResult {
  @ApiProperty({ description: 'Created calendar events', type: 'array' })
  createdEvents: any[];

  @ApiProperty({ description: 'Created reminders', type: 'array' })
  createdReminders: any[];

  @ApiPropertyOptional({ description: 'Skipped duplicates', type: 'array' })
  skippedDuplicates?: any[];

  @ApiProperty({ description: 'Import hash' })
  importHash: string;

  @ApiPropertyOptional({ description: 'Status message' })
  message?: string;
}