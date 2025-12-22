export interface DatabaseConfig {
  url: string;
}

export interface RedisConfig {
  url: string;
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
}

export interface FirebaseConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  fcmServerKey: string;
}

export interface AIConfig {
  openaiApiKey: string;
  embeddingsDim: number;
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  priceBasic: string;
  pricePremium: string;
}

export interface OAuthConfig {
  google: {
    clientId: string;
    clientSecret: string;
  };
  microsoft: {
    clientId: string;
    clientSecret: string;
  };
}

export interface AppConfig {
  baseUrl: string;
  jwtSecret: string;
  nodeEnv: string;
  port: number;
  throttleTtl: number;
  throttleLimit: number;
  logLevel: string;
}

export interface Configuration {
  database: DatabaseConfig;
  redis: RedisConfig;
  s3: S3Config;
  firebase: FirebaseConfig;
  ai: AIConfig;
  stripe: StripeConfig;
  oauth: OAuthConfig;
  app: AppConfig;
}

export default (): Configuration => ({
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    region: process.env.S3_REGION || 'us-east-1',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    fcmServerKey: process.env.FCM_SERVER_KEY,
  },
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    embeddingsDim: parseInt(process.env.EMBEDDINGS_DIM, 10) || 1536,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceBasic: process.env.STRIPE_PRICE_BASIC,
    pricePremium: process.env.STRIPE_PRICE_PREMIUM,
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    },
  },
  app: {
    baseUrl: process.env.APP_BASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    throttleTtl: parseInt(process.env.THROTTLE_TTL, 10) || 60,
    throttleLimit: parseInt(process.env.THROTTLE_LIMIT, 10) || 100,
    logLevel: process.env.LOG_LEVEL || 'info',
  },
});
