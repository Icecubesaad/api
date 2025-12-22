import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateNoteDto, ListNotesQueryDto } from './dto/create-note.dto';
import { Note } from '@prisma/client';
import { RagService } from '../ai/rag.service';

@Injectable()
export class NotesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ragService: RagService,
  ) {}

  async create(userId: string, dto: CreateNoteDto): Promise<Note> {
    console.log("🔧 Notes Service - Create called with userId:", userId, "projectId:", dto.projectId);
    
    const project = await this.db.project.findFirst({ where: { id: dto.projectId, ownerId: userId } });
    console.log("🔍 Project found:", project);
    
    if (!project) {
      // Let's also check if the project exists at all
      const anyProject = await this.db.project.findUnique({ where: { id: dto.projectId } });
      console.log("🔍 Any project with this ID:", anyProject);
      throw new ForbiddenException('You do not own this project');
    }

    const note = await this.db.note.create({
      data: {
        userId,
        projectId: dto.projectId,
        content: dto.content,
        kind: dto.type as any, // Map type to kind
        date: dto.date ? new Date(dto.date) : new Date(),
        tags: dto.tags ?? [],
        audioPath: dto.audioPath,
      },
    });

    // Ingest into RAG system for semantic search
    try {
      await this.ragService.ingestNote(
        note.id,
        note.content,
        note.projectId,
        note.date,
      );
    } catch (error) {
      console.error('Failed to ingest note into RAG:', error);
      // Don't fail the note creation if RAG ingestion fails
    }

    return note;
  }

  async list(userId: string, q: ListNotesQueryDto): Promise<Note[]> {
    return this.db.note.findMany({
      where: {
        userId,
        ...(q.projectId ? { projectId: q.projectId } : {}),
        ...(q.date ? { date: { gte: new Date(q.date), lt: new Date(new Date(q.date).getTime() + 86400000) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
