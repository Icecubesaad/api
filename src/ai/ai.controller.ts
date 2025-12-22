import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';
import { User } from '../auth/decorators/user.decorator';

@ApiTags('ai')
@Controller('ai')
@ApiBearerAuth()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI assistant' })
  @ApiResponse({ status: 200, description: 'AI response', type: ChatResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async chat(
    @Body() chatRequest: ChatRequestDto,
    @User() user: any,
  ): Promise<ChatResponseDto> {
    return this.aiService.chat(chatRequest, user.dbUser.id);
  }
}
