import { Controller, Post, Body, Get, Param, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody, ApiParam } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { User } from '../auth/decorators/user.decorator';
import { PresignUploadDto, FinalizeUploadDto, PresignUrlResponseDto } from './dto/upload.dto';

@ApiTags('uploads')
@Controller('uploads')
@ApiBearerAuth()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presign')
  @ApiOperation({ summary: 'Get presigned URL for file upload' })
  @ApiResponse({ status: 200, description: 'Presigned URL generated', type: PresignUrlResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async presignUpload(
    @Body() body: PresignUploadDto,
    @User() user: any,
  ) {
    return this.uploadsService.generatePresignedUrl(
      user.dbUser.id,
      body.projectId,
      body.filename,
      body.contentType,
    );
  }

  @Post('finalize')
  @ApiOperation({ summary: 'Finalize upload and trigger processing' })
  @ApiResponse({ status: 200, description: 'Upload finalized' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async finalizeUpload(
    @Body() body: FinalizeUploadDto,
    @User() user: any,
  ) {
    return this.uploadsService.finalizeUpload(
      user.dbUser.id, 
      body.uploadKey, 
      body.projectId,
      body.scheduleDate,
      body.tz,
      body.isSchedule
    );
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload file directly' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload (max 50MB)'
        },
        projectId: {
          type: 'string',
          description: 'Project ID (CUID)'
        },
        prompt: {
          type: 'string',
          description: 'Optional prompt for AI processing'
        },
        isSchedule: {
          type: 'string',
          description: 'Is this a schedule document? (true/false)'
        },
        scheduleDate: {
          type: 'string',
          description: 'Schedule date (ISO format)'
        },
        tz: {
          type: 'string',
          description: 'Timezone (e.g., "Australia/Sydney")'
        }
      },
      required: ['file', 'projectId']
    }
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or missing projectId' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('projectId') projectId: string,
    @User() user: any,
    @Body('prompt') prompt?: string,
    @Body('isSchedule') isSchedule?: string,
    @Body('scheduleDate') scheduleDate?: string,
    @Body('tz') tz?: string,
  ) {
    console.log('Upload endpoint hit');
    console.log('File:', file ? `${file.originalname} (${file.size} bytes)` : 'undefined');
    console.log('ProjectId:', projectId);
    console.log('User:', user?.dbUser?.id);
    console.log('Prompt:', prompt);
    console.log('IsSchedule:', isSchedule);

    if (!file) {
      throw new BadRequestException('No file uploaded - check if file field name is correct');
    }

    if (!projectId) {
      throw new BadRequestException('Project ID is required');
    }

    if (!user?.dbUser?.id) {
      throw new BadRequestException('User authentication required');
    }

    return this.uploadsService.handleFileUpload(
      file, 
      user.dbUser.id, 
      projectId, 
      prompt,
      isSchedule === 'true',
      scheduleDate,
      tz
    );
  }

  @Post('test')
  @Public()
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Test file upload' })
  async testUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    return {
      file: file ? {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      } : null,
      body,
      message: 'Test upload endpoint reached'
    };
  }

  @Post('create-test')
  @ApiOperation({ summary: 'Create test upload with extracted text (for testing)' })
  async createTestUpload(
    @Body() body: { projectId: string; filename: string; extractedText: string },
    @User() user: any,
  ) {
    return this.uploadsService.createTestUpload(
      user.dbUser.id,
      body.projectId,
      body.filename,
      body.extractedText,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get upload details' })
  @ApiParam({ name: 'id', description: 'Upload ID (CUID)' })
  @ApiResponse({ status: 200, description: 'Upload details' })
  @ApiResponse({ status: 404, description: 'Upload not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUpload(@Param('id') id: string, @User() user: any) {
    return this.uploadsService.getUpload(user.dbUser.id, id);
  }
} 