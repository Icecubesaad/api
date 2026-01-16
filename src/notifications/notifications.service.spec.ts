import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

// Mock Firebase Admin
const mockMessagingSend = jest.fn();
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn().mockReturnValue({}),
  credential: {
    cert: jest.fn(),
  },
  messaging: () => ({
    send: mockMessagingSend,
  }),
}));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockDb: any;
  let mockConfigService: any;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    notifPrefs: {
      fcmToken: 'legacy-token-123',
      fcmTokens: [
        { token: 'web-token-123', platform: 'web', registeredAt: new Date().toISOString() },
        { token: 'android-token-456', platform: 'android', registeredAt: new Date().toISOString() },
      ],
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    mockDb = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          FIREBASE_PROJECT_ID: 'test-project',
          FIREBASE_CLIENT_EMAIL: 'test@test.iam.gserviceaccount.com',
          FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('greeting prefix validation', () => {
    it('should validate correct greeting prefixes', () => {
      const validTitles = [
        'Hey mate! Your reminder is due',
        "G'day Mate, time for your meeting",
        'Hey mate! Event created successfully',
        "G'day Mate, your schedule is ready",
        "G'day Mate! Your task is complete",
      ];

      validTitles.forEach(title => {
        expect(NotificationsService.validateGreetingPrefix(title)).toBe(true);
      });
    });

    it('should reject non-compliant prefixes', () => {
      const invalidTitles = [
        'Your reminder is due',
        'Hello! Your meeting starts soon',
        'Hi mate, your event is ready',
        'Good day, your schedule is ready',
        'hey mate! your reminder', // wrong case for "hey"
        "g'day mate your meeting", // wrong case
      ];

      invalidTitles.forEach(title => {
        expect(NotificationsService.validateGreetingPrefix(title)).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      expect(NotificationsService.validateGreetingPrefix('')).toBe(false);
      expect(NotificationsService.validateGreetingPrefix('Hey mate!')).toBe(false); // No space after
      expect(NotificationsService.validateGreetingPrefix("G'day Mate,")).toBe(false); // No space after
    });
  });

  describe('testGreetingEnforcement', () => {
    it('should return valid titles unchanged', () => {
      const validTitle = 'Hey mate! Your reminder is due';
      const result = service.testGreetingEnforcement(validTitle);
      expect(result).toBe(validTitle);
    });

    it('should return invalid titles with warning logged', () => {
      const invalidTitle = 'Your reminder is due';
      const result = service.testGreetingEnforcement(invalidTitle);
      // The current implementation logs a warning but returns the title
      expect(result).toBe(invalidTitle);
    });
  });

  describe('sendNotification', () => {
    beforeEach(() => {
      mockDb.user.findUnique.mockResolvedValue(mockUser);
      mockDb.notification.create.mockResolvedValue({});
      mockMessagingSend.mockResolvedValue('message-id-123');
    });

    it('should send push notification to all registered tokens', async () => {
      await service.sendNotification('user-123', 'PUSH', {
        title: 'Hey mate! Test notification',
        body: 'This is a test',
        data: { type: 'test' },
      });

      // Should attempt to send to all tokens (web, android, legacy)
      expect(mockMessagingSend).toHaveBeenCalled();
      expect(mockDb.notification.create).toHaveBeenCalled();
    });

    it('should not send notification when user not found', async () => {
      mockDb.user.findUnique.mockResolvedValue(null);

      await service.sendNotification('non-existent', 'PUSH', {
        title: 'Hey mate! Test',
        body: 'Test body',
      });

      expect(mockMessagingSend).not.toHaveBeenCalled();
    });

    it('should handle user with no FCM tokens', async () => {
      mockDb.user.findUnique.mockResolvedValue({
        ...mockUser,
        notifPrefs: {},
      });

      await service.sendNotification('user-123', 'PUSH', {
        title: 'Hey mate! Test',
        body: 'Test body',
      });

      // Should not throw, just log warning
      expect(mockMessagingSend).not.toHaveBeenCalled();
    });

    it('should save notification to database', async () => {
      await service.sendNotification('user-123', 'PUSH', {
        title: 'Hey mate! Test notification',
        body: 'This is a test',
        data: { type: 'test' },
      });

      expect(mockDb.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-123',
          title: expect.any(String),
          body: 'This is a test',
          sentAt: expect.any(Date),
        }),
      });
    });

    it('should stringify data values for FCM', async () => {
      await service.sendNotification('user-123', 'PUSH', {
        title: 'Hey mate! Test',
        body: 'Test body',
        data: {
          stringValue: 'test',
          numberValue: 123,
          boolValue: true,
          objectValue: { nested: 'value' },
        },
      });

      expect(mockMessagingSend).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stringValue: 'test',
            numberValue: '123',
            boolValue: 'true',
            objectValue: '{"nested":"value"}',
          }),
        }),
      );
    });
  });

  describe('sendNotification - platform configurations', () => {
    beforeEach(() => {
      mockDb.user.findUnique.mockResolvedValue(mockUser);
      mockDb.notification.create.mockResolvedValue({});
      mockMessagingSend.mockResolvedValue('message-id-123');
    });

    it('should include webpush configuration', async () => {
      await service.sendNotification('user-123', 'PUSH', {
        title: 'Hey mate! Test',
        body: 'Test body',
      });

      expect(mockMessagingSend).toHaveBeenCalledWith(
        expect.objectContaining({
          webpush: expect.objectContaining({
            notification: expect.objectContaining({
              title: expect.any(String),
              body: 'Test body',
            }),
          }),
        }),
      );
    });

    it('should include android configuration with high priority', async () => {
      await service.sendNotification('user-123', 'PUSH', {
        title: 'Hey mate! Test',
        body: 'Test body',
      });

      expect(mockMessagingSend).toHaveBeenCalledWith(
        expect.objectContaining({
          android: expect.objectContaining({
            priority: 'high',
            notification: expect.objectContaining({
              clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            }),
          }),
        }),
      );
    });

    it('should include apns configuration for iOS', async () => {
      await service.sendNotification('user-123', 'PUSH', {
        title: 'Hey mate! Test',
        body: 'Test body',
      });

      expect(mockMessagingSend).toHaveBeenCalledWith(
        expect.objectContaining({
          apns: expect.objectContaining({
            payload: expect.objectContaining({
              aps: expect.objectContaining({
                sound: 'default',
              }),
            }),
          }),
        }),
      );
    });
  });

  describe('sendNotification - error handling', () => {
    beforeEach(() => {
      mockDb.user.findUnique.mockResolvedValue(mockUser);
      mockDb.notification.create.mockResolvedValue({});
    });

    it('should handle invalid token errors and remove token', async () => {
      mockMessagingSend.mockRejectedValue({
        code: 'messaging/registration-token-not-registered',
        message: 'Token not registered',
      });
      mockDb.user.update.mockResolvedValue({});

      await expect(
        service.sendNotification('user-123', 'PUSH', {
          title: 'Hey mate! Test',
          body: 'Test body',
        }),
      ).rejects.toThrow();

      // Should attempt to clean up invalid tokens
      expect(mockDb.user.update).toHaveBeenCalled();
    });

    it('should save notification with error when send fails', async () => {
      mockMessagingSend.mockRejectedValue(new Error('FCM error'));

      try {
        await service.sendNotification('user-123', 'PUSH', {
          title: 'Hey mate! Test',
          body: 'Test body',
        });
      } catch (e) {
        // Expected to throw
      }

      expect(mockDb.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metaJson: expect.objectContaining({
            error: expect.any(String),
          }),
        }),
      });
    });
  });

  describe('getRecentNotifications', () => {
    it('should return recent notifications for user', async () => {
      const mockNotifications = [
        { id: '1', title: 'Hey mate! Test 1', body: 'Body 1', createdAt: new Date() },
        { id: '2', title: 'Hey mate! Test 2', body: 'Body 2', createdAt: new Date() },
      ];
      mockDb.notification.findMany.mockResolvedValue(mockNotifications);

      const result = await service.getRecentNotifications('user-123');

      expect(result).toEqual(mockNotifications);
      expect(mockDb.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });

    it('should respect custom limit', async () => {
      mockDb.notification.findMany.mockResolvedValue([]);

      await service.getRecentNotifications('user-123', 5);

      expect(mockDb.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        }),
      );
    });

    it('should return empty array when no notifications', async () => {
      mockDb.notification.findMany.mockResolvedValue([]);

      const result = await service.getRecentNotifications('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('sendTemplatePush', () => {
    beforeEach(() => {
      mockDb.user.findUnique.mockResolvedValue(mockUser);
      mockDb.notification.create.mockResolvedValue({});
      mockMessagingSend.mockResolvedValue('message-id-123');
    });

    it('should send notification using template', async () => {
      await service.sendTemplatePush('user-123', 'reminderDue', {
        title: 'Test Task',
        dueTime: '10:00 AM',
      });

      expect(mockMessagingSend).toHaveBeenCalled();
      expect(mockDb.notification.create).toHaveBeenCalled();
    });

    it('should not send when user has no FCM token', async () => {
      mockDb.user.findUnique.mockResolvedValue({
        ...mockUser,
        notifPrefs: {},
      });

      await service.sendTemplatePush('user-123', 'reminderDue', {
        title: 'Test',
        dueTime: '10:00 AM',
      });

      expect(mockMessagingSend).not.toHaveBeenCalled();
    });
  });
});
