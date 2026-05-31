export interface DocumentMeta {
  documentId: string;
  sessionId: string;
  filename: string;
  chunkCount: number;
  uploadedAt: string;
}

export interface SourceCitation {
  documentId: string;
  filename: string;
  page?: number;
  snippet: string;
  score: number;
}

export interface UploadResult {
  documentId: string;
  sessionId: string;
  filename: string;
  chunkCount: number;
}
