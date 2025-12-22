import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NoteKind } from './create-note.dto';

export class NoteResponseDto {
  @ApiProperty({ description: 'Note ID (CUID)' })
  id: string;

  @ApiProperty({ description: 'Project ID (CUID)' })
  projectId: string;

  @ApiProperty({ description: 'User ID (CUID)' })
  userId: string;

  @ApiProperty({ description: 'Note content' })
  content: string;

  @ApiProperty({ description: 'Note kind', enum: NoteKind })
  kind: NoteKind;

  @ApiProperty({ description: 'Note date' })
  date: Date;

  @ApiProperty({ description: 'Tags', type: [String] })
  tags: string[];

  @ApiPropertyOptional({ description: 'Audio file path for voice notes' })
  audioPath?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class VoiceNoteResponseDto {
  @ApiProperty({ description: 'Note ID (CUID)' })
  noteId: string;

  @ApiProperty({ description: 'Transcribed text' })
  transcript: string;

  @ApiProperty({ description: 'Audio file path' })
  audioPath: string;
}

