import { useEffect, useRef, useState, type FormEvent } from 'react';
import { resetChatSession } from './api/chat';
import {
  clearStoredSessionId,
  getStoredSessionId,
  useSendMessage,
} from './hooks/useSendMessage';
import './App.css';

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(() => getStoredSessionId());
  const [messages, setMessages] = useState<
    { id: string; role: 'user' | 'assistant'; content: string }[]
  >([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const sendMessage = useSendMessage({
    sessionId,
    setSessionId,
    setMessages,
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
    setError(null);
    sendMessage.reset();
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header__row">
          <div>
            <h1>AI Knowledge Chat</h1>
            <p>M3 · Streaming SSE</p>
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

      <main className="chat">
        <div className="messages" role="log" aria-live="polite">
          {messages.length === 0 && (
            <p className="empty">
              Send a message to start. The server remembers context within the same session.
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
            placeholder="Ask something… (try: remember my name is …)"
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
