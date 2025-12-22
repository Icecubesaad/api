import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ description: 'User ID (CUID)' })
  id: string;

  @ApiProperty({ description: 'User email' })
  email: string;

  @ApiProperty({ description: 'Display name', required: false })
  displayName?: string;

  @ApiProperty({ description: 'Firebase UID' })
  firebaseUid: string;

  @ApiProperty({ description: 'Auth provider', enum: ['FIREBASE', 'LOCAL', 'GOOGLE'] })
  authProvider: string;

  @ApiProperty({ description: 'User role', enum: ['USER', 'ADMIN'] })
  role: string;

  @ApiProperty({ description: 'Subscription tier', enum: ['BASIC', 'PREMIUM'], required: false })
  tier?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'User information', type: AuthUserDto })
  user: AuthUserDto;
}

