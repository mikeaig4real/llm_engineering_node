import { IngestedNode } from './schema_interface.js';

export interface DatabaseInterface {
  initialize(): Promise<void>;
  insertNode(node: Omit<IngestedNode, 'sqliteId'>): Promise<number>; // returns auto-incremented sqliteId
  getNode(sqliteId: number): Promise<IngestedNode | undefined>;
  getNodes(sqliteIds: number[]): Promise<IngestedNode[]>;
  clearTable(): Promise<void>;
  close(): Promise<void>;
}

export interface KeywordIndexInterface {
  initialize(): Promise<void>;
  insertNode(node: {
    id: string;
    sqliteId: number;
    docName: string;
    docRelativePath: string;
    contentType: string;
    contentText: string;
  }): Promise<void>;
  search(query: string, limit: number): Promise<{ sqliteId: number; score: number }[]>;
  save(): Promise<void>;
}

export interface VectorIndexInterface {
  initialize(maxElements: number): Promise<void>;
  addPoint(vector: number[], sqliteId: number): Promise<void>;
  search(vector: number[], limit: number): Promise<{ sqliteId: number; score: number }[]>;
  save(): Promise<void>;
}
