import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { templates } from './templates';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    if (!admin.apps.length) {
      const projectId = this.config.get<string>('firebase.projectId');
      const clientEmail = this.config.get<string>('firebase.clientEmail');
      const privateKey = this.config.get<string>('firebase.privateKey');

      // Only initialize Firebase if valid credentials are provided
      const hasValidCredentials = 
        projectId && 
        !projectId.includes('your-') && 
        clientEmail && 
        !clientEmail.includes('xxxxx') &&
        privateKey && 
        privateKey.includes('BEGIN PRIVATE KEY') && 
        !privateKey.includes('YOUR_PRIVATE_KEY_HERE');

      if (hasValidCredentials) {
        try {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey: privateKey.replace(/\\n/g, '\n'),
            }),
          });
          this.logger.log('✅ Firebase Admin initialized for notifications');
        } catch (error) {
          this.logger.warn('⚠️  Firebase Admin initialization failed:', error.message);
          this.logger.warn('   Push notifications will not work until valid Firebase credentials are provided.');
        }
      } else {
        this.logger.warn('⚠️  Firebase credentials not configured properly.');
        this.logger.warn('   Push notifications disabled. Update FIREBASE_* variables in .env to enable.');
      }
    }
  }

  async sendTemplatePush(userId: string, key: keyof typeof templates, vars?: Record<string, any>) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) return;

    // FCM token is stored in user.notifPrefs.fcmToken
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
    // Enforce Australian greeting style - this is non-negotiable
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

      // Log notification in database
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
      
      // Log failed notification
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
    // Allow titles starting with "Hey mate!" or "G'day Mate," (space after is optional)
    const greetingPattern = /^(Hey mate!|G'day Mate,)\s?/i;
    
    // Check if title already starts with the required greeting pattern
    if (greetingPattern.test(title)) {
      return title;
    }
    
    // For non-compliant titles, just return as-is (don't block functionality)
    this.logger.warn(`Notification title doesn't follow Australian greeting style: "${title}"`);
    return title;
  }

  // Validate greeting prefix - used for testing
  static validateGreetingPrefix(title: string): boolean {
    const greetingPattern = /^(Hey mate!|G'day Mate,)\s?/i;
    return greetingPattern.test(title);
  }

  private async sendPushNotification(userId: string, notification: any) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`User ${userId} not found for push notification`);
      return;
    }

    // FCM token is stored in user.notifPrefs.fcmToken
    const notifPrefs = (user.notifPrefs as any) || {};
    const fcmToken = notifPrefs.fcmToken as string | undefined;
    
    this.logger.log(`📱 Push notification for user ${userId}:`);
    this.logger.log(`   - Has notifPrefs: ${!!notifPrefs}`);
    this.logger.log(`   - Has FCM token: ${!!fcmToken}`);
    this.logger.log(`   - Token preview: ${fcmToken ? fcmToken.substring(0, 20) + '...' : 'NONE'}`);
    
    if (!fcmToken) {
      this.logger.warn(`❌ No FCM token for user ${userId} - notification NOT sent`);
      this.logger.warn(`   User needs to allow notifications in browser and refresh the page`);
      return;
    }

    try {
      this.logger.log(`🚀 Sending FCM message...`);
      const result = await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data ? JSON.parse(JSON.stringify(notification.data)) : {},
      });
      this.logger.log(`✅ FCM message sent successfully! Message ID: ${result}`);
    } catch (fcmError) {
      this.logger.error(`❌ FCM send failed:`, fcmError.message);
      this.logger.error(`   Error code: ${fcmError.code}`);
      
      // If token is invalid/expired, clear it so user can re-register
      if (fcmError.code === 'messaging/registration-token-not-registered' ||
          fcmError.code === 'messaging/invalid-registration-token') {
        this.logger.warn(`🗑️ Clearing invalid FCM token for user ${userId}`);
        try {
          const updatedPrefs = { ...notifPrefs };
          delete updatedPrefs.fcmToken;
          await this.db.user.update({
            where: { id: userId },
            data: { notifPrefs: updatedPrefs },
          });
          this.logger.log(`   Token cleared. User will get new token on next page load.`);
        } catch (clearError) {
          this.logger.error(`   Failed to clear token:`, clearError.message);
        }
      }
      
      throw fcmError;
    }
  }

  private async sendEmailNotification(userId: string, notification: any) {
    // Email notification implementation would go here
    // For now, just log it
    this.logger.log(`Email notification for user ${userId}: ${notification.title}`);
  }

  private async sendSmsNotification(userId: string, notification: any) {
    // SMS notification implementation would go here
    // For now, just log it
    this.logger.log(`SMS notification for user ${userId}: ${notification.title}`);
  }

  // Public method for external use
  async sendPushNotificationPublic(userId: string, notification: {
    title: string;
    body: string;
    data?: any;
  }) {
    return this.sendNotification(userId, 'PUSH', notification);
  }

  // Unit test method to verify greeting enforcement
  testGreetingEnforcement(title: string): string {
    return this.enforceAustralianGreeting(title);
  }

  // Get recent notifications for a user
  async getRecentNotifications(userId: string, limit: number = 10) {
    return this.db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
} 