import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CheckinService } from './checkin.service';
import { CheckinController } from './checkin.controller';
import { CheckinScheduler } from './checkin.scheduler';
import { DatabaseService } from '../database/database.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'daily-checkin' }),
    NotificationsModule,
    UsersModule,
    forwardRef(() => AiModule),
  ],
  controllers: [CheckinController],
  providers: [CheckinService, CheckinScheduler, DatabaseService],
  exports: [CheckinService],
})
export class CheckinModule {}
