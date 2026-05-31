import 'dotenv/config';
import { z } from 'zod';
import pino from 'pino';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  OPENROUTER_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(['transformers', 'ollama', 'offline']).default('transformers'),
  EMBEDDING_MODEL: z.string().default('Xenova/bge-large-en-v1.5'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1024),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  INFERENCE_PROVIDER: z.enum(['openrouter', 'ollama']).default('openrouter'),
  INFERENCE_MODEL: z.string().default('google/gemini-2.5-flash'),
  SQLITE_DB_PATH: z.string().default('.storage/rag.db'),
  ORAMA_INDEX_PATH: z.string().default('.storage/oramaIndex.json'),
  HNSW_INDEX_PATH: z.string().default('.storage/hnsw.index'),
  HNSW_MAX_ELEMENTS: z.coerce.number().default(10000),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV !== 'test' && data.INFERENCE_PROVIDER === 'openrouter') {
    if (!data.OPENROUTER_API_KEY || data.OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENROUTER_API_KEY'],
        message: 'OPENROUTER_API_KEY is required when INFERENCE_PROVIDER is set to openrouter.',
      });
    }
  }
});

// Validate environment variables on startup
const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const isProduction = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';
    const tempLogger = pino({
      transport: !isProduction && !isTest
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    });

    tempLogger.error('Invalid Environment Configuration:');
    result.error.issues.forEach((issue) => {
      tempLogger.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    tempLogger.error('Please check your .env file or configuration parameters.');
    process.exit(1);
  }

  return result.data;
};

export const config = parseEnv();
