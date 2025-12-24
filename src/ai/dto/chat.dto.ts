import { IsString, IsArray, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ChatMessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
}

export class ChatMessage {
  @ApiProperty({ description: 'Message role', enum: ChatMessageRole, example: 'user' })
  @IsEnum(ChatMessageRole)
  role: ChatMessageRole;

  @ApiProperty({ description: 'Message content', example: 'What tasks do I have for today?' })
  @IsString()
  content: string;
}

export class DateRange {
  @ApiProperty({ description: 'Start date in ISO format', example: '2025-12-16T00:00:00.000Z' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'End date in ISO format', example: '2025-12-16T23:59:59.000Z' })
  @IsString()
  to: string;
}

export class ChatContext {
  @ApiPropertyOptional({ 
    description: 'Note IDs (optional - leave empty)', 
    example: [] 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  noteIds?: string[];

  @ApiPropertyOptional({ 
    description: 'Upload IDs (optional - leave empty)', 
    example: [] 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  uploadIds?: string[];

  @ApiPropertyOptional({ 
    description: 'Date range (optional)', 
    type: DateRange 
  })
  @IsOptional()
  dateRange?: DateRange;
}

export class ChatRequestDto {
  @ApiProperty({ 
    description: 'Chat messages - just ask a simple question!', 
    type: [ChatMessage],
    example: [{ role: 'user', content: 'Hello! What can you help me with?' }]
  })
  @IsArray()
  messages: ChatMessage[];

  @ApiPropertyOptional({ 
    description: '⚠️ PASTE YOUR PROJECT ID HERE for context', 
    example: 'PASTE_PROJECT_ID_HERE' 
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ 
    description: 'User timezone (IANA format) - defaults to Australia/Sydney if not provided', 
    example: 'Australia/Sydney' 
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ 
    description: 'Context (leave empty for simple chat)', 
    type: ChatContext 
  })
  @IsOptional()
  context?: ChatContext;

  @ApiPropertyOptional({ 
    description: 'Tools (leave empty)', 
    example: [] 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toolsAllowed?: string[];

  @ApiPropertyOptional({ 
    description: 'Temperature', 
    example: 0.7 
  })
  @IsOptional()
  temperature?: number;
}

export class ChatResponseDto {
  @ApiProperty({ description: 'AI response message' })
  message: string;

  @ApiPropertyOptional({ description: 'Tool results from AI execution' })
  toolResults?: any[];

  @ApiPropertyOptional({ description: 'Created entities from tools' })
  createdEntities?: any;

  @ApiPropertyOptional({ description: 'Usage statistics' })
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
