import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class ReminderNotificationsService {
  private readonly logger = new Logger(ReminderNotificationsService.name);
  private openai: OpenAI;

  constructor(
    private readonly db: DatabaseService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('ai.openaiApiKey'),
    });
  }

  // Check for reminders every minute - handles both early and follow-up notifications
  @Cron(CronExpression.EVERY_MINUTE)
  async checkReminders() {
    this.logger.debug('Checking for reminder notifications...');
    
    const now = new Date();

    try {
      // 1. Check for EARLY notifications (before due time)
      await this.checkEarlyNotifications(now);
      
      // 2. Check for FOLLOW-UP notifications (after due time)
      await this.checkFollowUpNotifications(now);
    } catch (error) {
      this.logger.error('Error checking reminders:', error);
    }
  }

  /**
   * Check for reminders that need early notification (before due time)
   */
  private async checkEarlyNotifications(now: Date) {
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Find pending reminders due within the next hour
    const upcomingReminders = await this.db.reminder.findMany({
      where: {
        dueAt: {
          gte: now,
          lte: oneHourFromNow,
        },
        status: 'PENDING',
      },
      include: {
        project: true,
      },
    });

    for (const reminder of upcomingReminders) {
      const hasEarlyNotification = await this.hasNotificationType(reminder.id, 'early');
      if (!hasEarlyNotification && this.shouldSendEarlyNotification(reminder, now)) {
        await this.sendEarlyNotification(reminder);
      }
    }
  }

  /**
   * Check for reminders that need follow-up notification (5-10 min after due time)
   */
  private async checkFollowUpNotifications(now: Date) {
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Find PENDING reminders that were due 5-10 minutes ago (not completed yet)
    const overdueReminders = await this.db.reminder.findMany({
      where: {
        dueAt: {
          gte: tenMinutesAgo,
          lte: fiveMinutesAgo,
        },
        status: 'PENDING', // Only if not completed
      },
      include: {
        project: true,
      },
    });

    for (const reminder of overdueReminders) {
      const hasFollowUp = await this.hasNotificationType(reminder.id, 'followup');
      if (!hasFollowUp) {
        await this.sendFollowUpNotification(reminder);
      }
    }
  }

  /**
   * Determine if we should send an early notification for a reminder.
   */
  private shouldSendEarlyNotification(reminder: any, now: Date): boolean {
    const dueAt = new Date(reminder.dueAt);
    const timeUntilDue = dueAt.getTime() - now.getTime();
    const oneHour = 60 * 60 * 1000;
    
    // If already past due, don't send early notification
    if (timeUntilDue <= 0) {
      return false;
    }
    
    // If more than 1 hour away, send at the 1-hour mark
    if (timeUntilDue >= oneHour) {
      const isAtOneHourMark = timeUntilDue <= oneHour + 60 * 1000;
      return isAtOneHourMark;
    }
    
    // Less than 1 hour away - calculate midpoint
    const createdAt = reminder.createdAt ? new Date(reminder.createdAt) : now;
    const effectiveCreatedAt = (now.getTime() - createdAt.getTime() < 2 * 60 * 1000) 
      ? now 
      : createdAt;
    
    const remainingTime = dueAt.getTime() - effectiveCreatedAt.getTime();
    const midpointTime = effectiveCreatedAt.getTime() + (remainingTime / 2);
    
    return now.getTime() >= midpointTime - 30 * 1000;
  }

  /**
   * Send early notification (before task is due)
   */
  private async sendEarlyNotification(reminder: any) {
    try {
      const eventTitle = reminder.title.replace('Reminder: ', '');
      const projectName = reminder.project?.name;
      
      const now = new Date();
      const dueAt = new Date(reminder.dueAt);
      const minutesUntilDue = Math.max(0, Math.round((dueAt.getTime() - now.getTime()) / (60 * 1000)));

      const { title, body } = await this.generateCheckinMessage(eventTitle, projectName, 'early', minutesUntilDue);
      
      await this.notificationsService.sendNotification(reminder.userId, 'PUSH', {
        title,
        body,
        data: {
          type: 'reminder_checkin',
          notificationType: 'early',
          reminderId: reminder.id,
          eventTitle,
          dueAt: reminder.dueAt.toISOString(),
          projectId: reminder.projectId,
          action: 'checkin',
          minutesUntilDue: String(minutesUntilDue),
        },
      });

      // Record the notification
      await this.db.notification.create({
        data: {
          userId: reminder.userId,
          title,
          body,
          sentAt: new Date(),
          metaJson: {
            type: 'reminder_checkin',
            notificationType: 'early',
            reminderId: reminder.id,
            eventTitle,
            dueAt: reminder.dueAt.toISOString(),
            minutesUntilDue,
          },
        },
      });

      this.logger.log(`Sent EARLY notification for: "${reminder.title}" (due in ${minutesUntilDue} min) to user ${reminder.userId}`);
    } catch (error) {
      this.logger.error(`Failed to send early notification for ${reminder.id}:`, error);
    }
  }

  /**
   * Send follow-up notification (after task was due, asking if it's done)
   */
  private async sendFollowUpNotification(reminder: any) {
    try {
      const eventTitle = reminder.title.replace('Reminder: ', '');
      const projectName = reminder.project?.name;
      
      const now = new Date();
      const dueAt = new Date(reminder.dueAt);
      const minutesSinceDue = Math.round((now.getTime() - dueAt.getTime()) / (60 * 1000));

      const { title, body } = await this.generateCheckinMessage(eventTitle, projectName, 'followup', minutesSinceDue);
      
      await this.notificationsService.sendNotification(reminder.userId, 'PUSH', {
        title,
        body,
        data: {
          type: 'reminder_followup',
          notificationType: 'followup',
          reminderId: reminder.id,
          eventTitle,
          dueAt: reminder.dueAt.toISOString(),
          projectId: reminder.projectId,
          action: 'checkin',
          minutesSinceDue: String(minutesSinceDue),
        },
      });

      // Record the notification
      await this.db.notification.create({
        data: {
          userId: reminder.userId,
          title,
          body,
          sentAt: new Date(),
          metaJson: {
            type: 'reminder_followup',
            notificationType: 'followup',
            reminderId: reminder.id,
            eventTitle,
            dueAt: reminder.dueAt.toISOString(),
            minutesSinceDue,
          },
        },
      });

      this.logger.log(`Sent FOLLOW-UP notification for: "${reminder.title}" (was due ${minutesSinceDue} min ago) to user ${reminder.userId}`);
    } catch (error) {
      this.logger.error(`Failed to send follow-up notification for ${reminder.id}:`, error);
    }
  }

  /**
   * Generate GPT check-in message based on notification type
   */
  private async generateCheckinMessage(
    taskTitle: string, 
    projectName: string | undefined, 
    type: 'early' | 'followup',
    minutes: number
  ): Promise<{ title: string; body: string }> {
    try {
      const timeContext = type === 'early'
        ? `This is an early heads-up - the task "${taskTitle}" is due in about ${minutes} minutes.`
        : `The task "${taskTitle}" was due ${minutes} minutes ago. This is a follow-up to check if it's done.`;
      
      const prompt = `You are JobMate, a friendly Australian assistant. Generate a short, casual ${type === 'early' ? 'reminder' : 'follow-up'} notification.

Task: "${taskTitle}"
${projectName ? `Project: "${projectName}"` : ''}
${timeContext}

Rules:
- Start with "Hey mate!" or "G'day Mate,"
- MUST include the task title "${taskTitle}" in the notification
- Keep title under 100 characters
${type === 'early' 
  ? `- Mention it's coming up soon (in ~${minutes} min)
- Be encouraging about the upcoming task`
  : `- Ask if the task is done or how it went
- Be friendly, not pushy - they might still be working on it
- Offer to mark it as complete if they're done`}
- Use Australian slang occasionally
- The body should mention the task name

Return JSON format:
{"title": "...", "body": "..."}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 150,
      });

      const content = completion.choices[0].message.content || '';
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || this.getDefaultTitle(taskTitle, type, minutes),
          body: parsed.body || this.getDefaultBody(taskTitle, type, minutes),
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to generate GPT message: ${error.message}`);
    }

    return {
      title: this.getDefaultTitle(taskTitle, type, minutes),
      body: this.getDefaultBody(taskTitle, type, minutes),
    };
  }

  private getDefaultTitle(taskTitle: string, type: 'early' | 'followup', minutes: number): string {
    if (type === 'early') {
      const titles = [
        `Hey mate! "${taskTitle}" in ${minutes} min`,
        `G'day! "${taskTitle}" coming up`,
        `Hey mate! Heads up - "${taskTitle}"`,
      ];
      return titles[Math.floor(Math.random() * titles.length)];
    } else {
      const titles = [
        `Hey mate! How'd "${taskTitle}" go?`,
        `G'day! Did you finish "${taskTitle}"?`,
        `Hey mate! "${taskTitle}" - all done?`,
      ];
      return titles[Math.floor(Math.random() * titles.length)];
    }
  }

  private getDefaultBody(taskTitle: string, type: 'early' | 'followup', minutes: number): string {
    if (type === 'early') {
      const bodies = [
        `"${taskTitle}" is coming up in ${minutes} minutes. Ready to go?`,
        `Just a heads up - "${taskTitle}" is due soon!`,
        `"${taskTitle}" is almost here. You've got this!`,
      ];
      return bodies[Math.floor(Math.random() * bodies.length)];
    } else {
      const bodies = [
        `"${taskTitle}" was due a few minutes ago. How'd it go? Let me know if you're done!`,
        `Checking in on "${taskTitle}" - is it finished? Just reply and I'll mark it complete.`,
        `Hey! "${taskTitle}" was scheduled earlier. All wrapped up?`,
      ];
      return bodies[Math.floor(Math.random() * bodies.length)];
    }
  }

  /**
   * Check if a specific notification type has been sent for a reminder
   */
  private async hasNotificationType(reminderId: string, type: 'early' | 'followup'): Promise<boolean> {
    const notification = await this.db.notification.findFirst({
      where: {
        metaJson: {
          path: ['reminderId'],
          equals: reminderId,
        },
        AND: {
          metaJson: {
            path: ['notificationType'],
            equals: type,
          },
        },
      },
    });

    return !!notification;
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

    await this.sendEarlyNotification(reminder);
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
}
