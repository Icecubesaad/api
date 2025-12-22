import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { DatabaseService } from '../database/database.service';
import { UsersModule } from '../users/users.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [UsersModule, AiModule],
  controllers: [NotesController],
  providers: [NotesService, DatabaseService],
  exports: [NotesService],
})
export class NotesModule {}
