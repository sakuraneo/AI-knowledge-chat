export interface DocumentMeta {
  documentId: string;
  sessionId: string;
  filename: string;
  chunkCount: number;
  uploadedAt: string;
}

export interface UploadResult {
  documentId: string;
  sessionId: string;
  filename: string;
  chunkCount: number;
}

export async function listDocuments(sessionId: string): Promise<DocumentMeta[]> {
  const response = await fetch(
    `/api/documents?sessionId=${encodeURIComponent(sessionId)}`,
  );

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw.slice(0, 120) || `List documents failed (${response.status})`);
  }

  const data = (await response.json()) as { documents: DocumentMeta[] };
  return data.documents ?? [];
}

export async function uploadDocument(
  file: File,
  sessionId?: string,
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('filename', file.name);
  if (sessionId) {
    form.append('sessionId', sessionId);
  }

  const response = await fetch('/api/documents/upload', {
    method: 'POST',
    body: form,
  });

  const raw = await response.text();
  let data: UploadResult & { error?: string; message?: string } = {} as UploadResult;

  if (raw) {
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      throw new Error(
        raw.slice(0, 120) || `Upload failed (${response.status})`,
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      data.message ?? data.error ?? `Upload failed (${response.status})`,
    );
  }

  return data;
}
