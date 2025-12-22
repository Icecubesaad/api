import { Test, TestingModule } from '@nestjs/testing';
import { ReminderNotificationsService } from './reminder-notifications.service';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ReminderNotificationsService', () => {
  let service: ReminderNotificationsService;
  let mockDatabaseService: any;
  let mockNotificationsService: any;

  beforeEach(async () => {
    mockDatabaseService = {
      reminder: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      notification: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    mockNotificationsService = {
      sendNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderNotificationsService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<ReminderNotificationsService>(ReminderNotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkDueReminders', () => {
    it('should find and process due reminders', async () => {
      const mockReminder = {
        id: 'reminder-1',
        title: 'Reminder: Test Meeting',
        dueAt: new Date(),
        userId: 'user-1',
        projectId: 'project-1',
        status: 'PENDING',
        project: { id: 'project-1', name: 'Test Project' },
      };

      mockDatabaseService.reminder.findMany.mockResolvedValue([mockReminder]);
      mockDatabaseService.notification.findFirst.mockResolvedValue(null); // No existing notification
      mockNotificationsService.sendNotification.mockResolvedValue(undefined);
      mockDatabaseService.notification.create.mockResolvedValue({});

      await service.checkDueReminders();

      expect(mockDatabaseService.reminder.findMany).toHaveBeenCalled();
      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        'user-1',
        'PUSH',
        expect.objectContaining({
          title: expect.stringContaining('Test Meeting'),
          body: 'Your scheduled event is starting soon',
          data: expect.objectContaining({
            type: 'reminder_due',
            reminderId: 'reminder-1',
          }),
        })
      );
    });

    it('should not send duplicate notifications', async () => {
      const mockReminder = {
        id: 'reminder-1',
        title: 'Reminder: Test Meeting',
        dueAt: new Date(),
        userId: 'user-1',
        projectId: 'project-1',
        status: 'PENDING',
        project: { id: 'project-1', name: 'Test Project' },
      };

      mockDatabaseService.reminder.findMany.mockResolvedValue([mockReminder]);
      mockDatabaseService.notification.findFirst.mockResolvedValue({ id: 'existing-notification' });

      await service.checkDueReminders();

      expect(mockNotificationsService.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('sendImmediateReminder', () => {
    it('should send immediate notification for valid reminder', async () => {
      const mockReminder = {
        id: 'reminder-1',
        title: 'Reminder: Test Meeting',
        dueAt: new Date(),
        userId: 'user-1',
        projectId: 'project-1',
        status: 'PENDING',
        project: { id: 'project-1', name: 'Test Project' },
      };

      mockDatabaseService.reminder.findFirst.mockResolvedValue(mockReminder);
      mockNotificationsService.sendNotification.mockResolvedValue(undefined);
      mockDatabaseService.notification.create.mockResolvedValue({});

      const result = await service.sendImmediateReminder('user-1', 'reminder-1');

      expect(result).toEqual({ success: true, message: 'Reminder notification sent' });
      expect(mockNotificationsService.sendNotification).toHaveBeenCalled();
    });

    it('should throw error for non-existent reminder', async () => {
      mockDatabaseService.reminder.findFirst.mockResolvedValue(null);

      await expect(
        service.sendImmediateReminder('user-1', 'non-existent')
      ).rejects.toThrow('Reminder not found or access denied');
    });
  });

  describe('getUpcomingReminders', () => {
    it('should return upcoming reminders for user', async () => {
      const mockReminders = [
        {
          id: 'reminder-1',
          title: 'Test Meeting',
          dueAt: new Date(Date.now() + 60000), // 1 minute from now
          status: 'PENDING',
          project: { id: 'project-1', name: 'Test Project' },
        },
      ];

      mockDatabaseService.reminder.findMany.mockResolvedValue(mockReminders);

      const result = await service.getUpcomingReminders('user-1');

      expect(result).toEqual(mockReminders);
      expect(mockDatabaseService.reminder.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          dueAt: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
          status: 'PENDING',
        },
        orderBy: {
          dueAt: 'asc',
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    });
  });
});