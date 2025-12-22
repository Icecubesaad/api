import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class BillingService {
  private stripe: Stripe;

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(this.config.get<string>('stripe.secretKey')!, {
      apiVersion: '2022-11-15',
    });
  }

  async createCheckout(userId: string, priceId: string) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.config.get('app.baseUrl')}/billing/success`,
      cancel_url: `${this.config.get('app.baseUrl')}/billing/cancel`,
      metadata: { userId },
    });

    return { url: session.url };
  }

  getWebhookEvent(signature: string, payload: Buffer) {
    const secret = this.config.get<string>('stripe.webhookSecret')!;
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
} 