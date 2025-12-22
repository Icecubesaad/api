import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse, ApiBody, ApiHeader } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { User } from '../auth/decorators/user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CheckoutDto, CheckoutResponseDto } from './dto/billing.dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Checkout session created', type: CheckoutResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid price ID' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkout(@User() u: any, @Body() body: CheckoutDto) {
    return this.billing.createCheckout(u.uid, body.priceId);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook endpoint (called by Stripe)' })
  @Public()
  @ApiHeader({ name: 'stripe-signature', description: 'Stripe webhook signature', required: true })
  @ApiBody({ description: 'Stripe webhook payload' })
  @ApiResponse({ status: 200, description: 'Webhook received and processed' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature' })
  async webhook(@Headers('stripe-signature') sig: string, @Body() raw: any) {
    const event = this.billing.getWebhookEvent(sig, Buffer.from(JSON.stringify(raw)));
    return { received: true, type: event.type };
  }
} 