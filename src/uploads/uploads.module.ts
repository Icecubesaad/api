import { Module, forwardRef } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { S3Service } from './s3.service';
import { DatabaseService } from '../database/database.service';
import { AiModule } from '../ai/ai.module';
import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      },
    }),
    forwardRef(() => AiModule),
    forwardRef(() => ScheduleModule),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, S3Service, DatabaseService],
  exports: [UploadsService, S3Service],
})
export class UploadsModule {} 