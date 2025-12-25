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

  // Generate a GPT check-in message for the task
  private async generateCheckinMessage(taskTitle: string, projectName?: string): Promise<{ title: string; body: string }> {
    try {
      const prompt = `You are JobMate, a friendly Australian assistant. Generate a short, casual check-in notification for a task that's now due.

Task: "${taskTitle}"
${projectName ? `Project: "${projectName}"` : ''}

Rules:
- Start with "Hey mate!" or "G'day Mate,"
- MUST include the task title "${taskTitle}" in the notification
- Keep title under 100 characters
- Ask about progress or readiness for THIS SPECIFIC task
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
          title: parsed.title || this.getDefaultTitle(taskTitle),
          body: parsed.body || this.getDefaultBody(taskTitle),
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to generate GPT check-in message: ${error.message}`);
    }

    // Fallback to default messages
    return {
      title: this.getDefaultTitle(taskTitle),
      body: this.getDefaultBody(taskTitle),
    };
  }

  private getDefaultTitle(taskTitle: string): string {
    const greetings = [
      `Hey mate! Time for "${taskTitle}"`,
      `G'day Mate, "${taskTitle}" is due now`,
      `Hey mate! Ready for "${taskTitle}"?`,
      `G'day! "${taskTitle}" — let's go!`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  private getDefaultBody(taskTitle: string): string {
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

      // Generate GPT check-in message
      const { title, body } = await this.generateCheckinMessage(eventTitle, projectName);
      
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
          },
        },
      });

      this.logger.log(`Sent check-in notification for: ${reminder.title} to user ${reminder.userId}`);
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