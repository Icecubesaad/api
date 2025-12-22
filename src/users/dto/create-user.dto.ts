import { IsEmail, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, SubscriptionTier, AuthProvider } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ description: 'User email address', example: 'jane.smith@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'User display name', example: 'Jane Smith' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({ description: 'Firebase UID', example: 'firebase_uid_abc123xyz789' })
  @IsString()
  firebaseUid: string;

  @ApiPropertyOptional({ description: 'Hashed password for local auth', example: 'hashedPassword123' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ description: 'Auth provider', enum: AuthProvider, default: AuthProvider.FIREBASE, example: 'LOCAL' })
  @IsOptional()
  @IsEnum(AuthProvider)
  authProvider?: AuthProvider = AuthProvider.FIREBASE;

  @ApiPropertyOptional({ description: 'User role', enum: UserRole, default: UserRole.USER, example: 'USER' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole = UserRole.USER;

  @ApiPropertyOptional({ description: 'Subscription tier', enum: SubscriptionTier, default: SubscriptionTier.BASIC, example: 'BASIC' })
  @IsOptional()
  @IsEnum(SubscriptionTier)
  tier?: SubscriptionTier = SubscriptionTier.BASIC;
}
