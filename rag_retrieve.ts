import { logger } from './logger.js';
import { initializeResources } from './rag_resources.js';
import { startTimer } from './rag_utils.js';
import { SqliteDatabase } from './sqlite_database.js';
import { config } from './config.js';

export interface RetrievalResult {
  content: string;
  metadata: Record<string, any>;
  score: number;
}

/**
 * Performs Reciprocal Rank Fusion (RRF) on vector and keyword search results.
 * Returns sorted [sqliteId, rrfScore] pairs.
 */
export function reciprocalRankFusion(
  vectorResults: { sqliteId: number; score: number }[],
  keywordResults: { sqliteId: number; score: number }[],
  limit: number,
  K = 60
): [number, number][] {
  const rrfScores = new Map<number, number>();

  vectorResults.forEach((res, index) => {
    const rank = index + 1;
    const score = 1 / (K + rank);
    rrfScores.set(res.sqliteId, (rrfScores.get(res.sqliteId) || 0) + score);
  });

  keywordResults.forEach((res, index) => {
    const rank = index + 1;
    const score = 1 / (K + rank);
    rrfScores.set(res.sqliteId, (rrfScores.get(res.sqliteId) || 0) + score);
  });

  return Array.from(rrfScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/**
 * Hydrates candidate nodes from SQLite database using the sorted RRF results.
 */
export async function hydrateCandidates(
  sortedCandidates: [number, number][],
  db: SqliteDatabase
): Promise<RetrievalResult[]> {
  const topSqliteIds = sortedCandidates.map(c => c[0]);

  if (topSqliteIds.length === 0) {
    return [];
  }

  logger.info({ topSqliteIds }, 'Hydrating top candidates from SQLite...');
  const hydratedNodes = await db.getNodes(topSqliteIds);

  const nodeMap = new Map<number, typeof hydratedNodes[0]>();
  for (const node of hydratedNodes) {
    nodeMap.set(node.sqliteId, node);
  }

  const results: RetrievalResult[] = [];
  for (const [sqliteId, rrfScore] of sortedCandidates) {
    const node = nodeMap.get(sqliteId);
    if (node) {
      results.push({
        content: node.contentText,
        metadata: {
          id: node.id,
          sqliteId: node.sqliteId,
          docName: node.docName,
          docRelativePath: node.docRelativePath,
          contentType: node.contentType,
          contentCharLength: node.contentCharLength,
          contentTokenCount: node.contentTokenCount,
          docExtension: node.docExtension,
          docSize: node.docSize
        },
        score: rrfScore
      });
    }
  }

  return results;
}

/**
 * Retrieves relevant document chunks based on a query using Reciprocal Rank Fusion (RRF) over Orama and HNSW index outputs.
 * 
 * @param query - The user query text.
 * @param limit - Max number of results to return.
 */
export async function retrieveChunks(query: string, limit = 10): Promise<RetrievalResult[]> {
  const timer = startTimer();
  logger.info({ query, limit }, 'Starting hybrid retrieval...');

  try {
    // Retrieve singletons from shared resources
    const { db, keywordIndex, vectorIndex, extractor } = await initializeResources(true);

    // 1. Keyword search (Orama)
    const keywordTimer = startTimer();
    const keywordResults = await keywordIndex.search(query, limit * 3);
    const keywordDuration = keywordTimer.getElapsedMs();

    // 2. Vector search (HNSW)
    const vectorEmbeddingTimer = startTimer();
    let embedQuery = query;
    if (config.EMBEDDING_MODEL.toLowerCase().includes('bge')) {
      embedQuery = `Represent this sentence for searching relevant passages: ${query}`;
    }
    const output = await extractor(embedQuery, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(output.data) as number[];
    const embeddingDuration = vectorEmbeddingTimer.getElapsedMs();

    const vectorSearchTimer = startTimer();
    const vectorResults = await vectorIndex.search(queryEmbedding, limit * 3);
    const vectorDuration = vectorSearchTimer.getElapsedMs();

    logger.info(
      {
        keywordCount: keywordResults.length,
        keywordDurationMs: keywordDuration,
        embeddingDurationMs: embeddingDuration,
        vectorCount: vectorResults.length,
        vectorDurationMs: vectorDuration
      },
      'Sub-retrievers completed.'
    );

    // 3. Perform Reciprocal Rank Fusion (RRF)
    const sortedCandidates = reciprocalRankFusion(vectorResults, keywordResults, limit);

    if (sortedCandidates.length === 0) {
      logger.info('No documents matched the retrieval query.');
      return [];
    }

    // 4. Hydrate metadata from SQLite
    const results = await hydrateCandidates(sortedCandidates, db);

    const retrievedItemsLog = results.map(res => ({
      sqliteId: res.metadata.sqliteId,
      docName: res.metadata.docName,
      docRelativePath: res.metadata.docRelativePath,
      score: res.score,
      snippet: res.content.length > 80 ? res.content.substring(0, 80) + '...' : res.content
    }));

    logger.info(
      {
        totalDurationMs: timer.getElapsedMs(),
        resultsCount: results.length,
        retrievedItems: retrievedItemsLog
      },
      'Hybrid RAG search completed.'
    );

    return results;
  } catch (err) {
    logger.error(err, 'Error during retrieval execution.');
    throw err;
  }
}
