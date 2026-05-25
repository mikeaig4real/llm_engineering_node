import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  OPENROUTER_API_KEY: process.env.NODE_ENV === 'test'
    ? z.string().default('test_api_key_placeholder')
    : z.string({
        message: 'OPENROUTER_API_KEY is required. Please set it in your .env file.',
      }).min(1, 'OPENROUTER_API_KEY cannot be empty'),
});

// Validate environment variables on startup
const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('\n❌ Invalid Environment Configuration:');
    result.error.issues.forEach((issue) => {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    console.error('\nPlease check your .env file or configuration parameters.\n');
    process.exit(1);
  }

  return result.data;
};

export const config = parseEnv();
