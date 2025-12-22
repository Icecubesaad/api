import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleSignInDto } from './dto/google-signin.dto';
import { AuthProvider, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const normalizedEmail = dto.email.toLowerCase();
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      email: normalizedEmail,
      displayName: dto.displayName ?? normalizedEmail.split('@')[0],
      firebaseUid: `local-${randomUUID()}`,
      password: passwordHash,
      authProvider: AuthProvider.LOCAL,
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user || !user.password || user.authProvider !== AuthProvider.LOCAL) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordsMatch = await bcrypt.compare(dto.password, user.password);

    if (!passwordsMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async googleSignIn(dto: GoogleSignInDto) {
    const decodedToken = await admin.auth().verifyIdToken(dto.idToken);

    if (!decodedToken?.uid) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const user = await this.usersService.getOrCreateUser({
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
    });

    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      provider: user.authProvider,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: this.toSafeUser(user),
    };
  }

  private toSafeUser(user: User) {
    const { password, ...safeUser } = user;
    return safeUser;
  }
}

