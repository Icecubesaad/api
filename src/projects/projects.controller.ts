import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { User } from '../auth/decorators/user.decorator';

@ApiTags('projects')
@Controller('projects')
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created successfully', type: ProjectResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @Body() createProjectDto: CreateProjectDto,
    @User() user: any,
  ) {
    console.log("🎯 Projects Controller - Create method called with:", createProjectDto, user);
    console.log("🎯 Calling projects service with:", createProjectDto, user.uid);
    return this.projectsService.create(createProjectDto, user.uid);
  }

  @Get()
  @ApiOperation({ summary: 'Get all user projects' })
  @ApiResponse({ status: 200, description: 'List of projects', type: [ProjectResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@User() user: any) {
    return this.projectsService.findAll(user.uid);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiParam({ name: 'id', description: 'Project ID (CUID)' })
  @ApiResponse({ status: 200, description: 'Project found', type: ProjectResponseDto })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findOne(@Param('id') id: string, @User() user: any) {
    return this.projectsService.findOne(id, user.uid);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project' })
  @ApiParam({ name: 'id', description: 'Project ID (CUID)' })
  @ApiResponse({ status: 200, description: 'Project updated successfully', type: ProjectResponseDto })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @User() user: any,
  ) {
    return this.projectsService.update(id, updateProjectDto, user.uid);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive project' })
  @ApiParam({ name: 'id', description: 'Project ID (CUID)' })
  @ApiResponse({ status: 200, description: 'Project archived successfully', type: ProjectResponseDto })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async archive(@Param('id') id: string, @User() user: any) {
    return this.projectsService.archive(id, user.uid);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete project' })
  @ApiParam({ name: 'id', description: 'Project ID (CUID)' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async remove(@Param('id') id: string, @User() user: any) {
    return this.projectsService.remove(id, user.uid);
  }
}
