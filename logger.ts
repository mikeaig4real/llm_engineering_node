import pino from 'pino';
import { config } from './config.js';

const isProduction = config.NODE_ENV === 'production';
const isTest = config.NODE_ENV === 'test';

export const logger = pino({
  level: isTest
    ? (process.env.TEST_LOG_LEVEL || 'silent')
    : config.LOG_LEVEL,
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
