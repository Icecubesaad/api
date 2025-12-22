import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-firebase-jwt';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseStrategy extends PassportStrategy(Strategy, 'firebase') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: (req) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          return authHeader.substring(7);
        }
        return null;
      },
    });

    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      const projectId = this.configService.get<string>('firebase.projectId');
      const clientEmail = this.configService.get<string>('firebase.clientEmail');
      const privateKey = this.configService.get<string>('firebase.privateKey');

      // Only initialize Firebase if valid credentials are provided
      const hasValidCredentials = 
        projectId && 
        !projectId.includes('your-') && 
        clientEmail && 
        !clientEmail.includes('xxxxx') &&
        privateKey && 
        privateKey.includes('BEGIN PRIVATE KEY') && 
        !privateKey.includes('YOUR_PRIVATE_KEY_HERE');

      if (hasValidCredentials) {
        try {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey: privateKey.replace(/\\n/g, '\n'),
            }),
          });
          console.log('✅ Firebase Admin initialized successfully');
        } catch (error) {
          console.warn('⚠️  Firebase Admin initialization failed:', error.message);
          console.warn('   Authentication will not work until valid Firebase credentials are provided.');
        }
      } else {
        console.warn('⚠️  Firebase credentials not configured properly.');
        console.warn('   Running in development mode without Firebase authentication.');
        console.warn('   Update FIREBASE_* variables in .env to enable authentication.');
      }
    }
  }

  async validate(payload: any) {
    if (!payload) {
      throw new Error('Invalid token');
    }

    return {
      uid: payload.uid,
      email: payload.email,
      email_verified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
    };
  }
}
