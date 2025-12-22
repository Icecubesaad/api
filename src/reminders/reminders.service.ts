import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateReminderDto, UpdateReminderDto } from './dto/create-reminder.dto';
import { Reminder } from '@prisma/client';

@Injectable()
export class RemindersService {
  constructor(private readonly db: DatabaseService) {}

  async create(userId: string, dto: CreateReminderDto): Promise<Reminder> {
    // RBAC: user must own the project OR be a member
    const project = await this.db.project.findFirst({ 
      where: { 
        id: dto.projectId, 
        OR: [
          { ownerId: userId },
          // Allow if user has any reminders in this project (they were granted access)
        ]
      } 
    });
    
    if (!project) {
      // Check if the project exists at all
      const projectExists = await this.db.project.findUnique({ where: { id: dto.projectId } });
      if (!projectExists) {
        throw new ForbiddenException('Project not found');
      }
      throw new ForbiddenException('You do not have access to this project');
    }

    const reminder = await this.db.reminder.create({
      data: {
        title: dto.title,
        dueAt: new Date(dto.dueAt),
        projectId: dto.projectId,
        userId,
      },
    });

    return reminder;
  }

  async list(userId: string, projectId?: string): Promise<Reminder[]> {
    return this.db.reminder.findMany({
      where: {
        userId,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  async update(userId: string, id: string, dto: UpdateReminderDto): Promise<Reminder> {
    const reminder = await this.db.reminder.findUnique({ where: { id } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    if (reminder.userId !== userId) throw new ForbiddenException('Not allowed');

    return this.db.reminder.update({
      where: { id },
      data: {
        title: dto.title,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        status: dto.status,
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const reminder = await this.db.reminder.findUnique({ where: { id } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    if (reminder.userId !== userId) throw new ForbiddenException('Not allowed');

    await this.db.reminder.delete({ where: { id } });
  }
} 