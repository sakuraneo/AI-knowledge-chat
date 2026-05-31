import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { config } from '../config.js';
import { addDocumentsToSession, registerDocument } from './store.js';
import type { UploadResult } from './types.js';

/* pdf-parse/index.js runs debug code when loaded as ESM; use lib directly. */
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  buffer: Buffer,
) => Promise<{ text: string }>;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: config.ragChunkSize,
  chunkOverlap: config.ragChunkOverlap,
});

export async function ingestPdf(
  sessionId: string,
  filename: string,
  buffer: Buffer,
): Promise<UploadResult> {
  const parsed = await pdfParse(buffer);
  const text = parsed.text?.trim();

  if (!text) {
    throw new Error('PDF contains no extractable text');
  }

  const chunks = await splitter.splitText(text);
  if (chunks.length === 0) {
    throw new Error('PDF produced no text chunks');
  }

  const documentId = randomUUID();
  const docs = chunks.map(
    (chunk, index) =>
      new Document({
        pageContent: chunk,
        metadata: {
          documentId,
          sessionId,
          filename,
          chunkIndex: index,
        },
      }),
  );

  await addDocumentsToSession(sessionId, docs);

  const meta = {
    documentId,
    sessionId,
    filename,
    chunkCount: chunks.length,
    uploadedAt: new Date().toISOString(),
  };
  registerDocument(meta);

  return {
    documentId,
    sessionId,
    filename,
    chunkCount: chunks.length,
  };
}
