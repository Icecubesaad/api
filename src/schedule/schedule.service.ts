import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CalendarService } from '../calendar/calendar.service';
import { RemindersService } from '../reminders/reminders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PdfScheduleParseService } from './pdf-schedule-parse.service';
import { CommitScheduleDto, EditedBlock, ScheduleImportResult } from './dto/schedule.dto';
import * as crypto from 'crypto';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly calendarService: CalendarService,
    private readonly remindersService: RemindersService,
    private readonly notificationsService: NotificationsService,
    private readonly pdfParseService: PdfScheduleParseService,
  ) {}

  async getPreview(uploadId: string, userId: string) {
    const upload = await this.db.upload.findFirst({
      where: { id: uploadId, userId },
    });

    if (!upload) {
      throw new NotFoundException('Upload not found');
    }

    // Check if we already have a cached preview
    // In production, this would be stored in Redis or database
    // For now, we'll re-parse each time
    
    // Default to today in user's timezone if no schedule date provided
    const scheduleDate = new Date().toISOString().split('T')[0]; // ISO day format
    const tz = 'UTC'; // In production, get from user profile
    
    return this.pdfParseService.parseScheduleFromUpload(
      uploadId,
      upload.projectId,
      scheduleDate,
      tz
    );
  }

  async commitSchedule(userIdOrFirebaseUid: string, dto: CommitScheduleDto): Promise<ScheduleImportResult> {
    this.logger.log(`commitSchedule called with userIdOrFirebaseUid: ${userIdOrFirebaseUid}`);
    
    // Try to find user by database ID first, then by Firebase UID
    let user = await this.db.user.findUnique({
      where: { id: userIdOrFirebaseUid },
    });
    
    if (!user) {
      // Try by Firebase UID
      this.logger.log(`User not found by ID, trying Firebase UID...`);
      user = await this.db.user.findUnique({
        where: { firebaseUid: userIdOrFirebaseUid },
      });
    }
    
    if (!user) {
      this.logger.error(`User not found for ID/UID: ${userIdOrFirebaseUid}`);
      throw new NotFoundException('User not found');
    }
    
    const userId = user.id;
    this.logger.log(`Found user: ${userId} (firebaseUid: ${user.firebaseUid})`);
    
    // Allow manual schedule creation without upload
    // Only validate upload if uploadId looks like a real CUID
    if (dto.uploadId && dto.uploadId.startsWith('c') && dto.uploadId.length > 20) {
      const upload = await this.db.upload.findFirst({
        where: { id: dto.uploadId, userId },
      });

      if (!upload) {
        throw new NotFoundException('Upload not found');
      }
    }

    // Generate import hash for idempotency
    const importHash = this.generateImportHash(dto);
    
    // Check for existing imports with same hash
    const existingEvents = await this.db.event.findMany({
      where: {
        projectId: dto.projectId,
        // In production, store importHash in metaJson or separate field
      },
    });

    if (dto.dryRun) {
      return {
        createdEvents: dto.blocks.map(block => ({
          id: `dry-run-${Date.now()}`,
          title: block.title,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          status: 'dry-run',
        })),
        createdReminders: dto.blocks.map(block => ({
          id: `dry-run-reminder-${Date.now()}`,
          title: `Reminder: ${block.title}`,
          dueAt: this.calculateReminderTime(block.startsAt, block.endsAt),
          status: 'dry-run',
        })),
        importHash,
      };
    }

    // If forceReimport is true, delete existing events and reminders for this project first
    if (dto.forceReimport) {
      this.logger.log(`Force reimport: clearing existing events and reminders for project ${dto.projectId}`);
      await Promise.all([
        this.db.event.deleteMany({ where: { projectId: dto.projectId } }),
        this.db.reminder.deleteMany({ where: { projectId: dto.projectId, userId } }),
      ]);
    }

    const createdEvents = [];
    const createdReminders = [];
    const skippedDuplicates = [];

    // Prepare batch data for events and reminders
    const eventDataList = [];
    const reminderDataList = [];

    for (const block of dto.blocks) {
      // Skip duplicates check only if not force reimport
      if (!dto.forceReimport) {
        const existing = await this.db.event.findFirst({
          where: { title: block.title, startsAt: new Date(block.startsAt) },
        });
        if (existing) {
          skippedDuplicates.push({ title: block.title, startsAt: block.startsAt });
          continue;
        }
      }

      // Prepare event data
      eventDataList.push({
        projectId: dto.projectId,
        provider: 'LOCAL' as any,
        providerEventId: `local-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        title: block.title,
        startsAt: new Date(block.startsAt),
        endsAt: new Date(block.endsAt),
        metaJson: {
          description: block.description,
          tags: block.tags,
          importHash,
          source: 'pdf_schedule_import',
        },
      });

      // Prepare reminder data
      const dueAt = this.calculateReminderTime(block.startsAt, block.endsAt);
      reminderDataList.push({
        title: `Reminder: ${block.title}`,
        dueAt,
        projectId: dto.projectId,
        userId,
      });
    }

    // Batch create events using transaction
    if (eventDataList.length > 0) {
      this.logger.log(`Batch creating ${eventDataList.length} events...`);
      
      // Use createMany for events (faster than individual creates)
      await this.db.event.createMany({ data: eventDataList });
      
      // Fetch created events to return
      const events = await this.db.event.findMany({
        where: { 
          projectId: dto.projectId,
          metaJson: { path: ['importHash'], equals: importHash },
        },
        orderBy: { startsAt: 'asc' },
      });
      createdEvents.push(...events);
    }

    // Batch create reminders
    if (reminderDataList.length > 0) {
      this.logger.log(`Batch creating ${reminderDataList.length} reminders...`);
      
      await this.db.reminder.createMany({ data: reminderDataList });
      
      // Fetch created reminders to return
      const reminders = await this.db.reminder.findMany({
        where: { 
          projectId: dto.projectId,
          userId,
          title: { startsWith: 'Reminder: ' },
        },
        orderBy: { dueAt: 'asc' },
        take: reminderDataList.length,
      });
      createdReminders.push(...reminders);
    }

    // Send single summary notification instead of per-event notifications
    if (createdEvents.length > 0) {
      await this.sendBatchNotification(userId, createdEvents.length, createdReminders.length);
    }

    // Create audit event
    await this.db.auditEvent.create({
      data: {
        userId,
        action: 'SCHEDULE_IMPORT',
        entity: 'SCHEDULE',
        entityId: dto.uploadId,
        metaJson: {
          projectId: dto.projectId,
          eventsCreated: createdEvents.length,
          remindersCreated: createdReminders.length,
          importHash,
        },
      },
    });

    this.logger.log(`Batch import complete: ${createdEvents.length} events, ${createdReminders.length} reminders`);

    return {
      createdEvents,
      createdReminders,
      skippedDuplicates,
      importHash,
      message: skippedDuplicates.length > 0 
        ? `Created ${createdEvents.length} events and ${createdReminders.length} reminders. Skipped ${skippedDuplicates.length} duplicates.`
        : `Created ${createdEvents.length} events and ${createdReminders.length} reminders.`,
    };
  }

  private async sendBatchNotification(userId: string, eventsCount: number, remindersCount: number) {
    try {
      await this.notificationsService.sendPushNotificationPublic(userId, {
        title: `G'day Mate! Schedule imported`,
        body: `Created ${eventsCount} events and ${remindersCount} reminders from your PDF.`,
        data: { type: 'schedule_import', eventsCount, remindersCount },
      });
    } catch (error) {
      this.logger.warn(`Failed to send batch notification: ${error.message}`);
    }
  }

  private generateImportHash(dto: CommitScheduleDto): string {
    const hashInput = JSON.stringify({
      projectId: dto.projectId,
      blocks: dto.blocks.map(b => ({
        title: b.title,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
      })),
    });
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  private async checkForDuplicate(importHash: string, block: EditedBlock): Promise<boolean> {
    // Check for exact duplicate by title AND start time
    // This prevents creating the same event twice but allows re-importing with different times
    const existing = await this.db.event.findFirst({
      where: {
        title: block.title,
        startsAt: new Date(block.startsAt),
      },
    });
    
    if (existing) {
      this.logger.log(`Found duplicate: ${block.title} at ${block.startsAt}`);
    }
    
    return !!existing;
  }

  private async createEvent(userId: string, projectId: string, block: EditedBlock, importHash: string) {
    // Try to create in external calendar first
    let providerEventId: string | undefined;
    
    try {
      const calendarEvent = await this.calendarService.createEvent(userId, {
        summary: block.title,
        description: block.description,
        start: { dateTime: block.startsAt },
        end: { dateTime: block.endsAt },
      });
      providerEventId = calendarEvent.id;
    } catch (error) {
      this.logger.warn(`Failed to create calendar event for ${block.title}:`, error);
      // Continue with local-only event
    }

    // Create local event record
    return this.db.event.create({
      data: {
        projectId,
        provider: 'GOOGLE', // Default provider
        providerEventId: providerEventId || `local-${Date.now()}`,
        title: block.title,
        startsAt: new Date(block.startsAt),
        endsAt: new Date(block.endsAt),
        metaJson: {
          description: block.description,
          tags: block.tags,
          importHash,
          source: 'pdf_schedule_import',
        },
      },
    });
  }

  private async createReminder(userId: string, projectId: string, block: EditedBlock, eventId?: string) {
    const dueAt = this.calculateReminderTime(block.startsAt, block.endsAt);
    
    this.logger.log(`Creating reminder for "${block.title}" at ${dueAt.toISOString()}`);
    
    try {
      const reminder = await this.remindersService.create(userId, {
        title: `Reminder: ${block.title}`,
        dueAt: dueAt.toISOString(),
        projectId,
      });
      
      this.logger.log(`Created reminder: ${reminder.id} for "${block.title}"`);
      return reminder;
    } catch (error) {
      this.logger.error(`Failed to create reminder for "${block.title}":`, error.message);
      throw error;
    }
  }

  private calculateReminderTime(startsAt: string, endsAt: string): Date {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const duration = end.getTime() - start.getTime();
    const durationMinutes = duration / (1000 * 60);
    
    // For meetings/blocks ≥30min: startsAt - 15min
    // For short tasks <30min: startsAt - 5min
    const leadTimeMinutes = durationMinutes >= 30 ? 15 : 5;
    
    return new Date(start.getTime() - leadTimeMinutes * 60 * 1000);
  }

  private async sendEventCreatedNotification(userId: string, block: EditedBlock) {
    const startTime = new Date(block.startsAt).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const title = `Hey mate! "${block.title}" is on your schedule at ${startTime}.`;
    
    await this.notificationsService.sendPushNotificationPublic(userId, {
      title,
      body: block.description || 'Tap to view details',
      data: {
        type: 'event_created',
        eventTitle: block.title,
        startsAt: block.startsAt,
      },
    });
  }

  private async scheduleReminderNotification(userId: string, block: EditedBlock, reminderId: string) {
    const startTime = new Date(block.startsAt).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const title = `G'day Mate, "${block.title}" starts at ${startTime} — time to roll.`;
    
    // In production, this would schedule the notification for the reminder time
    // For now, we'll just create the notification record
    await this.db.notification.create({
      data: {
        userId,
        title,
        body: 'Your scheduled event is starting soon',
        metaJson: {
          type: 'reminder_due',
          reminderId,
          eventTitle: block.title,
          startsAt: block.startsAt,
          scheduledFor: this.calculateReminderTime(block.startsAt, block.endsAt).toISOString(),
        },
      },
    });
  }

  async importScheduleFromPdf(projectId: string, uploadId: string, scheduleDate?: string, tz?: string) {
    // This method is for AI chat tool integration
    const defaultScheduleDate = scheduleDate || new Date().toISOString().split('T')[0];
    const defaultTz = tz || 'UTC';
    
    return this.pdfParseService.parseScheduleFromUpload(
      uploadId,
      projectId,
      defaultScheduleDate,
      defaultTz
    );
  }
}