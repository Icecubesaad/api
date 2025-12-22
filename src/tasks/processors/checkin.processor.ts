import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationsService } from '../../notifications/notifications.service';

@Processor('daily-checkin')
export class CheckinProcessor {
  private readonly logger = new Logger(CheckinProcessor.name);

  constructor(private readonly notifications: NotificationsService) {}

  @Process('daily-checkin')
  async handleDailyCheckin(job: Job<{ userId: string }>) {
    const { userId } = job.data;
    
    try {
      this.logger.log(`Sending daily check-in for user ${userId}`);
      
      await this.notifications.sendNotification(userId, 'PUSH', {
        title: "G'day Mate! How's your day going?",
        body: "Just checking in to see how you're doing. Need any help organizing your tasks or creating reminders?",
        data: { type: 'daily_checkin' }
      });
      
      this.logger.log(`Daily check-in sent for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send daily check-in for user ${userId}:`, error);
      throw error;
    }
  }
}
