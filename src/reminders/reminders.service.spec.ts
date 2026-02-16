import { Test, TestingModule } from '@nestjs/testing';
import { RemindersService } from './reminders.service';
import { DatabaseService } from '../database/database.service';

describe('RemindersService - Timezone Handling', () => {
  let service: RemindersService;
  let db: DatabaseService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    notifPrefs: { timezone: 'Asia/Karachi' },
  };

  const mockProject = {
    id: 'project-123',
    ownerId: 'user-123',
    name: 'Test Project',
  };

  const mockReminder = {
    id: 'reminder-123',
    title: 'Test Reminder',
    dueAt: new Date('2026-02-16T12:30:00.000Z'), // 5:30 PM in Asia/Karachi (UTC+5)
    projectId: 'project-123',
    userId: 'user-123',
    status: 'PENDING',
    recurrenceJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        {
          provide: DatabaseService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
            project: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
            },
            reminder: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<RemindersService>(RemindersService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  describe('create', () => {
    it('should create reminder and return formatted time in user timezone', async () => {
      jest.spyOn(db.project, 'findFirst').mockResolvedValue(mockProject as any);
      jest.spyOn(db.reminder, 'create').mockResolvedValue(mockReminder as any);
      jest.spyOn(db.user, 'findUnique').mockResolvedValue(mockUser as any);

      const result = await service.create('user-123', {
        title: 'Test Reminder',
        dueAt: '2026-02-16T12:30:00.000Z',
        projectId: 'project-123',
      });

      expect(result.dueAt).toEqual(mockReminder.dueAt);
      expect(result.timezone).toBe('Asia/Karachi');
      expect(result.dueAtFormatted).toContain('5:30 PM'); // Should show local time
      expect(result.dueAtFormatted).toContain('Feb 16');
    });

    it('should handle UTC timezone when user has no timezone preference', async () => {
      const userWithoutTimezone = { ...mockUser, notifPrefs: {} };
      jest.spyOn(db.project, 'findFirst').mockResolvedValue(mockProject as any);
      jest.spyOn(db.reminder, 'create').mockResolvedValue(mockReminder as any);
      jest.spyOn(db.user, 'findUnique').mockResolvedValue(userWithoutTimezone as any);

      const result = await service.create('user-123', {
        title: 'Test Reminder',
        dueAt: '2026-02-16T12:30:00.000Z',
        projectId: 'project-123',
      });

      expect(result.timezone).toBe('UTC');
      expect(result.dueAtFormatted).toContain('12:30 PM'); // Should show UTC time
    });
  });

  describe('list', () => {
    it('should return all reminders with formatted times', async () => {
      const reminders = [mockReminder, { ...mockReminder, id: 'reminder-456' }];
      jest.spyOn(db.reminder, 'findMany').mockResolvedValue(reminders as any);
      jest.spyOn(db.user, 'findUnique').mockResolvedValue(mockUser as any);

      const result = await service.list('user-123');

      expect(result).toHaveLength(2);
      expect(result[0].dueAtFormatted).toContain('5:30 PM');
      expect(result[0].timezone).toBe('Asia/Karachi');
      expect(result[1].dueAtFormatted).toContain('5:30 PM');
    });

    it('should filter by projectId when provided', async () => {
      jest.spyOn(db.reminder, 'findMany').mockResolvedValue([mockReminder] as any);
      jest.spyOn(db.user, 'findUnique').mockResolvedValue(mockUser as any);

      await service.list('user-123', 'project-123');

      expect(db.reminder.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          projectId: 'project-123',
        },
        orderBy: { dueAt: 'asc' },
      });
    });
  });

  describe('timezone formatting', () => {
    it('should correctly format time for different timezones', async () => {
      const timezones = [
        { tz: 'Asia/Karachi', expected: '5:30 PM' }, // UTC+5
        { tz: 'America/New_York', expected: '7:30 AM' }, // UTC-5
        { tz: 'Europe/London', expected: '12:30 PM' }, // UTC+0
        { tz: 'Australia/Sydney', expected: '11:30 PM' }, // UTC+11
      ];

      for (const { tz, expected } of timezones) {
        const userWithTz = { ...mockUser, notifPrefs: { timezone: tz } };
        jest.spyOn(db.project, 'findFirst').mockResolvedValue(mockProject as any);
        jest.spyOn(db.reminder, 'create').mockResolvedValue(mockReminder as any);
        jest.spyOn(db.user, 'findUnique').mockResolvedValue(userWithTz as any);

        const result = await service.create('user-123', {
          title: 'Test Reminder',
          dueAt: '2026-02-16T12:30:00.000Z',
          projectId: 'project-123',
        });

        expect(result.timezone).toBe(tz);
        expect(result.dueAtFormatted).toContain(expected);
      }
    });
  });
});
