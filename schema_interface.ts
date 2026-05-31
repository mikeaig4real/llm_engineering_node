import { z } from 'zod';

export const TEXT_EXTENSIONS = {
  TXT: '.txt',
  MD: '.md',
  MDX: '.mdx',
  JSON: '.json',
  JS: '.js',
  JSX: '.jsx',
  TS: '.ts',
  TSX: '.tsx',
  HTML: '.html',
  CSS: '.css',
  CSV: '.csv',
  YAML: '.yaml',
  YML: '.yml',
  INI: '.ini',
  CONF: '.conf',
  ENV: '.env'
} as const;

export type TextExtension = typeof TEXT_EXTENSIONS[keyof typeof TEXT_EXTENSIONS];

export const TextExtensionSchema = z.enum(
  Object.values(TEXT_EXTENSIONS) as [TextExtension, ...TextExtension[]]
);

export const FileSystemItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  relativePath: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number(),
  extension: z.string(),
  modifiedAt: z.date(),
  createdAt: z.date()
});

export type FileSystemItem = z.infer<typeof FileSystemItemSchema>;

export const MarkdownElementSchema = z.object({
  type: z.enum(['heading', 'paragraph', 'list', 'table', 'code', 'other']),
  text: z.string(),
  depth: z.number().optional(),
  items: z.array(z.string()).optional(),
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional(),
  lang: z.string().optional(),
  raw: z.string()
});

export type MarkdownElement = z.infer<typeof MarkdownElementSchema>;

export const ChunkSchema = z.object({
  text: z.string(),
  startIndex: z.number(),
  endIndex: z.number(),
  metadata: z.object({
    filePath: z.string(),
    chunkIndex: z.number()
  })
});

export type Chunk = z.infer<typeof ChunkSchema>;

export const IngestedNodeSchema = z.object({
  id: z.string(),          // Unique UUID pointer
  sqliteId: z.number(),    // SQLite auto-incrementing ID

  // Document-level Metadata
  docName: z.string(),
  docPath: z.string(),
  docRelativePath: z.string(),
  docSize: z.number(),
  docExtension: z.string(),
  docModifiedAt: z.date(),
  docCreatedAt: z.date(),

  // Content-level Metadata
  contentIndex: z.number(),
  contentType: z.enum(['heading', 'paragraph', 'list', 'table', 'code', 'other']),
  contentText: z.string(),
  contentRaw: z.string(),
  contentDepth: z.number().optional(),
  contentItems: z.array(z.string()).optional(),
  contentHeaders: z.array(z.string()).optional(),
  contentRows: z.array(z.array(z.string())).optional(),
  contentLang: z.string().optional(),
  contentCharLength: z.number(),
  contentTokenCount: z.number(),
  
  // Ingestion creation/modified dates
  contentCreatedAt: z.date(),
  contentModifiedAt: z.date()
});

export type IngestedNode = z.infer<typeof IngestedNodeSchema>;
