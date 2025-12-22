import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class PresignUploadDto {
  @ApiProperty({ 
    description: 'Filename to upload', 
    example: 'schedule.pdf' 
  })
  @IsString()
  filename: string;

  @ApiProperty({ 
    description: 'MIME type', 
    example: 'application/pdf' 
  })
  @IsString()
  contentType: string;

  @ApiProperty({ 
    description: '⚠️ PASTE YOUR PROJECT ID HERE', 
    example: 'PASTE_PROJECT_ID_HERE' 
  })
  @IsString()
  projectId: string;
}

export class FinalizeUploadDto {
  @ApiProperty({ 
    description: '⚠️ PASTE UPLOAD KEY from presign response', 
    example: 'PASTE_UPLOAD_KEY_HERE' 
  })
  @IsString()
  uploadKey: string;

  @ApiProperty({ 
    description: '⚠️ PASTE YOUR PROJECT ID HERE', 
    example: 'PASTE_PROJECT_ID_HERE' 
  })
  @IsString()
  projectId: string;

  @ApiPropertyOptional({ 
    description: 'Is this a schedule PDF?', 
    default: false, 
    example: false 
  })
  @IsOptional()
  @IsBoolean()
  isSchedule?: boolean;

  @ApiPropertyOptional({ 
    description: 'Schedule date (leave empty)', 
    example: '' 
  })
  @IsOptional()
  @IsString()
  scheduleDate?: string;

  @ApiPropertyOptional({ 
    description: 'Timezone (leave empty)', 
    example: '' 
  })
  @IsOptional()
  @IsString()
  tz?: string;
}

export class PresignUrlResponseDto {
  @ApiProperty({ description: 'Presigned URL for upload' })
  url: string;

  @ApiProperty({ description: 'Upload key for finalization' })
  key: string;
}

