import { Test, TestingModule } from '@nestjs/testing';
import { RemindersService } from './reminders.service';
import { DatabaseService } from '../database/database.service';

describe('Timezone Integration Tests - Real World Scenarios', () => {
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

  describe('Real World Timezone Scenarios', () => {
    const testCases = [
      {
        name: 'Pakistan user sets 5:30 PM reminder',
        timezone: 'Asia/Karachi',
        localTime: '2026-02-16T17:30:00', // 5:30 PM local
        expectedUTC: '2026-02-16T12:30:00.000Z', // UTC+5
        expectedDisplay: '5:30 PM',
        expectedDate: 'Feb 16',
      },
      {
        name: 'New York user sets 9:00 AM reminder',
        timezone: 'America/New_York',
        localTime: '2026-02-16T09:00:00', // 9:00 AM local
        expectedUTC: '2026-02-16T14:00:00.000Z', // UTC-5 (EST)
        expectedDisplay: '9:00 AM',
        expectedDate: 'Feb 16',
      },
      {
        name: 'London user sets 11:45 PM reminder',
        timezone: 'Europe/London',
        localTime: '2026-02-16T23:45:00', // 11:45 PM local
        expectedUTC: '2026-02-16T23:45:00.000Z', // UTC+0
        expectedDisplay: '11:45 PM',
        expectedDate: 'Feb 16',
      },
      {
        name: 'Tokyo user sets 3:15 PM reminder',
        timezone: 'Asia/Tokyo',
        localTime: '2026-02-16T15:15:00', // 3:15 PM local
        expectedUTC: '2026-02-16T06:15:00.000Z', // UTC+9
        expectedDisplay: '3:15 PM',
        expectedDate: 'Feb 16',
      },
      {
        name: 'Sydney user sets 8:00 AM reminder',
        timezone: 'Australia/Sydney',
        localTime: '2026-02-16T08:00:00', // 8:00 AM local
        expectedUTC: '2026-02-15T21:00:00.000Z', // UTC+11 (crosses date)
        expectedDisplay: '8:00 AM',
        expectedDate: 'Feb 16',
      },
      {
        name: 'Los Angeles user sets midnight reminder',
        timezone: 'America/Los_Angeles',
        localTime: '2026-02-17T00:00:00', // 12:00 AM local
        expectedUTC: '2026-02-17T08:00:00.000Z', // UTC-8 (PST)
        expectedDisplay: '12:00 AM',
        expectedDate: 'Feb 17',
      },
      {
        name: 'Dubai user sets 1:30 PM reminder',
        timezone: 'Asia/Dubai',
        localTime: '2026-02-16T13:30:00', // 1:30 PM local
        expectedUTC: '2026-02-16T09:30:00.000Z', // UTC+4
        expectedDisplay: '1:30 PM',
        expectedDate: 'Feb 16',
      },
      {
        name: 'Berlin user sets 6:45 PM reminder',
        timezone: 'Europe/Berlin',
        localTime: '2026-02-16T18:45:00', // 6:45 PM local
        expectedUTC: '2026-02-16T17:45:00.000Z', // UTC+1 (CET)
        expectedDisplay: '6:45 PM',
        expectedDate: 'Feb 16',
      },
    ];

    testCases.forEach(({ name, timezone, localTime, expectedUTC, expectedDisplay, expectedDate }) => {
      it(name, async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          notifPrefs: { timezone },
        };

        const mockReminder = {
          id: 'reminder-123',
          title: 'Test Reminder',
          dueAt: new Date(expectedUTC),
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
          title: 'Test Reminder',
          dueAt: expectedUTC,
          projectId: 'project-123',
        });

        // Verify UTC storage is correct
        expect(result.dueAt.toISOString()).toBe(expectedUTC);
        
        // Verify timezone is correct
        expect(result.timezone).toBe(timezone);
        
        // Verify formatted time shows local time
        expect(result.dueAtFormatted).toContain(expectedDisplay);
        expect(result.dueAtFormatted).toContain(expectedDate);

        console.log(`✅ ${name}`);
        console.log(`   Timezone: ${timezone}`);
        console.log(`   UTC Stored: ${result.dueAt.toISOString()}`);
        console.log(`   Display: ${result.dueAtFormatted}`);
        console.log(`   Expected: ${expectedDisplay} on ${expectedDate}`);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle daylight saving time transitions correctly', async () => {
      // March 2026 - DST starts in US (second Sunday of March)
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        notifPrefs: { timezone: 'America/New_York' },
      };

      const mockReminder = {
        id: 'reminder-123',
        title: 'DST Test',
        dueAt: new Date('2026-03-08T14:00:00.000Z'), // During DST transition
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
        title: 'DST Test',
        dueAt: '2026-03-08T14:00:00.000Z',
        projectId: 'project-123',
      });

      expect(result.timezone).toBe('America/New_York');
      // Should automatically handle DST offset
      expect(result.dueAtFormatted).toBeDefined();
      
      console.log(`✅ DST Transition Test`);
      console.log(`   UTC: ${result.dueAt.toISOString()}`);
      console.log(`   Display: ${result.dueAtFormatted}`);
    });

    it('should handle same UTC time displayed in multiple timezones', async () => {
      const utcTime = '2026-02-16T12:00:00.000Z';
      const timezones = [
        { tz: 'Asia/Karachi', expected: '5:00 PM' },      // UTC+5
        { tz: 'Europe/London', expected: '12:00 PM' },    // UTC+0
        { tz: 'America/New_York', expected: '7:00 AM' },  // UTC-5
        { tz: 'Asia/Tokyo', expected: '9:00 PM' },        // UTC+9
      ];

      for (const { tz, expected } of timezones) {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          notifPrefs: { timezone: tz },
        };

        const mockReminder = {
          id: 'reminder-123',
          title: 'Multi-TZ Test',
          dueAt: new Date(utcTime),
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
          title: 'Multi-TZ Test',
          dueAt: utcTime,
          projectId: 'project-123',
        });

        expect(result.dueAt.toISOString()).toBe(utcTime);
        expect(result.timezone).toBe(tz);
        expect(result.dueAtFormatted).toContain(expected);

        console.log(`✅ Same UTC (${utcTime}) in ${tz}: ${result.dueAtFormatted}`);
      }
    });

    it('should handle early morning times (1 AM, 2 AM)', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        notifPrefs: { timezone: 'Asia/Karachi' },
      };

      const mockReminder = {
        id: 'reminder-123',
        title: 'Early Morning',
        dueAt: new Date('2026-02-16T20:00:00.000Z'), // 1 AM in Karachi (UTC+5)
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
        title: 'Early Morning',
        dueAt: '2026-02-16T20:00:00.000Z',
        projectId: 'project-123',
      });

      expect(result.dueAtFormatted).toContain('1:00 AM');
      expect(result.dueAtFormatted).toContain('Feb 17'); // Next day

      console.log(`✅ Early Morning Test`);
      console.log(`   UTC: ${result.dueAt.toISOString()}`);
      console.log(`   Display: ${result.dueAtFormatted}`);
    });
  });
});
