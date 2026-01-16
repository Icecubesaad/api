import { Test, TestingModule } from '@nestjs/testing';
import { RemindersService } from './reminders.service';
import { DatabaseService } from '../database/database.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('RemindersService', () => {
  let service: RemindersService;
  let mockDb: any;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    firebaseUid: 'firebase-123',
  };

  const mockProject = {
    id: 'project-123',
    name: 'Test Project',
    ownerId: 'user-123',
  };

  const mockReminder = {
    id: 'reminder-123',
    title: 'Test Reminder',
    dueAt: new Date('2025-01-15T10:00:00Z'),
    projectId: 'project-123',
    userId: 'user-123',
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = {
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<RemindersService>(RemindersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a reminder when user owns the project', async () => {
      mockDb.project.findFirst.mockResolvedValue(mockProject);
      mockDb.reminder.create.mockResolvedValue(mockReminder);

      const result = await service.create(mockUser.id, {
        title: 'Test Reminder',
        dueAt: '2025-01-15T10:00:00Z',
        projectId: mockProject.id,
      });

      expect(result).toEqual(mockReminder);
      expect(mockDb.reminder.create).toHaveBeenCalledWith({
        data: {
          title: 'Test Reminder',
          dueAt: expect.any(Date),
          projectId: mockProject.id,
          userId: mockUser.id,
        },
      });
    });

    it('should throw ForbiddenException when project not found', async () => {
      mockDb.project.findFirst.mockResolvedValue(null);
      mockDb.project.findUnique.mockResolvedValue(null);

      await expect(
        service.create(mockUser.id, {
          title: 'Test Reminder',
          dueAt: '2025-01-15T10:00:00Z',
          projectId: 'non-existent',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user does not own project', async () => {
      mockDb.project.findFirst.mockResolvedValue(null);
      mockDb.project.findUnique.mockResolvedValue({ ...mockProject, ownerId: 'other-user' });

      await expect(
        service.create(mockUser.id, {
          title: 'Test Reminder',
          dueAt: '2025-01-15T10:00:00Z',
          projectId: mockProject.id,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list', () => {
    it('should list all reminders for a user', async () => {
      const reminders = [mockReminder, { ...mockReminder, id: 'reminder-456' }];
      mockDb.reminder.findMany.mockResolvedValue(reminders);

      const result = await service.list(mockUser.id);

      expect(result).toEqual(reminders);
      expect(mockDb.reminder.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        orderBy: { dueAt: 'asc' },
      });
    });

    it('should filter reminders by projectId', async () => {
      mockDb.reminder.findMany.mockResolvedValue([mockReminder]);

      const result = await service.list(mockUser.id, mockProject.id);

      expect(result).toEqual([mockReminder]);
      expect(mockDb.reminder.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, projectId: mockProject.id },
        orderBy: { dueAt: 'asc' },
      });
    });
  });

  describe('update', () => {
    it('should update reminder status to COMPLETED', async () => {
      mockDb.reminder.findUnique.mockResolvedValue(mockReminder);
      mockDb.reminder.update.mockResolvedValue({
        ...mockReminder,
        status: 'COMPLETED',
      });

      const result = await service.update(mockUser.id, mockReminder.id, {
        status: 'COMPLETED',
      });

      expect(result.status).toBe('COMPLETED');
    });

    it('should throw NotFoundException when reminder not found', async () => {
      mockDb.reminder.findUnique.mockResolvedValue(null);

      await expect(
        service.update(mockUser.id, 'non-existent', { title: 'New Title' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own reminder', async () => {
      mockDb.reminder.findUnique.mockResolvedValue({
        ...mockReminder,
        userId: 'other-user',
      });

      await expect(
        service.update(mockUser.id, mockReminder.id, { title: 'New Title' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete a reminder', async () => {
      mockDb.reminder.findUnique.mockResolvedValue(mockReminder);
      mockDb.reminder.delete.mockResolvedValue(mockReminder);

      await service.remove(mockUser.id, mockReminder.id);

      expect(mockDb.reminder.delete).toHaveBeenCalledWith({
        where: { id: mockReminder.id },
      });
    });

    it('should throw NotFoundException when reminder not found', async () => {
      mockDb.reminder.findUnique.mockResolvedValue(null);

      await expect(
        service.remove(mockUser.id, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
