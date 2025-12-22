import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { RagService } from './rag.service';
import OpenAI from 'openai';

export interface PdfExtractionResult {
  tasks: string[];
  notes: string[];
  hazards?: string[];
  summary: string;
}

@Injectable()
export class PdfIngestService {
  private readonly logger = new Logger(PdfIngestService.name);
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private db: DatabaseService,
    private ragService: RagService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('ai.openaiApiKey'),
    });
  }

  // Dynamic import to avoid serverless issues with pdf-parse
  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = (pdfParseModule.default || pdfParseModule) as (buffer: Buffer) => Promise<{ text: string }>;
      
      const pdfData = await pdfParse(buffer);
      return pdfData.text;
    } catch (error) {
      this.logger.error('PDF parsing failed:', error);
      return '';
    }
  }

  async processPdf(uploadId: string, fileBuffer: Buffer): Promise<PdfExtractionResult> {
    try {
      // Update status to processing
      await this.db.upload.update({
        where: { id: uploadId },
        data: { parseStatus: 'PROCESSING' },
      });

      // Extract text from PDF
      const extractedText = await this.parsePdf(fileBuffer);

      if (!extractedText.trim()) {
        throw new Error('No text content found in PDF');
      }

      // Get upload details for project context
      const upload = await this.db.upload.findUnique({
        where: { id: uploadId },
      });

      if (!upload) {
        throw new Error('Upload not found');
      }

      // Generate embeddings for RAG
      await this.ragService.ingestUpload(uploadId, extractedText, upload.projectId);

      // Extract structured information using AI
      const extractionResult = await this.extractStructuredInfo(extractedText);

      // Generate summary
      const summary = await this.generateSummary(extractedText);

      // Update upload status
      await this.db.upload.update({
        where: { id: uploadId },
        data: { 
          parseStatus: 'COMPLETED',
          parsedAt: new Date(),
        },
      });

      const result = {
        ...extractionResult,
        summary,
      };

      this.logger.log(`Successfully processed PDF ${uploadId}: ${extractedText.length} chars, ${result.tasks.length} tasks, ${result.notes.length} notes`);
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to process PDF ${uploadId}:`, error);
      
      // Update status to failed
      await this.db.upload.update({
        where: { id: uploadId },
        data: { parseStatus: 'FAILED' },
      });

      throw error;
    }
  }

  private async extractStructuredInfo(text: string): Promise<Omit<PdfExtractionResult, 'summary'>> {
    try {
      const prompt = `Analyze the following document text and extract structured information. Return a JSON object with the following structure:

{
  "tasks": ["array of actionable tasks or to-dos found in the document"],
  "notes": ["array of important notes, observations, or key information"],
  "hazards": ["array of any safety concerns, risks, or hazards mentioned (optional)"]
}

Keep items concise but informative. Focus on actionable items for tasks, key insights for notes, and safety-related items for hazards.

Document text:
${text.slice(0, 8000)} ${text.length > 8000 ? '...' : ''}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o', // Use GPT-4o which supports JSON mode
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      
      return {
        tasks: Array.isArray(result.tasks) ? result.tasks : [],
        notes: Array.isArray(result.notes) ? result.notes : [],
        hazards: Array.isArray(result.hazards) ? result.hazards : [],
      };
    } catch (error) {
      this.logger.error('Failed to extract structured info:', error);
      
      // Fallback to simple text analysis
      return this.fallbackExtraction(text);
    }
  }

  private async generateSummary(text: string): Promise<string> {
    try {
      const prompt = `Provide a concise summary of this document in 2-3 sentences. Focus on the main purpose, key points, and any important outcomes or next steps.

Document text:
${text.slice(0, 4000)} ${text.length > 4000 ? '...' : ''}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o', // Use GPT-4o for consistency
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 200,
      });

      return completion.choices[0].message.content || 'Document processed successfully.';
    } catch (error) {
      this.logger.error('Failed to generate summary:', error);
      return `Document contains ${Math.round(text.length / 1000)}k characters. Processing completed.`;
    }
  }

  private fallbackExtraction(text: string): Omit<PdfExtractionResult, 'summary'> {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const tasks: string[] = [];
    const notes: string[] = [];
    const hazards: string[] = [];

    // Simple keyword-based extraction
    const taskKeywords = ['todo', 'task', 'action', 'complete', 'finish', 'implement', 'review', 'check'];
    const hazardKeywords = ['danger', 'risk', 'hazard', 'safety', 'warning', 'caution', 'unsafe'];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      if (taskKeywords.some(keyword => lowerLine.includes(keyword))) {
        tasks.push(line);
      } else if (hazardKeywords.some(keyword => lowerLine.includes(keyword))) {
        hazards.push(line);
      } else if (line.length > 20 && line.length < 200) {
        // Potential note - not too short or too long
        notes.push(line);
      }
    }

    return {
      tasks: tasks.slice(0, 10), // Limit to prevent overwhelming
      notes: notes.slice(0, 15),
      hazards: hazards.slice(0, 5),
    };
  }

  async getParsedContent(uploadId: string): Promise<PdfExtractionResult | null> {
    try {
      const upload = await this.db.upload.findUnique({
        where: { id: uploadId },
      });

      if (!upload || upload.parseStatus !== 'COMPLETED') {
        return null;
      }

      // Get embeddings to reconstruct content using raw SQL
      const embeddings = await this.db.$queryRaw`
        SELECT "chunkText" FROM embeddings 
        WHERE "sourceType" = 'UPLOAD' AND "sourceId" = ${uploadId}
        ORDER BY "chunkIndex" ASC
      ` as any[];

      if (embeddings.length === 0) {
        return null;
      }

      const fullText = embeddings.map((e: any) => e.chunkText).join(' ');
      
      // Re-extract structured info from stored embeddings
      const extracted = await this.extractStructuredInfo(fullText);
      const summary = await this.generateSummary(fullText);
      return { ...extracted, summary };
    } catch (error) {
      this.logger.error(`Failed to get parsed content for ${uploadId}:`, error);
      return null;
    }
  }
}