import { Controller, Post, Body, Get, Query, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';
import { User } from '../auth/decorators/user.decorator';
import { DatabaseService } from '../database/database.service';

@ApiTags('ai')
@Controller('ai')
@ApiBearerAuth()
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly db: DatabaseService,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI assistant' })
  @ApiResponse({ status: 200, description: 'AI response', type: ChatResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async chat(
    @Body() chatRequest: ChatRequestDto,
    @User() user: any,
  ): Promise<ChatResponseDto> {
    const userId = user.dbUser.id;
    const projectId = chatRequest.projectId;
    
    // Get the latest user message to save
    const latestUserMessage = chatRequest.messages
      .filter(m => m.role === 'user')
      .pop();
    
    // Save user message to history
    if (latestUserMessage && projectId) {
      await this.db.chatMessage.create({
        data: {
          projectId,
          userId,
          role: 'USER',
          content: latestUserMessage.content,
        },
      });
    }
    
    // Get AI response
    const response = await this.aiService.chat(chatRequest, userId);
    
    // Save assistant message to history
    if (response.message && projectId) {
      await this.db.chatMessage.create({
        data: {
          projectId,
          userId,
          role: 'ASSISTANT',
          content: response.message,
        },
      });
    }
    
    return response;
  }

  @Get('chat/history')
  @ApiOperation({ summary: 'Get chat history for a project' })
  @ApiQuery({ name: 'projectId', required: true, description: 'Project ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of messages to return (default 50)' })
  @ApiResponse({ status: 200, description: 'Chat history' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getChatHistory(
    @User() user: any,
    @Query('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    const userId = user.dbUser.id;
    const messageLimit = limit ? parseInt(limit, 10) : 50;
    
    const messages = await this.db.chatMessage.findMany({
      where: {
        projectId,
        userId,
      },
      orderBy: { createdAt: 'asc' },
      take: messageLimit,
    });
    
    return {
      projectId,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role.toLowerCase(),
        content: m.content,
        timestamp: m.createdAt.toISOString(),
      })),
      count: messages.length,
    };
  }

  @Delete('chat/history/:projectId')
  @ApiOperation({ summary: 'Clear chat history for a project' })
  @ApiResponse({ status: 200, description: 'Chat history cleared' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async clearChatHistory(
    @User() user: any,
    @Param('projectId') projectId: string,
  ) {
    const userId = user.dbUser.id;
    
    const deleted = await this.db.chatMessage.deleteMany({
      where: {
        projectId,
        userId,
      },
    });
    
    return {
      success: true,
      deletedCount: deleted.count,
      message: `Cleared ${deleted.count} messages from chat history`,
    };
  }
}
