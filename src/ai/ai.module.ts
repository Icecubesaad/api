import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { RagService } from './rag.service';
import { PdfIngestService } from './pdf-ingest.service';
import { DatabaseService } from '../database/database.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CalendarModule } from '../calendar/calendar.module';
import { UsersModule } from '../users/users.module';
import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  imports: [
    NotificationsModule, 
    CalendarModule, 
    UsersModule,
    forwardRef(() => ScheduleModule),
  ],
  controllers: [AiController],
  providers: [AiService, RagService, PdfIngestService, DatabaseService],
  exports: [AiService, RagService, PdfIngestService],
})
export class AiModule {}
