import { Process, Processor } from '@nestjs/bull';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NotificationsService } from '../../notifications/notifications.service';
import { DatabaseService } from '../../database/database.service';

// Australian-style check-in prompts
const CHECKIN_PROMPTS = [
  {
    title: "G'day Mate! How's your day going?",
    body: "Just checking in to see how you're tracking. Any updates to log or tasks to tackle?",
  },
  {
    title: "Hey mate! Time for your daily check-in",
    body: "What's on the agenda today? I'm here to help you stay organized!",
  },
  {
    title: "G'day Mate, ready to smash it today?",
    body: "Let me know what you're working on and I'll help keep you on track.",
  },
  {
    title: "Hey mate! Quick check-in time",
    body: "How's everything going? Need help with any reminders or notes?",
  },
  {
    title: "G'day Mate! Let's get organized",
    body: "What's the plan for today? I can help you set up reminders and track your progress.",
  },
];

interface CheckinPrefs {
  enabled: boolean;
  time: string;
  timezone: string;
  frequency: string;
  customDays?: number[];
}

@Processor('daily-checkin')
export class CheckinProcessor {
  private readonly logger = new Logger(CheckinProcessor.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly db: DatabaseService,
    @InjectQueue('daily-checkin') private checkinQueue: Queue,
  ) {}

  @Process('daily-checkin')
  async handleDailyCheckin(job: Job<{ userId: string; prefs?: CheckinPrefs }>) {
    const { userId, prefs } = job.data;
    
    try {
      this.logger.log(`Processing daily check-in for user ${userId}`);
      
      // Pick a random prompt for variety
      const prompt = CHECKIN_PROMPTS[Math.floor(Math.random() * CHECKIN_PROMPTS.length)];
      
      await this.notifications.sendNotification(userId, 'PUSH', {
        title: prompt.title,
        body: prompt.body,
        data: { 
          type: 'daily_checkin',
          action: 'open_chat',
          timestamp: new Date().toISOString(),
        }
      });
      
      // Update last check-in time in user preferences
      await this.updateLastCheckinTime(userId);
      
      // Schedule the next check-in
      if (prefs?.enabled !== false) {
        await this.scheduleNextCheckin(userId, prefs);
      }
      
      this.logger.log(`Daily check-in sent for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send daily check-in for user ${userId}:`, error);
      throw error;
    }
  }

  private async updateLastCheckinTime(userId: string): Promise<void> {
    try {
      const user = await this.db.user.findUnique({ where: { id: userId } });
      if (!user) return;

      const notifPrefs = (user.notifPrefs as any) || {};
      const checkinPrefs = notifPrefs.checkin || {};

      await this.db.user.update({
        where: { id: userId },
        data: {
          notifPrefs: {
            ...notifPrefs,
            checkin: {
              ...checkinPrefs,
              lastCheckinAt: new Date().toISOString(),
            },
          },
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to update last check-in time for user ${userId}:`, error);
    }
  }

  private async scheduleNextCheckin(userId: string, prefs?: CheckinPrefs): Promise<void> {
    try {
      if (!prefs) {
        const user = await this.db.user.findUnique({ where: { id: userId } });
        if (!user) return;
        const notifPrefs = (user.notifPrefs as any) || {};
        prefs = notifPrefs.checkin;
      }

      if (!prefs?.enabled) return;

      const nextCheckin = this.calculateNextCheckin(prefs);
      if (!nextCheckin) return;

      const delay = nextCheckin.getTime() - Date.now();
      if (delay <= 0) return;

      await this.checkinQueue.add(
        'daily-checkin',
        { userId, prefs },
        {
          delay,
          jobId: `checkin-${userId}`,
          removeOnComplete: true,
        },
      );

      this.logger.log(`Scheduled next check-in for user ${userId} at ${nextCheckin.toISOString()}`);
    } catch (error) {
      this.logger.warn(`Failed to schedule next check-in for user ${userId}:`, error);
    }
  }

  private calculateNextCheckin(prefs: CheckinPrefs): Date | null {
    if (!prefs?.enabled) return null;

    const [hours, minutes] = (prefs.time || '09:00').split(':').map(Number);
    const now = new Date();

    // Create date in user's timezone
    const targetDate = new Date(
      now.toLocaleString('en-US', { timeZone: prefs.timezone || 'Australia/Sydney' }),
    );
    targetDate.setHours(hours, minutes, 0, 0);

    // Move to tomorrow since we just sent today's check-in
    targetDate.setDate(targetDate.getDate() + 1);

    // Adjust for frequency
    if (prefs.frequency === 'WEEKDAYS') {
      while (targetDate.getDay() === 0 || targetDate.getDay() === 6) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    } else if (prefs.frequency === 'CUSTOM' && prefs.customDays) {
      while (!prefs.customDays.includes(targetDate.getDay())) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    }

    return targetDate;
  }
}
