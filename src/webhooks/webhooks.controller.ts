import { Controller, Post, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from '../billing/billing.service';
import { DatabaseService } from '../database/database.service';
import { User } from '../auth/decorators/user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RegisterFcmTokenDto, FcmTokenResponseDto } from './dto/webhook.dto';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly billing: BillingService,
    private readonly db: DatabaseService,
  ) {}

  @Post('stripe')
  @ApiOperation({ summary: 'Stripe webhook endpoint (called by Stripe)' })
  @Public()
  @ApiHeader({ name: 'stripe-signature', description: 'Stripe webhook signature', required: true })
  @ApiResponse({ status: 200, description: 'Webhook received and processed' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature' })
  async stripeWebhook(@Headers('stripe-signature') signature: string, @Body() payload: any) {
    try {
      const event = this.billing.getWebhookEvent(signature, Buffer.from(JSON.stringify(payload)));

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionCancellation(event.data.object);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      return { received: true };
    } catch (error) {
      console.error('Webhook error:', error);
      throw error;
    }
  }

  @Post('fcm-token')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register FCM token for push notifications' })
  @ApiResponse({
    status: 200,
    description: 'FCM token registered successfully',
    type: FcmTokenResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid token' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async registerFcmToken(@User() user: any, @Body() body: RegisterFcmTokenDto) {
    // Get current user to preserve existing notifPrefs
    const dbUser = await this.db.user.findUnique({
      where: { firebaseUid: user.uid },
    });

    if (!dbUser) {
      return { success: false, message: 'User not found' };
    }

    // Update with FCM token
    await this.db.user.update({
      where: { firebaseUid: user.uid },
      data: {
        notifPrefs: {
          ...((dbUser.notifPrefs as object) || {}),
          fcmToken: body.token,
        },
      },
    });

    return { success: true };
  }

  private async handleSubscriptionUpdate(subscription: any) {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    await this.db.subscription.upsert({
      where: { userId },
      update: {
        status: subscription.status.toUpperCase(),
        tier:
          subscription.items.data[0]?.price.id === process.env.STRIPE_PRICE_PREMIUM
            ? 'PREMIUM'
            : 'BASIC',
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
      create: {
        userId,
        status: subscription.status.toUpperCase(),
        tier:
          subscription.items.data[0]?.price.id === process.env.STRIPE_PRICE_PREMIUM
            ? 'PREMIUM'
            : 'BASIC',
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        limits: {
          aiCallsPerDay:
            subscription.items.data[0]?.price.id === process.env.STRIPE_PRICE_PREMIUM ? 100 : 10,
          fileUploadsPerDay:
            subscription.items.data[0]?.price.id === process.env.STRIPE_PRICE_PREMIUM ? 10 : 1,
          pdfExportsPerMonth:
            subscription.items.data[0]?.price.id === process.env.STRIPE_PRICE_PREMIUM ? 50 : 0,
        },
      },
    });
  }

  private async handleSubscriptionCancellation(subscription: any) {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    await this.db.subscription.update({
      where: { userId },
      data: {
        status: 'CANCELLED',
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });
  }
}
