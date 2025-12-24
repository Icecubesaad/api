import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RemindersService } from './reminders.service';
import { ReminderNotificationsService } from './reminder-notifications.service';
import { CreateReminderDto, UpdateReminderDto } from './dto/create-reminder.dto';
import { ReminderResponseDto } from './dto/reminder-response.dto';
import { User } from '../auth/decorators/user.decorator';

@ApiTags('reminders')
@ApiBearerAuth()
@Controller('reminders')
export class RemindersController {
  constructor(
    private readonly reminders: RemindersService,
    private readonly reminderNotifications: ReminderNotificationsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a reminder' })
  @ApiResponse({ status: 201, description: 'Reminder created', type: ReminderResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@User() u: any, @Body() dto: CreateReminderDto) {
    return this.reminders.create(u.dbUser.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List reminders' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Filter by project ID (CUID)' })
  @ApiResponse({ status: 200, description: 'Reminders list', type: [ReminderResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(@User() u: any, @Query('projectId') projectId?: string) {
    return this.reminders.list(u.dbUser.id, projectId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update reminder' })
  @ApiParam({ name: 'id', description: 'Reminder ID (CUID)' })
  @ApiResponse({ status: 200, description: 'Reminder updated', type: ReminderResponseDto })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@User() u: any, @Param('id') id: string, @Body() dto: UpdateReminderDto) {
    return this.reminders.update(u.dbUser.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete reminder' })
  @ApiParam({ name: 'id', description: 'Reminder ID (CUID)' })
  @ApiResponse({ status: 200, description: 'Reminder deleted' })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  remove(@User() u: any, @Param('id') id: string) {
    return this.reminders.remove(u.dbUser.id, id);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming reminders (next 24 hours)' })
  @ApiResponse({ status: 200, description: 'Upcoming reminders retrieved', type: [ReminderResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getUpcoming(@User() u: any) {
    return this.reminderNotifications.getUpcomingReminders(u.dbUser.id);
  }

  @Post(':id/notify')
  @ApiOperation({ summary: 'Send immediate notification for a reminder (testing)' })
  @ApiParam({ name: 'id', description: 'Reminder ID (CUID)' })
  @ApiResponse({ status: 200, description: 'Notification sent' })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  sendNotification(@User() u: any, @Param('id') id: string) {
    return this.reminderNotifications.sendImmediateReminder(u.dbUser.id, id);
  }

  @Post('test/cron')
  @ApiOperation({ summary: 'Manually trigger the reminder cron job (testing)' })
  @ApiResponse({ status: 200, description: 'Cron job executed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async testCronJob(@User() u: any) {
    await this.reminderNotifications.checkDueReminders();
    return { 
      success: true, 
      message: 'Cron job executed. Check logs for details.',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('test/create-and-notify')
  @ApiOperation({ summary: 'Create a reminder due in 10 seconds and wait for notification (testing)' })
  @ApiResponse({ status: 200, description: 'Test completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async testCreateAndNotify(@User() u: any, @Body() body: { projectId: string }) {
    // Create a reminder due in 10 seconds
    const dueAt = new Date(Date.now() + 10 * 1000);
    
    const reminder = await this.reminders.create(u.dbUser.id, {
      title: `Test Notification - ${new Date().toLocaleTimeString()}`,
      dueAt: dueAt.toISOString(),
      projectId: body.projectId,
    });

    return {
      success: true,
      message: `Created reminder "${reminder.title}" due at ${dueAt.toLocaleTimeString()}. The cron job runs every minute, so you should receive a notification within 60-70 seconds.`,
      reminder: {
        id: reminder.id,
        title: reminder.title,
        dueAt: reminder.dueAt,
      },
      instructions: [
        '1. Wait for the cron job to run (every minute)',
        '2. Check your browser/device for push notification',
        '3. Or call POST /reminders/test/cron to trigger immediately',
      ],
    };
  }
} 