import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { ReminderNotificationsService } from './reminder-notifications.service';
import { DatabaseService } from '../database/database.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [RemindersController],
  providers: [RemindersService, ReminderNotificationsService, DatabaseService],
  exports: [RemindersService, ReminderNotificationsService],
})
export class RemindersModule {} 