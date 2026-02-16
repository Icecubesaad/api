import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project, Prisma } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private db: DatabaseService) {}

  /**
   * Convert reminder times from UTC to user's local timezone
   */
  private convertReminderTimesToLocal(reminders: any[], timezone: string) {
    return reminders.map(reminder => {
      // Calculate the local time by applying timezone offset
      const utcDate = new Date(reminder.dueAt);
      
      // Get the local time string in the user's timezone
      const localTimeStr = utcDate.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      
      // Parse the local time string to create ISO format
      const [datePart, timePart] = localTimeStr.split(', ');
      const [month, day, year] = datePart.split('/');
      const [hour, minute, second] = timePart.split(':');
      
      // Create ISO string in local timezone (without Z suffix)
      const dueAtLocal = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour}:${minute}:${second}`;
      
      return {
        ...reminder,
        dueAtLocal, // Local time in ISO format
        dueAtUTC: reminder.dueAt, // Keep original UTC for reference
      };
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

  async create(createProjectDto: CreateProjectDto, firebaseUid: string): Promise<Project> {
    console.log("🔧 Projects Service - Create called with:", createProjectDto, firebaseUid);
    console.log("🔍 Looking for user with firebaseUid:", firebaseUid);
    
    // Find the user by Firebase UID
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    console.log("✅ User found:", user.id);

    return this.db.project.create({
      data: {
        ...createProjectDto,
        ownerId: user.id, // Use the database user ID
      },
      include: {
        owner: true,
        notes: true,
        dailyLogs: true,
        reminders: true,
      },
    });
  }

  async findAll(firebaseUid: string): Promise<any[]> {
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const timezone = await this.getUserTimezone(user.id);

    const projects = await this.db.project.findMany({
      where: {
        ownerId: user.id,
        archivedAt: null,
      },
      include: {
        owner: true,
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        dailyLogs: {
          orderBy: { date: 'desc' },
          take: 5,
        },
        reminders: {
          where: { status: 'PENDING' },
          orderBy: { dueAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Convert reminder times to local timezone
    return projects.map(project => ({
      ...project,
      reminders: this.convertReminderTimesToLocal(project.reminders, timezone),
    }));
  }

  async findOne(id: string, firebaseUid: string): Promise<any> {
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const timezone = await this.getUserTimezone(user.id);

    const project = await this.db.project.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
      include: {
        owner: true,
        notes: {
          orderBy: { createdAt: 'desc' },
        },
        dailyLogs: {
          orderBy: { date: 'desc' },
        },
        reminders: {
          orderBy: { dueAt: 'asc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    // Convert reminder times to local timezone
    return {
      ...project,
      reminders: this.convertReminderTimesToLocal(project.reminders, timezone),
    };
  }

  async update(id: string, updateProjectDto: UpdateProjectDto, firebaseUid: string): Promise<Project> {
    console.log('🔧 Update project called:', { id, updateProjectDto, firebaseUid });
    
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      console.log('❌ User not found for firebaseUid:', firebaseUid);
      throw new NotFoundException('User not found');
    }

    console.log('✅ User found:', user.id);

    const project = await this.db.project.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
    });

    if (!project) {
      console.log('❌ Project not found:', id);
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    console.log('✅ Project found, updating...');

    // Remove ownerId from update data if present (shouldn't be changed)
    const { ownerId, ...safeUpdateData } = updateProjectDto as any;

    try {
      const updated = await this.db.project.update({
        where: { id },
        data: safeUpdateData,
        include: {
          owner: true,
          notes: true,
          dailyLogs: true,
          reminders: true,
        },
      });
      console.log('✅ Project updated successfully');
      return updated;
    } catch (error) {
      console.error('❌ Error updating project:', error);
      throw error;
    }
  }

  async archive(id: string, firebaseUid: string): Promise<Project> {
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const project = await this.db.project.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return this.db.project.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: {
        owner: true,
        notes: true,
        dailyLogs: true,
        reminders: true,
      },
    });
  }

  async remove(id: string, firebaseUid: string): Promise<Project> {
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const project = await this.db.project.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return this.db.project.delete({
      where: { id },
      include: {
        owner: true,
        notes: true,
        dailyLogs: true,
        reminders: true,
      },
    });
  }
}
