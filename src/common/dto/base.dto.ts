import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class BaseDto {
  @ApiPropertyOptional({ description: 'Entity ID' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: 'Creation timestamp' })
  @IsOptional()
  createdAt?: Date;

  @ApiPropertyOptional({ description: 'Last update timestamp' })
  @IsOptional()
  updatedAt?: Date;
}

export class PaginationDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Search query' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class PaginatedResponseDto<T> {
  @ApiPropertyOptional({ description: 'Array of items' })
  data: T[];

  @ApiPropertyOptional({ description: 'Total count of items' })
  total: number;

  @ApiPropertyOptional({ description: 'Current page' })
  page: number;

  @ApiPropertyOptional({ description: 'Items per page' })
  limit: number;

  @ApiPropertyOptional({ description: 'Total pages' })
  totalPages: number;

  @ApiPropertyOptional({ description: 'Has next page' })
  hasNext: boolean;

  @ApiPropertyOptional({ description: 'Has previous page' })
  hasPrev: boolean;
}
