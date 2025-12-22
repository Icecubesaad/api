import * as Joi from 'joi';

export const envSchema = Joi.object({
  // Database
  DATABASE_URL: Joi.string().required(),
  
  // Redis
  REDIS_URL: Joi.string().required(),
  
  // S3 Storage - OPTIONAL
  S3_ENDPOINT: Joi.string().optional(),
  S3_BUCKET: Joi.string().optional(),
  S3_ACCESS_KEY: Joi.string().optional(),
  S3_SECRET_KEY: Joi.string().optional(),
  S3_REGION: Joi.string().default('us-east-1'),
  
  // Firebase
  FIREBASE_PROJECT_ID: Joi.string().required(),
  FIREBASE_CLIENT_EMAIL: Joi.string().required(),
  FIREBASE_PRIVATE_KEY: Joi.string().required(),
  FCM_SERVER_KEY: Joi.string().required(),
  
  // AI Provider
  OPENAI_API_KEY: Joi.string().required(),
  EMBEDDINGS_DIM: Joi.number().default(1536),
  
  // Stripe - OPTIONAL
  STRIPE_SECRET_KEY: Joi.string().optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
  STRIPE_PRICE_BASIC: Joi.string().optional(),
  STRIPE_PRICE_PREMIUM: Joi.string().optional(),
  
  // OAuth Providers - Google required, Microsoft optional
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  MICROSOFT_CLIENT_ID: Joi.string().optional(),
  MICROSOFT_CLIENT_SECRET: Joi.string().optional(),
  
  // App Configuration
  APP_BASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  
  // Rate Limiting
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
});
