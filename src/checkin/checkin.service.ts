import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UpdateCheckinPreferencesDto,
  CheckinResponseDto,
  CheckinFrequency,
  CheckinPreferencesResponseDto,
} from './dto/checkin.dto';

interface CheckinPrefs {
  enabled: boolean;
  time: string;
  timezone: string;
  frequency: CheckinFrequency;
  customDays?: number[];
  lastCheckinAt?: string;
  nextScheduledAt?: string;
}

const DEFAULT_PREFS: CheckinPrefs = {
  enabled: true,
  time: '09:00',
  timezone: 'Australia/Sydney',
  frequency: CheckinFrequency.DAILY,
};

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

@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    @InjectQueue('daily-checkin') private checkinQueue: Queue,
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  async getPreferences(userId: string): Promise<CheckinPreferencesResponseDto> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const notifPrefs = (user.notifPrefs as any) || {};
    const checkinPrefs: CheckinPrefs = {
      ...DEFAULT_PREFS,
      ...notifPrefs.checkin,
    };

    return {
      enabled: checkinPrefs.enabled,
      time: checkinPrefs.time,
      timezone: checkinPrefs.timezone,
      frequency: checkinPrefs.frequency,
      customDays: checkinPrefs.customDays,
      nextScheduledAt: checkinPrefs.nextScheduledAt
        ? new Date(checkinPrefs.nextScheduledAt)
        : this.calculateNextCheckin(checkinPrefs),
    };
  }

  async updatePreferences(
    userId: string,
    dto: UpdateCheckinPreferencesDto,
  ): Promise<CheckinPreferencesResponseDto> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const currentPrefs = (user.notifPrefs as any) || {};
    const currentCheckin: CheckinPrefs = {
      ...DEFAULT_PREFS,
      ...currentPrefs.checkin,
    };

    const updatedCheckin: CheckinPrefs = {
      ...currentCheckin,
      ...dto,
    };

    // Calculate next scheduled time
    const nextScheduledAt = this.calculateNextCheckin(updatedCheckin);
    updatedCheckin.nextScheduledAt = nextScheduledAt?.toISOString();

    await this.db.user.update({
      where: { id: userId },
      data: {
        notifPrefs: {
          ...currentPrefs,
          checkin: updatedCheckin,
        },
      },
    });

    // Reschedule the check-in job
    if (updatedCheckin.enabled) {
      await this.scheduleCheckin(userId, updatedCheckin);
    } else {
      await this.cancelCheckin(userId);
    }

    this.logger.log(`Updated check-in preferences for user ${userId}`);

    return {
      enabled: updatedCheckin.enabled,
      time: updatedCheckin.time,
      timezone: updatedCheckin.timezone,
      frequency: updatedCheckin.frequency,
      customDays: updatedCheckin.customDays,
      nextScheduledAt,
    };
  }

  async scheduleCheckin(userId: string, prefs?: CheckinPrefs): Promise<void> {
    // Cancel any existing jobs for this user
    await this.cancelCheckin(userId);

    if (!prefs) {
      const user = await this.db.user.findUnique({ where: { id: userId } });
      if (!user) return;
      const notifPrefs = (user.notifPrefs as any) || {};
      prefs = { ...DEFAULT_PREFS, ...notifPrefs.checkin };
    }

    if (!prefs.enabled) return;

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

    this.logger.log(
      `Scheduled check-in for user ${userId} at ${nextCheckin.toISOString()}`,
    );
  }

  async cancelCheckin(userId: string): Promise<void> {
    try {
      const job = await this.checkinQueue.getJob(`checkin-${userId}`);
      if (job) {
        await job.remove();
        this.logger.log(`Cancelled check-in for user ${userId}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to cancel check-in for user ${userId}:`, error);
    }
  }

  async sendCheckinPrompt(userId: string): Promise<void> {
    // Pick a random prompt
    const prompt = CHECKIN_PROMPTS[Math.floor(Math.random() * CHECKIN_PROMPTS.length)];

    await this.notifications.sendNotification(userId, 'PUSH', {
      title: prompt.title,
      body: prompt.body,
      data: {
        type: 'daily_checkin',
        action: 'open_chat',
        timestamp: new Date().toISOString(),
      },
    });

    // Update last check-in time
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (user) {
      const notifPrefs = (user.notifPrefs as any) || {};
      const checkinPrefs = notifPrefs.checkin || DEFAULT_PREFS;

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
    }

    this.logger.log(`Sent check-in prompt to user ${userId}`);
  }

  async processCheckinResponse(
    userId: string,
    dto: CheckinResponseDto,
  ): Promise<{ noteId?: string; message: string }> {
    // Create a note from the check-in response
    let projectId = dto.projectId;

    // If no project specified, use the user's first project
    if (!projectId) {
      const project = await this.db.project.findFirst({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
      });
      projectId = project?.id;
    }

    if (!projectId) {
      // Create a default project if none exists
      const newProject = await this.db.project.create({
        data: {
          name: 'My Project',
          description: 'Default project',
          ownerId: userId,
        },
      });
      projectId = newProject.id;
    }

    // Create a daily log note from the response
    const note = await this.db.note.create({
      data: {
        projectId,
        userId,
        content: `## Daily Check-in - ${new Date().toLocaleDateString()}\n\n${dto.response}`,
        kind: 'TEXT',
        date: new Date(),
        tags: ['daily-checkin', 'log'],
      },
    });

    this.logger.log(`Created check-in note ${note.id} for user ${userId}`);

    return {
      noteId: note.id,
      message: "G'day! I've logged your update. Anything else you need help with?",
    };
  }

  private calculateNextCheckin(prefs: CheckinPrefs): Date | null {
    if (!prefs.enabled) return null;

    const [hours, minutes] = prefs.time.split(':').map(Number);
    const now = new Date();

    // Create date in user's timezone
    const targetDate = new Date(
      now.toLocaleString('en-US', { timeZone: prefs.timezone }),
    );
    targetDate.setHours(hours, minutes, 0, 0);

    // If time has passed today, move to next valid day
    if (targetDate <= now) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    // Adjust for frequency
    if (prefs.frequency === CheckinFrequency.WEEKDAYS) {
      while (targetDate.getDay() === 0 || targetDate.getDay() === 6) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    } else if (prefs.frequency === CheckinFrequency.CUSTOM && prefs.customDays) {
      while (!prefs.customDays.includes(targetDate.getDay())) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    }

    return targetDate;
  }

  async getCheckinHistory(userId: string, limit = 10) {
    return this.db.note.findMany({
      where: {
        userId,
        tags: { has: 'daily-checkin' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async scheduleAllUserCheckins(): Promise<number> {
    const users = await this.db.user.findMany({
      where: {
        notifPrefs: {
          path: ['checkin', 'enabled'],
          equals: true,
        },
      },
    });

    let scheduled = 0;
    for (const user of users) {
      try {
        await this.scheduleCheckin(user.id);
        scheduled++;
      } catch (error) {
        this.logger.error(`Failed to schedule check-in for user ${user.id}:`, error);
      }
    }

    this.logger.log(`Scheduled check-ins for ${scheduled} users`);
    return scheduled;
  }
}
