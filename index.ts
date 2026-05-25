import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { z } from 'zod';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './config.js';
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

// Swagger Docs Configuration
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LLM Engineering Toolkit API',
      version: '1.0.0',
      description: 'Interactive API Documentation generated automatically from JSDocs and TypeScript types',
    },
    servers: [
      {
        url: `http://localhost:${config.PORT}`,
        description: 'Development Server',
      },
    ],
  },
  apis: ['./index.ts', './dist/index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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

/**
 * @openapi
 * /:
 *   get:
 *     summary: Welcome endpoint
 *     description: Returns a welcome message for the LLM Engineering Node.js application.
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: welcome to LLM_ENGINEERING WITH NODEJS
 */
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'welcome to LLM_ENGINEERING WITH NODEJS',
  });
});

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health status check
 *     description: Check if the server is healthy and responding.
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   example: 2026-05-24T18:50:00Z
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @openapi
 * /echo:
 *   post:
 *     summary: Echo endpoint
 *     description: Echoes back a provided message after performing validation check.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The message to be echoed. Should be at least 1 character long.
 *                 example: Hello, OpenRouter!
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 echoed:
 *                   type: string
 *                   example: Hello, OpenRouter!
 *       400:
 *         description: Validation failure
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: Validation failed
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                         example: message
 *                       message:
 *                         type: string
 *                         example: Message is required and cannot be empty
 */
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
if (config.NODE_ENV !== 'test') {
  app.listen(config.PORT, () => {
    logger.info(`Server is running on http://localhost:${config.PORT}`);
  });
}

export { app };
