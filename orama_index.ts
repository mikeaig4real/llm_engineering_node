import { create, insert, search, save, load, AnyOrama } from "@orama/orama";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { KeywordIndexInterface } from "./interfaces.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGLISH_STOPWORDS = [
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
  "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", 
  "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", 
  "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", 
  "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", 
  "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", 
  "for", "with", "about", "against", "between", "into", "through", "during", "before", 
  "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", 
  "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", 
  "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", 
  "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", 
  "will", "just", "don", "should", "now"
];

export class OramaIndex implements KeywordIndexInterface {
  private db!: AnyOrama;
  private indexPath: string;

  constructor(indexPath?: string) {
    if (indexPath) {
      this.indexPath = indexPath;
    } else {
      const storageDir = path.resolve(__dirname, ".storage");
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.indexPath = path.join(storageDir, "oramaIndex.json");
    }
  }

  async initialize(): Promise<void> {
    if (fs.existsSync(this.indexPath)) {
      try {
        const fileContent = fs.readFileSync(this.indexPath, "utf-8");
        const serialized = JSON.parse(fileContent);
        // Create an empty instance with the correct schema
        this.db = create({
          schema: {
            id: "string",
            sqliteId: "number",
            docName: "string",
            docRelativePath: "string",
            contentType: "string",
            contentText: "string",
          },
          components: {
            tokenizer: {
              stopWords: ENGLISH_STOPWORDS,
            },
          },
        });
        load(this.db, serialized);
        return;
      } catch (err) {
        // Fall back to creating a new index if load fails
      }
    }

    this.db = create({
      schema: {
        id: "string",
        sqliteId: "number",
        docName: "string",
        docRelativePath: "string",
        contentType: "string",
        contentText: "string",
      },
      components: {
        tokenizer: {
          stopWords: ENGLISH_STOPWORDS,
        },
      },
    });
  }

  async insertNode(node: {
    id: string;
    sqliteId: number;
    docName: string;
    docRelativePath: string;
    contentType: string;
    contentText: string;
  }): Promise<void> {
    await insert(this.db, {
      id: node.id,
      sqliteId: node.sqliteId,
      docName: node.docName,
      docRelativePath: node.docRelativePath,
      contentType: node.contentType,
      contentText: node.contentText,
    });
  }

  async search(
    query: string,
    limit: number,
  ): Promise<{ sqliteId: number; score: number }[]> {
    const results = await search(this.db, {
      term: query,
      properties: ["contentText", "docName", "docRelativePath"],
      boost: {
        docName: 1.5,
        contentText: 1.0,
        docRelativePath: 0.05,
      },
      limit,
    });

    return results.hits.map((hit) => ({
      sqliteId: (hit.document as any).sqliteId,
      score: hit.score,
    }));
  }

  async save(): Promise<void> {
    const serialized = save(this.db);
    fs.writeFileSync(
      this.indexPath,
      JSON.stringify(serialized, null, 2),
      "utf-8",
    );
  }
}
