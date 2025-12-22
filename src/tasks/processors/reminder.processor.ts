import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DatabaseService } from '../../database/database.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Processor('reminder-notifications')
export class ReminderProcessor {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  @Process('send-reminder')
  async handleReminderNotification(job: Job<{ reminderId: string }>) {
    const { reminderId } = job.data;
    
    try {
      this.logger.log(`Sending reminder notification for ${reminderId}`);
      
      const reminder = await this.db.reminder.findUnique({
        where: { id: reminderId },
        include: { user: true },
      });

      if (!reminder) {
        this.logger.warn(`Reminder ${reminderId} not found`);
        return;
      }

      if (reminder.status !== 'PENDING') {
        this.logger.log(`Reminder ${reminderId} is no longer pending`);
        return;
      }

      // Send push notification
      await this.notifications.sendTemplatePush(
        reminder.userId,
        'reminderDue',
        { title: reminder.title }
      );

      this.logger.log(`Reminder notification sent for ${reminderId}`);
    } catch (error) {
      this.logger.error(`Failed to send reminder notification for ${reminderId}:`, error);
      throw error;
    }
  }
}
