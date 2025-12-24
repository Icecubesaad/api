import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CheckinService } from './checkin.service';

@Injectable()
export class CheckinScheduler implements OnModuleInit {
  private readonly logger = new Logger(CheckinScheduler.name);

  constructor(private readonly checkinService: CheckinService) {}

  async onModuleInit() {
    // Schedule all user check-ins on startup
    this.logger.log('Initializing daily check-in scheduler...');
    try {
      const count = await this.checkinService.scheduleAllUserCheckins();
      this.logger.log(`Initialized check-ins for ${count} users`);
    } catch (error) {
      this.logger.error('Failed to initialize check-ins:', error);
    }
  }

  // Re-schedule all check-ins at midnight to handle day changes
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async rescheduleAllCheckins() {
    this.logger.log('Rescheduling all daily check-ins...');
    try {
      const count = await this.checkinService.scheduleAllUserCheckins();
      this.logger.log(`Rescheduled check-ins for ${count} users`);
    } catch (error) {
      this.logger.error('Failed to reschedule check-ins:', error);
    }
  }
}
