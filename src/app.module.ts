import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerModuleOptions } from '@nestjs/throttler';
import { BullModule, BullRootModuleOptions } from '@nestjs/bull';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { PassportModule } from '@nestjs/passport';
import { MulterModule } from '@nestjs/platform-express';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { envSchema } from './config/env.schema';
import configuration from './config/configuration';
import { DatabaseService } from './database/database.service';
import { LoggerService } from './core/logging/logger.service';
import { AuthModule } from './auth/auth.module';
import { FirebaseAuthGuard } from './auth/firebase-auth.guard';

// Feature Modules
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { NotesModule } from './notes/notes.module';
import { AiModule } from './ai/ai.module';
import { CalendarModule } from './calendar/calendar.module';
import { BillingModule } from './billing/billing.module';
import { ProfileModule } from './profile/profile.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TasksModule } from './tasks/tasks.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { RemindersModule } from './reminders/reminders.module';
import { UploadsModule } from './uploads/uploads.module';
import { ScheduleModule } from './schedule/schedule.module';

@Module({
  imports: [
    // Serve static files from public folder
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/',
      exclude: ['/api*', '/auth*', '/projects*', '/notes*', '/reminders*', '/ai*', '/calendar*', '/billing*', '/profile*', '/notifications*', '/tasks*', '/webhooks*', '/uploads*', '/schedule*', '/health*'],
    }),

    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envSchema,
    }),

    // JWT Module - Register globally BEFORE feature modules
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.jwtSecret'),
        signOptions: { expiresIn: '7d' },
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      useFactory: (): ThrottlerModuleOptions => ({
        throttlers: [{
          ttl: 60,
          limit: 100,
        }],
      }),
    }),

    // Redis/BullMQ
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): BullRootModuleOptions => {
        const redisUrl = config.get<string>('redis.url');
        if (!redisUrl) {
          throw new Error('REDIS_URL environment variable is required');
        }
        
        // Parse Redis URL (format: redis://user:pass@host:port or rediss://host:port for TLS)
        const url = new URL(redisUrl);
        
        return {
          redis: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            password: url.password || undefined,
            username: url.username || undefined,
            // For Aiven Valkey with TLS (rediss:// protocol)
            tls: url.protocol === 'rediss:' ? {} : undefined,
          },
        };
      },
    }),

    // Scheduling
    NestScheduleModule.forRoot(),

    // Passport
    PassportModule.register({ defaultStrategy: 'firebase' }),

    // File uploads
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      },
    }),

    // Feature modules - AuthModule must be first to ensure dependencies are available
    AuthModule,
    HealthModule,
    UsersModule,
    ProjectsModule,
    NotesModule,
    AiModule,
    CalendarModule,
    BillingModule,
    ProfileModule,
    NotificationsModule,
    TasksModule,
    WebhooksModule,
    RemindersModule,
    UploadsModule,
    ScheduleModule,
  ],
  providers: [
    DatabaseService,
    LoggerService,
    // Register global guard in AppModule where all dependencies are available
    {
      provide: APP_GUARD,
      useClass: FirebaseAuthGuard,
    },
  ],
})
export class AppModule {}