import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { User } from '../auth/decorators/user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CalendarProvider } from '@prisma/client';
import { ConnectCalendarDto, CreateCalendarEventDto, CalendarAuthUrlResponseDto, CalendarStatusResponseDto } from './dto/calendar.dto';

@ApiTags('calendar')
@Controller('calendar')
@ApiBearerAuth()
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('auth-url')
  @ApiOperation({ summary: 'Get OAuth URL for calendar provider' })
  @ApiQuery({ name: 'provider', enum: CalendarProvider, description: 'Calendar provider (GOOGLE or MICROSOFT)' })
  @ApiResponse({ status: 200, description: 'OAuth URL generated', type: CalendarAuthUrlResponseDto })
  @Public()
  async getAuthUrl(@Query('provider') provider: CalendarProvider) {
    const authUrl = await this.calendarService.getAuthUrl(provider);
    return { authUrl };
  }

  @Post('connect')
  @ApiOperation({ summary: 'Connect calendar provider with auth code' })
  @ApiResponse({ status: 200, description: 'Calendar connected successfully' })
  @ApiResponse({ status: 400, description: 'Invalid auth code or provider' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  connectProvider(
    @User() user: any,
    @Body() body: ConnectCalendarDto
  ) {
    console.log('🔐 Calendar connect request:', { 
      userId: user?.dbUser?.id, 
      userEmail: user?.dbUser?.email,
      provider: body.provider,
      hasAuthCode: !!body.authCode 
    });
    return this.calendarService.connectProvider(user.dbUser.id, body.provider, body.authCode);
  }

  @Post('events')
  @ApiOperation({ summary: 'Create calendar event' })
  @ApiResponse({ status: 201, description: 'Event created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid event data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createEvent(@User() user: any, @Body() eventData: CreateCalendarEventDto) {
    return this.calendarService.createEvent(user.dbUser.id, eventData);
  }

  @Get('events')
  @ApiOperation({ summary: 'List calendar events' })
  @ApiQuery({ name: 'timeMin', required: false, description: 'Minimum time (ISO format)' })
  @ApiQuery({ name: 'timeMax', required: false, description: 'Maximum time (ISO format)' })
  @ApiResponse({ status: 200, description: 'List of calendar events' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  listEvents(
    @User() user: any,
    @Query('timeMin') timeMin?: string,
    @Query('timeMax') timeMax?: string
  ) {
    return this.calendarService.listEvents(user.dbUser.id, timeMin, timeMax);
  }

  @Get('status')
  @ApiOperation({ summary: 'Check calendar connection status' })
  @ApiResponse({ status: 200, description: 'Connection status', type: CalendarStatusResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConnectionStatus(@User() user: any) {
    return this.calendarService.getConnectionStatus(user.dbUser.id);
  }

  @Get('debug-status')
  @ApiOperation({ summary: 'Debug calendar connection status' })
  @ApiQuery({ name: 'email', required: false, description: 'User email to check' })
  @ApiResponse({ status: 200, description: 'Debug status information' })
  @Public()
  async getDebugStatus(@Query('email') email?: string) {
    return this.calendarService.getDebugStatus(email);
  }
}
