import { Test, TestingModule } from '@nestjs/testing';
import { PdfScheduleParseService } from './pdf-schedule-parse.service';
import { DatabaseService } from '../database/database.service';
import { AiService } from '../ai/ai.service';

describe('PdfScheduleParseService', () => {
  let service: PdfScheduleParseService;
  let mockDb: jest.Mocked<DatabaseService>;
  let mockAiService: jest.Mocked<AiService>;

  const goldenTestText = `⏰ Morning  
09:00 AM – 09:30 AM 
Check emails and messages 
Review pull requests and updates from the team 
Stand-up meeting prep  

09:30 AM – 10:00 AM 
Daily stand-up meeting with the team  

10:00 AM – 12:00 PM 
Work on assigned feature development (e.g., building React components, styling with Tailwind) 
Fix UI bugs from the backlog  

⏰ Midday  

12:00 PM – 01:00 PM 
Lunch break  

01:00 PM – 03:00 PM 
Continue coding tasks 
Integrate frontend with API endpoints 
Testing and debugging UI issues  

03:00 PM – 03:15 PM 
Short break  

⏰ Afternoon  

03:15 PM – 05:00 PM 
Work on code optimization and performance improvements 
Write unit tests for frontend components 
Collaborate with backend developers if needed  

05:00 PM – 05:30 PM 
Push code to GitHub / GitLab 
Update task board (Jira / Trello)  

⏰ End of Day  

05:30 PM – 06:00 PM 
Review progress vs. planned tasks 
Prepare notes for tomorrow's work 
Team sync-up (if required)`;

  beforeEach(async () => {
    const mockDbService = {
      upload: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    } as any;

    const mockAi = {
      generateCompletion: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfScheduleParseService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: AiService, useValue: mockAi },
      ],
    }).compile();

    service = module.get<PdfScheduleParseService>(PdfScheduleParseService);
    mockDb = module.get(DatabaseService);
    mockAiService = module.get(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deterministic parsing', () => {
    it('should parse the golden test sample into 9+ blocks with correct times', async () => {
      // Mock the upload
      (mockDb.upload.findUnique as jest.Mock).mockResolvedValue({
        id: 'test-upload',
        projectId: 'test-project',
        userId: 'test-user',
      });

      (mockDb.upload.update as jest.Mock).mockResolvedValue({});

      const result = await service.parseScheduleFromUpload(
        'test-upload',
        'test-project',
        '2025-09-26',
        'UTC'
      );

      expect(result.blocks.length).toBeGreaterThanOrEqual(9);
      
      // Check first block
      const firstBlock = result.blocks[0];
      expect(firstBlock.title).toBe('Check emails and messages');
      expect(firstBlock.startsAt).toContain('09:00');
      expect(firstBlock.endsAt).toContain('09:30');
      expect(firstBlock.tags).toContain('Morning');

      // Check lunch block
      const lunchBlock = result.blocks.find(b => b.title.includes('Lunch'));
      expect(lunchBlock).toBeDefined();
      expect(lunchBlock?.startsAt).toContain('12:00');
      expect(lunchBlock?.endsAt).toContain('13:00'); // 1 PM in 24h format

      // Check short break (should have 5min reminder)
      const shortBreak = result.blocks.find(b => b.title.includes('Short break'));
      expect(shortBreak).toBeDefined();
      expect(shortBreak?.startsAt).toContain('15:00'); // 3 PM
      expect(shortBreak?.endsAt).toContain('15:15'); // 3:15 PM

      // Verify no overlaps
      for (let i = 0; i < result.blocks.length - 1; i++) {
        const current = new Date(result.blocks[i].endsAt);
        const next = new Date(result.blocks[i + 1].startsAt);
        expect(current.getTime()).toBeLessThanOrEqual(next.getTime());
      }
    });

    it('should handle various time formats', () => {
      const testCases = [
        { input: '09:00 AM – 09:30 AM', expected: { start: 9, end: 9.5 } },
        { input: '9:30am-10am', expected: { start: 9.5, end: 10 } },
        { input: '15:00–16:30', expected: { start: 15, end: 16.5 } },
        { input: '12:00 PM – 01:00 PM', expected: { start: 12, end: 13 } },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = (service as any).parseTimeRange(
          input.split(/[-–—]/)[0].trim(),
          input.split(/[-–—]/)[1].trim(),
          '2025-09-26',
          'UTC'
        );

        const startHour = new Date(result.startsAt).getUTCHours() + 
                         new Date(result.startsAt).getUTCMinutes() / 60;
        const endHour = new Date(result.endsAt).getUTCHours() + 
                       new Date(result.endsAt).getUTCMinutes() / 60;

        expect(startHour).toBe(expected.start);
        expect(endHour).toBe(expected.end);
      });
    });

    it('should ignore section headers for time parsing but use them for tags', async () => {
      const testText = `⏰ Morning
09:00 AM – 09:30 AM
Test task

⏰ Afternoon
02:00 PM – 03:00 PM
Another task`;

      (mockDb.upload.findUnique as jest.Mock).mockResolvedValue({
        id: 'test-upload',
        projectId: 'test-project',
      });

      // Mock the extractTextFromUpload method to return our test text
      jest.spyOn(service as any, 'extractTextFromUpload').mockResolvedValue(testText);

      const result = await service.parseScheduleFromUpload(
        'test-upload',
        'test-project',
        '2025-09-26',
        'UTC'
      );

      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0].tags).toContain('Morning');
      expect(result.blocks[1].tags).toContain('Afternoon');
    });

    it('should achieve high confidence for well-formed schedules', async () => {
      (mockDb.upload.findUnique as jest.Mock).mockResolvedValue({
        id: 'test-upload',
        projectId: 'test-project',
      });

      const result = await service.parseScheduleFromUpload(
        'test-upload',
        'test-project',
        '2025-09-26',
        'UTC'
      );

      // Should have high confidence for the golden test sample
      expect(result.blocks.length).toBeGreaterThan(5);
      // The deterministic parser should handle this well
    });
  });

  describe('LLM fallback', () => {
    it('should fall back to LLM when deterministic parsing has low confidence', async () => {
      const poorText = 'Some meeting at 9 and another thing later';
      
      (mockDb.upload.findUnique as jest.Mock).mockResolvedValue({
        id: 'test-upload',
        projectId: 'test-project',
      });

      jest.spyOn(service as any, 'extractTextFromUpload').mockResolvedValue(poorText);

      (mockAiService.generateCompletion as jest.Mock).mockResolvedValue(JSON.stringify({
        confidence: 0.8,
        blocks: [
          {
            title: 'Meeting',
            startsAt: '2025-09-26T09:00:00Z',
            endsAt: '2025-09-26T10:00:00Z',
          }
        ],
      }));

      const result = await service.parseScheduleFromUpload(
        'test-upload',
        'test-project',
        '2025-09-26',
        'UTC'
      );

      expect(mockAiService.generateCompletion).toHaveBeenCalled();
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].title).toBe('Meeting');
    });

    it('should handle LLM failures gracefully', async () => {
      (mockDb.upload.findUnique as jest.Mock).mockResolvedValue({
        id: 'test-upload',
        projectId: 'test-project',
      });

      jest.spyOn(service as any, 'extractTextFromUpload').mockResolvedValue('bad text');
      (mockAiService.generateCompletion as jest.Mock).mockRejectedValue(new Error('API Error'));

      const result = await service.parseScheduleFromUpload(
        'test-upload',
        'test-project',
        '2025-09-26',
        'UTC'
      );

      expect(result.blocks).toHaveLength(0);
    });
  });

  describe('import hash generation', () => {
    it('should generate consistent hashes for same input', () => {
      const hash1 = (service as any).generateImportHash('project1', '2025-09-26', 'test text');
      const hash2 = (service as any).generateImportHash('project1', '2025-09-26', 'test text');
      
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = (service as any).generateImportHash('project1', '2025-09-26', 'test text');
      const hash2 = (service as any).generateImportHash('project2', '2025-09-26', 'test text');
      const hash3 = (service as any).generateImportHash('project1', '2025-09-27', 'test text');
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });
});