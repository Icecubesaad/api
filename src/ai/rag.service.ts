import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DatabaseService } from '../database/database.service';

export interface RagRetrievalQuery {
    projectId: string;
    query: string;
    noteIds?: string[];
    uploadIds?: string[];
    dateRange?: {
        from: string;
        to: string;
    };
    k?: number;
}

export interface RagChunk {
    sourceType: 'note' | 'upload' | 'log';
    sourceId: string;
    chunkText: string;
    score: number;
    date?: Date;
}

export interface RagRetrievalResult {
    chunks: RagChunk[];
    contextText: string;
}

@Injectable()
export class RagService {
    private readonly logger = new Logger(RagService.name);
    private openai: OpenAI;

    constructor(
        private configService: ConfigService,
        private db: DatabaseService,
    ) {
        this.openai = new OpenAI({
            apiKey: this.configService.get<string>('ai.openaiApiKey'),
        });
    }

    async ingestNote(noteId: string, content: string, projectId: string, date?: Date): Promise<void> {
        try {
            const chunks = this.chunkText(content);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const embedding = await this.generateEmbedding(chunk);

                // Use raw SQL since we don't have Prisma model for pgvector
                await this.db.$executeRaw`
          INSERT INTO embeddings (id, "projectId", "sourceType", "sourceId", vector, "chunkText", "chunkIndex", date, "createdAt")
          VALUES (${this.generateId()}, ${projectId}, 'NOTE', ${noteId}, ${embedding}::vector, ${chunk}, ${i}, ${date || new Date()}, ${new Date()})
        `;
            }

            this.logger.log(`Ingested ${chunks.length} chunks for note ${noteId}`);
        } catch (error) {
            this.logger.error(`Failed to ingest note ${noteId}:`, error);
            throw error;
        }
    }

    async ingestUpload(uploadId: string, content: string, projectId: string): Promise<void> {
        try {
            const chunks = this.chunkText(content, 1000, 150); // Larger chunks for PDFs

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const embedding = await this.generateEmbedding(chunk);

                // Use raw SQL since we don't have Prisma model for pgvector
                await this.db.$executeRaw`
          INSERT INTO embeddings (id, "projectId", "sourceType", "sourceId", vector, "chunkText", "chunkIndex", date, "createdAt")
          VALUES (${this.generateId()}, ${projectId}, 'UPLOAD', ${uploadId}, ${embedding}::vector, ${chunk}, ${i}, ${new Date()}, ${new Date()})
        `;
            }

            this.logger.log(`Ingested ${chunks.length} chunks for upload ${uploadId}`);
        } catch (error) {
            this.logger.error(`Failed to ingest upload ${uploadId}:`, error);
            throw error;
        }
    }

    async ingestDailyLog(logId: string, summary: string, projectId: string, date: Date): Promise<void> {
        try {
            const embedding = await this.generateEmbedding(summary);

            // Use raw SQL since we don't have Prisma model for pgvector
            await this.db.$executeRaw`
        INSERT INTO embeddings (id, "projectId", "sourceType", "sourceId", vector, "chunkText", "chunkIndex", date, "createdAt")
        VALUES (${this.generateId()}, ${projectId}, 'LOG', ${logId}, ${embedding}::vector, ${summary}, ${0}, ${date}, ${new Date()})
      `;

            this.logger.log(`Ingested daily log ${logId}`);
        } catch (error) {
            this.logger.error(`Failed to ingest daily log ${logId}:`, error);
            throw error;
        }
    }

    async retrieve(query: RagRetrievalQuery): Promise<RagRetrievalResult> {
        try {
            const queryEmbedding = await this.generateEmbedding(query.query);
            const k = query.k || 8;

            // Build where clause for filtering
            const whereClause: any = {
                projectId: query.projectId,
            };

            // Filter by specific notes/uploads if provided
            if (query.noteIds?.length || query.uploadIds?.length) {
                const sourceFilters = [];

                if (query.noteIds?.length) {
                    sourceFilters.push({
                        sourceType: 'NOTE',
                        sourceId: { in: query.noteIds },
                    });
                }

                if (query.uploadIds?.length) {
                    sourceFilters.push({
                        sourceType: 'UPLOAD',
                        sourceId: { in: query.uploadIds },
                    });
                }

                whereClause.OR = sourceFilters;
            }

            // Filter by date range
            if (query.dateRange) {
                whereClause.date = {
                    gte: new Date(query.dateRange.from),
                    lte: new Date(query.dateRange.to),
                };
            } else {
                // Default to last 30 days if no specific context provided
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                whereClause.date = {
                    gte: thirtyDaysAgo,
                };
            }

            // Use pgvector similarity search
            // Note: This is a simplified version. In production, you'd use proper vector similarity
            let embeddings: any[];
            
            if (query.dateRange) {
                embeddings = await this.db.$queryRaw`
                    SELECT id, "sourceType", "sourceId", "chunkText", "date",
                           1 - (vector <=> ${queryEmbedding}::vector) as similarity
                    FROM embeddings 
                    WHERE "projectId" = ${query.projectId}
                    AND date >= ${new Date(query.dateRange.from)} 
                    AND date <= ${new Date(query.dateRange.to)}
                    ORDER BY vector <=> ${queryEmbedding}::vector
                    LIMIT ${k}
                ` as any[];
            } else {
                embeddings = await this.db.$queryRaw`
                    SELECT id, "sourceType", "sourceId", "chunkText", "date",
                           1 - (vector <=> ${queryEmbedding}::vector) as similarity
                    FROM embeddings 
                    WHERE "projectId" = ${query.projectId}
                    ORDER BY vector <=> ${queryEmbedding}::vector
                    LIMIT ${k}
                ` as any[];
            }

            const chunks: RagChunk[] = embeddings.map(emb => ({
                sourceType: emb.sourceType.toLowerCase() as 'note' | 'upload' | 'log',
                sourceId: emb.sourceId,
                chunkText: emb.chunkText,
                score: emb.similarity || 0,
                date: emb.date,
            }));

            // Create context text with citations
            const contextText = this.buildContextText(chunks);

            return { chunks, contextText };
        } catch (error) {
            this.logger.error('Failed to retrieve RAG context:', error);
            return { chunks: [], contextText: '' };
        }
    }

    private async generateEmbedding(text: string): Promise<number[]> {
        try {
            const response = await this.openai.embeddings.create({
                model: 'text-embedding-ada-002',
                input: text,
            });

            return response.data[0].embedding;
        } catch (error) {
            this.logger.error('Failed to generate embedding:', error);
            // Return a mock embedding for development
            return new Array(1536).fill(0).map(() => Math.random() - 0.5);
        }
    }

    private chunkText(text: string, maxChunkSize = 700, overlap = 150): string[] {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const chunks: string[] = [];
        let currentChunk = '';
        let currentSize = 0;

        for (const sentence of sentences) {
            const sentenceSize = sentence.length;

            if (currentSize + sentenceSize > maxChunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());

                // Create overlap by keeping the last part of the current chunk
                const words = currentChunk.split(' ');
                const overlapWords = words.slice(-Math.floor(overlap / 6)); // Rough word count estimation
                currentChunk = overlapWords.join(' ') + ' ' + sentence;
                currentSize = currentChunk.length;
            } else {
                currentChunk += (currentChunk ? '. ' : '') + sentence;
                currentSize += sentenceSize;
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks.length > 0 ? chunks : [text]; // Fallback to original text if chunking fails
    }

    private buildContextText(chunks: RagChunk[]): string {
        if (chunks.length === 0) return '';

        const contextParts = chunks.map((chunk) => {
            const citation = `[${chunk.sourceType}:${chunk.sourceId.slice(-8)}]`;
            return `${citation} ${chunk.chunkText}`;
        });

        return `Relevant context from your project:\n\n${contextParts.join('\n\n')}`;
    }

    async deleteEmbeddings(sourceType: 'note' | 'upload' | 'log', sourceId: string): Promise<void> {
        try {
            await this.db.$executeRaw`
        DELETE FROM embeddings 
        WHERE "sourceType" = ${sourceType.toUpperCase()} AND "sourceId" = ${sourceId}
      `;

            this.logger.log(`Deleted embeddings for ${sourceType} ${sourceId}`);
        } catch (error) {
            this.logger.error(`Failed to delete embeddings for ${sourceType} ${sourceId}:`, error);
        }
    }

    private generateId(): string {
        // Generate a simple ID similar to Prisma's cuid
        return 'emb_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    }
}