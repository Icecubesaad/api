import { Controller, Get, Post, Query, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ScheduleService } from './schedule.service';
import { CommitScheduleDto, ParsePreview, ScheduleImportResult } from './dto/schedule.dto';
import { User } from '../auth/decorators/user.decorator';

@ApiTags('schedule')
@Controller('schedule')
@ApiBearerAuth()
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('preview')
  @ApiOperation({ summary: 'Get preview of parsed schedule from upload' })
  @ApiQuery({ name: 'uploadId', description: 'Upload ID (CUID)' })
  @ApiResponse({ status: 200, description: 'Schedule preview', type: ParsePreview })
  @ApiResponse({ status: 404, description: 'Upload not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPreview(@Query('uploadId') uploadId: string, @User() user: any) {
    return this.scheduleService.getPreview(uploadId, user.uid);
  }

  @Post('commit')
  @ApiOperation({ summary: 'Commit schedule (create events and reminders from parsed blocks)' })
  @ApiResponse({ status: 200, description: 'Schedule committed successfully', type: ScheduleImportResult })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Upload or project not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async commitSchedule(@Body() dto: CommitScheduleDto, @User() user: any) {
    return this.scheduleService.commitSchedule(user.uid, dto);
  }
}