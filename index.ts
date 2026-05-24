import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { logger } from './logger.js';

const app = express();

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
      },
      `HTTP ${req.method} ${req.url} - ${res.statusCode}`
    );
  });
  next();
});

// Reusable Zod Validation Middleware for Request Body
export const validateBody = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    req.body = await schema.parseAsync(req.body);
    next();
  };
};

// Zod Schema Definition
export const EchoSchema = z.object({
  message: z.string({ message: 'Message is required and cannot be empty' }).min(1, 'Message is required and cannot be empty'),
});

// App Routes
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'welcome to LLM_ENGINEERING WITH NODEJS',
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.post('/echo', validateBody(EchoSchema), (req: Request, res: Response) => {
  const { message } = req.body;
  res.status(200).json({
    status: 'success',
    echoed: message,
  });
});

// Global Error Handler Middleware
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: err.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  logger.error(err, 'Unhandled error occurred');
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
};

app.use(errorHandler);

// Only listen to the port when we are not running tests
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
  });
}

export { app };
