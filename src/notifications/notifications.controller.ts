import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { User } from '../auth/decorators/user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class TestNotificationDto {
  @ApiProperty({ description: 'Notification title (must start with "Hey mate!" or "G\'day Mate,")' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Notification body' })
  @IsString()
  body: string;

  @ApiPropertyOptional({ description: 'Notification channel', enum: ['PUSH', 'EMAIL', 'SMS'], default: 'PUSH' })
  @IsOptional()
  @IsEnum(['PUSH', 'EMAIL', 'SMS'])
  channel?: 'PUSH' | 'EMAIL' | 'SMS';
}

export class TestGreetingDto {
  @ApiProperty({ description: 'Title to test for greeting enforcement' })
  @IsString()
  title: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) { }

  @Get('firebase-config')
  @Public()
  @ApiOperation({
    summary: 'Get Firebase client configuration (public)',
    description: 'Returns Firebase config needed for client-side initialization including VAPID key for web push'
  })
  @ApiResponse({ status: 200, description: 'Firebase configuration returned' })
  async getFirebaseConfig() {
    // Return public Firebase config for client-side use
    // These are safe to expose - they're meant to be public
    return {
      apiKey: this.configService.get<string>('FIREBASE_API_KEY') || 'AIzaSyBcS21HPdSxotT7an5HcOsPs8vKzCFahqI',
      authDomain: `${this.configService.get<string>('FIREBASE_PROJECT_ID') || 'jobmate-122bd'}.firebaseapp.com`,
      projectId: this.configService.get<string>('FIREBASE_PROJECT_ID') || 'jobmate-122bd',
      storageBucket: `${this.configService.get<string>('FIREBASE_PROJECT_ID') || 'jobmate-122bd'}.firebasestorage.app`,
      messagingSenderId: this.configService.get<string>('FCM_SERVER_KEY') || '119527345940',
      appId: this.configService.get<string>('FIREBASE_APP_ID') || '1:119527345940:web:7d07c3f709bf7e068e7c01',
      // VAPID key is required for web push notifications
      vapidKey: this.configService.get<string>('FIREBASE_VAPID_KEY') || null,
    };
  }

  @Post('test')
  @ApiOperation({
    summary: 'Test notification with greeting enforcement (dev only)',
    description: 'Validates that notification titles are properly prefixed with Australian greetings'
  })
  @ApiResponse({ status: 200, description: 'Test notification sent' })
  async testNotification(
    @User() u: any,
    @Body() dto: TestNotificationDto,
  ) {
    const channel = dto.channel || 'PUSH';

    await this.notificationsService.sendNotification(u.dbUser.id, channel as any, {
      title: dto.title,
      body: dto.body,
      data: { test: true, timestamp: new Date().toISOString() },
    });

    // Return the enforced title to show the transformation
    const enforcedTitle = this.notificationsService.testGreetingEnforcement(dto.title);

    return {
      success: true,
      originalTitle: dto.title,
      enforcedTitle,
      channel,
      message: 'Test notification sent successfully',
    };
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent notifications for the user' })
  @ApiResponse({ status: 200, description: 'Recent notifications retrieved' })
  async getRecentNotifications(@User() user: any) {
    // Get recent notifications from database
    const notifications = await this.notificationsService.getRecentNotifications(user.dbUser.id);
    return {
      notifications,
      count: notifications.length,
      message: 'Recent notifications retrieved successfully',
    };
  }

  @Post('demo/schedule')
  @ApiOperation({
    summary: 'Demo schedule notifications',
    description: 'Shows examples of all notification types that users receive for schedule events'
  })
  @ApiResponse({ status: 200, description: 'Demo notifications sent' })
  async demoScheduleNotifications(@User() user: any) {
    const userId = user.dbUser.id;
    const demoNotifications = [];

    // 1. Event Created Notification
    const eventCreatedTitle = `Hey mate! "Daily Stand-up Meeting" is on your schedule at 9:30 AM.`;
    await this.notificationsService.sendNotification(userId, 'PUSH', {
      title: eventCreatedTitle,
      body: 'Team sync meeting - Tap to view details',
      data: { type: 'event_created', eventTitle: 'Daily Stand-up Meeting', startsAt: '2025-09-26T09:30:00Z' },
    });
    demoNotifications.push({ type: 'Event Created', title: eventCreatedTitle });

    // 2. Reminder Due (Long Event - 15min before)
    const longReminderTitle = `G'day Mate, "Work on Feature Development" starts at 10:00 AM — time to roll.`;
    await this.notificationsService.sendNotification(userId, 'PUSH', {
      title: longReminderTitle,
      body: 'Your 2-hour coding session is about to begin',
      data: { type: 'reminder_due', eventTitle: 'Work on Feature Development', startsAt: '2025-09-26T10:00:00Z' },
    });
    demoNotifications.push({ type: 'Long Event Reminder (15min before)', title: longReminderTitle });

    // 3. Reminder Due (Short Event - 5min before)
    const shortReminderTitle = `Hey mate! "Short Break" starts at 3:00 PM — time to roll.`;
    await this.notificationsService.sendNotification(userId, 'PUSH', {
      title: shortReminderTitle,
      body: 'Take a quick 15-minute break',
      data: { type: 'reminder_due', eventTitle: 'Short Break', startsAt: '2025-09-26T15:00:00Z' },
    });
    demoNotifications.push({ type: 'Short Event Reminder (5min before)', title: shortReminderTitle });

    // 4. Schedule Import Success
    const importSuccessTitle = `G'day Mate, your schedule has been imported successfully!`;
    await this.notificationsService.sendNotification(userId, 'PUSH', {
      title: importSuccessTitle,
      body: 'Created 9 reminders and 9 calendar events from your PDF',
      data: { type: 'schedule_imported', eventsCreated: 9, remindersCreated: 9 },
    });
    demoNotifications.push({ type: 'Schedule Import Success', title: importSuccessTitle });

    // 5. Calendar Connection Reminder
    const calendarReminderTitle = `Hey mate! Connect your calendar to sync events automatically.`;
    await this.notificationsService.sendNotification(userId, 'PUSH', {
      title: calendarReminderTitle,
      body: 'Your events are saved locally. Connect Google Calendar for full sync.',
      data: { type: 'calendar_connection_reminder' },
    });
    demoNotifications.push({ type: 'Calendar Connection Reminder', title: calendarReminderTitle });

    return {
      success: true,
      message: 'Demo notifications sent! Check your notification history.',
      demoNotifications,
      totalSent: demoNotifications.length,
      note: 'All notifications follow the mandatory Australian greeting format: "Hey mate!" or "G\'day Mate,"'
    };
  }

  @Post('demo/test-greeting')
  @Public()
  @ApiOperation({
    summary: 'Test greeting enforcement',
    description: 'Shows how the system enforces Australian greetings on all notifications'
  })
  @ApiResponse({ status: 200, description: 'Greeting validation result' })
  async testGreetingEnforcement(@Body() dto: TestGreetingDto) {
    try {
      const enforcedTitle = this.notificationsService.testGreetingEnforcement(dto.title);
      return {
        success: true,
        originalTitle: dto.title,
        enforcedTitle,
        message: 'Title passed greeting validation'
      };
    } catch (error) {
      return {
        success: false,
        originalTitle: dto.title,
        error: error.message,
        message: 'Title failed greeting validation',
        requiredFormat: 'Must start with "Hey mate!" or "G\'day Mate," followed by a space'
      };
    }
  }

  @Get('demo/examples')
  @Public()
  @ApiOperation({
    summary: 'Get notification examples (no auth required)',
    description: 'Shows examples of all notification types without requiring authentication'
  })
  async getNotificationExamples() {
    const demoNotifications = [
      {
        type: 'Event Created',
        title: 'Hey mate! "Daily Stand-up Meeting" is on your schedule at 9:30 AM.',
        body: 'Team sync meeting - Tap to view details',
        time: '2 minutes ago',
        priority: 'medium',
        data: { type: 'event_created', eventTitle: 'Daily Stand-up Meeting', startsAt: '2025-09-26T09:30:00Z' }
      },
      {
        type: 'Long Event Reminder (15min before)',
        title: 'G\'day Mate, "Work on Feature Development" starts at 10:00 AM — time to roll.',
        body: 'Your 2-hour coding session is about to begin',
        time: '15 minutes ago',
        priority: 'high',
        data: { type: 'reminder_due', eventTitle: 'Work on Feature Development', startsAt: '2025-09-26T10:00:00Z' }
      },
      {
        type: 'Short Event Reminder (5min before)',
        title: 'Hey mate! "Short Break" starts at 3:00 PM — time to roll.',
        body: 'Take a quick 15-minute break',
        time: '1 hour ago',
        priority: 'medium',
        data: { type: 'reminder_due', eventTitle: 'Short Break', startsAt: '2025-09-26T15:00:00Z' }
      },
      {
        type: 'Schedule Import Success',
        title: 'G\'day Mate, your schedule has been imported successfully!',
        body: 'Created 9 reminders and 9 calendar events from your PDF',
        time: '2 hours ago',
        priority: 'low',
        data: { type: 'schedule_imported', eventsCreated: 9, remindersCreated: 9 }
      },
      {
        type: 'Calendar Connection Reminder',
        title: 'Hey mate! Connect your calendar to sync events automatically.',
        body: 'Your events are saved locally. Connect Google Calendar for full sync.',
        time: '1 day ago',
        priority: 'low',
        data: { type: 'calendar_connection_reminder' }
      }
    ];

    return {
      success: true,
      message: 'Demo notification examples (these show what users would receive)',
      notifications: demoNotifications,
      totalExamples: demoNotifications.length,
      greetingEnforcement: {
        rule: 'All notifications must start with "Hey mate!" or "G\'day Mate," followed by a space',
        examples: {
          valid: ['Hey mate! Your task is ready', 'G\'day Mate, your schedule is imported'],
          invalid: ['Your task is ready', 'Hello! Your task is ready', 'hey mate your task']
        }
      },
      reminderTiming: {
        longEvents: '15 minutes before start time (≥30 minute duration)',
        shortEvents: '5 minutes before start time (<30 minute duration)'
      }
    };
  }
}