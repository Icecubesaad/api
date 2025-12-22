import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({ 
    description: 'User email address - SAVE THE TOKEN FROM RESPONSE!', 
    example: 'testuser@demo.com' 
  })
  @IsEmail()
  email: string;

  @ApiProperty({ 
    description: 'Account password (min 8 characters)', 
    example: 'Password123!' 
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ 
    description: 'Display name', 
    example: 'Test User' 
  })
  @IsOptional()
  @IsString()
  displayName?: string;
}

