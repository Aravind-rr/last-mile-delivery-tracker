import dotenv from 'dotenv';
import path from 'path';

// Load .env from the server directory whether we run from source (cwd=server)
// or from the compiled bundle (cwd=repo root). On a hosted platform the
// variables are injected directly and these lookups simply find nothing.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

export const env = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  notificationDriver: process.env.NOTIFICATION_DRIVER || 'console',
};
