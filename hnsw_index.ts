import hnswlib from 'hnswlib-node';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VectorIndexInterface } from './interfaces.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class HnswIndex implements VectorIndexInterface {
  private index!: hnswlib.HierarchicalNSW;
  private indexPath: string;
  private dimensions: number;

  constructor(dimensions = 1024, indexPath?: string) {
    this.dimensions = dimensions;
    if (indexPath) {
      this.indexPath = indexPath;
    } else {
      const storageDir = path.resolve(__dirname, '.storage');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.indexPath = path.join(storageDir, 'hnsw.index');
    }
  }

  async initialize(maxElements = 10000): Promise<void> {
    this.index = new hnswlib.HierarchicalNSW('cosine', this.dimensions);
    
    if (fs.existsSync(this.indexPath)) {
      try {
        this.index.readIndexSync(this.indexPath);
        return;
      } catch (err) {
        // Fall back to new index initialization if read fails
      }
    }

    this.index.initIndex(maxElements);
  }

  async addPoint(vector: number[], sqliteId: number): Promise<void> {
    this.index.addPoint(vector, sqliteId);
  }

  async search(vector: number[], limit: number): Promise<{ sqliteId: number; score: number }[]> {
    const result = this.index.searchKnn(vector, limit);
    
    return result.neighbors.map((neighbor, idx) => ({
      sqliteId: neighbor,
      // For cosine distance, we convert distance to similarity score: similarity = 1 - distance
      score: 1 - result.distances[idx]
    }));
  }

  async save(): Promise<void> {
    this.index.writeIndexSync(this.indexPath);
  }
}
