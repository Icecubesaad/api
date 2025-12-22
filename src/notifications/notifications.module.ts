import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { DatabaseService } from '../database/database.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, DatabaseService],
  exports: [NotificationsService],
})
export class NotificationsModule {} 