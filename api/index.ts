import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';
import { AppModule } from '../src/app.module';

const server: Express = express();

let app: any;

async function bootstrap() {
  if (!app) {
    try {
      console.log('Bootstrapping NestJS app...');
      app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
        logger: ['error', 'warn', 'log'],
      });
      
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: false,
          transform: true,
          skipMissingProperties: true,
        }),
      );
      
      app.enableCors({
        origin: true,
        credentials: true,
      });
      
      await app.init();
      console.log('NestJS app initialized successfully');
    } catch (error) {
      console.error('Failed to bootstrap NestJS app:', error);
      throw error;
    }
  }
  return app;
}

export default async (req: any, res: any) => {
  try {
    await bootstrap();
    server(req, res);
  } catch (error) {
    console.error('Request handler error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
