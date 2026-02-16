import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateReminderDto, UpdateReminderDto } from './dto/create-reminder.dto';
import { Reminder } from '@prisma/client';

@Injectable()
export class RemindersService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Format time in user's timezone
   */
  private formatTimeInUserTimezone(date: Date, timezone: string): string {
    return date.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  /**
   * Get user's timezone from preferences
   */
  private async getUserTimezone(userId: string): Promise<string> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    const notifPrefs = (user?.notifPrefs as any) || {};
    return notifPrefs.timezone || 'UTC';
  }

  /**
   * Add formatted time to reminder response
   */
  private async formatReminder(reminder: Reminder, userId: string) {
    const timezone = await this.getUserTimezone(userId);
    return {
      ...reminder,
      dueAtFormatted: this.formatTimeInUserTimezone(reminder.dueAt, timezone),
      timezone,
    };
  }

  async create(userId: string, dto: CreateReminderDto): Promise<any> {
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

    return this.formatReminder(reminder, userId);
  }

  async list(userId: string, projectId?: string): Promise<any[]> {
    const reminders = await this.db.reminder.findMany({
      where: {
        userId,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { dueAt: 'asc' },
    });

    return Promise.all(reminders.map(r => this.formatReminder(r, userId)));
  }

  async update(userId: string, id: string, dto: UpdateReminderDto): Promise<any> {
    const reminder = await this.db.reminder.findUnique({ where: { id } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    if (reminder.userId !== userId) throw new ForbiddenException('Not allowed');

    const updated = await this.db.reminder.update({
      where: { id },
      data: {
        title: dto.title,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        status: dto.status,
      },
    });

    return this.formatReminder(updated, userId);
  }

  async remove(userId: string, id: string): Promise<void> {
    const reminder = await this.db.reminder.findUnique({ where: { id } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    if (reminder.userId !== userId) throw new ForbiddenException('Not allowed');

    await this.db.reminder.delete({ where: { id } });
  }
} 