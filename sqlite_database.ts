import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseInterface } from './interfaces.js';
import { IngestedNode, IngestedNodeSchema } from './schema_interface.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SqliteDatabase implements DatabaseInterface {
  private db!: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    if (dbPath) {
      this.dbPath = dbPath;
    } else {
      const storageDir = path.resolve(__dirname, '.storage');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.dbPath = path.join(storageDir, 'rag.db');
    }
  }

  async initialize(): Promise<void> {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        sqliteId INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        docName TEXT NOT NULL,
        docPath TEXT NOT NULL,
        docRelativePath TEXT NOT NULL,
        docSize INTEGER NOT NULL,
        docExtension TEXT NOT NULL,
        docModifiedAt TEXT NOT NULL,
        docCreatedAt TEXT NOT NULL,
        contentIndex INTEGER NOT NULL,
        contentType TEXT NOT NULL,
        contentText TEXT NOT NULL,
        contentRaw TEXT NOT NULL,
        contentDepth INTEGER,
        contentItems TEXT,
        contentHeaders TEXT,
        contentRows TEXT,
        contentLang TEXT,
        contentCharLength INTEGER NOT NULL,
        contentTokenCount INTEGER NOT NULL,
        contentCreatedAt TEXT NOT NULL,
        contentModifiedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_id ON chunks(id);
    `);
  }

  async insertNode(node: Omit<IngestedNode, 'sqliteId'>): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO chunks (
        id, docName, docPath, docRelativePath, docSize, docExtension, 
        docModifiedAt, docCreatedAt, contentIndex, contentType, contentText, 
        contentRaw, contentDepth, contentItems, contentHeaders, contentRows, 
        contentLang, contentCharLength, contentTokenCount, contentCreatedAt, contentModifiedAt
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 
        ?, ?, ?, ?, ?, 
        ?, ?, ?, ?, ?, 
        ?, ?, ?, ?, ?
      )
    `);

    const result = stmt.run(
      node.id,
      node.docName,
      node.docPath,
      node.docRelativePath,
      node.docSize,
      node.docExtension,
      node.docModifiedAt.toISOString(),
      node.docCreatedAt.toISOString(),
      node.contentIndex,
      node.contentType,
      node.contentText,
      node.contentRaw,
      node.contentDepth !== undefined ? node.contentDepth : null,
      node.contentItems ? JSON.stringify(node.contentItems) : null,
      node.contentHeaders ? JSON.stringify(node.contentHeaders) : null,
      node.contentRows ? JSON.stringify(node.contentRows) : null,
      node.contentLang !== undefined ? node.contentLang : null,
      node.contentCharLength,
      node.contentTokenCount,
      node.contentCreatedAt.toISOString(),
      node.contentModifiedAt.toISOString()
    );

    return result.lastInsertRowid as number;
  }

  async getNode(sqliteId: number): Promise<IngestedNode | undefined> {
    const stmt = this.db.prepare('SELECT * FROM chunks WHERE sqliteId = ?');
    const row = stmt.get(sqliteId) as any;
    if (!row) return undefined;

    return this.mapRowToNode(row);
  }

  async getNodes(sqliteIds: number[]): Promise<IngestedNode[]> {
    if (sqliteIds.length === 0) return [];
    const markers = sqliteIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`SELECT * FROM chunks WHERE sqliteId IN (${markers})`);
    const rows = stmt.all(...sqliteIds) as any[];
    
    const nodeMap = new Map<number, IngestedNode>();
    for (const row of rows) {
      const node = this.mapRowToNode(row);
      nodeMap.set(node.sqliteId, node);
    }

    return sqliteIds
      .map(id => nodeMap.get(id))
      .filter((node): node is IngestedNode => node !== undefined);
  }

  async clearTable(): Promise<void> {
    if (this.db) {
      this.db.exec('DELETE FROM chunks;');
      try {
        this.db.exec("DELETE FROM sqlite_sequence WHERE name='chunks';");
      } catch (e) {}
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }

  private mapRowToNode(row: any): IngestedNode {
    return IngestedNodeSchema.parse({
      sqliteId: row.sqliteId,
      id: row.id,
      docName: row.docName,
      docPath: row.docPath,
      docRelativePath: row.docRelativePath,
      docSize: row.docSize,
      docExtension: row.docExtension,
      docModifiedAt: new Date(row.docModifiedAt),
      docCreatedAt: new Date(row.docCreatedAt),
      contentIndex: row.contentIndex,
      contentType: row.contentType,
      contentText: row.contentText,
      contentRaw: row.contentRaw,
      contentDepth: row.contentDepth !== null ? row.contentDepth : undefined,
      contentItems: row.contentItems ? JSON.parse(row.contentItems) : undefined,
      contentHeaders: row.contentHeaders ? JSON.parse(row.contentHeaders) : undefined,
      contentRows: row.contentRows ? JSON.parse(row.contentRows) : undefined,
      contentLang: row.contentLang !== null ? row.contentLang : undefined,
      contentCharLength: row.contentCharLength,
      contentTokenCount: row.contentTokenCount,
      contentCreatedAt: new Date(row.contentCreatedAt),
      contentModifiedAt: new Date(row.contentModifiedAt)
    });
  }
}
