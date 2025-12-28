import { Test, TestingModule } from '@nestjs/testing';
import { ReminderNotificationsService } from './reminder-notifications.service';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ReminderNotificationsService', () => {
  let service: ReminderNotificationsService;
  let mockDb: any;
  let mockNotifications: any;

  // Test data
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    firebaseUid: 'firebase-123',
    notifPrefs: { fcmToken: 'mock-fcm-token' },
  };

  const mockProject = {
    id: 'project-123',
    name: 'Test Project',
    ownerId: mockUser.id,
  };

  beforeEach(async () => {
    // Create mock database service
    mockDb = {
      reminder: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      notification: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
      },
    };

    // Create mock notifications service
    mockNotifications = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
      sendTemplatePush: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderNotificationsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<ReminderNotificationsService>(ReminderNotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkReminders', () => {
    it('should find and send notifications for due reminders', async () => {
      const now = new Date();
      const dueReminder = {
        id: 'reminder-1',
        title: 'Test Reminder',
        dueAt: new Date(now.getTime() - 30000), // 30 seconds ago
        status: 'PENDING',
        userId: mockUser.id,
        projectId: mockProject.id,
        project: mockProject,
      };

      // Mock: Find due reminders
      mockDb.reminder.findMany.mockResolvedValue([dueReminder]);
      
      // Mock: No existing notification (not yet notified)
      mockDb.notification.findFirst.mockResolvedValue(null);
      
      // Mock: Create notification record
      mockDb.notification.create.mockResolvedValue({ id: 'notif-1' });

      // Execute the cron job
      await service.checkReminders();

      // Verify reminder query was called with correct time range
      expect(mockDb.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
            dueAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );

      // Verify notification was sent
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        mockUser.id,
        'PUSH',
        expect.objectContaining({
          title: expect.stringContaining('Test Reminder'),
          body: expect.any(String),
          data: expect.objectContaining({
            type: 'reminder_due',
            reminderId: 'reminder-1',
          }),
        }),
      );

      // Verify notification record was created
      expect(mockDb.notification.create).toHaveBeenCalled();
    });

    it('should NOT send duplicate notifications for already notified reminders', async () => {
      const now = new Date();
      const dueReminder = {
        id: 'reminder-1',
        title: 'Already Notified Reminder',
        dueAt: new Date(now.getTime() - 30000),
        status: 'PENDING',
        userId: mockUser.id,
        projectId: mockProject.id,
        project: mockProject,
      };

      // Mock: Find due reminders
      mockDb.reminder.findMany.mockResolvedValue([dueReminder]);
      
      // Mock: Existing notification found (already notified)
      mockDb.notification.findFirst.mockResolvedValue({ id: 'existing-notif' });

      // Execute the cron job
      await service.checkReminders();

      // Verify notification was NOT sent (already notified)
      expect(mockNotifications.sendNotification).not.toHaveBeenCalled();
    });

    it('should handle multiple due reminders', async () => {
      const now = new Date();
      const dueReminders = [
        {
          id: 'reminder-1',
          title: 'First Reminder',
          dueAt: new Date(now.getTime() - 30000),
          status: 'PENDING',
          userId: mockUser.id,
          projectId: mockProject.id,
          project: mockProject,
        },
        {
          id: 'reminder-2',
          title: 'Second Reminder',
          dueAt: new Date(now.getTime() - 20000),
          status: 'PENDING',
          userId: mockUser.id,
          projectId: mockProject.id,
          project: mockProject,
        },
      ];

      mockDb.reminder.findMany.mockResolvedValue(dueReminders);
      mockDb.notification.findFirst.mockResolvedValue(null); // Not notified
      mockDb.notification.create.mockResolvedValue({ id: 'notif' });

      await service.checkReminders();

      // Both reminders should trigger notifications
      expect(mockNotifications.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('should skip reminders that are not PENDING', async () => {
      // The query already filters by status: 'PENDING'
      // This test verifies the query is correct
      mockDb.reminder.findMany.mockResolvedValue([]);

      await service.checkReminders();

      expect(mockDb.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should handle errors gracefully', async () => {
      mockDb.reminder.findMany.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(service.checkReminders()).resolves.not.toThrow();
    });
  });

  describe('getUpcomingReminders', () => {
    it('should return reminders due in the next 24 hours', async () => {
      const upcomingReminder = {
        id: 'reminder-1',
        title: 'Upcoming Reminder',
        dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        status: 'PENDING',
        userId: mockUser.id,
        project: { id: mockProject.id, name: mockProject.name },
      };

      mockDb.reminder.findMany.mockResolvedValue([upcomingReminder]);

      const result = await service.getUpcomingReminders(mockUser.id);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Upcoming Reminder');
      expect(mockDb.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUser.id,
            status: 'PENDING',
          }),
        }),
      );
    });
  });

  describe('sendImmediateReminder', () => {
    it('should send notification for a specific reminder', async () => {
      const reminder = {
        id: 'reminder-1',
        title: 'Immediate Reminder',
        dueAt: new Date(),
        status: 'PENDING',
        userId: mockUser.id,
        projectId: mockProject.id,
        project: mockProject,
      };

      mockDb.reminder.findFirst.mockResolvedValue(reminder);
      mockDb.notification.create.mockResolvedValue({ id: 'notif-1' });

      const result = await service.sendImmediateReminder(mockUser.id, 'reminder-1');

      expect(result.success).toBe(true);
      expect(mockNotifications.sendNotification).toHaveBeenCalled();
    });

    it('should throw error if reminder not found', async () => {
      mockDb.reminder.findFirst.mockResolvedValue(null);

      await expect(
        service.sendImmediateReminder(mockUser.id, 'non-existent'),
      ).rejects.toThrow('Reminder not found');
    });
  });

  describe('notification content', () => {
    it('should include Australian greeting in notification title', async () => {
      const now = new Date();
      const dueReminder = {
        id: 'reminder-1',
        title: 'Reminder: Team Meeting',
        dueAt: now,
        status: 'PENDING',
        userId: mockUser.id,
        projectId: mockProject.id,
        project: mockProject,
      };

      mockDb.reminder.findMany.mockResolvedValue([dueReminder]);
      mockDb.notification.findFirst.mockResolvedValue(null);
      mockDb.notification.create.mockResolvedValue({ id: 'notif-1' });

      await service.checkReminders();

      // Verify Australian greeting is used
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        mockUser.id,
        'PUSH',
        expect.objectContaining({
          title: expect.stringMatching(/^(Hey mate!|G'day Mate,)/),
        }),
      );
    });
  });
});
