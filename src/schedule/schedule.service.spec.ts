import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleService } from './schedule.service';
import { DatabaseService } from '../database/database.service';
import { CalendarService } from '../calendar/calendar.service';
import { RemindersService } from '../reminders/reminders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PdfScheduleParseService } from './pdf-schedule-parse.service';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let mockDb: jest.Mocked<DatabaseService>;
  let mockCalendarService: jest.Mocked<CalendarService>;
  let mockRemindersService: jest.Mocked<RemindersService>;
  let mockNotificationsService: jest.Mocked<NotificationsService>;
  let mockPdfParseService: jest.Mocked<PdfScheduleParseService>;

  beforeEach(async () => {
    const mockDbService = {
      upload: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      event: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      auditEvent: {
        create: jest.fn(),
      },
    } as any;

    const mockCalendar = {
      createEvent: jest.fn(),
    } as any;

    const mockReminders = {
      create: jest.fn(),
    } as any;

    const mockNotifications = {
      sendNotification: jest.fn(),
      sendPushNotificationPublic: jest.fn(),
    } as any;

    const mockPdfParse = {
      parseScheduleFromUpload: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: CalendarService, useValue: mockCalendar },
        { provide: RemindersService, useValue: mockReminders },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: PdfScheduleParseService, useValue: mockPdfParse },
      ],
    }).compile();

    service = module.get<ScheduleService>(ScheduleService);
    mockDb = module.get(DatabaseService);
    mockCalendarService = module.get(CalendarService);
    mockRemindersService = module.get(RemindersService);
    mockNotificationsService = module.get(NotificationsService);
    mockPdfParseService = module.get(PdfScheduleParseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('commitSchedule', () => {
    const mockCommitDto = {
      uploadId: 'test-upload',
      projectId: 'test-project',
      blocks: [
        {
          title: 'Test Meeting',
          description: 'A test meeting',
          startsAt: '2025-09-26T09:00:00Z',
          endsAt: '2025-09-26T10:00:00Z',
          tags: ['Morning'],
        },
        {
          title: 'Short Break',
          startsAt: '2025-09-26T15:00:00Z',
          endsAt: '2025-09-26T15:15:00Z',
        },
      ],
    };

    beforeEach(() => {
      (mockDb.upload.findFirst as jest.Mock).mockResolvedValue({
        id: 'test-upload',
        projectId: 'test-project',
        userId: 'test-user',
      });

      (mockDb.event.findFirst as jest.Mock).mockResolvedValue(null); // No duplicates
      (mockDb.event.create as jest.Mock).mockResolvedValue({
        id: 'event-1',
        title: 'Test Meeting',
        startsAt: new Date('2025-09-26T09:00:00Z'),
        endsAt: new Date('2025-09-26T10:00:00Z'),
      });

      (mockCalendarService.createEvent as jest.Mock).mockResolvedValue({
        id: 'cal-event-1',
        summary: 'Test Meeting',
      });

      (mockRemindersService.create as jest.Mock).mockResolvedValue({
        id: 'reminder-1',
        projectId: 'test-project',
        userId: 'test-user',
        title: 'Reminder: Test Meeting',
        dueAt: new Date('2025-09-26T08:45:00Z'),
        status: 'PENDING',
        recurrenceJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      (mockDb.auditEvent.create as jest.Mock).mockResolvedValue({});
    });

    it('should create events and reminders successfully', async () => {
      const result = await service.commitSchedule('test-user', mockCommitDto);

      expect(result.createdEvents).toHaveLength(2);
      expect(result.createdReminders).toHaveLength(2);
      expect(result.importHash).toBeDefined();

      expect(mockDb.event.create).toHaveBeenCalledTimes(2);
      expect(mockRemindersService.create).toHaveBeenCalledTimes(2);
      expect(mockNotificationsService.sendPushNotificationPublic).toHaveBeenCalledTimes(2);
    });

    it('should calculate correct reminder times', async () => {
      await service.commitSchedule('test-user', mockCommitDto);

      // First call should be for 60-minute meeting (15min lead time)
      expect(mockRemindersService.create).toHaveBeenNthCalledWith(1, 'test-user', {
        title: 'Reminder: Test Meeting',
        dueAt: '2025-09-26T08:45:00.000Z', // 15 minutes before 9 AM
        projectId: 'test-project',
      });

      // Second call should be for 15-minute break (5min lead time)
      expect(mockRemindersService.create).toHaveBeenNthCalledWith(2, 'test-user', {
        title: 'Reminder: Short Break',
        dueAt: '2025-09-26T14:55:00.000Z', // 5 minutes before 3 PM
        projectId: 'test-project',
      });
    });

    it('should handle dry run mode', async () => {
      const dryRunDto = { ...mockCommitDto, dryRun: true };
      
      const result = await service.commitSchedule('test-user', dryRunDto);

      expect(result.createdEvents).toHaveLength(2);
      expect(result.createdReminders).toHaveLength(2);
      expect(result.createdEvents[0].status).toBe('dry-run');
      expect(result.createdReminders[0].status).toBe('dry-run');

      // Should not create actual records in dry run
      expect(mockDb.event.create).not.toHaveBeenCalled();
      expect(mockRemindersService.create).not.toHaveBeenCalled();
    });

    it('should prevent duplicate imports', async () => {
      // Mock existing event
      (mockDb.event.findFirst as jest.Mock).mockResolvedValue({
        id: 'existing-event',
        title: 'Test Meeting',
        startsAt: new Date('2025-09-26T09:00:00Z'),
      });

      const result = await service.commitSchedule('test-user', mockCommitDto);

      // Should skip duplicates
      expect(result.createdEvents.length).toBeLessThan(2);
    });

    it('should create audit event', async () => {
      await service.commitSchedule('test-user', mockCommitDto);

      expect(mockDb.auditEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'test-user',
          action: 'SCHEDULE_IMPORT',
          entity: 'SCHEDULE',
          entityId: 'test-upload',
          metaJson: expect.objectContaining({
            projectId: 'test-project',
            eventsCreated: expect.any(Number),
            remindersCreated: expect.any(Number),
            importHash: expect.any(String),
          }),
        },
      });
    });
  });

  describe('reminder time calculation', () => {
    it('should use 15 minutes for events >= 30 minutes', () => {
      const startsAt = '2025-09-26T09:00:00Z';
      const endsAt = '2025-09-26T10:00:00Z'; // 60 minutes

      const reminderTime = (service as any).calculateReminderTime(startsAt, endsAt);
      
      expect(reminderTime.toISOString()).toBe('2025-09-26T08:45:00.000Z');
    });

    it('should use 5 minutes for events < 30 minutes', () => {
      const startsAt = '2025-09-26T15:00:00Z';
      const endsAt = '2025-09-26T15:15:00Z'; // 15 minutes

      const reminderTime = (service as any).calculateReminderTime(startsAt, endsAt);
      
      expect(reminderTime.toISOString()).toBe('2025-09-26T14:55:00.000Z');
    });
  });

  describe('import hash generation', () => {
    it('should generate consistent hashes for same input', () => {
      const dto1 = {
        projectId: 'project1',
        blocks: [{ title: 'Meeting', startsAt: '2025-09-26T09:00:00Z', endsAt: '2025-09-26T10:00:00Z' }],
      };
      const dto2 = {
        projectId: 'project1',
        blocks: [{ title: 'Meeting', startsAt: '2025-09-26T09:00:00Z', endsAt: '2025-09-26T10:00:00Z' }],
      };

      const hash1 = (service as any).generateImportHash(dto1);
      const hash2 = (service as any).generateImportHash(dto2);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const dto1 = {
        projectId: 'project1',
        blocks: [{ title: 'Meeting', startsAt: '2025-09-26T09:00:00Z', endsAt: '2025-09-26T10:00:00Z' }],
      };
      const dto2 = {
        projectId: 'project2',
        blocks: [{ title: 'Meeting', startsAt: '2025-09-26T09:00:00Z', endsAt: '2025-09-26T10:00:00Z' }],
      };

      const hash1 = (service as any).generateImportHash(dto1);
      const hash2 = (service as any).generateImportHash(dto2);

      expect(hash1).not.toBe(hash2);
    });
  });
});