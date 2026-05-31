import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { runChat, streamChatTokens } from './chains/chat.js';
import { config } from './config.js';
import { clearSession } from './memory/sessions.js';
import { ingestPdf } from './rag/ingest.js';
import { listDocuments } from './rag/store.js';
import { resolveUploadFilename } from './utils/filename.js';

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxBytes },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function writeSse(res: express.Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function parseDocumentIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim());
  return ids.length > 0 ? ids : undefined;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/documents', (req, res) => {
  const sessionId =
    typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';

  if (!sessionId) {
    res.status(400).json({ error: 'sessionId query parameter is required' });
    return;
  }

  res.json({ documents: listDocuments(sessionId) });
});

app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  const sessionId =
    typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()
      ? req.body.sessionId.trim()
      : randomUUID();

  if (!file) {
    res.status(400).json({ error: 'PDF file is required (field name: file)' });
    return;
  }

  try {
    const filename = resolveUploadFilename(req.body?.filename, file.originalname);
    const result = await ingestPdf(sessionId, filename, file.buffer);
    res.json(result);
  } catch (error) {
    console.error('[POST /api/documents/upload]', error);
    res.status(500).json({
      error: 'upload_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/api/chat/stream', async (req, res) => {
  const message = req.body?.message;
  const sessionId =
    typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()
      ? req.body.sessionId.trim()
      : randomUUID();
  const documentIds = parseDocumentIds(req.body?.documentIds);

  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  writeSse(res, 'session', { sessionId });

  try {
    const { stream, sources } = await streamChatTokens(message.trim(), sessionId, {
      documentIds,
    });

    if (sources.length > 0) {
      writeSse(res, 'citation', { sources });
    }

    for await (const token of stream) {
      writeSse(res, 'token', { content: token });
    }

    writeSse(res, 'done', { sessionId, sources });
    res.end();
  } catch (error) {
    console.error('[POST /api/chat/stream]', error);
    writeSse(res, 'error', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    res.end();
  }
});

/* 非流式输出保留，方便 curl 测试。 */
app.post('/api/chat', async (req, res) => {
  const message = req.body?.message;
  const sessionId =
    typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()
      ? req.body.sessionId.trim()
      : randomUUID();
  const documentIds = parseDocumentIds(req.body?.documentIds);

  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const { reply, sources } = await runChat(message.trim(), sessionId, { documentIds });
    res.json({ reply, sessionId, sources });
  } catch (error) {
    console.error('[POST /api/chat]', error);
    res.status(500).json({
      error: 'chat_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/api/chat/reset', (req, res) => {
  const sessionId = req.body?.sessionId;

  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }

  /* Decision A: New chat 只清对话记忆，不删除该 session 的 PDF 向量。 */
  clearSession(sessionId.trim());
  res.json({ ok: true });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({
        error: 'upload_failed',
        message: err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : err.message,
      });
      return;
    }
    if (err instanceof Error && err.message === 'Only PDF files are allowed') {
      res.status(400).json({ error: 'upload_failed', message: err.message });
      return;
    }
    console.error('[express error]', err);
    res.status(500).json({
      error: 'internal_error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  },
);

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
