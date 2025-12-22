import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project, Prisma } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private db: DatabaseService) {}

  async create(createProjectDto: CreateProjectDto, firebaseUid: string): Promise<Project> {
    console.log("🔧 Projects Service - Create called with:", createProjectDto, firebaseUid);
    console.log("🔍 Looking for user with firebaseUid:", firebaseUid);
    
    // Find the user by Firebase UID
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    console.log("✅ User found:", user.id);

    return this.db.project.create({
      data: {
        ...createProjectDto,
        ownerId: user.id, // Use the database user ID
      },
      include: {
        owner: true,
        notes: true,
        dailyLogs: true,
        reminders: true,
      },
    });
  }

  async findAll(firebaseUid: string): Promise<Project[]> {
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.db.project.findMany({
      where: {
        ownerId: user.id,
        archivedAt: null,
      },
      include: {
        owner: true,
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        dailyLogs: {
          orderBy: { date: 'desc' },
          take: 5,
        },
        reminders: {
          where: { status: 'PENDING' },
          orderBy: { dueAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, firebaseUid: string): Promise<Project> {
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const project = await this.db.project.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
      include: {
        owner: true,
        notes: {
          orderBy: { createdAt: 'desc' },
        },
        dailyLogs: {
          orderBy: { date: 'desc' },
        },
        reminders: {
          orderBy: { dueAt: 'asc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto, firebaseUid: string): Promise<Project> {
    console.log('🔧 Update project called:', { id, updateProjectDto, firebaseUid });
    
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      console.log('❌ User not found for firebaseUid:', firebaseUid);
      throw new NotFoundException('User not found');
    }

    console.log('✅ User found:', user.id);

    const project = await this.db.project.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
    });

    if (!project) {
      console.log('❌ Project not found:', id);
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    console.log('✅ Project found, updating...');

    // Remove ownerId from update data if present (shouldn't be changed)
    const { ownerId, ...safeUpdateData } = updateProjectDto as any;

    try {
      const updated = await this.db.project.update({
        where: { id },
        data: safeUpdateData,
        include: {
          owner: true,
          notes: true,
          dailyLogs: true,
          reminders: true,
        },
      });
      console.log('✅ Project updated successfully');
      return updated;
    } catch (error) {
      console.error('❌ Error updating project:', error);
      throw error;
    }
  }

  async archive(id: string, firebaseUid: string): Promise<Project> {
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const project = await this.db.project.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return this.db.project.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: {
        owner: true,
        notes: true,
        dailyLogs: true,
        reminders: true,
      },
    });
  }

  async remove(id: string, firebaseUid: string): Promise<Project> {
    const user = await this.db.user.findUnique({
      where: { firebaseUid }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const project = await this.db.project.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return this.db.project.delete({
      where: { id },
      include: {
        owner: true,
        notes: true,
        dailyLogs: true,
        reminders: true,
      },
    });
  }
}
