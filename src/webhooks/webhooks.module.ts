import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { BillingService } from '../billing/billing.service';
import { DatabaseService } from '../database/database.service';

@Module({
  controllers: [WebhooksController],
  providers: [BillingService, DatabaseService],
})
export class WebhooksModule {}
