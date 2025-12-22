import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectQueue('pdf-processing') private pdfQueue: Queue,
    @InjectQueue('reminder-notifications') private reminderQueue: Queue,
    @InjectQueue('daily-checkin') private checkinQueue: Queue,
  ) {}

  async processPdf(uploadId: string) {
    await this.pdfQueue.add('process-pdf', { uploadId });
    this.logger.log(`Queued PDF processing for upload ${uploadId}`);
  }

  async scheduleReminderNotification(reminderId: string, dueAt: Date) {
    await this.reminderQueue.add(
      'send-reminder',
      { reminderId },
      { delay: dueAt.getTime() - Date.now() }
    );
    this.logger.log(`Scheduled reminder notification for ${reminderId} at ${dueAt}`);
  }

  async scheduleDailyCheckin(userId: string, time: string) {
    // Parse time (e.g., "09:00") and schedule for next occurrence
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);
    
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    await this.checkinQueue.add(
      'daily-checkin',
      { userId },
      { delay: scheduledTime.getTime() - Date.now() }
    );
    
    this.logger.log(`Scheduled daily check-in for user ${userId} at ${scheduledTime}`);
  }

  async cancelReminderNotification(reminderId: string) {
    const jobs = await this.reminderQueue.getJobs(['delayed', 'waiting']);
    const job = jobs.find(j => j.data.reminderId === reminderId);
    
    if (job) {
      await job.remove();
      this.logger.log(`Cancelled reminder notification for ${reminderId}`);
    }
  }
}
