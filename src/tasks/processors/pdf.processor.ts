import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DatabaseService } from '../../database/database.service';
import { PdfIngestService } from '../../ai/pdf-ingest.service';

@Processor('pdf-processing')
export class PdfProcessor {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly pdfIngestService: PdfIngestService,
  ) {}

  @Process('process-pdf')
  async handlePdfProcessing(job: Job<{ uploadId: string; fileBuffer: Buffer; prompt?: string }>) {
    const { uploadId, fileBuffer, prompt } = job.data;
    
    try {
      this.logger.log(`Processing PDF for upload ${uploadId}`);
      
      if (!fileBuffer) {
        throw new Error('No file buffer provided for PDF processing');
      }

      // Use the PDF ingestion service to process the PDF
      const result = await this.pdfIngestService.processPdf(uploadId, fileBuffer);
      
      this.logger.log(`PDF processing completed for upload ${uploadId}: ${result.tasks.length} tasks, ${result.notes.length} notes`);
      
      return result;
    } catch (error) {
      this.logger.error(`PDF processing failed for upload ${uploadId}:`, error);
      
      await this.db.upload.update({
        where: { id: uploadId },
        data: { parseStatus: 'FAILED' },
      });
      
      throw error;
    }
  }

  private chunkText(text: string, chunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence + '. ';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
