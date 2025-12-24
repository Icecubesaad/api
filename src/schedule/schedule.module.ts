import { Module, forwardRef } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { PdfScheduleParseService } from './pdf-schedule-parse.service';
import { DatabaseService } from '../database/database.service';
import { CalendarModule } from '../calendar/calendar.module';
import { RemindersModule } from '../reminders/reminders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';
import { UploadsModule } from '../uploads/uploads.module';


@Module({
  imports: [

    CalendarModule,
    RemindersModule,
    NotificationsModule,
    UsersModule,
    forwardRef(() => AiModule),
    forwardRef(() => UploadsModule),
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService, PdfScheduleParseService, DatabaseService],
  exports: [ScheduleService, PdfScheduleParseService],
})
export class ScheduleModule {}