import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectResponseDto {
  @ApiProperty({ description: 'Project ID (CUID)' })
  id: string;

  @ApiProperty({ description: 'Owner user ID (CUID)' })
  ownerId: string;

  @ApiProperty({ description: 'Project name' })
  name: string;

  @ApiPropertyOptional({ description: 'Project description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Archived timestamp' })
  archivedAt?: Date;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

