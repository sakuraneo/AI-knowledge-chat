import { config } from '../config.js';
import { getDocument, listDocuments, similaritySearch } from './store.js';
import type { SourceCitation } from './types.js';

export async function retrieveSources(
  sessionId: string,
  query: string,
  documentIds?: string[],
): Promise<SourceCitation[]> {
  const sessionDocs = listDocuments(sessionId);
  if (sessionDocs.length === 0) return [];

  let targetIds = documentIds?.filter(Boolean);
  if (!targetIds || targetIds.length === 0) {
    targetIds = sessionDocs.map((d) => d.documentId);
  }

  const results = await similaritySearch(
    sessionId,
    query,
    config.ragTopK,
    targetIds,
  );

  return results.map(([doc, score]) => {
    const documentId = String(doc.metadata.documentId ?? '');
    const meta = getDocument(documentId);
    const snippet =
      doc.pageContent.length > 200
        ? `${doc.pageContent.slice(0, 200)}…`
        : doc.pageContent;

    return {
      documentId,
      filename: meta?.filename ?? String(doc.metadata.filename ?? 'document'),
      snippet,
      score,
    };
  });
}

export function formatContext(sources: SourceCitation[]): string {
  if (sources.length === 0) return '';

  return sources
    .map(
      (s, i) =>
        `[${i + 1}] (${s.filename})\n${s.snippet}`,
    )
    .join('\n\n');
}
