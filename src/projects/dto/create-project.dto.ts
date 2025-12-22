import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ 
    description: 'Project name - SAVE THE PROJECT ID FROM RESPONSE!', 
    example: 'My First Project' 
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({ 
    description: 'Project description', 
    example: 'Testing all endpoints' 
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ 
    description: 'Owner user ID (auto-set from token)', 
    example: '' 
  })
  @IsOptional()
  @IsString()
  ownerId?: string;
}
