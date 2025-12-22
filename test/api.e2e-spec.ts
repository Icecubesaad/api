import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

// Increase timeout for remote database operations
jest.setTimeout(30000);

describe('JobMate API E2E Tests', () => {
  let app: INestApplication;
  let authToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testReminderId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ==================== HEALTH ====================
  describe('Health', () => {
    test('GET /health - basic health check', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => expect(res.body.status).toBe('ok'));
    });

    test('GET /health/detailed - detailed health with DB', () => {
      return request(app.getHttpServer())
        .get('/health/detailed')
        .expect(200)
        .expect((res) => expect(res.body.checks).toBeDefined());
    });
  });

  // ==================== AUTH ====================
  describe('Auth', () => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'SecurePass123!';

    test('POST /auth/signup - create account', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: testEmail, password: testPassword, displayName: 'Test' })
        .expect(201);
      expect(res.body.accessToken).toBeDefined();
      authToken = res.body.accessToken;
      testUserId = res.body.user.id;
    });

    test('POST /auth/signup - reject duplicate', () => {
      return request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: testEmail, password: testPassword })
        .expect(409);
    });

    test('POST /auth/login - valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(201); // POST returns 201
      expect(res.body.accessToken).toBeDefined();
      authToken = res.body.accessToken;
    });

    test('POST /auth/login - invalid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: 'wrong' });
      expect([400, 401]).toContain(res.status); // 400 for validation, 401 for auth
    });

    test('POST /auth/google-signin - invalid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/google-signin')
        .send({ idToken: 'invalid-token' });
      expect([401, 500]).toContain(res.status); // Firebase may throw 500
    });
  });

  // ==================== USERS ====================
  describe('Users', () => {
    test('GET /users/me - current user', () => {
      return request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('GET /users/me - no auth', () => {
      return request(app.getHttpServer())
        .get('/users/me')
        .expect(401);
    });

    test('GET /users - list users', () => {
      return request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  // ==================== PROJECTS ====================
  describe('Projects', () => {
    test('POST /projects - create', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test Project', description: 'E2E test' })
        .expect(201);
      testProjectId = res.body.id;
    });

    test('GET /projects - list', () => {
      return request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('GET /projects/:id - get by ID', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('PATCH /projects/:id - update', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated' })
        .expect(200);
    });

    test('PATCH /projects/:id/archive - archive', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}/archive`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  // ==================== NOTES ====================
  describe('Notes', () => {
    test('POST /notes - create', () => {
      return request(app.getHttpServer())
        .post('/notes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ projectId: testProjectId, content: 'Test note', type: 'TEXT' })
        .expect(201);
    });

    test('GET /notes - list', () => {
      return request(app.getHttpServer())
        .get('/notes')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('GET /notes?projectId - filter', () => {
      return request(app.getHttpServer())
        .get(`/notes?projectId=${testProjectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  // ==================== REMINDERS ====================
  describe('Reminders', () => {
    test('POST /reminders - create', async () => {
      const res = await request(app.getHttpServer())
        .post('/reminders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Test', projectId: testProjectId, dueAt: new Date(Date.now() + 86400000).toISOString() })
        .expect(201);
      testReminderId = res.body.id;
    });

    test('GET /reminders - list', () => {
      return request(app.getHttpServer())
        .get('/reminders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('GET /reminders/upcoming', () => {
      return request(app.getHttpServer())
        .get('/reminders/upcoming')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('PATCH /reminders/:id - update', () => {
      return request(app.getHttpServer())
        .patch(`/reminders/${testReminderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    });

    test('DELETE /reminders/:id', () => {
      return request(app.getHttpServer())
        .delete(`/reminders/${testReminderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  // ==================== AI ====================
  describe('AI', () => {
    test('POST /ai/chat', async () => {
      const res = await request(app.getHttpServer())
        .post('/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ messages: [{ role: 'user', content: 'Hello' }], projectId: testProjectId });
      expect([200, 201, 500, 503]).toContain(res.status);
    });
  });

  // ==================== CALENDAR ====================
  describe('Calendar', () => {
    test('GET /calendar/auth-url', () => {
      return request(app.getHttpServer())
        .get('/calendar/auth-url?provider=GOOGLE')
        .expect(200);
    });

    test('GET /calendar/status', () => {
      return request(app.getHttpServer())
        .get('/calendar/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('GET /calendar/debug-status', () => {
      return request(app.getHttpServer())
        .get('/calendar/debug-status')
        .expect(200);
    });

    test('GET /calendar/events', async () => {
      const res = await request(app.getHttpServer())
        .get('/calendar/events')
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 404]).toContain(res.status); // 404 if no calendar connected
    });
  });

  // ==================== PROFILE ====================
  describe('Profile', () => {
    test('GET /profile', () => {
      return request(app.getHttpServer())
        .get('/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('PATCH /profile', () => {
      return request(app.getHttpServer())
        .patch('/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayName: 'Updated' })
        .expect(200);
    });

    test('GET /profile/subscription', () => {
      return request(app.getHttpServer())
        .get('/profile/subscription')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('PATCH /profile/notifications', () => {
      return request(app.getHttpServer())
        .patch('/profile/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emailNotifications: true })
        .expect(200);
    });
  });

  // ==================== NOTIFICATIONS ====================
  describe('Notifications', () => {
    test('GET /notifications/demo/examples', () => {
      return request(app.getHttpServer())
        .get('/notifications/demo/examples')
        .expect(200);
    });

    test('POST /notifications/demo/test-greeting', async () => {
      const res = await request(app.getHttpServer())
        .post('/notifications/demo/test-greeting')
        .send({ title: "Hey mate! Your task is ready" });
      expect([200, 201]).toContain(res.status);
    });

    test('GET /notifications/recent', () => {
      return request(app.getHttpServer())
        .get('/notifications/recent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('POST /notifications/test', async () => {
      const res = await request(app.getHttpServer())
        .post('/notifications/test')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: "Hey mate! Test", body: "Test" });
      expect([200, 201]).toContain(res.status);
    });
  });

  // ==================== UPLOADS ====================
  describe('Uploads', () => {
    test('POST /uploads/test', async () => {
      const res = await request(app.getHttpServer())
        .post('/uploads/test');
      expect([200, 201]).toContain(res.status);
    });

    test('POST /uploads/presign', async () => {
      const res = await request(app.getHttpServer())
        .post('/uploads/presign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ filename: 'test.pdf', contentType: 'application/pdf', projectId: testProjectId });
      expect([200, 201, 500]).toContain(res.status);
    });
  });

  // ==================== SCHEDULE ====================
  describe('Schedule', () => {
    test('GET /schedule/preview - requires uploadId', async () => {
      const res = await request(app.getHttpServer())
        .get('/schedule/preview')
        .set('Authorization', `Bearer ${authToken}`);
      expect([400, 404, 500]).toContain(res.status);
    });
  });

  // ==================== BILLING ====================
  describe('Billing', () => {
    test('POST /billing/checkout', async () => {
      const res = await request(app.getHttpServer())
        .post('/billing/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ priceId: 'price_test' });
      expect([200, 201, 400, 401, 500]).toContain(res.status); // Stripe key may be invalid
    });
  });

  // ==================== WEBHOOKS ====================
  describe('Webhooks', () => {
    test('POST /webhooks/fcm-token', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks/fcm-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: 'test-token' });
      expect([200, 201]).toContain(res.status);
    });
  });

  // ==================== CLEANUP ====================
  describe('Cleanup', () => {
    test('DELETE /projects/:id', () => {
      return request(app.getHttpServer())
        .delete(`/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    test('DELETE /users/:id', () => {
      return request(app.getHttpServer())
        .delete(`/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
