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
    // Try to find user by database ID first, then by Firebase UID
    let user = await this.db.user.findUnique({
      where: { id: userIdOrFirebaseUid },
    });
    
    if (!user) {
      // Try by Firebase UID
      user = await this.db.user.findUnique({
        where: { firebaseUid: userIdOrFirebaseUid },
      });
    }
    
    if (!user) {
      this.logger.error(`User not found for ID/UID: ${userIdOrFirebaseUid}`);
      throw new NotFoundException('User not found');
    }
    
    const userId = user.id;
    
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
      await this.db.event.deleteMany({ where: { projectId: dto.projectId } });
      await this.db.reminder.deleteMany({ where: { projectId: dto.projectId, userId } });
    }

    const createdEvents = [];
    const createdReminders = [];
    const skippedDuplicates = [];

    for (const block of dto.blocks) {
      try {
        // Check for duplicates by startsAt + title (skip if forceReimport already cleared)
        if (!dto.forceReimport) {
          const duplicateCheck = await this.checkForDuplicate(importHash, block);
          if (duplicateCheck) {
            this.logger.log(`Skipping duplicate event: ${block.title} at ${block.startsAt}`);
            skippedDuplicates.push({ title: block.title, startsAt: block.startsAt });
            continue;
          }
        }

        // Try to create calendar event, and ALWAYS create local event record
        let event = null;
        let providerEventId: string | undefined;
        
        // Try external calendar first (may fail if not connected)
        try {
          const calendarEvent = await this.calendarService.createEvent(userId, {
            summary: block.title,
            description: block.description,
            start: { dateTime: block.startsAt },
            end: { dateTime: block.endsAt },
          });
          providerEventId = calendarEvent.id;
          this.logger.log(`Created Google Calendar event: ${providerEventId}`);
        } catch (calendarError) {
          this.logger.warn(`Google Calendar not connected, creating local event only for: ${block.title}`);
        }

        // ALWAYS create local event record in database
        try {
          event = await this.db.event.create({
            data: {
              projectId: dto.projectId,
              provider: providerEventId ? 'GOOGLE' : 'LOCAL' as any,
              providerEventId: providerEventId || `local-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
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
          createdEvents.push(event);
          this.logger.log(`Created local event: ${event.id} - ${block.title}`);
        } catch (eventError) {
          this.logger.error(`Failed to create local event for ${block.title}:`, eventError);
        }

        // Always create reminder
        const reminder = await this.createReminder(userId, dto.projectId, block, event?.id);
        createdReminders.push(reminder);

        // Send confirmation notification
        await this.sendEventCreatedNotification(userId, block);

        // Schedule reminder notification
        await this.scheduleReminderNotification(userId, block, reminder.id);

      } catch (error) {
        this.logger.error(`Failed to create event for ${block.title}:`, error);
        // Continue with other blocks
      }
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
    
    return this.remindersService.create(userId, {
      title: `Reminder: ${block.title}`,
      dueAt: dueAt.toISOString(),
      projectId,
    });
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