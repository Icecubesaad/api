import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Ignore favicon.ico requests and root path health checks - just return 404 without logging
    if (request.url === '/favicon.ico' || (request.url === '/' && (request.method === 'GET' || request.method === 'HEAD'))) {
      response.status(404).end();
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: typeof message === 'string' ? message : (message as any).message,
      error: typeof message === 'object' ? (message as any).error : undefined,
    };

    // Only log errors that are not 404 for favicon or root path health checks
    const isHealthCheck = (request.url === '/favicon.ico') || (request.url === '/' && (request.method === 'GET' || request.method === 'HEAD'));
    if (!isHealthCheck) {
      this.logger.error(
        `${request.method} ${request.url} - ${typeof message === 'string' ? message : JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      
      // Log full error details for debugging
      if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        console.error('🔴 Full error details:', exception);
      }
    }

    response.status(status).json(errorResponse);
  }
}
