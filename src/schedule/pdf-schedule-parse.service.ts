import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AiService } from '../ai/ai.service';
import { ParseResult, ParsedBlock, ParsePreview } from './dto/schedule.dto';
import * as crypto from 'crypto';

@Injectable()
export class PdfScheduleParseService {
  private readonly logger = new Logger(PdfScheduleParseService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => AiService))
    private readonly aiService: AiService,
  ) {}

  async parseScheduleFromUpload(
    uploadId: string,
    projectId: string,
    scheduleDate: string,
    tz: string,
  ): Promise<ParsePreview> {
    // Get the upload and extract text
    this.logger.log(`Looking for upload with ID: ${uploadId}`);
    const upload = await this.db.upload.findUnique({
      where: { id: uploadId },
    });

    if (!upload) {
      this.logger.error(`Upload not found with ID: ${uploadId}`);
      throw new Error(`Upload not found with ID: ${uploadId}`);
    }

    this.logger.log(`Found upload: ${upload.id}, created: ${upload.createdAt}`);

    // Get extracted text from upload
    const extractedText = await this.extractTextFromUpload(upload);
    
    if (!extractedText || extractedText.trim().length < 10) {
      throw new Error('Could not extract meaningful text from PDF');
    }
    
    // Generate import hash for idempotency
    const importHash = this.generateImportHash(projectId, scheduleDate, extractedText);
    
    // Use GPT-4 directly to parse the schedule - more accurate than deterministic parsing
    this.logger.log('Sending PDF content to GPT-4 for parsing...');
    const parseResult = await this.gptParsePdf(extractedText, scheduleDate, tz);

    // Update upload with import hash
    await this.db.upload.update({
      where: { id: uploadId },
      data: { 
        parseStatus: 'COMPLETED',
      },
    });

    this.logger.log(`GPT-4 parsed ${parseResult.blocks.length} schedule blocks`);

    return {
      uploadId,
      projectId,
      scheduleDate,
      tz,
      blocks: parseResult.blocks,
      importHash,
    };
  }

  private async gptParsePdf(text: string, scheduleDate: string, tz: string): Promise<ParseResult> {
    const today = new Date();
    const currentYear = today.getFullYear();
    const systemPrompt = `You are a schedule parser. Extract schedule items from text and return COMPACT JSON.

CRITICAL RULES:
1. Extract ALL tasks from ALL days (Mon-Sun)
2. Skip days marked "OFF", "Day Off", "REST", or similar
3. Use EXACT titles from schedule (keep them SHORT)
4. Parse dates correctly - if no year specified, use ${currentYear}
5. IMPORTANT: Default year is ${currentYear}, NOT 2024
6. KEEP RESPONSE UNDER 2000 CHARACTERS - abbreviate titles if needed
7. NO descriptions field - only title, startsAt, endsAt, tags

Return ONLY valid JSON (no markdown, no explanation):
{"confidence":0.9,"blocks":[{"title":"Task Name","startsAt":"${currentYear}-12-23T09:00:00.000Z","endsAt":"${currentYear}-12-23T09:30:00.000Z","tags":["Mon"]}]}`;

    try {
      this.logger.log(`Sending ${text.length} chars to GPT for parsing...`);
      
      // Limit input text to prevent huge responses
      const truncatedText = text.substring(0, 4000);
      
      const response = await this.aiService.generateCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Parse this schedule (extract all tasks with times):\n\n${truncatedText}` },
      ]);

      this.logger.log(`GPT response length: ${response.length} chars`);
      
      // Clean the response - remove markdown code blocks if present
      let cleanResponse = this.cleanJsonResponse(response);
      
      // Try to repair truncated or malformed JSON
      cleanResponse = this.repairJson(cleanResponse);

      let result: ParseResult;
      try {
        result = JSON.parse(cleanResponse) as ParseResult;
      } catch (parseError) {
        this.logger.error(`JSON parse error: ${parseError.message}`);
        this.logger.error(`Attempted to parse: ${cleanResponse.substring(0, 500)}...`);
        throw parseError;
      }
      
      // Validate the result
      if (!result.blocks || !Array.isArray(result.blocks)) {
        throw new Error('Invalid GPT response: missing blocks array');
      }

      // Filter out any blocks with invalid dates
      const validBlocks = result.blocks.filter(block => {
        if (!block.startsAt || !block.endsAt || !block.title) {
          this.logger.warn(`Skipping invalid block: ${JSON.stringify(block)}`);
          return false;
        }
        const start = new Date(block.startsAt);
        const end = new Date(block.endsAt);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          this.logger.warn(`Skipping block with invalid dates: ${block.title}`);
          return false;
        }
        return true;
      });

      result.blocks = validBlocks;
      this.logger.log(`GPT parsed ${result.blocks.length} valid blocks`);
      return result;
    } catch (error) {
      this.logger.error('GPT parsing failed:', error.message);
      // Fall back to deterministic parsing
      this.logger.log('Falling back to deterministic parsing...');
      return this.deterministicParse(text, scheduleDate, tz);
    }
  }

  private cleanJsonResponse(response: string): string {
    let clean = response.trim();
    
    // Remove markdown code blocks
    if (clean.startsWith('```json')) {
      clean = clean.slice(7);
    } else if (clean.startsWith('```')) {
      clean = clean.slice(3);
    }
    if (clean.endsWith('```')) {
      clean = clean.slice(0, -3);
    }
    
    // Remove any leading/trailing whitespace or newlines
    clean = clean.trim();
    
    // Remove any text before the first {
    const firstBrace = clean.indexOf('{');
    if (firstBrace > 0) {
      clean = clean.substring(firstBrace);
    }
    
    return clean;
  }

  private repairJson(json: string): string {
    let repaired = json;
    
    // If it doesn't end with }, try to fix it
    if (!repaired.endsWith('}')) {
      this.logger.warn('JSON appears truncated, attempting repair...');
      
      // Find the last complete object in the blocks array
      const lastCompleteBlock = repaired.lastIndexOf('}]');
      if (lastCompleteBlock > 0) {
        repaired = repaired.substring(0, lastCompleteBlock + 2) + '}';
        this.logger.log('Repaired by closing at last complete block');
      } else {
        // Try to find last complete block object
        const lastBlockEnd = repaired.lastIndexOf('}');
        if (lastBlockEnd > 0) {
          // Check if we're inside the blocks array
          const blocksStart = repaired.indexOf('"blocks"');
          if (blocksStart > 0 && lastBlockEnd > blocksStart) {
            repaired = repaired.substring(0, lastBlockEnd + 1) + ']}';
            this.logger.log('Repaired by closing blocks array and root object');
          }
        }
      }
    }
    
    // Fix common JSON issues
    // Remove trailing commas before ] or }
    repaired = repaired.replace(/,\s*]/g, ']');
    repaired = repaired.replace(/,\s*}/g, '}');
    
    // Fix unescaped quotes in strings (common GPT issue)
    // This is tricky - only do basic fixes
    repaired = repaired.replace(/:\s*"([^"]*)"([^,}\]]*)"([^"]*)",/g, ': "$1\'$2\'$3",');
    
    return repaired;
  }

  private async extractTextFromUpload(upload: any): Promise<string> {
    // Check if we have extracted text stored in the upload record
    if (upload.extractedText) {
      this.logger.log('Using stored extracted text from upload');
      return upload.extractedText;
    }

    // Check if we have the file content stored
    if (upload.fileContent) {
      this.logger.log('Using stored file content from upload');
      return upload.fileContent;
    }

    // Try to read from the file path if stored locally
    if (upload.path) {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = (pdfParseModule.default || pdfParseModule) as (buffer: Buffer) => Promise<{ text: string }>;
        
        const filePath = path.join(process.cwd(), 'uploads', upload.path);
        this.logger.log(`Attempting to read PDF from: ${filePath}`);
        
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);
        
        this.logger.log(`Extracted ${pdfData.text.length} characters from PDF`);
        return pdfData.text;
      } catch (error) {
        this.logger.warn(`Failed to read PDF from path: ${error.message}`);
      }
    }

    // Try to read from S3 URL if available
    if (upload.url && upload.url.includes('s3')) {
      try {
        this.logger.log(`Attempting to fetch PDF from S3: ${upload.url}`);
        const response = await fetch(upload.url);
        const arrayBuffer = await response.arrayBuffer();
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = (pdfParseModule.default || pdfParseModule) as (buffer: Buffer) => Promise<{ text: string }>;
        const pdfData = await pdfParse(Buffer.from(arrayBuffer));
        
        this.logger.log(`Extracted ${pdfData.text.length} characters from S3 PDF`);
        return pdfData.text;
      } catch (error) {
        this.logger.warn(`Failed to read PDF from S3: ${error.message}`);
      }
    }

    // If no text could be extracted, throw an error with helpful message
    this.logger.error('Could not extract text from upload - no valid source found');
    this.logger.log('Upload details:', { 
      id: upload.id, 
      path: upload.path, 
      url: upload.url,
      hasExtractedText: !!upload.extractedText,
      hasFileContent: !!upload.fileContent 
    });
    
    throw new Error('Could not extract text from PDF. Please ensure the PDF was uploaded correctly and contains readable text.');
  }

  private generateImportHash(projectId: string, scheduleDate: string, text: string): string {
    const normalizedText = this.normalizeText(text);
    const hashInput = `${projectId}${scheduleDate}${normalizedText}`;
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  private normalizeText(text: string): string {
    return text
      .replace(/[–—]/g, '-') // Normalize dashes
      .replace(/\n\s*\n/g, '\n') // Collapse consecutive blank lines
      .split('\n')
      .map(line => line.trim())
      .join('\n');
  }

  private deterministicParse(text: string, scheduleDate: string, tz: string): ParseResult {
    const normalizedText = this.normalizeText(text);
    const lines = normalizedText.split('\n');
    
    const blocks: ParsedBlock[] = [];
    let currentBlock: Partial<ParsedBlock> | null = null;
    let currentSection = '';
    let currentDate = scheduleDate; // Track current date for multi-day schedules
    let confidence = 0;
    const warnings: string[] = [];

    // Regex patterns for time ranges - support multiple formats
    const time12hPattern = /(?<start>\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm))\s*[-–—|to]\s*(?<end>\d{1,2}:\d{2}\s?(?:AM|PM|am|pm))/i;
    const time24hPattern = /(?<start>\b\d{1,2}:\d{2})\s*[-–—|to]\s*(?<end>\d{1,2}:\d{2})/;
    // Also match times with title on same line: "9:00 AM - 10:00 AM | Task Name" or "9:00 AM - 10:00 AM Task Name"
    const timeWithTitlePattern = /(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?)\s*[-–—|to]\s*(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?)\s*[|:]?\s*(.+)/i;
    
    const sectionHeaderPattern = /^(⏰\s*)?(Morning|Midday|Afternoon|Evening|End of Day|Night)\b/i;
    
    // Pattern for day headers like "MONDAY - December 23, 2024" or "Monday, December 23" or just "MONDAY"
    const dayHeaderPattern = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s*[-–—,:]?\s*(.*)/i;
    // Pattern for "OFF" days
    const offDayPattern = /\b(OFF|Day Off|REST|HOLIDAY|VACATION|NO WORK)\b/i;

    this.logger.log(`Deterministic parsing ${lines.length} lines...`);

    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Skip OFF days
      if (offDayPattern.test(line)) {
        this.logger.log(`Skipping OFF day: ${line}`);
        continue;
      }

      // Check for day headers (multi-day schedule)
      const dayMatch = line.match(dayHeaderPattern);
      if (dayMatch) {
        // Finalize previous block before switching days
        if (currentBlock) {
          this.finalizeBlock(currentBlock, blocks, currentDate, tz, currentSection, warnings);
          currentBlock = null;
        }
        
        // Check if this day is marked as OFF
        if (offDayPattern.test(dayMatch[2])) {
          this.logger.log(`Skipping OFF day from header: ${line}`);
          continue;
        }
        
        // Parse the date from the header
        try {
          const dateStr = dayMatch[2];
          const parsedDate = this.parseDateString(dateStr);
          if (parsedDate) {
            currentDate = parsedDate;
            this.logger.log(`Switched to date: ${currentDate} from header: ${line}`);
          }
        } catch (e) {
          this.logger.warn(`Could not parse date from: ${line}`);
        }
        currentSection = dayMatch[1]; // Use day name as section
        continue;
      }

      // Check for section headers
      const sectionMatch = line.match(sectionHeaderPattern);
      if (sectionMatch) {
        currentSection = sectionMatch[2];
        continue;
      }

      // Try to match time with title on same line first
      const timeWithTitle = line.match(timeWithTitlePattern);
      if (timeWithTitle) {
        // Finalize previous block
        if (currentBlock) {
          this.finalizeBlock(currentBlock, blocks, currentDate, tz, currentSection, warnings);
        }

        const startStr = timeWithTitle[1];
        const endStr = timeWithTitle[2];
        const title = timeWithTitle[3].trim();

        // Start new block with title
        currentBlock = {
          startsAt: '',
          endsAt: '',
          title: title,
          description: '',
          tags: currentSection ? [currentSection] : [],
        };

        // Parse times
        try {
          const { startsAt, endsAt } = this.parseTimeRange(startStr, endStr, currentDate, tz);
          currentBlock.startsAt = startsAt;
          currentBlock.endsAt = endsAt;
          
          // Immediately finalize since we have the title
          this.finalizeBlock(currentBlock, blocks, currentDate, tz, currentSection, warnings);
          currentBlock = null;
        } catch (error) {
          warnings.push(`Invalid time range: ${line}`);
          currentBlock = null;
        }
        continue;
      }

      // Check for time ranges without title
      const timeMatch = line.match(time12hPattern) || line.match(time24hPattern);
      
      if (timeMatch) {
        // Finalize previous block
        if (currentBlock) {
          this.finalizeBlock(currentBlock, blocks, currentDate, tz, currentSection, warnings);
        }

        // Start new block
        currentBlock = {
          startsAt: '',
          endsAt: '',
          title: '',
          description: '',
          tags: currentSection ? [currentSection] : [],
        };

        // Parse times
        try {
          const { startsAt, endsAt } = this.parseTimeRange(
            timeMatch.groups!.start,
            timeMatch.groups!.end,
            currentDate,
            tz
          );
          currentBlock.startsAt = startsAt;
          currentBlock.endsAt = endsAt;
        } catch (error) {
          warnings.push(`Invalid time range: ${line}`);
          currentBlock = null;
        }
      } else if (currentBlock && line.trim()) {
        // Add content to current block
        if (!currentBlock.title) {
          currentBlock.title = line.trim();
        } else {
          currentBlock.description = currentBlock.description 
            ? `${currentBlock.description}\n${line.trim()}`
            : line.trim();
        }
      }
    }

    // Finalize last block
    if (currentBlock) {
      this.finalizeBlock(currentBlock, blocks, currentDate, tz, currentSection, warnings);
    }

    // Calculate confidence
    if (blocks.length >= 3) confidence += 0.3;
    if (this.hasNoOverlaps(blocks)) confidence += 0.2;
    if (blocks.every(b => b.title && b.title.length > 0)) confidence += 0.2;
    if (blocks.length >= 5) confidence += 0.3;

    this.logger.log(`Deterministic parse found ${blocks.length} blocks with confidence ${confidence}`);
    if (warnings.length > 0) {
      this.logger.warn(`Parse warnings: ${warnings.join(', ')}`);
    }

    return {
      confidence,
      blocks,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  private parseDateString(dateStr: string): string | null {
    try {
      this.logger.log(`Parsing date string: "${dateStr}"`);
      
      // Try to parse "December 23, 2024" format
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                          'july', 'august', 'september', 'october', 'november', 'december'];
      
      // Match "December 23, 2024" or "December 23 2024"
      const monthDayYearMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/i);
      if (monthDayYearMatch) {
        const monthName = monthDayYearMatch[1].toLowerCase();
        const day = parseInt(monthDayYearMatch[2]);
        const year = parseInt(monthDayYearMatch[3]);
        const monthIndex = monthNames.indexOf(monthName);
        
        if (monthIndex !== -1) {
          // Create date string in YYYY-MM-DD format directly to avoid timezone issues
          const month = (monthIndex + 1).toString().padStart(2, '0');
          const dayStr = day.toString().padStart(2, '0');
          const result = `${year}-${month}-${dayStr}`;
          this.logger.log(`Parsed "${dateStr}" to "${result}"`);
          return result;
        }
      }
      
      // Try DD/MM/YYYY or MM/DD/YYYY
      const parts = dateStr.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
      if (parts) {
        const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
        // Assume DD/MM/YYYY format
        const month = parts[2].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      
      // Last resort: try native Date parsing
      const date = new Date(dateStr + ' UTC'); // Add UTC to avoid timezone issues
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
      
      return null;
    } catch (e) {
      this.logger.warn(`Failed to parse date: ${dateStr}`, e);
      return null;
    }
  }

  private finalizeBlock(
    block: Partial<ParsedBlock>,
    blocks: ParsedBlock[],
    scheduleDate: string,
    tz: string,
    currentSection: string,
    warnings: string[]
  ) {
    if (!block.startsAt || !block.endsAt) return;

    if (!block.title) {
      block.title = 'Scheduled Work Block';
    }

    // Validate times
    const start = new Date(block.startsAt);
    const end = new Date(block.endsAt);
    
    if (end <= start) {
      warnings.push(`Invalid time range for "${block.title}": end time must be after start time`);
      return;
    }

    blocks.push({
      title: block.title,
      description: block.description || undefined,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      tags: block.tags || (currentSection ? [currentSection] : undefined),
    });
  }

  private parseTimeRange(startStr: string, endStr: string, scheduleDate: string, tz: string) {
    const date = new Date(scheduleDate);
    
    // Parse start time
    const startTime = this.parseTime(startStr);
    const startDateTime = new Date(date);
    startDateTime.setHours(startTime.hours, startTime.minutes, 0, 0);
    
    // Parse end time
    const endTime = this.parseTime(endStr);
    const endDateTime = new Date(date);
    endDateTime.setHours(endTime.hours, endTime.minutes, 0, 0);
    
    // Handle day rollover for times like "11:00 PM - 01:00 AM"
    if (endDateTime <= startDateTime) {
      endDateTime.setDate(endDateTime.getDate() + 1);
    }
    
    return {
      startsAt: startDateTime.toISOString(),
      endsAt: endDateTime.toISOString(),
    };
  }

  private parseTime(timeStr: string): { hours: number; minutes: number } {
    const time12hMatch = timeStr.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
    if (time12hMatch) {
      let hours = parseInt(time12hMatch[1]);
      const minutes = parseInt(time12hMatch[2]);
      const period = time12hMatch[3].toUpperCase();
      
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      
      return { hours, minutes };
    }
    
    const time24hMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (time24hMatch) {
      return {
        hours: parseInt(time24hMatch[1]),
        minutes: parseInt(time24hMatch[2]),
      };
    }
    
    throw new Error(`Unable to parse time: ${timeStr}`);
  }

  private hasNoOverlaps(blocks: ParsedBlock[]): boolean {
    for (let i = 0; i < blocks.length - 1; i++) {
      const current = new Date(blocks[i].endsAt);
      const next = new Date(blocks[i + 1].startsAt);
      if (current > next) return false;
    }
    return true;
  }

  private async llmFallbackParse(text: string, scheduleDate: string, tz: string): Promise<ParseResult> {
    const systemPrompt = `You extract a structured, machine-ready schedule from noisy text. Output ONLY valid JSON matching the given TypeScript type. Do not invent times. If a block lacks a clear title, generate a short neutral one like "Work Block". Keep descriptions concise.

Schedule date: ${scheduleDate}
Timezone: ${tz}

Return JSON matching this type:
type ParseResult = {
  confidence: number; // 0..1
  blocks: {
    title: string;
    description?: string;
    startsAt: string; // RFC3339 with timezone
    endsAt: string; // RFC3339 with timezone
    tags?: string[];
  }[];
  warnings?: string[];
}`;

    try {
      const response = await this.aiService.generateCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ]);

      const result = JSON.parse(response) as ParseResult;
      
      // Validate the result
      if (!result.blocks || !Array.isArray(result.blocks)) {
        throw new Error('Invalid LLM response: missing blocks array');
      }

      return result;
    } catch (error) {
      this.logger.error('LLM fallback parsing failed:', error);
      return {
        confidence: 0,
        blocks: [],
        warnings: ['LLM parsing failed. Please try uploading a clearer schedule format.'],
      };
    }
  }
}