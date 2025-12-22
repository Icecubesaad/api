import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { User } from '../auth/decorators/user.decorator';
import { UpdateProfileDto } from './dto/profile.dto';

@ApiTags('profile')
@Controller('profile')
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(@User() user: any) {
    return this.profileService.getProfile(user.uid);
  }

  @Patch()
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  updateProfile(
    @User() user: any,
    @Body() updates: UpdateProfileDto
  ) {
    return this.profileService.updateProfile(user.uid, updates);
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get subscription status' })
  @ApiResponse({ status: 200, description: 'Subscription status retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getSubscriptionStatus(@User() user: any) {
    return this.profileService.getSubscriptionStatus(user.uid);
  }

  @Patch('notifications')
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiBody({
    description: 'Notification preferences (flexible JSON object)',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: { fcmToken: 'token123', emailNotifications: true }
    }
  })
  @ApiResponse({ status: 200, description: 'Notification preferences updated' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  updateNotificationPreferences(
    @User() user: any,
    @Body() preferences: any
  ) {
    return this.profileService.updateNotificationPreferences(user.uid, preferences);
  }
}
