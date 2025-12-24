import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TasksService } from './tasks.service';
import { PdfProcessor } from './processors/pdf.processor';
import { ReminderProcessor } from './processors/reminder.processor';
import { CheckinProcessor } from './processors/checkin.processor';
import { DatabaseService } from '../database/database.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'pdf-processing' },
      { name: 'reminder-notifications' },
      { name: 'daily-checkin' },
    ),
    NotificationsModule,
    AuthModule,
    AiModule,
  ],
  providers: [
    TasksService,
    PdfProcessor,
    ReminderProcessor,
    CheckinProcessor,
    DatabaseService,
  ],
  exports: [TasksService, BullModule],
})
export class TasksModule {}
