import { env, pipeline } from '@xenova/transformers';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SqliteDatabase } from './sqlite_database.js';
import { OramaIndex } from './orama_index.js';
import { HnswIndex } from './hnsw_index.js';
import { logger } from './logger.js';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure local-only model loading for Xenova transformers
env.localModelPath = path.join(__dirname, 'node_modules', '@xenova/transformers', '.cache');
env.allowRemoteModels = false;

let dbInstance: SqliteDatabase | null = null;
let keywordIndexInstance: OramaIndex | null = null;
let vectorIndexInstance: HnswIndex | null = null;
let extractorInstance: any = null;
let initPromise: Promise<void> | null = null;

/**
 * Checks if document ingestion has been performed by verifying the existence of SQLite, Orama, and HNSW files.
 */
export function checkIngestionStatus(): { ingested: boolean; reason?: string } {
  if (!fs.existsSync(config.SQLITE_DB_PATH)) {
    return { ingested: false, reason: `SQLite database file not found at "${config.SQLITE_DB_PATH}".` };
  }
  if (!fs.existsSync(config.ORAMA_INDEX_PATH)) {
    return { ingested: false, reason: `Orama keyword index file not found at "${config.ORAMA_INDEX_PATH}".` };
  }
  if (!fs.existsSync(config.HNSW_INDEX_PATH)) {
    return { ingested: false, reason: `HNSW vector index file not found at "${config.HNSW_INDEX_PATH}".` };
  }
  return { ingested: true };
}

/**
 * Initializes and connects to the SQLite Database at the specified path.
 */
export async function setupSqlite(dbPath: string): Promise<SqliteDatabase> {
  const absolutePath = path.resolve(process.cwd(), dbPath);
  const dbDir = path.dirname(absolutePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const db = new SqliteDatabase(absolutePath);
  await db.initialize();
  return db;
}

/**
 * Initializes and connects to the Orama Keyword Index.
 */
export async function setupOrama(indexPath: string): Promise<OramaIndex> {
  const absolutePath = path.resolve(process.cwd(), indexPath);
  const oramaDir = path.dirname(absolutePath);
  if (!fs.existsSync(oramaDir)) {
    fs.mkdirSync(oramaDir, { recursive: true });
  }
  const index = new OramaIndex(absolutePath);
  await index.initialize();
  return index;
}

/**
 * Initializes and connects to the HNSW Vector Index.
 */
export async function setupHnsw(
  dimensions: number,
  indexPath: string,
  maxElements: number
): Promise<HnswIndex> {
  const absolutePath = path.resolve(process.cwd(), indexPath);
  const hnswDir = path.dirname(absolutePath);
  if (!fs.existsSync(hnswDir)) {
    fs.mkdirSync(hnswDir, { recursive: true });
  }
  const index = new HnswIndex(dimensions, absolutePath);
  await index.initialize(maxElements);
  return index;
}

/**
 * Creates a deterministic, normalized offline mockup vector generator
 * matching the specified embedding dimensions.
 */
export function makeOfflineExtractor(dimensions: number): (text: string) => Promise<{ data: Float32Array }> {
  return async (text: string) => {
    const hash = crypto.createHash('sha256').update(text).digest();
    const vector = new Array(dimensions).fill(0).map((_, i) => {
      return Math.sin(hash[i % 32] + i);
    });
    
    // Normalize vector for proper cosine distance
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    const normalized = vector.map(val => val / (magnitude || 1));
    
    return {
      data: new Float32Array(normalized)
    };
  };
}

/**
 * Verifies connection and sets up the Ollama embedding generator.
 */
export async function setupOllamaExtractor(
  baseUrl: string,
  modelName: string,
  dimensionsFallback: number
): Promise<(text: string) => Promise<{ data: Float32Array }>> {
  const ollamaEndpoint = `${baseUrl}/api/embeddings`;
  logger.info({ endpoint: ollamaEndpoint, model: modelName }, 'Connecting to Ollama service...');

  // Verify Ollama connection and model existence
  const testRes = await fetch(ollamaEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      prompt: 'test connection'
    })
  });

  if (!testRes.ok) {
    const detail = await testRes.text();
    throw new Error(`Ollama returned status ${testRes.status}: ${detail}`);
  }

  logger.info('Ollama connection test succeeded. Using Ollama embedding generator.');

  return async (text: string) => {
    const res = await fetch(ollamaEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt: text
      })
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Ollama embedding generation failed: ${detail}`);
    }

    const data = (await res.json()) as { embedding: number[] };
    return {
      data: new Float32Array(data.embedding)
    };
  };
}

/**
 * Sets up local transformers ONNX pipeline model.
 */
export async function setupTransformersExtractor(modelName: string): Promise<any> {
  logger.info({ model: modelName }, 'Loading local embedding pipeline model...');
  return await pipeline('feature-extraction', modelName);
}

/**
 * Connects to OpenRouter's unified embeddings API endpoint.
 */
export async function setupOpenRouterExtractor(apiKey: string, modelName: string): Promise<any> {
  logger.info({ model: modelName }, 'Initializing OpenRouter embedding service...');
  const openrouterEndpoint = 'https://openrouter.ai/api/v1/embeddings';

  // Verify connection with a test prompt
  const testRes = await fetch(openrouterEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelName,
      input: 'test connection'
    })
  });

  if (!testRes.ok) {
    const detail = await testRes.text();
    throw new Error(`OpenRouter returned status ${testRes.status}: ${detail}`);
  }

  logger.info('OpenRouter embedding connection test succeeded.');

  return async (text: string) => {
    const res = await fetch(openrouterEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        input: text
      })
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`OpenRouter embedding generation failed: ${detail}`);
    }

    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return {
      data: new Float32Array(data.data[0].embedding)
    };
  };
}

/**
 * Initializes RAG resources orchestrating databases and embedding models.
 */
export async function initializeResources(requireIngested = false): Promise<{
  db: SqliteDatabase;
  keywordIndex: OramaIndex;
  vectorIndex: HnswIndex;
  extractor: any;
}> {
  if (requireIngested) {
    const status = checkIngestionStatus();
    if (!status.ingested) {
      throw new Error(`RAG Ingestion Check Failed: ${status.reason} You MUST run document ingestion first via 'npm run ingest'`);
    }
  }

  if (initPromise) {
    await initPromise;
    return {
      db: dbInstance!,
      keywordIndex: keywordIndexInstance!,
      vectorIndex: vectorIndexInstance!,
      extractor: extractorInstance!
    };
  }

  initPromise = (async () => {
    logger.info(
      { 
        provider: config.EMBEDDING_PROVIDER, 
        model: config.EMBEDDING_MODEL, 
        dimensions: config.EMBEDDING_DIMENSIONS 
      },
      'Initializing common RAG resources (databases & embedding model)...'
    );
    
    // 1. Initialize databases and indexing engines
    dbInstance = await setupSqlite(config.SQLITE_DB_PATH);
    keywordIndexInstance = await setupOrama(config.ORAMA_INDEX_PATH);
    vectorIndexInstance = await setupHnsw(
      config.EMBEDDING_DIMENSIONS,
      config.HNSW_INDEX_PATH,
      config.HNSW_MAX_ELEMENTS
    );

    // 2. Setup embedding extractor based on provider selection
    if (config.EMBEDDING_PROVIDER === 'offline') {
      logger.info('Using offline deterministic mockup generator.');
      extractorInstance = makeOfflineExtractor(config.EMBEDDING_DIMENSIONS);
    } 
    else if (config.EMBEDDING_PROVIDER === 'ollama') {
      try {
        extractorInstance = await setupOllamaExtractor(
          config.OLLAMA_BASE_URL,
          config.EMBEDDING_MODEL,
          config.EMBEDDING_DIMENSIONS
        );
      } catch (err: any) {
        logger.warn(
          { error: err.message, model: config.EMBEDDING_MODEL },
          'Ollama embedding service connection failed. Falling back to offline mockup generator.'
        );
        extractorInstance = makeOfflineExtractor(config.EMBEDDING_DIMENSIONS);
      }
    } 
    else if (config.EMBEDDING_PROVIDER === 'openrouter') {
      try {
        extractorInstance = await setupOpenRouterExtractor(
          config.OPENROUTER_API_KEY || '',
          config.EMBEDDING_MODEL
        );
      } catch (err: any) {
        logger.warn(
          { error: err.message, model: config.EMBEDDING_MODEL },
          'OpenRouter embedding service connection failed. Falling back to offline mockup generator.'
        );
        extractorInstance = makeOfflineExtractor(config.EMBEDDING_DIMENSIONS);
      }
    }
    else {
      // Default: transformers local ONNX
      try {
        extractorInstance = await setupTransformersExtractor(config.EMBEDDING_MODEL);
      } catch (err: any) {
        logger.warn(
          { error: err.message, model: config.EMBEDDING_MODEL },
          'Failed to load transformers model locally. Falling back to offline mockup generator.'
        );
        extractorInstance = makeOfflineExtractor(config.EMBEDDING_DIMENSIONS);
      }
    }
    
    logger.info('Common RAG resources initialized successfully.');
  })();

  await initPromise;

  return {
    db: dbInstance!,
    keywordIndex: keywordIndexInstance!,
    vectorIndex: vectorIndexInstance!,
    extractor: extractorInstance!
  };
}

export async function closeResources(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
  keywordIndexInstance = null;
  vectorIndexInstance = null;
  extractorInstance = null;
  initPromise = null;
}
