import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private db: DatabaseService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ 
    status: 200, 
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        service: { type: 'string', example: 'JobMate API' },
        version: { type: 'string', example: '1.0.0' }
      }
    }
  })
  async check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'JobMate API',
      version: '1.0.0',
    };
  }

  @Public()
  @Get('detailed')
  @ApiOperation({ summary: 'Detailed health check with database status' })
  @ApiResponse({ 
    status: 200, 
    description: 'Detailed health status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        checks: {
          type: 'object',
          properties: {
            database: { type: 'string', example: 'healthy' },
            timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' }
          }
        },
        service: { type: 'string', example: 'JobMate API' },
        version: { type: 'string', example: '1.0.0' }
      }
    }
  })
  async detailedCheck() {
    const checks = {
      database: 'unknown',
      timestamp: new Date().toISOString(),
    };

    try {
      await this.db.$queryRaw`SELECT 1`;
      checks.database = 'healthy';
    } catch (error) {
      checks.database = 'unhealthy';
    }

    return {
      status: checks.database === 'healthy' ? 'ok' : 'error',
      checks,
      service: 'JobMate API',
      version: '1.0.0',
    };
  }
}
