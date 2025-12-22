const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { ExpressAdapter } = require('@nestjs/platform-express');
const express = require('express');

// Import the compiled AppModule
const { AppModule } = require('../dist/src/app.module');

const server = express();
let cachedApp;

async function bootstrap() {
  if (!cachedApp) {
    console.log('[Vercel] Bootstrapping NestJS application...');
    
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
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
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    });

    await app.init();
    cachedApp = app;
    console.log('[Vercel] NestJS application initialized successfully');
  }
  return cachedApp;
}

module.exports = async (req, res) => {
  try {
    await bootstrap();
    server(req, res);
  } catch (error) {
    console.error('[Vercel] Error:', error.message);
    console.error('[Vercel] Stack:', error.stack);
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
};
