import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as admin from 'firebase-admin';
import { UsersService } from '../users/users.service';
import { User } from '@prisma/client';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    const localUser = await this.validateLocalToken(token);
    if (localUser) {
      request.user = localUser;
      return true;
    }

    const firebaseUser = await this.validateFirebaseToken(token);
    if (firebaseUser) {
      request.user = firebaseUser;
      return true;
    }

    throw new UnauthorizedException('Invalid token');
  }

  private async validateLocalToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token);

      if (!payload?.sub) {
        return null;
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        return null;
      }

      return this.buildRequestUser(user);
    } catch (error) {
      return null;
    }
  }

  private async validateFirebaseToken(token: string) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      const user = await this.usersService.getOrCreateUser({
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
      });

      return this.buildRequestUser(user, {
        picture: decodedToken.picture,
        email_verified: decodedToken.email_verified,
      });
    } catch (error) {
      console.error('Firebase auth error:', error?.message ?? error);
      return null;
    }
  }

  private buildRequestUser(user: User, extras: Record<string, any> = {}) {
    const { password, ...safeUser } = user as any;

    return {
      uid: user.firebaseUid,
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      authProvider: user.authProvider,
      dbUser: safeUser,
      ...extras,
    };
  }
}
