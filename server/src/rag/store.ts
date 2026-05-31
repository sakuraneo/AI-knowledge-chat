import type { Document } from '@langchain/core/documents';
import type { DocumentMeta } from './types.js';
import { getEmbeddings } from './embeddings.js';

interface StoredChunk {
  doc: Document;
  vector: number[];
}

const chunksBySession = new Map<string, StoredChunk[]>();
const documentsById = new Map<string, DocumentMeta>();
const documentIdsBySession = new Map<string, Set<string>>();

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function registerDocument(meta: DocumentMeta): void {
  documentsById.set(meta.documentId, meta);
  let ids = documentIdsBySession.get(meta.sessionId);
  if (!ids) {
    ids = new Set();
    documentIdsBySession.set(meta.sessionId, ids);
  }
  ids.add(meta.documentId);
}

export function listDocuments(sessionId: string): DocumentMeta[] {
  const ids = documentIdsBySession.get(sessionId);
  if (!ids) return [];
  return [...ids]
    .map((id) => documentsById.get(id))
    .filter((doc): doc is DocumentMeta => doc !== undefined)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function getDocument(documentId: string): DocumentMeta | undefined {
  return documentsById.get(documentId);
}

export async function addDocumentsToSession(
  sessionId: string,
  docs: Document[],
): Promise<void> {
  const embeddings = getEmbeddings();
  const vectors = await embeddings.embedDocuments(docs.map((d) => d.pageContent));
  const stored = chunksBySession.get(sessionId) ?? [];

  docs.forEach((doc, index) => {
    stored.push({ doc, vector: vectors[index] });
  });

  chunksBySession.set(sessionId, stored);
}

export async function similaritySearch(
  sessionId: string,
  query: string,
  k: number,
  documentIds?: string[],
): Promise<Array<[Document, number]>> {
  const stored = chunksBySession.get(sessionId) ?? [];
  if (stored.length === 0) return [];

  const filterSet =
    documentIds && documentIds.length > 0 ? new Set(documentIds) : undefined;

  const queryVector = await getEmbeddings().embedQuery(query);

  const scored = stored
    .filter(({ doc }) => {
      if (!filterSet) return true;
      const id = doc.metadata.documentId as string | undefined;
      return id !== undefined && filterSet.has(id);
    })
    .map(({ doc, vector }) => [doc, cosineSimilarity(queryVector, vector)] as [Document, number])
    .sort((a, b) => b[1] - a[1]);

  return scored.slice(0, k);
}
