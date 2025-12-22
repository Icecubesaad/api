import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleSignInDto {
  @ApiProperty({ 
    description: 'Firebase ID token obtained from Google Sign-In',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vam9ibWF0ZS0zMzhlOSIsImF1ZCI6ImpvYm1hdGUtMzM4ZTkiLCJhdXRoX3RpbWUiOjE3MDI2NTYwMDAsInVzZXJfaWQiOiJhYmMxMjMiLCJzdWIiOiJhYmMxMjMiLCJpYXQiOjE3MDI2NTYwMDAsImV4cCI6MTcwMjY1OTYwMCwiZW1haWwiOiJqb2huQGV4YW1wbGUuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWV9.signature'
  })
  @IsString()
  idToken: string;
}

