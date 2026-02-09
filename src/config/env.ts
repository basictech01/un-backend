import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Look for the .env file in the project root
const envPath = path.join(__dirname, '..', '..', '.env');
const result = config({ path: envPath });

if (result.error) {
  console.warn(`Warning: Environment file not found at ${envPath}`);
}

// Server configuration
export const PORT = process.env.PORT;
export const NODE_ENV = process.env.NODE_ENV;

// Database configuration
export const DB_HOST = process.env.DB_HOST!;
export const DB_USER = process.env.DB_USER!;
export const DB_PASSWORD = process.env.DB_PASSWORD!;
export const DB_NAME = process.env.DB_NAME!;
export const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);

// JWT configuration
export const JWT_SECRET = process.env.JWT_SECRET!;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
export const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN;

// CORS configuration
export const CORS_ORIGIN = process.env.CORS_ORIGIN;

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
export const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

// Azure Blob Storage
export const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING!;
export const AZURE_CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME || 'images';

// File upload secret for filename hashing
export const FILE_CREATION_SECRET_KEY = process.env.FILE_CREATION_SECRET_KEY || 'un-backend-file-key';
