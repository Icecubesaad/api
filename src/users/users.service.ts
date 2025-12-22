import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, Prisma, AuthProvider } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private db: DatabaseService) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      return await this.db.user.create({
        data: createUserDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('User with this email or Firebase UID already exists');
        }
      }
      throw error;
    }
  }

  async findAll(): Promise<User[]> {
    return this.db.user.findMany({
      include: {
        projects: true,
        subscriptions: true,
      },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.db.user.findUnique({
      where: { id },
      include: {
        projects: true,
        subscriptions: true,
        calendarLinks: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({
      where: { id },
    });
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return this.db.user.findUnique({
      where: { firebaseUid },
      include: {
        projects: true,
        subscriptions: true,
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      return await this.db.user.update({
        where: { id },
        data: updateUserDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`User with ID ${id} not found`);
        }
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.db.user.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`User with ID ${id} not found`);
        }
      }
      throw error;
    }
  }

  async getOrCreateUser(firebaseUser: { uid: string; email?: string | null; name?: string | null }): Promise<User> {
    console.log("🔧 UsersService - getOrCreateUser called with:", firebaseUser.uid, firebaseUser.email);
    
    let user = await this.findByFirebaseUid(firebaseUser.uid);
    console.log("🔍 UsersService - Found existing user:", user ? user.id : "none");
    
    if (!user) {
      if (firebaseUser.email) {
        user = await this.findByEmail(firebaseUser.email);
      }
    }

    if (!user) {
      console.log("🔧 UsersService - Creating new user...");
      user = await this.create({
        email: firebaseUser.email ?? `${firebaseUser.uid}@firebase.local`,
        displayName: firebaseUser.name,
        firebaseUid: firebaseUser.uid,
        authProvider: AuthProvider.FIREBASE,
      });
      console.log("✅ UsersService - Created new user:", user.id);
    } else if (user.authProvider !== AuthProvider.FIREBASE) {
      user = await this.update(user.id, {
        authProvider: AuthProvider.FIREBASE,
      });
    }

    return user;
  }
}
