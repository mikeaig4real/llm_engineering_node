import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { encodingForModel } from 'js-tiktoken';
import { logger } from './logger.js';
import { 
  scanDirectory, 
  readFileContent, 
  parseMarkdown, 
  chunkText, 
  isTextFile, 
  startTimer 
} from './rag_utils.js';
import { IngestedNode, FileSystemItem } from './schema_interface.js';
import { initializeResources, closeResources } from './rag_resources.js';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KNOWLEDGE_BASE_PATH = path.resolve(__dirname, 'knowledge-base');

// Constant rate for input token pricing (e.g. OpenAI BGE-equivalent/text-embedding-3-large pricing: $0.00013 per 1k tokens)
const COST_PER_1K_TOKENS = 0.00013;

interface IngestionTracker {
  totalTokensIngested: number;
  totalCharactersIngested: number;
  totalNodesInserted: number;
}

interface IngestResources {
  db: any;
  keywordIndex: any;
  vectorIndex: any;
  extractor: any;
  encoder: any;
}

/**
 * Clears any pre-existing database and index files specified in our configuration to start ingestion with a fresh state.
 */
function clearStorage() {
  const filesToDelete = [
    path.resolve(process.cwd(), config.SQLITE_DB_PATH),
    path.resolve(process.cwd(), config.ORAMA_INDEX_PATH),
    path.resolve(process.cwd(), config.HNSW_INDEX_PATH)
  ];

  logger.info('Clearing existing storage files before beginning ingestion...');
  for (const filePath of filesToDelete) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err: any) {
        logger.warn({ filePath, error: err.message }, 'Unable to delete existing storage file.');
      }
    }
  }
}

/**
 * Decoupled helper that processes and persists a single chunk across SQLite, HNSW vector, and Orama keyword indexes.
 */
async function ingestChunk(
  chunk: { text: string; raw: string },
  file: FileSystemItem,
  contentType: IngestedNode['contentType'],
  depth: number | undefined,
  items: string[] | undefined,
  headers: string[] | undefined,
  rows: string[][] | undefined,
  lang: string | undefined,
  contentIndex: number,
  resources: IngestResources,
  tracker: IngestionTracker
): Promise<void> {
  const { db, keywordIndex, vectorIndex, extractor, encoder } = resources;

  const charLength = chunk.text.length;
  const tokens = encoder.encode(chunk.text);
  const tokenCount = tokens.length;

  tracker.totalTokensIngested += tokenCount;
  tracker.totalCharactersIngested += charLength;

  // Generate local embedding vector
  const output = await extractor(chunk.text, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data) as number[];

  const docModifiedAt = file.modifiedAt || new Date();
  const docCreatedAt = file.createdAt || new Date();

  // Map fields to IngestedNode schema structure
  const nodeData: Omit<IngestedNode, 'sqliteId'> = {
    id: crypto.randomUUID(),
    docName: file.name,
    docPath: file.path,
    docRelativePath: file.relativePath,
    docSize: file.size,
    docExtension: file.extension,
    docModifiedAt,
    docCreatedAt,
    contentIndex,
    contentType,
    contentText: chunk.text,
    contentRaw: chunk.raw,
    contentDepth: depth,
    contentItems: items,
    contentHeaders: headers,
    contentRows: rows,
    contentLang: lang,
    contentCharLength: charLength,
    contentTokenCount: tokenCount,
    contentCreatedAt: new Date(),
    contentModifiedAt: new Date()
  };

  // SQLite insert (retrieving auto-increment integer sqliteId)
  const sqliteId = await db.insertNode(nodeData);

  // Vector Index insert mapped via sqliteId
  await vectorIndex.addPoint(embedding, sqliteId);

  // Keyword Index insert mapped via id/sqliteId pointer alignment
  await keywordIndex.insertNode({
    id: nodeData.id,
    sqliteId,
    docName: nodeData.docName,
    docRelativePath: nodeData.docRelativePath,
    contentType: nodeData.contentType,
    contentText: nodeData.contentText
  });

  tracker.totalNodesInserted++;
}

/**
 * Reads, parses, chunks, and queues ingestion for elements within a single file.
 */
async function processFile(
  file: FileSystemItem,
  resources: IngestResources,
  tracker: IngestionTracker
): Promise<void> {
  logger.info({ filePath: file.relativePath }, `Processing file: ${file.name}`);
  const content = await readFileContent(file.path);
  
  // Parse markdown elements
  const rawElements = parseMarkdown(content);
  
  const groupedChunks: {
    text: string;
    raw: string;
    type: string;
    depth?: number;
    items?: string[];
    headers?: string[];
    rows?: string[][];
    lang?: string;
  }[] = [];

  let currentAccumulator: typeof rawElements = [];
  let currentLength = 0;
  let activeHeadings: string[] = [];

  for (const el of rawElements) {
    if (el.type === 'heading') {
      // Flush current accumulator before starting a new heading section
      if (currentAccumulator.length > 0) {
        const headingPrefix = activeHeadings.filter(Boolean).join('\n\n') + '\n\n';
        const text = (headingPrefix + currentAccumulator.map(x => x.text).join('\n\n')).trim();
        const raw = (headingPrefix + currentAccumulator.map(x => x.raw).join('\n\n')).trim();
        
        const firstEl = currentAccumulator[0];
        groupedChunks.push({
          text,
          raw,
          type: firstEl.type,
          depth: el.depth,
          items: currentAccumulator.flatMap(x => x.items || []),
          headers: firstEl.headers,
          rows: firstEl.rows,
          lang: firstEl.lang
        });
        currentAccumulator = [];
        currentLength = 0;
      }
      
      // Update active headings
      const depth = el.depth || 1;
      activeHeadings = activeHeadings.slice(0, depth - 1);
      activeHeadings[depth - 1] = el.raw.trim();
    } else {
      const elLength = el.text.length;
      // If adding this element would exceed 1000 characters, flush first
      if (currentLength + elLength > 1000 && currentAccumulator.length > 0) {
        const headingPrefix = activeHeadings.filter(Boolean).join('\n\n') + '\n\n';
        const text = (headingPrefix + currentAccumulator.map(x => x.text).join('\n\n')).trim();
        const raw = (headingPrefix + currentAccumulator.map(x => x.raw).join('\n\n')).trim();
        const firstEl = currentAccumulator[0];
        groupedChunks.push({
          text,
          raw,
          type: firstEl.type,
          items: currentAccumulator.flatMap(x => x.items || []),
          headers: firstEl.headers,
          rows: firstEl.rows,
          lang: firstEl.lang
        });
        currentAccumulator = [];
        currentLength = 0;
      }
      currentAccumulator.push(el);
      currentLength += elLength;
    }
  }

  // Flush remaining elements
  if (currentAccumulator.length > 0) {
    const headingPrefix = activeHeadings.filter(Boolean).join('\n\n') + '\n\n';
    const text = (headingPrefix + currentAccumulator.map(x => x.text).join('\n\n')).trim();
    const raw = (headingPrefix + currentAccumulator.map(x => x.raw).join('\n\n')).trim();
    const firstEl = currentAccumulator[0];
    groupedChunks.push({
      text,
      raw,
      type: firstEl.type,
      items: currentAccumulator.flatMap(x => x.items || []),
      headers: firstEl.headers,
      rows: firstEl.rows,
      lang: firstEl.lang
    });
  }

  let contentIndex = 0;

  for (const chunk of groupedChunks) {
    const chunkTextStr = chunk.text.trim();
    if (!chunkTextStr) continue;

    let chunksToIngest: { text: string; raw: string }[] = [];

    if (chunkTextStr.length <= 1200) {
      chunksToIngest.push({ text: chunkTextStr, raw: chunk.raw });
    } else {
      logger.info(
        { charLength: chunkTextStr.length, type: chunk.type },
        `Grouped chunk exceeds 1200 chars. Falling back to sliding-window chunking.`
      );
      const subChunks = chunkText(chunkTextStr, file.path, 1000, 200);
      chunksToIngest = subChunks.map(sc => ({ text: sc.text, raw: sc.text }));
    }

    for (const subChunk of chunksToIngest) {
      await ingestChunk(
        subChunk,
        file,
        chunk.type as IngestedNode['contentType'],
        chunk.depth,
        chunk.items && chunk.items.length > 0 ? chunk.items : undefined,
        chunk.headers,
        chunk.rows,
        chunk.lang,
        contentIndex++,
        resources,
        tracker
      );
    }
  }
}

export async function ingestDocuments(basePath: string = KNOWLEDGE_BASE_PATH): Promise<void> {
  const timer = startTimer();
  logger.info({ basePath }, 'Initializing Hybrid Ingestion Pipeline...');

  if (!fs.existsSync(basePath)) {
    logger.error({ basePath }, 'Source folder path does not exist. Aborting Ingestion.');
    return;
  }

  // Clear storage first to ensure no duplicates or leftover indices
  clearStorage();

  // 1. Initialize databases and indexing engines from shared resources
  const { db, keywordIndex, vectorIndex, extractor } = await initializeResources();
  await db.clearTable();

  // 2. Initialize Token Encoder
  const encoder = encodingForModel('gpt-4o');

  // 3. Scan files in knowledge-base
  logger.info('Scanning files in knowledge-base...');
  const directoryContents = await scanDirectory(basePath);
  const filesToProcess = directoryContents.filter(item => item.type === 'file' && isTextFile(item.path));
  logger.info({ totalFiles: filesToProcess.length }, 'Files scanned.');

  const tracker: IngestionTracker = {
    totalTokensIngested: 0,
    totalCharactersIngested: 0,
    totalNodesInserted: 0
  };

  const resources: IngestResources = {
    db,
    keywordIndex,
    vectorIndex,
    extractor,
    encoder
  };

  // 4. Parse, Chunk, Embed and Ingest
  for (const file of filesToProcess) {
    await processFile(file, resources, tracker);
  }

  // 5. Save indexes
  logger.info('Saving full-text and vector indexes to storage directory...');
  await keywordIndex.save();
  await vectorIndex.save();

  // Close database connections
  await closeResources();

  // Ingestion metrics and cost estimations
  const totalCost = (tracker.totalTokensIngested / 1000) * COST_PER_1K_TOKENS;
  const elapsedSeconds = timer.getElapsedSeconds();

  logger.info(
    {
      durationSeconds: elapsedSeconds,
      totalNodesInserted: tracker.totalNodesInserted,
      totalCharactersIngested: tracker.totalCharactersIngested,
      totalTokensIngested: tracker.totalTokensIngested,
      estimatedIngestionCostUsd: totalCost.toFixed(6)
    },
    'Hybrid Document Ingestion Completed Successfully!'
  );
}

// Support direct run
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  (async () => {
    try {
      await ingestDocuments();
    } catch (err) {
      logger.error(err, 'Ingestion runner error');
    }
  })();
}
