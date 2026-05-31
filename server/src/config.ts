import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  deepseekApiKey: requireEnv('DEEPSEEK_API_KEY'),
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  model: process.env.MODEL ?? 'deepseek-v4-flash',
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'hashing-local',
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 512),
  ragTopK: Number(process.env.RAG_TOP_K ?? 4),
  ragChunkSize: Number(process.env.RAG_CHUNK_SIZE ?? 800),
  ragChunkOverlap: Number(process.env.RAG_CHUNK_OVERLAP ?? 100),
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024),
} as const;
