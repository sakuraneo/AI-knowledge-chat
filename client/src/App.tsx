import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { SourceCitation } from './api/chat';
import { resetChatSession } from './api/chat';
import { listDocuments, uploadDocument, type DocumentMeta } from './api/documents';
import {
  clearStoredSessionId,
  getStoredSessionId,
  storeSessionId,
  useSendMessage,
} from './hooks/useSendMessage';
import './App.css';

function CitationList({ sources }: { sources: SourceCitation[] }) {
  if (sources.length === 0) return null;

  return (
    <ul className="citations">
      {sources.map((source) => (
        <li key={`${source.documentId}-${source.snippet.slice(0, 24)}`} className="citations__item">
          <span className="citations__file">{source.filename}</span>
          <p className="citations__snippet">{source.snippet}</p>
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(() => getStoredSessionId());
  const [messages, setMessages] = useState<
    { id: string; role: 'user' | 'assistant'; content: string; sources?: SourceCitation[] }[]
  >([]);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documentIds = documents.map((d) => d.documentId);

  const refreshDocuments = useCallback(async (sid: string) => {
    try {
      const docs = await listDocuments(sid);
      setDocuments(docs);
    } catch {
      setDocuments([]);
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      void refreshDocuments(sessionId);
    } else {
      setDocuments([]);
    }
  }, [sessionId, refreshDocuments]);

  const sendMessage = useSendMessage({
    sessionId,
    setSessionId,
    setMessages,
    documentIds,
    onError: (message) => setError(message || null),
  });

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sendMessage.isPending]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sendMessage.isPending) return;

    setInput('');
    sendMessage.mutate(text);
  }

  async function handleNewChat() {
    if (sessionId) {
      try {
        await resetChatSession(sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reset session');
        return;
      }
    }
    setSessionId(null);
    clearStoredSessionId();
    setMessages([]);
    setDocuments([]);
    setError(null);
    sendMessage.reset();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const result = await uploadDocument(file, sessionId ?? undefined);
      setSessionId(result.sessionId);
      storeSessionId(result.sessionId);
      await refreshDocuments(result.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header__row">
          <div>
            <h1>AI Knowledge Chat</h1>
            <p>M4 · PDF RAG + Citations</p>
          </div>
          <button
            type="button"
            className="header__new-chat"
            onClick={handleNewChat}
            disabled={sendMessage.isPending}
          >
            New chat
          </button>
        </div>
        {sessionId && (
          <p className="header__session" title={sessionId}>
            Session: {sessionId.slice(0, 8)}…
          </p>
        )}
      </header>

      <section className="documents">
        <div className="documents__row">
          <h2 className="documents__title">Documents</h2>
          <button
            type="button"
            className="documents__upload"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sendMessage.isPending}
          >
            {uploading ? 'Uploading…' : 'Upload PDF'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="documents__file-input"
            onChange={handleFileChange}
          />
        </div>
        {documents.length === 0 ? (
          <p className="documents__empty">Upload a PDF to ask questions about its content.</p>
        ) : (
          <ul className="documents__list">
            {documents.map((doc) => (
              <li key={doc.documentId} className="documents__item">
                <span className="documents__name">{doc.filename}</span>
                <span className="documents__meta">{doc.chunkCount} chunks</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <main className="chat">
        <div className="messages" role="log" aria-live="polite">
          {messages.length === 0 && (
            <p className="empty">
              Upload a PDF, then ask a question. Multi-turn memory works within the same session.
            </p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`message message--${msg.role}`}>
              <span className="message__role">
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <p className="message__content">
                {msg.content}
                {msg.role === 'assistant' &&
                  sendMessage.isPending &&
                  msg.id === messages[messages.length - 1]?.id && (
                    <span className="message__cursor" aria-hidden="true" />
                  )}
              </p>
              {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                <CitationList sources={msg.sources} />
              )}
            </div>
          ))}
          <div ref={listEndRef} />
        </div>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            className="composer__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              documents.length > 0
                ? 'Ask about your PDF…'
                : 'Upload a PDF first, or ask a general question…'
            }
            rows={2}
            disabled={sendMessage.isPending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="composer__send"
            type="submit"
            disabled={sendMessage.isPending || !input.trim()}
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
