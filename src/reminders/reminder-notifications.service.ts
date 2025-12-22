import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReminderNotificationsService {
  private readonly logger = new Logger(ReminderNotificationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Check for due reminders every minute
  @Cron(CronExpression.EVERY_MINUTE)
  async checkDueReminders() {
    this.logger.debug('Checking for due reminders...');
    
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

    try {
      // Find reminders that are due (between 1 minute ago and now)
      const dueReminders = await this.db.reminder.findMany({
        where: {
          dueAt: {
            gte: oneMinuteAgo,
            lte: now,
          },
          status: 'PENDING', // Only send notifications for pending reminders
        },
        include: {
          project: true,
        },
      });

      // Filter out reminders that have already been notified
      const unnotifiedReminders = [];
      for (const reminder of dueReminders) {
        const hasNotification = await this.hasBeenNotified(reminder.id);
        if (!hasNotification) {
          unnotifiedReminders.push(reminder);
        }
      }

      this.logger.log(`Found ${unnotifiedReminders.length} unnotified due reminders out of ${dueReminders.length} total`);

      for (const reminder of unnotifiedReminders) {
        await this.sendReminderNotification(reminder);
      }
    } catch (error) {
      this.logger.error('Error checking due reminders:', error);
    }
  }

  private async sendReminderNotification(reminder: any) {
    try {
      const dueTime = reminder.dueAt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      // Determine if this is a long or short event based on title
      const isLongEvent = reminder.title.includes('Work on') || 
                         reminder.title.includes('coding') || 
                         reminder.title.includes('development');
      
      const greeting = isLongEvent ? "G'day Mate," : "Hey mate!";
      const eventTitle = reminder.title.replace('Reminder: ', '');
      
      const title = `${greeting} "${eventTitle}" starts at ${dueTime} — time to roll.`;
      
      await this.notificationsService.sendNotification(reminder.userId, 'PUSH', {
        title,
        body: 'Your scheduled event is starting soon',
        data: {
          type: 'reminder_due',
          reminderId: reminder.id,
          eventTitle,
          dueAt: reminder.dueAt.toISOString(),
          projectId: reminder.projectId,
        },
      });

      // Mark reminder as notified by creating a notification record
      await this.db.notification.create({
        data: {
          userId: reminder.userId,
          title,
          body: 'Your scheduled event is starting soon',
          sentAt: new Date(),
          metaJson: {
            type: 'reminder_due',
            reminderId: reminder.id,
            eventTitle,
            dueAt: reminder.dueAt.toISOString(),
          },
        },
      });

      this.logger.log(`Sent reminder notification for: ${reminder.title} to user ${reminder.userId}`);
    } catch (error) {
      this.logger.error(`Failed to send reminder notification for ${reminder.id}:`, error);
    }
  }

  // Manual method to send immediate reminder notifications (for testing)
  async sendImmediateReminder(userId: string, reminderId: string) {
    const reminder = await this.db.reminder.findFirst({
      where: {
        id: reminderId,
        userId,
      },
      include: {
        project: true,
      },
    });

    if (!reminder) {
      throw new Error('Reminder not found or access denied');
    }

    await this.sendReminderNotification(reminder);
    return { success: true, message: 'Reminder notification sent' };
  }

  // Get upcoming reminders for a user (next 24 hours)
  async getUpcomingReminders(userId: string) {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return this.db.reminder.findMany({
      where: {
        userId,
        dueAt: {
          gte: now,
          lte: tomorrow,
        },
        status: 'PENDING',
      },
      orderBy: {
        dueAt: 'asc',
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // Check if a reminder has already been notified
  private async hasBeenNotified(reminderId: string): Promise<boolean> {
    const notification = await this.db.notification.findFirst({
      where: {
        metaJson: {
          path: ['reminderId'],
          equals: reminderId,
        },
      },
    });

    return !!notification;
  }
}