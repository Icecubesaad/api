import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import 'multer'; // For Express.Multer types

import { PdfIngestService } from '../ai/pdf-ingest.service';
import { PdfScheduleParseService } from '../schedule/pdf-schedule-parse.service';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
    private readonly pdfIngestService: PdfIngestService,
    private readonly pdfScheduleParseService: PdfScheduleParseService,
  ) {}

  // Dynamic import to avoid serverless issues with pdf-parse
  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      this.logger.log(`Attempting to parse PDF, buffer size: ${buffer.length} bytes`);
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(buffer);
      this.logger.log(`PDF parsed successfully, extracted ${pdfData.text.length} characters`);
      return pdfData.text;
    } catch (error) {
      this.logger.error('PDF parsing failed:', error.message);
      this.logger.error('PDF parsing stack:', error.stack);
      // Return empty string but don't throw - let the upload continue
      return '';
    }
  }

  async generatePresignedUrl(
    userId: string,
    projectId: string,
    filename: string,
    contentType: string,
  ) {
    // Mock implementation - in real app, this would generate S3 presigned URL
    const uploadKey = `${userId}/${projectId}/${Date.now()}-${filename}`;
    
    return {
      uploadKey,
      presignedUrl: `https://mock-s3-url.com/${uploadKey}`,
      expiresIn: 3600, // 1 hour
    };
  }

  async finalizeUpload(
    userId: string, 
    uploadKey: string, 
    projectId: string,
    scheduleDate?: string,
    tz?: string,
    isSchedule?: boolean
  ) {
    try {
      // Create upload record
      const upload = await this.db.upload.create({
        data: {
          projectId,
          userId,
          storageKey: uploadKey,
          mime: 'application/pdf', // This would be determined from the file
          bytes: 0, // This would be the actual file size
          parseStatus: 'PENDING',
        },
      });

      // If this is a schedule PDF, enqueue parsing job
      if (isSchedule && upload.mime === 'application/pdf') {
        try {
          const defaultScheduleDate = scheduleDate || new Date().toISOString().split('T')[0];
          const defaultTz = tz || 'UTC'; // In production, get from user profile
          
          // Enqueue PDF schedule parsing (in production this would be a background job)
          await this.pdfScheduleParseService.parseScheduleFromUpload(
            upload.id,
            projectId,
            defaultScheduleDate,
            defaultTz
          );
          
          this.logger.log(`Schedule PDF parsing initiated for upload ${upload.id}`);
        } catch (error) {
          this.logger.error(`Failed to parse schedule PDF ${upload.id}:`, error);
          await this.db.upload.update({
            where: { id: upload.id },
            data: { parseStatus: 'FAILED' },
          });
        }
      }

      return upload;
    } catch (error) {
      this.logger.error('Failed to finalize upload:', error);
      throw error;
    }
  }

  async getUpload(userId: string, uploadId: string) {
    return this.db.upload.findFirst({
      where: {
        id: uploadId,
        userId,
      },
    });
  }

  async handleFileUpload(
    file: Express.Multer.File,
    userId: string,
    projectId: string,
    prompt?: string,
    isSchedule?: boolean,
    scheduleDate?: string,
    tz?: string,
  ) {
    try {
      if (!file) {
        throw new Error('No file provided');
      }

      if (!file.originalname) {
        throw new Error('File has no name');
      }

      this.logger.log(`Processing file upload: ${file.originalname}, size: ${file.size}, type: ${file.mimetype}`);

      // Extract text from PDF if applicable
      let extractedText = '';
      if (file.mimetype === 'application/pdf' && file.buffer) {
        try {
          extractedText = await this.parsePdf(file.buffer);
          this.logger.log(`Extracted ${extractedText.length} characters from PDF`);
        } catch (error) {
          this.logger.warn(`Failed to extract text from PDF: ${error.message}`);
        }
      }

      // Create upload record with extracted text
      const upload = await this.db.upload.create({
        data: {
          projectId,
          userId,
          storageKey: `${userId}/${projectId}/${Date.now()}-${file.originalname}`,
          mime: file.mimetype,
          bytes: file.size,
          parseStatus: 'PENDING',
          extractedText: extractedText || null, // Store extracted text
        },
      });

      // If it's a PDF with extracted text, process it
      if (file.mimetype === 'application/pdf' && extractedText) {
        try {
          const defaultScheduleDate = scheduleDate || new Date().toISOString().split('T')[0];
          const defaultTz = tz || 'UTC';
          
          // Parse as schedule
          await this.pdfScheduleParseService.parseScheduleFromUpload(
            upload.id,
            projectId,
            defaultScheduleDate,
            defaultTz
          );
          this.logger.log(`PDF parsed as schedule for upload ${upload.id}`);
        } catch (error) {
          this.logger.error(`Failed to process PDF ${upload.id}:`, error);
          await this.db.upload.update({
            where: { id: upload.id },
            data: { parseStatus: 'FAILED' },
          });
        }
      }

      return {
        ...upload,
        message: file.mimetype === 'application/pdf' 
          ? 'PDF uploaded successfully and queued for processing'
          : 'File uploaded successfully',
        prompt: prompt || null,
      };
    } catch (error) {
      this.logger.error('Failed to handle file upload:', error);
      throw error;
    }
  }

  async processPDF(uploadId: string, fileBuffer: Buffer) {
    try {
      // Use the new PDF ingestion service
      const result = await this.pdfIngestService.processPdf(uploadId, fileBuffer);
      return { 
        success: true, 
        textLength: result.summary.length,
        extracted: result,
      };
    } catch (error) {
      this.logger.error(`Failed to process PDF ${uploadId}:`, error);
      throw error;
    }
  }

  private async generateEmbeddings(uploadId: string, text: string) {
    // Split text into chunks
    const chunks = this.splitTextIntoChunks(text, 1000);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        // Generate embedding using OpenAI
        // This would be implemented with actual OpenAI embeddings API
        const mockVector = new Array(1536).fill(0).map(() => Math.random());
        
        // Comment out embedding creation for now due to Prisma issues
        // await this.db.embedding.create({
        //   data: {
        //     uploadId,
        //     vector: mockVector, // In real implementation, use actual embeddings
        //     chunkText: chunk,
        //     chunkIndex: i,
        //   },
        // });
      } catch (error) {
        this.logger.error(`Failed to create embedding for chunk ${i}:`, error);
      }
    }
  }

  private splitTextIntoChunks(text: string, chunkSize: number): string[] {
    const chunks = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence + '.';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  async searchDocuments(userId: string, query: string, projectId?: string) {
    // This would implement semantic search using pgvector
    // For now, return a mock response
    return {
      results: [],
      query,
      totalResults: 0,
    };
  }

  async createTestUpload(userId: string, projectId: string, filename: string, extractedText: string) {
    this.logger.log(`Creating test upload for user ${userId}, project ${projectId}`);
    
    const upload = await this.db.upload.create({
      data: {
        projectId,
        userId,
        storageKey: `${userId}/${projectId}/${Date.now()}-${filename}`,
        mime: 'application/pdf',
        bytes: extractedText.length,
        parseStatus: 'COMPLETED',
        extractedText,
      },
    });

    this.logger.log(`Created test upload: ${upload.id}`);
    return upload;
  }
}
