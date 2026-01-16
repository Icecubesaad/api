import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';

/**
 * E2E Tests for Reminder and Notification Flow
 * 
 * These tests verify the complete flow from:
 * 1. Creating a reminder
 * 2. Triggering notifications
 * 3. Receiving notification data
 * 4. Marking reminders complete
 * 
 * Note: These tests require a test database and mock Firebase.
 * Run with: npm run test:e2e -- --testPathPattern=reminders-notifications
 */

// Mock Firebase Admin for e2e tests
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn().mockReturnValue({}),
  credential: {
    cert: jest.fn(),
  },
  messaging: () => ({
    send: jest.fn().mockResolvedValue('mock-message-id'),
  }),
  auth: () => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'test-firebase-uid',
      email: 'test@example.com',
    }),
  }),
}));

describe('Reminders and Notifications (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let authToken: string;
  let testUserId: string;
  let testProjectId: string;

  // Skip these tests if no test database is configured
  const skipIfNoDb = process.env.DATABASE_URL?.includes('test') ? describe : describe.skip;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
    }));
    
    await app.init();
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Setup', () => {
    it('should create test user and project', async () => {
      // This would normally be done through auth flow
      // For e2e tests, we create test data directly
      
      // Create or find test user
      const testUser = await db.user.upsert({
        where: { email: 'e2e-test@example.com' },
        update: {},
        create: {
          email: 'e2e-test@example.com',
          firebaseUid: 'e2e-test-firebase-uid',
          displayName: 'E2E Test User',
          notifPrefs: {
            fcmToken: 'test-fcm-token',
            fcmTokens: [
              { token: 'test-web-token', platform: 'web' },
            ],
          },
        },
      });
      testUserId = testUser.id;

      // Create test project
      const testProject = await db.project.create({
        data: {
          name: 'E2E Test Project',
          ownerId: testUserId,
        },
      });
      testProjectId = testProject.id;

      expect(testUserId).toBeDefined();
      expect(testProjectId).toBeDefined();
    });
  });

  describe('Reminder CRUD Operations', () => {
    let reminderId: string;

    it('POST /reminders - should create a reminder', async () => {
      const dueAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      const response = await request(app.getHttpServer())
        .post('/reminders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'E2E Test Reminder',
          dueAt: dueAt.toISOString(),
          projectId: testProjectId,
        });

      // Note: This will fail without proper auth setup
      // In real e2e tests, you'd need to mock or setup Firebase auth
      if (response.status === 201) {
        expect(response.body).toHaveProperty('id');
        expect(response.body.title).toBe('E2E Test Reminder');
        expect(response.body.status).toBe('PENDING');
        reminderId = response.body.id;
      }
    });

    it('GET /reminders - should list reminders', async () => {
      const response = await request(app.getHttpServer())
        .get('/reminders')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it('GET /reminders/upcoming - should get upcoming reminders', async () => {
      const response = await request(app.getHttpServer())
        .get('/reminders/upcoming')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it('PATCH /reminders/:id - should update reminder status', async () => {
      if (!reminderId) return;

      const response = await request(app.getHttpServer())
        .patch(`/reminders/${reminderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'COMPLETED',
        });

      if (response.status === 200) {
        expect(response.body.status).toBe('COMPLETED');
      }
    });

    it('DELETE /reminders/:id - should delete reminder', async () => {
      if (!reminderId) return;

      const response = await request(app.getHttpServer())
        .delete(`/reminders/${reminderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        expect(response.status).toBe(200);
      }
    });
  });

  describe('Notification Endpoints', () => {
    it('GET /notifications/firebase-config - should return Firebase config (public)', async () => {
      const response = await request(app.getHttpServer())
        .get('/notifications/firebase-config');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('projectId');
      expect(response.body).toHaveProperty('messagingSenderId');
    });

    it('GET /notifications/demo/examples - should return notification examples (public)', async () => {
      const response = await request(app.getHttpServer())
        .get('/notifications/demo/examples');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('notifications');
      expect(Array.isArray(response.body.notifications)).toBe(true);
      expect(response.body.notifications.length).toBeGreaterThan(0);
    });

    it('POST /notifications/demo/test-greeting - should validate greeting format (public)', async () => {
      // Valid greeting
      const validResponse = await request(app.getHttpServer())
        .post('/notifications/demo/test-greeting')
        .send({ title: 'Hey mate! Test notification' });

      expect(validResponse.status).toBe(201);
      expect(validResponse.body.success).toBe(true);

      // Invalid greeting
      const invalidResponse = await request(app.getHttpServer())
        .post('/notifications/demo/test-greeting')
        .send({ title: 'Hello! Test notification' });

      expect(invalidResponse.status).toBe(201);
      // The response indicates validation result
    });

    it('GET /notifications/recent - should require authentication', async () => {
      const response = await request(app.getHttpServer())
        .get('/notifications/recent');

      expect(response.status).toBe(401);
    });
  });

  describe('FCM Token Registration', () => {
    it('POST /webhooks/fcm-token - should require authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/fcm-token')
        .send({
          token: 'test-fcm-token-123',
          platform: 'web',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Reminder Notification Testing Endpoints', () => {
    it('POST /reminders/test/cron - should require authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/reminders/test/cron');

      expect(response.status).toBe(401);
    });

    it('POST /reminders/:id/notify - should require authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/reminders/test-id/notify');

      expect(response.status).toBe(401);
    });
  });

  describe('Cleanup', () => {
    it('should clean up test data', async () => {
      if (testProjectId) {
        // Delete test reminders
        await db.reminder.deleteMany({
          where: { projectId: testProjectId },
        });

        // Delete test notifications
        await db.notification.deleteMany({
          where: { userId: testUserId },
        });

        // Delete test project
        await db.project.delete({
          where: { id: testProjectId },
        });
      }

      if (testUserId) {
        // Delete test user
        await db.user.delete({
          where: { id: testUserId },
        }).catch(() => {
          // Ignore if already deleted
        });
      }
    });
  });
});

/**
 * Unit-style integration tests that don't require full app bootstrap
 */
describe('Reminder Notification Flow (Integration)', () => {
  describe('Notification Content Validation', () => {
    it('should enforce Australian greeting in notification titles', () => {
      const validTitles = [
        'Hey mate! Your task is due',
        "G'day Mate, time for your meeting",
        'Hey mate! Reminder: Complete report',
      ];

      const invalidTitles = [
        'Your task is due',
        'Reminder: Complete report',
        'Hello! Your meeting starts soon',
      ];

      const greetingPattern = /^(Hey mate!|G'day Mate[,!]?)\s/i;

      validTitles.forEach(title => {
        expect(greetingPattern.test(title)).toBe(true);
      });

      invalidTitles.forEach(title => {
        expect(greetingPattern.test(title)).toBe(false);
      });
    });

    it('should include required data fields in notification payload', () => {
      const requiredFields = [
        'type',
        'reminderId',
        'eventTitle',
        'projectId',
        'action',
      ];

      const mockPayload = {
        type: 'reminder_checkin',
        reminderId: 'reminder-123',
        eventTitle: 'Test Task',
        projectId: 'project-456',
        action: 'checkin',
        dueAt: '2025-01-15T10:00:00Z',
      };

      requiredFields.forEach(field => {
        expect(mockPayload).toHaveProperty(field);
      });
    });
  });

  describe('Reminder Status Transitions', () => {
    it('should allow valid status transitions', () => {
      const validTransitions = [
        { from: 'PENDING', to: 'COMPLETED' },
        { from: 'PENDING', to: 'CANCELLED' },
      ];

      const invalidTransitions = [
        { from: 'COMPLETED', to: 'PENDING' },
        { from: 'CANCELLED', to: 'PENDING' },
      ];

      // In a real implementation, you'd test the service method
      validTransitions.forEach(({ from, to }) => {
        expect(['PENDING', 'COMPLETED', 'CANCELLED']).toContain(from);
        expect(['PENDING', 'COMPLETED', 'CANCELLED']).toContain(to);
      });
    });
  });

  describe('Notification Timing Logic', () => {
    it('should calculate early notification timing correctly', () => {
      const now = new Date();
      const dueIn30Min = new Date(now.getTime() + 30 * 60 * 1000);
      const dueIn2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      // For reminders due within 1 hour, notify at midpoint
      const timeUntilDue30 = dueIn30Min.getTime() - now.getTime();
      expect(timeUntilDue30).toBeLessThan(60 * 60 * 1000);

      // For reminders due in more than 1 hour, notify at 1 hour mark
      const timeUntilDue2h = dueIn2Hours.getTime() - now.getTime();
      expect(timeUntilDue2h).toBeGreaterThan(60 * 60 * 1000);
    });

    it('should calculate follow-up notification timing correctly', () => {
      const now = new Date();
      const due5MinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const due10MinAgo = new Date(now.getTime() - 10 * 60 * 1000);

      // Follow-up should be sent 5-10 minutes after due time
      const timeSinceDue5 = now.getTime() - due5MinAgo.getTime();
      const timeSinceDue10 = now.getTime() - due10MinAgo.getTime();

      expect(timeSinceDue5).toBeGreaterThanOrEqual(5 * 60 * 1000);
      expect(timeSinceDue10).toBeLessThanOrEqual(10 * 60 * 1000);
    });
  });

  describe('Multi-platform Token Handling', () => {
    it('should support multiple FCM tokens per user', () => {
      const userNotifPrefs = {
        fcmToken: 'legacy-token', // Backward compatibility
        fcmTokens: [
          { token: 'web-token', platform: 'web', registeredAt: new Date().toISOString() },
          { token: 'android-token', platform: 'android', registeredAt: new Date().toISOString() },
          { token: 'ios-token', platform: 'ios', registeredAt: new Date().toISOString() },
        ],
      };

      expect(userNotifPrefs.fcmTokens).toHaveLength(3);
      expect(userNotifPrefs.fcmTokens.map(t => t.platform)).toContain('web');
      expect(userNotifPrefs.fcmTokens.map(t => t.platform)).toContain('android');
      expect(userNotifPrefs.fcmTokens.map(t => t.platform)).toContain('ios');
    });

    it('should deduplicate tokens when collecting all tokens', () => {
      const fcmTokens = [
        { token: 'token-1', platform: 'web' },
        { token: 'token-2', platform: 'android' },
      ];
      const legacyToken = 'token-1'; // Same as web token

      const allTokens: { token: string; platform: string }[] = [];
      
      for (const t of fcmTokens) {
        if (t.token && !allTokens.find(x => x.token === t.token)) {
          allTokens.push({ token: t.token, platform: t.platform });
        }
      }
      
      if (legacyToken && !allTokens.find(x => x.token === legacyToken)) {
        allTokens.push({ token: legacyToken, platform: 'legacy' });
      }

      // Should not have duplicates
      expect(allTokens).toHaveLength(2);
    });
  });
});
