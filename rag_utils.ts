import fs from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import {
  FileSystemItemSchema,
  FileSystemItem,
  MarkdownElementSchema,
  MarkdownElement,
  ChunkSchema,
  Chunk,
  TextExtensionSchema,
  TextExtension,
  TEXT_EXTENSIONS
} from './schema_interface.js';

// Fast lookup Set using the values of the object
const TEXT_EXTENSIONS_SET = new Set<string>(Object.values(TEXT_EXTENSIONS));

/**
 * Recursively scans an absolute directory path and returns details of all nested files/folders.
 * 
 * @param targetPath - The absolute directory path to scan.
 * @param baseDir - Internal helper parameter to calculate relative path.
 * @returns A promise resolving to an array of FileSystemItem.
 */
export async function scanDirectory(
  targetPath: string,
  baseDir: string = targetPath
): Promise<FileSystemItem[]> {
  const items: FileSystemItem[] = [];
  const absolutePath = path.resolve(targetPath);

  const entries = await fs.readdir(absolutePath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(absolutePath, entry.name);
    const relativePath = path.relative(baseDir, entryPath);
    
    const stats = await fs.stat(entryPath);
    const type = entry.isDirectory() ? 'directory' : 'file';
    const extension = entry.isFile() ? path.extname(entry.name).toLowerCase() : '';

    const item = FileSystemItemSchema.parse({
      name: entry.name,
      path: entryPath,
      relativePath,
      type,
      size: entry.isFile() ? stats.size : 0,
      extension,
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime
    });

    items.push(item);

    if (entry.isDirectory()) {
      const subItems = await scanDirectory(entryPath, baseDir);
      items.push(...subItems);
    }
  }

  return items;
}

/**
 * Checks if a file is formatted as readable text based on its extension.
 */
export function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS_SET.has(ext);
}

/**
 * Reads UTF-8 content of a supported text file.
 */
export async function readFileContent(filePath: string): Promise<string> {
  if (!isTextFile(filePath)) {
    throw new Error(`File format "${path.extname(filePath)}" is not supported for text extraction.`);
  }
  return await fs.readFile(filePath, 'utf-8');
}

/**
 * Parses markdown file content into structured objects categorized by heading, list, table, etc.
 */
export function parseMarkdown(content: string): MarkdownElement[] {
  const tokens = marked.lexer(content);
  const elements: MarkdownElement[] = [];

  for (const token of tokens) {
    let type: MarkdownElement['type'] = 'other';
    let text = '';
    let depth: number | undefined;
    let items: string[] | undefined;
    let headers: string[] | undefined;
    let rows: string[][] | undefined;
    let lang: string | undefined;

    switch (token.type) {
      case 'heading':
        type = 'heading';
        text = token.text;
        depth = token.depth;
        break;
      case 'paragraph':
        type = 'paragraph';
        text = token.text;
        break;
      case 'list':
        type = 'list';
        text = token.raw;
        items = token.items.map((item: any) => item.text);
        break;
      case 'table':
        type = 'table';
        text = token.raw;
        headers = token.header.map((h: any) => h.text);
        rows = token.rows.map((row: any) => row.map((cell: any) => cell.text));
        break;
      case 'code':
        type = 'code';
        text = token.text;
        lang = token.lang || undefined;
        break;
      case 'space':
      case 'hr':
        continue;
      default:
        type = 'other';
        text = 'text' in token ? (token as any).text : token.raw;
        break;
    }

    const parsedElement = MarkdownElementSchema.parse({
      type,
      text,
      depth,
      items,
      headers,
      rows,
      lang,
      raw: token.raw
    });

    elements.push(parsedElement);
  }

  return elements;
}

/**
 * Splits document content into overlapping blocks, choosing newline or space boundaries for cleaner breaks.
 * 
 * @param text - The content text string.
 * @param filePath - Path of source file for chunk metadata mapping.
 * @param chunkSize - Max character boundary per chunk.
 * @param chunkOverlap - Length of overlap between chunks.
 */
export function chunkText(
  text: string,
  filePath: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): Chunk[] {
  const chunks: Chunk[] = [];
  if (!text) return chunks;

  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;
    
    if (endIndex < text.length) {
      const lookbackLimit = Math.max(startIndex, endIndex - Math.floor(chunkSize * 0.15));
      let foundBoundary = false;

      // Try newline first
      for (let i = endIndex; i >= lookbackLimit; i--) {
        if (text[i] === '\n') {
          endIndex = i + 1;
          foundBoundary = true;
          break;
        }
      }

      // Try space next
      if (!foundBoundary) {
        for (let i = endIndex; i >= lookbackLimit; i--) {
          if (text[i] === ' ') {
            endIndex = i + 1;
            foundBoundary = true;
            break;
          }
        }
      }
    } else {
      endIndex = text.length;
    }

    const chunkTextContent = text.substring(startIndex, endIndex).trim();
    if (chunkTextContent.length > 0) {
      const parsedChunk = ChunkSchema.parse({
        text: chunkTextContent,
        startIndex,
        endIndex,
        metadata: {
          filePath,
          chunkIndex
        }
      });
      chunks.push(parsedChunk);
      chunkIndex++;
    }

    startIndex = endIndex - chunkOverlap;
    if (startIndex >= text.length || endIndex === text.length) {
      break;
    }
    if (startIndex < 0 || startIndex >= endIndex) {
      startIndex = endIndex;
    }
  }

  return chunks;
}
export { TEXT_EXTENSIONS };

/**
 * Creates a closure-based timer that captures the initial timestamp.
 */
export function startTimer() {
  const startTime = Date.now();
  return {
    getElapsedSeconds: () => ((Date.now() - startTime) / 1000).toFixed(2),
    getElapsedMs: () => Date.now() - startTime
  };
}

