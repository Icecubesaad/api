import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pino from 'pino';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: pino.Logger;

  constructor(private configService: ConfigService) {
    this.logger = pino({
      level: this.configService.get<string>('app.logLevel'),
      transport: this.configService.get<string>('app.nodeEnv') === 'development' 
        ? { target: 'pino-pretty' }
        : undefined,
    });
  }

  log(message: any, context?: string) {
    this.logger.info({ context }, message);
  }

  error(message: any, trace?: string, context?: string) {
    this.logger.error({ context, trace }, message);
  }

  warn(message: any, context?: string) {
    this.logger.warn({ context }, message);
  }

  debug(message: any, context?: string) {
    this.logger.debug({ context }, message);
  }

  verbose(message: any, context?: string) {
    this.logger.trace({ context }, message);
  }

  getPinoLogger(): pino.Logger {
    return this.logger;
  }
}
