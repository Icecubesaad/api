import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ 
    description: 'Same email used in signup', 
    example: 'testuser@demo.com' 
  })
  @IsEmail()
  email: string;

  @ApiProperty({ 
    description: 'Same password used in signup', 
    example: 'Password123!' 
  })
  @IsString()
  @MinLength(8)
  password: string;
}

