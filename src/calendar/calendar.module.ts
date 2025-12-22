import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { DatabaseService } from '../database/database.service';

@Module({
  controllers: [CalendarController],
  providers: [CalendarService, GoogleCalendarProvider, DatabaseService],
  exports: [CalendarService],
})
export class CalendarModule {}
