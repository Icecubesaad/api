import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CheckinService } from './checkin.service';
import {
  UpdateCheckinPreferencesDto,
  CheckinResponseDto,
  CheckinPreferencesResponseDto,
} from './dto/checkin.dto';

@ApiTags('Check-in')
@Controller('checkin')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Get daily check-in preferences' })
  async getPreferences(@Request() req): Promise<CheckinPreferencesResponseDto> {
    return this.checkinService.getPreferences(req.user.uid);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update daily check-in preferences' })
  async updatePreferences(
    @Request() req,
    @Body() dto: UpdateCheckinPreferencesDto,
  ): Promise<CheckinPreferencesResponseDto> {
    return this.checkinService.updatePreferences(req.user.uid, dto);
  }

  @Post('respond')
  @ApiOperation({ summary: 'Submit a check-in response' })
  async respond(
    @Request() req,
    @Body() dto: CheckinResponseDto,
  ): Promise<{ noteId?: string; message: string }> {
    return this.checkinService.processCheckinResponse(req.user.uid, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get check-in history' })
  async getHistory(@Request() req) {
    return this.checkinService.getCheckinHistory(req.user.uid);
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Manually trigger a check-in prompt (for testing)' })
  async triggerCheckin(@Request() req): Promise<{ message: string }> {
    await this.checkinService.sendCheckinPrompt(req.user.uid);
    return { message: 'Check-in prompt sent' };
  }
}
