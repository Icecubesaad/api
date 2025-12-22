import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ description: 'Notification preferences' })
  @IsOptional()
  @IsObject()
  notifPrefs?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Stripe customer ID' })
  @IsOptional()
  @IsString()
  stripeCustomerId?: string;
}
