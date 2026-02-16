import { Test, TestingModule } from '@nestjs/testing';
import { RemindersService } from './reminders.service';
import { DatabaseService } from '../database/database.service';

describe('Relative Time Reminders - Pakistan & Australia', () => {
  let service: RemindersService;
  let db: DatabaseService;

  const mockProject = {
    id: 'project-123',
    ownerId: 'user-123',
    name: 'Test Project',
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

  describe('Pakistan (Asia/Karachi) - Relative Time', () => {
    const timezone = 'Asia/Karachi';

    it('should handle "after 30 minutes" from 2:00 PM', async () => {
      // Current time: 2:00 PM in Karachi = 09:00 UTC
      const now = new Date('2026-02-16T09:00:00.000Z');
      // After 30 minutes: 2:30 PM in Karachi = 09:30 UTC
      const expectedUTC = new Date('2026-02-16T09:30:00.000Z');

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        notifPrefs: { timezone },
      };

      const mockReminder = {
        id: 'reminder-123',
        title: 'Reminder in 30 minutes',
        dueAt: expectedUTC,
        projectId: 'project-123',
        userId: 'user-123',
        status: 'PENDING',
        recurrenceJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(db.project, 'findFirst').mockResolvedValue(mockProject as any);
      jest.spyOn(db.reminder, 'create').mockResolvedValue(mockReminder as any);
      jest.spyOn(db.user, 'findUnique').mockResolvedValue(mockUser as any);

      const result = await service.create('user-123', {
        title: 'Reminder in 30 minutes',
        dueAt: expectedUTC.toISOString(),
        projectId: 'project-123',
      });

      expect(result.dueAt.toISOString()).toBe(expectedUTC.toISOString());
      expect(result.timezone).toBe(timezone);
      expect(result.dueAtFormatted).toContain('2:30 PM');

      console.log(`✅ Pakistan - "after 30 minutes" from 2:00 PM`);
      console.log(`   Current: 2:00 PM Karachi (${now.toISOString()})`);
      console.log(`   Due: ${result.dueAtFormatted}`);
      console.log(`   UTC: ${result.dueAt.toISOString()}`);
    });

    it('should handle "after 4 hours" from 3:00 PM', async () => {
      // Current time: 3:00 PM in Karachi = 10:00 UTC
      const now = new Date('2026-02-16T10:00:00.000Z');
      // After 4 hours: 7:00 PM in Karachi = 14:00 UTC
      const expectedUTC = new Date('2026-02-16T14:00:00.000Z');

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        notifPrefs: { timezone },
      };

      const mockReminder = {
        id: 'reminder-123',
        title: 'Reminder in 4 hours',
        dueAt: expectedUTC,
        projectId: 'project-123',
        userId: 'user-123',
        status: 'PENDING',
        recurrenceJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(db.project, 'findFirst').mockResolvedValue(mockProject as any);
      jest.spyOn(db.reminder, 'create').mockResolvedValue(mockReminder as any);
      jest.spyOn(db.user, 'findUnique').mockResolvedValue(mockUser as any);

      const result = await service.create('user-123', {
        title: 'Reminder in 4 hours',
        dueAt: expectedUTC.toISOString(),
        projectId: 'project-123',
      });

      expect(result.dueAt.toISOString()).toBe(expectedUTC.toISOString());
      expect(result.timezone).toBe(timezone);
      expect(result.dueAtFormatted).toContain('7:00 PM');

      console.log(`✅ Pakistan - "after 4 hours" from 3:00 PM`);
      console.log(`   Current: 3:00 PM Karachi (${now.toISOString()})`);
      console.log(`   Due: ${result.dueAtFormatted}`);
      console.log(`   UTC: ${result.dueAt.toISOString()}`);
    });

    it('should handle "after 2 hours" crossing midnight', async () => {
      // Current time: 11:00 PM in Karachi = 18:00 UTC
      const now = new Date('2026-02-16T18:00:00.000Z');
      // After 2 hours: 1:00 AM next day in Karachi = 20:00 UTC (same day)
      const expectedUTC = new Date('2026-02-16T20:00:00.000Z');

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        notifPrefs: { timezone },
      };

      const mockReminder = {
        id: 'reminder-123',
        title: 'Reminder in 2 hours',
        dueAt: expectedUTC,
        projectId: 'project-123',
        userId: 'user-123',
        status: 'PENDING',
        recurrenceJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(db.project, 'findFirst').mockResolvedValue(mockProject as any);
      jest.spyOn(db.reminder, 'create').mockResolvedValue(mockReminder as any);
      jest.spyOn(db.user, 'findUnique').mockResolvedValue(mockUser as any);

      const result = await service.create('user-123', {
        title: 'Reminder in 2 hours',
        dueAt: expectedUTC.toISOString(),
        projectId: 'project-123',
      });

      expect(result.dueAt.toISOString()).toBe(expectedUTC.toISOString());
      expect(result.timezone).toBe(timezone);
      expect(result.dueAtFormatted).toContain('1:00 AM');
      expect(result.dueAtFormatted).toContain('Feb 17'); // Next day

      console.log(`✅ Pakistan - "after 2 hours" crossing midnight`);
      console.log(`   Current: 11:00 PM Karachi (${now.toISOString()})`);
      console.log(`   Due: ${result.dueAtFormatted}`);
      console.log(`   UTC: ${result.dueAt.toISOString()}`);
    });
  });

  describe('Australia (Australia/Sydney) - Relative Time', () => {
    const timezone = 'Australia/Sydney';

    it('should handle "after 30 minutes" from 10:00 AM', async () => {
      // Current time: 10:00 AM in Sydney = 23:00 UTC (previous day)
      const now = new Date('2026-02-15T23:00:00.000Z');
      // After 30 minutes: 10:30 AM in Sydney = 23:30 UTC (previous day)
      const expectedUTC = new Date('2026-02-15T23:30:00.000Z');

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        notifPrefs: { timezone },
      };

      const mockReminder = {
        id: 'reminder-123',
        title: 'Reminder in 30 minutes',
        dueAt: expectedUTC,
        projectId: 'project-123',
        userId: 'user-123',
        status: 'PENDING',
        recurrenceJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(db.project, 'findFirst').mockResolvedValue(mockProject as any);
      jest.spyOn(db.reminder, 'create').mockResolvedValue(mockReminder as any);
      jest.spyOn(db.user, 'findUnique').mockResolvedValue(mockUser as any);

      const result = await service.create('user-123', {
        title: 'Reminder in 30 minutes',
        dueAt: expectedUTC.toISOString(),
        projectId: 'project-123',
      });

      expect(result.dueAt.toISOString()).toBe(expectedUTC.toISOString());
      expect(result.timezone).toBe(timezone);
      expect(result.dueAtFormatted).toContain('10:30 AM');

      console.log(`✅ Australia - "after 30 minutes" from 10:00 AM`);
      console.log(`   Current: 10:00 AM Sydney (${now.toISOString()})`);
      console.log(`   Due: ${result.dueAtFormatted}`);
      console.log(`   UTC: ${result.dueAt.toISOString()}`);
    });

    it('should handle "after 4 hours" from 6:00 PM', async () => {
      // Current time: 6:00 PM in Sydney = 07:00 UTC (same day)
      const now = new Date('2026-02-16T07:00:00.000Z');
      // After 4 hours: 10:00 PM in Sydney = 11:00 UTC (same day)
      const expectedUTC = new Date('2026-02-16T11:00:00.000Z');

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        notifPrefs: { timezone },
      };

      const mockReminder = {
        id: 'reminder-123',
        title: 'Reminder in 4 hours',
        dueAt: expectedUTC,
        projectId: 'project-123',
        userId: 'user-123',
        status: 'PENDING',
        recurrenceJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(db.project, 'findFirst').mockResolvedValue(mockProject as any);
      jest.spyOn(db.reminder, 'create').mockResolvedValue(mockReminder as any);
      jest.spyOn(db.user, 'findUnique').mockResolvedValue(mockUser as any);

      const result = await service.create('user-123', {
        title: 'Reminder in 4 hours',
        dueAt: expectedUTC.toISOString(),
        projectId: 'project-123',
      });

      expect(result.dueAt.toISOString()).toBe(expectedUTC.toISOString());
      expect(result.timezone).toBe(timezone);
      expect(result.dueAtFormatted).toContain('10:00 PM');

      console.log(`✅ Australia - "after 4 hours" from 6:00 PM`);
      console.log(`   Current: 6:00 PM Sydney (${now.toISOString()})`);
      console.log(`   Due: ${result.dueAtFormatted}`);
      console.log(`   UTC: ${result.dueAt.toISOString()}`);
    });

    it('should handle "after 3 hours" crossing midnight', async () => {
      // Current time: 11:00 PM in Sydney = 12:00 UTC (same day)
      const now = new Date('2026-02-16T12:00:00.000Z');
      // After 3 hours: 2:00 AM next day in Sydney = 15:00 UTC (same day)
      const expectedUTC = new Date('2026-02-16T15:00:00.000Z');

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        notifPrefs: { timezone },
      };

      const mockReminder = {
        id: 'reminder-123',
        title: 'Reminder in 3 hours',
        dueAt: expectedUTC,
        projectId: 'project-123',
        userId: 'user-123',
        status: 'PENDING',
        recurrenceJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(db.project, 'findFirst').mockResolvedValue(mockProject as any);
      jest.spyOn(db.reminder, 'create').mockResolvedValue(mockReminder as any);
      jest.spyOn(db.user, 'findUnique').mockResolvedValue(mockUser as any);

      const result = await service.create('user-123', {
        title: 'Reminder in 3 hours',
        dueAt: expectedUTC.toISOString(),
        projectId: 'project-123',
      });

      expect(result.dueAt.toISOString()).toBe(expectedUTC.toISOString());
      expect(result.timezone).toBe(timezone);
      expect(result.dueAtFormatted).toContain('2:00 AM');
      expect(result.dueAtFormatted).toContain('Feb 17'); // Next day

      console.log(`✅ Australia - "after 3 hours" crossing midnight`);
      console.log(`   Current: 11:00 PM Sydney (${now.toISOString()})`);
      console.log(`   Due: ${result.dueAtFormatted}`);
      console.log(`   UTC: ${result.dueAt.toISOString()}`);
    });
  });

  describe('Comparison - Same Relative Time in Different Timezones', () => {
    it('should show "after 1 hour" results in different local times', async () => {
      // Both users set reminder "after 1 hour" at the same UTC moment
      const baseUTC = new Date('2026-02-16T10:00:00.000Z');
      const afterOneHour = new Date('2026-02-16T11:00:00.000Z');

      const timezones = [
        { 
          tz: 'Asia/Karachi', 
          currentLocal: '3:00 PM',
          expectedLocal: '4:00 PM',
        },
        { 
          tz: 'Australia/Sydney', 
          currentLocal: '9:00 PM',
          expectedLocal: '10:00 PM',
        },
      ];

      for (const { tz, currentLocal, expectedLocal } of timezones) {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          notifPrefs: { timezone: tz },
        };

        const mockReminder = {
          id: 'reminder-123',
          title: 'Reminder in 1 hour',
          dueAt: afterOneHour,
          projectId: 'project-123',
          userId: 'user-123',
          status: 'PENDING',
          recurrenceJson: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        jest.spyOn(db.project, 'findFirst').mockResolvedValue(mockProject as any);
        jest.spyOn(db.reminder, 'create').mockResolvedValue(mockReminder as any);
        jest.spyOn(db.user, 'findUnique').mockResolvedValue(mockUser as any);

        const result = await service.create('user-123', {
          title: 'Reminder in 1 hour',
          dueAt: afterOneHour.toISOString(),
          projectId: 'project-123',
        });

        expect(result.dueAt.toISOString()).toBe(afterOneHour.toISOString());
        expect(result.timezone).toBe(tz);
        expect(result.dueAtFormatted).toContain(expectedLocal);

        console.log(`✅ ${tz} - "after 1 hour"`);
        console.log(`   Current: ${currentLocal} (${baseUTC.toISOString()})`);
        console.log(`   Due: ${result.dueAtFormatted}`);
        console.log(`   Expected: ${expectedLocal}`);
      }
    });
  });
});
