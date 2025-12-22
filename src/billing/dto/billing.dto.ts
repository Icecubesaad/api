import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ 
    description: 'Stripe price ID (will fail - no valid Stripe key)', 
    example: 'price_basic_tier_id' 
  })
  @IsString()
  priceId: string;
}

export class CheckoutResponseDto {
  @ApiProperty({ description: 'Checkout session URL', example: 'https://checkout.stripe.com/pay/cs_test_...' })
  url: string;

  @ApiProperty({ description: 'Session ID', example: 'cs_test_a1b2c3d4e5f6g7h8i9j0' })
  sessionId: string;
}

