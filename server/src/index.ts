import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { runChat, streamChat } from './chains/chat.js';
import { config } from './config.js';
import { clearSession } from './memory/sessions.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function writeSse(res: express.Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/chat/stream', async (req, res) => {
  const message = req.body?.message;
  const sessionId =
    typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()
      ? req.body.sessionId.trim()
      : randomUUID();

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
    for await (const token of streamChat(message.trim(), sessionId)) {
      writeSse(res, 'token', { content: token });
    }
    writeSse(res, 'done', { sessionId });
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

  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const reply = await runChat(message.trim(), sessionId);
    res.json({ reply, sessionId });
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

  clearSession(sessionId.trim());
  res.json({ ok: true });
});

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
