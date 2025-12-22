import { IsString, IsOptional, IsDateString, IsEnum, IsArray, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum NoteKind {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
  AI = 'AI',
}

export class CreateNoteDto {
  @ApiProperty({ 
    description: '⚠️ PASTE YOUR PROJECT ID HERE (from step 3)', 
    example: 'PASTE_PROJECT_ID_HERE' 
  })
  @IsString()
  projectId: string;

  @ApiProperty({ 
    description: 'Note content - SAVE THE NOTE ID FROM RESPONSE!', 
    example: 'Had a productive meeting today. Need to follow up on the proposal by Friday.' 
  })
  @IsString()
  content: string;

  @ApiProperty({ 
    enum: NoteKind, 
    description: 'Note type', 
    example: 'TEXT' 
  })
  @IsEnum(NoteKind)
  type: NoteKind;

  @ApiPropertyOptional({ 
    description: 'Date (optional - delete this field or leave out)', 
    example: '2025-12-17T10:00:00.000Z' 
  })
  @IsOptional()
  @ValidateIf((o) => o.date !== '' && o.date !== undefined)
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ 
    description: 'Tags', 
    example: ['meeting', 'followup'] 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ 
    description: 'Audio path (optional - delete this field)', 
    example: '' 
  })
  @IsOptional()
  @ValidateIf((o) => o.audioPath !== '' && o.audioPath !== undefined)
  @IsString()
  audioPath?: string;
}

export class ListNotesQueryDto {
  @ApiPropertyOptional({ 
    description: 'Paste your project ID to filter', 
    example: '' 
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by date', 
    example: '' 
  })
  @IsOptional()
  @ValidateIf((o) => o.date !== '' && o.date !== undefined)
  @IsDateString()
  date?: string;
} 