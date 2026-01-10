import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  private async connectWithRetry(retries = 5, delay = 3000): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await this.$connect();
        this.logger.log('✅ Database connected');
        return;
      } catch (error) {
        this.logger.warn(`Database connection attempt ${i + 1}/${retries} failed`);
        if (i === retries - 1) throw error;
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
