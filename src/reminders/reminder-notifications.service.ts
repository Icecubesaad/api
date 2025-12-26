import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
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

  // Check for due reminders every minute
  @Cron(CronExpression.EVERY_MINUTE)
  async checkDueReminders() {
    this.logger.debug('Checking for due reminders...');
    
    const now = new Date();
    
    // Look for reminders due in the next hour that haven't been notified yet
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    try {
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

      // Filter out reminders that have already been notified
      const unnotifiedReminders = [];
      for (const reminder of upcomingReminders) {
        const hasNotification = await this.hasBeenNotified(reminder.id);
        if (!hasNotification) {
          // Check if it's time to send the notification
          const shouldNotify = this.shouldSendEarlyNotification(reminder, now);
          if (shouldNotify) {
            unnotifiedReminders.push(reminder);
          }
        }
      }

      this.logger.log(`Found ${unnotifiedReminders.length} reminders ready for early notification out of ${upcomingReminders.length} upcoming`);

      for (const reminder of unnotifiedReminders) {
        await this.sendReminderNotification(reminder);
      }
    } catch (error) {
      this.logger.error('Error checking due reminders:', error);
    }
  }

  /**
   * Determine if we should send an early notification for a reminder.
   * 
   * Logic:
   * - If reminder is 1+ hour away: send notification 1 hour before
   * - If reminder is less than 1 hour away: send at the midpoint
   *   (e.g., reminder at 2:00 AM created at 1:40 AM → notify at 1:50 AM)
   * - If reminder is already past due: send immediately
   */
  private shouldSendEarlyNotification(reminder: any, now: Date): boolean {
    const dueAt = new Date(reminder.dueAt);
    const timeUntilDue = dueAt.getTime() - now.getTime();
    const oneHour = 60 * 60 * 1000;
    
    // If already past due, send immediately
    if (timeUntilDue <= 0) {
      this.logger.debug(`Reminder "${reminder.title}" is past due, sending immediately`);
      return true;
    }
    
    // If more than 1 hour away, only send if we're within the 1-hour window
    // (This means we send exactly 1 hour before)
    if (timeUntilDue >= oneHour) {
      // Check if we're at the 1-hour mark (within 1 minute tolerance)
      const isAtOneHourMark = timeUntilDue <= oneHour + 60 * 1000;
      if (isAtOneHourMark) {
        this.logger.debug(`Reminder "${reminder.title}" is 1 hour away, sending early notification`);
        return true;
      }
      return false;
    }
    
    // Less than 1 hour away - calculate midpoint
    // Get the reminder's creation time to calculate midpoint
    const createdAt = reminder.createdAt ? new Date(reminder.createdAt) : now;
    const totalDuration = dueAt.getTime() - createdAt.getTime();
    
    // If created very recently (within last 2 minutes), use current time as baseline
    const effectiveCreatedAt = (now.getTime() - createdAt.getTime() < 2 * 60 * 1000) 
      ? now 
      : createdAt;
    
    const remainingTime = dueAt.getTime() - effectiveCreatedAt.getTime();
    const midpointTime = effectiveCreatedAt.getTime() + (remainingTime / 2);
    
    // Send if we're at or past the midpoint (within 1 minute tolerance)
    const isAtOrPastMidpoint = now.getTime() >= midpointTime - 30 * 1000;
    
    if (isAtOrPastMidpoint) {
      const minutesUntilDue = Math.round(timeUntilDue / (60 * 1000));
      this.logger.debug(`Reminder "${reminder.title}" is ${minutesUntilDue} min away, at midpoint - sending early notification`);
      return true;
    }
    
    return false;
  }

  // Generate a GPT check-in message for the task
  private async generateCheckinMessage(taskTitle: string, projectName?: string, minutesUntilDue?: number): Promise<{ title: string; body: string }> {
    try {
      const timeContext = minutesUntilDue && minutesUntilDue > 0 
        ? `This is an early heads-up - the task is due in about ${minutesUntilDue} minutes.`
        : `The task is due now.`;
      
      const prompt = `You are JobMate, a friendly Australian assistant. Generate a short, casual check-in notification for a task.

Task: "${taskTitle}"
${projectName ? `Project: "${projectName}"` : ''}
${timeContext}

Rules:
- Start with "Hey mate!" or "G'day Mate,"
- MUST include the task title "${taskTitle}" in the notification
- Keep title under 100 characters
- ${minutesUntilDue && minutesUntilDue > 0 ? `Mention it's coming up soon (in ~${minutesUntilDue} min)` : 'Ask about progress or readiness'}
- Use Australian slang occasionally
- Be encouraging, not pushy
- The body should mention the task name and ask a follow-up question

Return JSON format:
{"title": "...", "body": "..."}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 150,
      });

      const content = completion.choices[0].message.content || '';
      
      // Try to parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || this.getDefaultTitle(taskTitle, minutesUntilDue),
          body: parsed.body || this.getDefaultBody(taskTitle, minutesUntilDue),
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to generate GPT check-in message: ${error.message}`);
    }

    // Fallback to default messages
    return {
      title: this.getDefaultTitle(taskTitle, minutesUntilDue),
      body: this.getDefaultBody(taskTitle, minutesUntilDue),
    };
  }

  private getDefaultTitle(taskTitle: string, minutesUntilDue?: number): string {
    if (minutesUntilDue && minutesUntilDue > 0) {
      const greetings = [
        `Hey mate! "${taskTitle}" in ${minutesUntilDue} min`,
        `G'day! "${taskTitle}" coming up soon`,
        `Hey mate! Heads up - "${taskTitle}"`,
        `G'day Mate, "${taskTitle}" is almost due`,
      ];
      return greetings[Math.floor(Math.random() * greetings.length)];
    }
    
    const greetings = [
      `Hey mate! Time for "${taskTitle}"`,
      `G'day Mate, "${taskTitle}" is due now`,
      `Hey mate! Ready for "${taskTitle}"?`,
      `G'day! "${taskTitle}" — let's go!`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  private getDefaultBody(taskTitle: string, minutesUntilDue?: number): string {
    if (minutesUntilDue && minutesUntilDue > 0) {
      const bodies = [
        `"${taskTitle}" is coming up in about ${minutesUntilDue} minutes. Ready to go?`,
        `Just a heads up - "${taskTitle}" is due soon. You've got this!`,
        `"${taskTitle}" is almost here. Need anything before you start?`,
        `Quick reminder: "${taskTitle}" in ${minutesUntilDue} min. All set?`,
      ];
      return bodies[Math.floor(Math.random() * bodies.length)];
    }
    
    const bodies = [
      `How's "${taskTitle}" going? Need any help?`,
      `Ready to smash out "${taskTitle}"?`,
      `Time to tackle "${taskTitle}" - you've got this!`,
      `"${taskTitle}" is up - let me know how you go!`,
      `Checking in on "${taskTitle}" - ready to roll?`,
    ];
    return bodies[Math.floor(Math.random() * bodies.length)];
  }

  private async sendReminderNotification(reminder: any) {
    try {
      const eventTitle = reminder.title.replace('Reminder: ', '');
      const projectName = reminder.project?.name;
      
      // Calculate minutes until due for the message
      const now = new Date();
      const dueAt = new Date(reminder.dueAt);
      const minutesUntilDue = Math.max(0, Math.round((dueAt.getTime() - now.getTime()) / (60 * 1000)));

      // Generate GPT check-in message with time context
      const { title, body } = await this.generateCheckinMessage(eventTitle, projectName, minutesUntilDue);
      
      await this.notificationsService.sendNotification(reminder.userId, 'PUSH', {
        title,
        body,
        data: {
          type: 'reminder_checkin',
          reminderId: reminder.id,
          eventTitle,
          dueAt: reminder.dueAt.toISOString(),
          projectId: reminder.projectId,
          action: 'checkin', // Frontend can use this to open check-in dialog
          minutesUntilDue: String(minutesUntilDue),
        },
      });

      // Mark reminder as notified by creating a notification record
      await this.db.notification.create({
        data: {
          userId: reminder.userId,
          title,
          body,
          sentAt: new Date(),
          metaJson: {
            type: 'reminder_checkin',
            reminderId: reminder.id,
            eventTitle,
            dueAt: reminder.dueAt.toISOString(),
            minutesUntilDue,
          },
        },
      });

      this.logger.log(`Sent early check-in notification for: ${reminder.title} (due in ${minutesUntilDue} min) to user ${reminder.userId}`);
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