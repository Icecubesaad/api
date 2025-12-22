import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const getCorsConfig = (isDevelopment: boolean): CorsOptions => {
  const developmentOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];

  const productionOrigins = [
    'https://jobmate-122bd.firebaseapp.com',
    'https://jobmate-122bd.web.app',
    'https://accounts.google.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
  ];

  const firebaseOrigins = [
    'https://accounts.google.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://www.googleapis.com',
    'https://firebase.googleapis.com',
  ];

  return {
    origin: isDevelopment 
      ? [...developmentOrigins, ...firebaseOrigins, ...productionOrigins]
      : [...productionOrigins, ...firebaseOrigins],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Firebase-Auth',
      'Firebase-Instance-ID-Token',
      'X-Client-Version',
      'X-Firebase-Client',
      'X-Firebase-Client-Log-Type',
      'X-Goog-Api-Key',
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400, // 24 hours
  };
};

export const getCSPDirectives = () => ({
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://www.gstatic.com",
    "https://apis.google.com",
    "https://www.googleapis.com",
    "https://securetoken.googleapis.com",
  ],
  scriptSrcAttr: ["'unsafe-inline'"],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
  ],
  imgSrc: [
    "'self'",
    "data:",
    "https:",
    "blob:",
    "https://lh3.googleusercontent.com",
    "https://www.gravatar.com",
  ],
  connectSrc: [
    "'self'",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://www.googleapis.com",
    "https://fcmregistrations.googleapis.com",
    "https://firebaseinstallations.googleapis.com",
    "https://firebase.googleapis.com",
    "https://firebaseremoteconfig.googleapis.com",
    "https://content-firebaseappcheck.googleapis.com",
  ],
  frameSrc: [
    "'self'",
    "https://accounts.google.com",
    "https://jobmate-122bd.firebaseapp.com",
    "https://jobmate-122bd.web.app",
  ],
  fontSrc: [
    "'self'",
    "https://fonts.gstatic.com",
    "https://fonts.googleapis.com",
  ],
  manifestSrc: ["'self'"],
  mediaSrc: ["'self'", "data:", "blob:"],
});