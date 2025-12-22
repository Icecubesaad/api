import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { uid: string } | undefined;

    if (!user) return false;

    // Load user and subscription
    const dbUser = await this.db.user.findUnique({
      where: { firebaseUid: user.uid },
      include: { subscriptions: true },
    });

    if (!dbUser) return false;

    const activeSub = dbUser.subscriptions.find((s) => s.status === 'ACTIVE');

    // Basic gating example (stub). Extend with counters and limits.
    if (!activeSub || activeSub.tier === 'BASIC') {
      // Example: block premium-only endpoints
      if (req.route?.path?.includes('export') || req.route?.path?.includes('pdf')) {
        throw new ForbiddenException('Upgrade to premium to access this feature');
      }
    }

    return true;
  }
} 