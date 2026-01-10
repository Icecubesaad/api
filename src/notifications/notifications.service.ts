import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { templates } from './templates';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseApp: admin.app.App | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    // Initialize Firebase from environment variables
    try {
      // Check if already initialized
      if (admin.apps.length > 0) {
        this.firebaseApp = admin.apps[0];
        this.logger.log('✅ Firebase already initialized, reusing existing app');
        return;
      }

      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');

      if (projectId && clientEmail && privateKey) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
        this.logger.log(`✅ Firebase initialized (${projectId})`);
      } else {
        this.logger.warn('⚠️ Missing Firebase env vars - notifications disabled');
        this.logger.warn(`   FIREBASE_PROJECT_ID: ${projectId ? 'set' : 'missing'}`);
        this.logger.warn(`   FIREBASE_CLIENT_EMAIL: ${clientEmail ? 'set' : 'missing'}`);
        this.logger.warn(`   FIREBASE_PRIVATE_KEY: ${privateKey ? 'set' : 'missing'}`);
      }
    } catch (error) {
      this.logger.error('❌ Firebase initialization failed:', error.message);
    }
  }

  async sendTemplatePush(userId: string, key: keyof typeof templates, vars?: Record<string, any>) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const notifPrefs = (user.notifPrefs as any) || {};
    const fcmToken = notifPrefs.fcmToken as string | undefined;
    if (!fcmToken) {
      this.logger.warn(`No FCM token for user ${userId}`);
      return;
    }

    const { title, body } = templates[key](vars);

    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: { key, ...(vars ?? {}) },
    });

    await this.db.notification.create({
      data: {
        userId,
        title,
        body,
        sentAt: new Date(),
        metaJson: { key, vars },
      },
    });
  }

  async sendNotification(userId: string, channel: 'PUSH' | 'EMAIL' | 'SMS', notification: {
    title: string;
    body: string;
    data?: any;
  }) {
    const enforcedTitle = this.enforceAustralianGreeting(notification.title);
    
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`User ${userId} not found for notification`);
      return;
    }

    try {
      switch (channel) {
        case 'PUSH':
          await this.sendPushNotification(userId, {
            title: enforcedTitle,
            body: notification.body,
            data: notification.data,
          });
          break;
        case 'EMAIL':
          await this.sendEmailNotification(userId, {
            title: enforcedTitle,
            body: notification.body,
            data: notification.data,
          });
          break;
        case 'SMS':
          await this.sendSmsNotification(userId, {
            title: enforcedTitle,
            body: notification.body,
            data: notification.data,
          });
          break;
      }

      await this.db.notification.create({
        data: {
          userId,
          title: enforcedTitle,
          body: notification.body,
          sentAt: new Date(),
          metaJson: { channel, ...notification.data },
        },
      });

    } catch (error) {
      this.logger.error(`Failed to send ${channel} notification to user ${userId}:`, error);
      
      await this.db.notification.create({
        data: {
          userId,
          title: enforcedTitle,
          body: notification.body,
          metaJson: { channel, error: error.message, ...notification.data },
        },
      });
    }
  }

  private enforceAustralianGreeting(title: string): string {
    const greetingPattern = /^(Hey mate!|G'day Mate[,!]?)\s?/i;
    if (greetingPattern.test(title)) {
      return title;
    }
    this.logger.warn(`Notification title doesn't follow Australian greeting style: "${title}"`);
    return title;
  }

  static validateGreetingPrefix(title: string): boolean {
    const greetingPattern = /^(Hey mate!|G'day Mate[,!]?)\s?/i;
    return greetingPattern.test(title);
  }

  private async sendPushNotification(userId: string, notification: any) {
    if (!this.firebaseApp) {
      this.logger.error('❌ Firebase not initialized - cannot send push notification');
      throw new Error('Firebase not initialized');
    }

    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`User ${userId} not found for push notification`);
      return;
    }

    const notifPrefs = (user.notifPrefs as any) || {};
    const fcmTokens = notifPrefs.fcmTokens || [];
    const legacyToken = notifPrefs.fcmToken;
    
    const allTokens: { token: string; platform: string }[] = [];
    
    for (const t of fcmTokens) {
      if (t.token && !allTokens.find(x => x.token === t.token)) {
        allTokens.push({ token: t.token, platform: t.platform || 'unknown' });
      }
    }
    
    if (legacyToken && !allTokens.find(x => x.token === legacyToken)) {
      allTokens.push({ token: legacyToken, platform: 'legacy' });
    }
    
    this.logger.log(`📱 Push notification for user ${userId}:`);
    this.logger.log(`   - Total tokens: ${allTokens.length}`);
    allTokens.forEach((t, i) => {
      this.logger.log(`   - Token ${i + 1} (${t.platform}): ${t.token.substring(0, 20)}...`);
    });
    
    if (allTokens.length === 0) {
      this.logger.warn(`❌ No FCM tokens for user ${userId} - notification NOT sent`);
      return;
    }

    const stringifiedData: Record<string, string> = {};
    if (notification.data) {
      for (const [key, value] of Object.entries(notification.data)) {
        if (value !== null && value !== undefined) {
          stringifiedData[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
      }
    }

    const invalidTokens: string[] = [];
    let successCount = 0;
    
    for (const { token, platform } of allTokens) {
      try {
        this.logger.log(`🚀 Sending FCM to ${platform} via jobmate-122bd...`);
        
        const result = await admin.messaging().send({
          token,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: stringifiedData,
          // Web push configuration (for browsers)
          webpush: {
            notification: {
              title: notification.title,
              body: notification.body,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              requireInteraction: true,
              actions: [
                { action: 'checkin', title: '✅ Check In' },
                { action: 'dismiss', title: '❌ Dismiss' },
              ],
            },
            fcmOptions: {
              link: '/',
            },
          },
          // Android configuration (for Flutter Android)
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              clickAction: 'FLUTTER_NOTIFICATION_CLICK',
              channelId: 'jobmate_notifications',
            },
          },
          // iOS configuration (for Flutter iOS)
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
                'mutable-content': 1,
              },
            },
          },
        });
        
        this.logger.log(`✅ FCM sent to ${platform}! Message ID: ${result}`);
        successCount++;
      } catch (fcmError) {
        this.logger.error(`❌ FCM send to ${platform} failed:`, fcmError.message);
        
        if (fcmError.code === 'messaging/registration-token-not-registered' ||
            fcmError.code === 'messaging/invalid-registration-token') {
          invalidTokens.push(token);
        }
      }
    }

    if (invalidTokens.length > 0) {
      this.logger.warn(`🗑️ Removing ${invalidTokens.length} invalid tokens for user ${userId}`);
      const validTokens = fcmTokens.filter((t: any) => !invalidTokens.includes(t.token));
      const newLegacyToken = invalidTokens.includes(legacyToken) ? null : legacyToken;
      
      try {
        await this.db.user.update({
          where: { id: userId },
          data: {
            notifPrefs: {
              ...notifPrefs,
              fcmToken: newLegacyToken,
              fcmTokens: validTokens,
            },
          },
        });
      } catch (clearError) {
        this.logger.error(`Failed to clear invalid tokens:`, clearError.message);
      }
    }

    if (successCount === 0) {
      throw new Error('Failed to send to any device');
    }
  }

  private async sendEmailNotification(userId: string, notification: any) {
    this.logger.log(`Email notification for user ${userId}: ${notification.title}`);
  }

  private async sendSmsNotification(userId: string, notification: any) {
    this.logger.log(`SMS notification for user ${userId}: ${notification.title}`);
  }

  async sendPushNotificationPublic(userId: string, notification: {
    title: string;
    body: string;
    data?: any;
  }) {
    return this.sendNotification(userId, 'PUSH', notification);
  }

  testGreetingEnforcement(title: string): string {
    return this.enforceAustralianGreeting(title);
  }

  async getRecentNotifications(userId: string, limit: number = 10) {
    return this.db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
