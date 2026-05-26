export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
}

export interface ChatErrorBody {
  error?: string;
  message?: string;
}

export interface StreamChatResult {
  sessionId: string;
}

interface SseEvent {
  event: string;
  data: string;
}

function parseSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const blocks = buffer.split('\n\n');

  for (let i = 0; i < blocks.length - 1; i += 1) {
    const block = blocks[i];
    if (!block.trim()) continue;

    let event = 'message';
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length > 0) {
      events.push({ event, data: dataLines.join('\n') });
    }
  }

  return { events, rest: blocks[blocks.length - 1] ?? '' };
}

export async function sendChatStream(
  message: string,
  sessionId: string | undefined,
  handlers: {
    onSessionId?: (sessionId: string) => void;
    onToken: (token: string) => void;
  },
): Promise<StreamChatResult> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
  });

  if (!response.ok) {
    const raw = await response.text();
    let errorMessage = `Request failed (${response.status})`;
    if (raw) {
      try {
        const data = JSON.parse(raw) as ChatErrorBody;
        errorMessage = data.message ?? data.error ?? errorMessage;
      } catch {
        errorMessage = raw.slice(0, 120);
      }
    }
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error('Empty response body from stream endpoint');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resolvedSessionId = sessionId ?? '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseEvents(buffer);
    buffer = rest;

    for (const { event, data } of events) {
      const payload = JSON.parse(data) as Record<string, string>;

      if (event === 'session' && payload.sessionId) {
        resolvedSessionId = payload.sessionId;
        handlers.onSessionId?.(payload.sessionId);
      }

      if (event === 'token' && payload.content) {
        handlers.onToken(payload.content);
      }

      if (event === 'error') {
        throw new Error(payload.message ?? 'Stream failed');
      }

      if (event === 'done' && payload.sessionId) {
        resolvedSessionId = payload.sessionId;
      }
    }
  }

  if (!resolvedSessionId) {
    throw new Error('Stream ended without sessionId');
  }

  return { sessionId: resolvedSessionId };
}

export async function sendChat(
  message: string,
  sessionId?: string,
): Promise<ChatResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
  });

  const raw = await response.text();
  let data: Partial<ChatResponse> & ChatErrorBody = {};

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON response (${response.status}): ${raw.slice(0, 120)}`);
    }
  } else if (!response.ok) {
    throw new Error(
      `Request failed (${response.status}). Is the server running on port 3001?`,
    );
  } else {
    throw new Error('Empty response from server. Is the server running?');
  }

  if (!response.ok) {
    throw new Error(data.message ?? data.error ?? `Request failed (${response.status})`);
  }

  if (typeof data.reply !== 'string' || typeof data.sessionId !== 'string') {
    throw new Error('Invalid response: missing reply or sessionId');
  }

  return { reply: data.reply, sessionId: data.sessionId };
}

export async function resetChatSession(sessionId: string): Promise<void> {
  const response = await fetch('/api/chat/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = `Reset failed (${response.status})`;
    if (raw) {
      try {
        const data = JSON.parse(raw) as ChatErrorBody;
        message = data.message ?? data.error ?? message;
      } catch {
        message = raw.slice(0, 120);
      }
    }
    throw new Error(message);
  }
}
