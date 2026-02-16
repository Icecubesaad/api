import { Controller, Get, Post, Body, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { NotesService } from './notes.service';
import { CreateNoteDto, ListNotesQueryDto } from './dto/create-note.dto';
import { NoteResponseDto, VoiceNoteResponseDto } from './dto/note-response.dto';
import { User } from '../auth/decorators/user.decorator';
import OpenAI, { toFile } from 'openai';
import { ConfigService } from '@nestjs/config';

@ApiTags('notes')
@ApiBearerAuth()
@Controller('notes')
export class NotesController {
  private openai: OpenAI;

  constructor(
    private readonly notes: NotesService,
    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('ai.openaiApiKey'),
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a note' })
  @ApiResponse({ status: 201, description: 'Note created', type: NoteResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@User() u: any, @Body() dto: CreateNoteDto) {
    return this.notes.create(u.dbUser.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List notes' })
  @ApiResponse({ status: 200, description: 'List of notes', type: [NoteResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(@User() u: any, @Query() q: ListNotesQueryDto) {
    return this.notes.list(u.dbUser.id, q);
  }

  @Post('voice')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a voice note with transcription' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description: 'Audio file (MP3, WAV, etc.)'
        },
        projectId: {
          type: 'string',
          description: 'Project ID (CUID)'
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags (optional)'
        }
      },
      required: ['audio', 'projectId']
    }
  })
  @ApiResponse({ status: 201, description: 'Voice note created with transcript', type: VoiceNoteResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid file or missing projectId' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createVoiceNote(
    @User() u: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('projectId') projectId: string,
    @Body('tags') tags?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Audio file is required');
    }

    if (!projectId) {
      throw new BadRequestException('Project ID is required');
    }

    try {
      // Validate file type
      if (!file.mimetype.startsWith('audio/')) {
        throw new BadRequestException('File must be an audio file');
      }

      // Transcribe audio using OpenAI Whisper
      // Use toFile helper from OpenAI SDK to convert Buffer to File
      const transcription = await this.openai.audio.transcriptions.create({
        file: await toFile(file.buffer, file.originalname, { type: file.mimetype }),
        model: 'whisper-1',
        language: 'en', // You can make this configurable
      });

      const transcript = transcription.text;

      if (!transcript || transcript.trim().length === 0) {
        throw new BadRequestException('Could not transcribe audio - no speech detected');
      }

      // Create note with transcript
      const note = await this.notes.create(u.dbUser.id, {
        projectId,
        content: transcript,
        type: 'VOICE' as any,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        audioPath: `voice/${Date.now()}-${file.originalname}`, // In production, store to S3/MinIO
      });

      return {
        noteId: note.id,
        transcript,
        audioPath: note.audioPath,
      };
    } catch (error) {
      console.error('Failed to process voice note:', error);
      throw new BadRequestException('Failed to process voice note');
    }
  }
}
