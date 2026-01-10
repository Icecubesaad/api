import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
const helmet = require('helmet');
const compression = require('compression');
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './core/errors/all-exceptions.filter';
import { LoggerService } from './core/logging/logger.service';
import { getCorsConfig, getCSPDirectives } from './config/cors.config';
async function bootstrap() {
  console.log("Starting bootstrap...");
  console.log("Creating NestJS app...");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'], // Enable all logging
  });

  console.log("Getting config service...");
  const configService = app.get(ConfigService);
  const logger = app.get(LoggerService);

  // Security middleware - configure helmet to allow Firebase scripts
  app.use(helmet({
    contentSecurityPolicy: {
      directives: getCSPDirectives(),
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  app.use(compression());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // Allow extra properties for multipart uploads
      transform: true,
      skipMissingProperties: true, // Skip validation for missing properties
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global auth guard is now registered via APP_GUARD in AppModule

  // CORS - Configure for Firebase and frontend
  const isDevelopment = configService.get<string>('NODE_ENV') === 'development';
  app.enableCors(getCorsConfig(isDevelopment));

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('JobMate API')
    .setDescription(`
## 🚀 Quick Test Guide - Run endpoints in this order:

### Step 1: Auth
1. **POST /auth/signup** → Copy the \`token\` from response
2. Click **Authorize** button (top right) → Paste token → Click Authorize

### Step 2: Create Project  
3. **POST /projects** → Copy the \`id\` from response (this is your PROJECT_ID)

### Step 3: Create Note
4. **POST /notes** → Paste PROJECT_ID in \`projectId\` field → Copy \`id\` from response

### Step 4: Create Reminder
5. **POST /reminders** → Paste PROJECT_ID in \`projectId\` field

### Step 5: AI Chat
6. **POST /ai/chat** → Paste PROJECT_ID in \`projectId\` field → Ask anything!

### Other Endpoints
- **GET /projects** - List your projects
- **GET /notes** - List your notes  
- **GET /reminders** - List your reminders
- **GET /profile** - View your profile

---
⚠️ **Important**: Always paste your PROJECT_ID where you see "PASTE_PROJECT_ID_HERE"
    `)
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = configService.get<number>('app.port') || process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on port: ${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api`);
  console.log(`🔥 Firebase Test Page: http://localhost:${port}/firebase-test.html`);
}

bootstrap();
