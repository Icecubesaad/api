import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ProfileService {
  constructor(private readonly db: DatabaseService) {}

  async getProfile(userId: string) {
    const user = await this.db.user.findUnique({
      where: { firebaseUid: userId },
      include: {
        subscriptions: true,
        projects: {
          where: { archivedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateNotificationPreferences(userId: string, preferences: any) {
    const user = await this.db.user.findUnique({
      where: { firebaseUid: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.db.user.update({
      where: { firebaseUid: userId },
      data: {
        notifPrefs: {
          ...(user.notifPrefs as any || {}),
          ...preferences,
        },
      },
    });
  }

  async getSubscriptionStatus(userId: string) {
    const user = await this.db.user.findUnique({
      where: { firebaseUid: userId },
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activeSubscription = user.subscriptions[0];
    
    return {
      tier: user.tier,
      status: activeSubscription?.status || 'INACTIVE',
      currentPeriodEnd: activeSubscription?.currentPeriodEnd,
      limits: activeSubscription?.limits || {
        aiCallsPerDay: 10,
        fileUploadsPerDay: 1,
        pdfExportsPerMonth: 0,
      },
    };
  }

  async updateProfile(userId: string, updates: { displayName?: string }) {
    const user = await this.db.user.findUnique({
      where: { firebaseUid: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.db.user.update({
      where: { firebaseUid: userId },
      data: updates,
    });
  }
}
