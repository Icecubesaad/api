import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const getCorsConfig = (isDevelopment: boolean): CorsOptions => {
  // Allow all origins in production for flexibility
  // You can restrict this later once you know all your domains
  return {
    origin: true, // Allow all origins
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
      'X-Api-Key',
      'Cache-Control',
      'Pragma',
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
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
    "https://*.firebaseapp.com",
    "https://*.railway.app",
    "https://*.vercel.app",
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
    "https:",
    "wss:",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://www.googleapis.com",
    "https://fcmregistrations.googleapis.com",
    "https://firebaseinstallations.googleapis.com",
    "https://firebase.googleapis.com",
    "https://firebaseremoteconfig.googleapis.com",
    "https://content-firebaseappcheck.googleapis.com",
    "https://*.railway.app",
    "https://*.vercel.app",
    "https://*.render.com",
  ],
  frameSrc: [
    "'self'",
    "https://accounts.google.com",
    "https://*.firebaseapp.com",
    "https://*.web.app",
    "https://*.railway.app",
    "https://*.vercel.app",
  ],
  fontSrc: [
    "'self'",
    "https://fonts.gstatic.com",
    "https://fonts.googleapis.com",
    "data:",
  ],
  manifestSrc: ["'self'"],
  mediaSrc: ["'self'", "data:", "blob:"],
  workerSrc: ["'self'", "blob:"],
});