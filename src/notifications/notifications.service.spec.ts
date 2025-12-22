import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

// Mock Firebase Admin before importing the service
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
  messaging: () => ({
    send: jest.fn(),
  }),
}));

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue('mock-value'),
    };

    const mockDatabaseService = {
      user: {
        findUnique: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('greeting prefix validation', () => {
    it('should validate correct greeting prefixes', () => {
      const validTitles = [
        'Hey mate! Your reminder is due',
        'G\'day Mate, time for your meeting',
        'Hey mate! Event created successfully',
        'G\'day Mate, your schedule is ready',
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
        'hey mate your reminder', // missing exclamation
        'G\'day mate your meeting', // wrong capitalization
      ];

      invalidTitles.forEach(title => {
        expect(NotificationsService.validateGreetingPrefix(title)).toBe(false);
      });
    });

    it('should enforce greeting prefix in notifications', async () => {
      const invalidTitle = 'Your reminder is due';
      
      await expect(
        service.testGreetingEnforcement(invalidTitle)
      ).rejects.toThrow('Push notification title must start with "Hey mate!" or "G\'day Mate,"');
    });

    it('should pass through valid greeting prefixes unchanged', async () => {
      const validTitle = 'Hey mate! Your reminder is due';
      
      const result = await service.testGreetingEnforcement(validTitle);
      expect(result).toBe(validTitle);
    });
  });

  describe('prefix regex pattern', () => {
    it('should match the exact required pattern', () => {
      const pattern = /^(Hey mate!|G'day Mate,)\s/;
      
      // Should match
      expect(pattern.test('Hey mate! Your reminder')).toBe(true);
      expect(pattern.test('G\'day Mate, your meeting')).toBe(true);
      
      // Should not match
      expect(pattern.test('Hey mate your reminder')).toBe(false); // missing !
      expect(pattern.test('G\'day Mate your meeting')).toBe(false); // missing ,
      expect(pattern.test('hey mate! your reminder')).toBe(false); // wrong case
      expect(pattern.test('Hello mate! your reminder')).toBe(false); // wrong greeting
    });
  });
});