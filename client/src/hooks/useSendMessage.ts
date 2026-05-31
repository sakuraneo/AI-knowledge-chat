import { useMutation } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import { sendChatStream, type ChatMessage, type SourceCitation } from '../api/chat';

const SESSION_KEY = 'chat-session-id';

export function getStoredSessionId(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

export function storeSessionId(sessionId: string): void {
  sessionStorage.setItem(SESSION_KEY, sessionId);
}

export function clearStoredSessionId(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

function createId(): string {
  return crypto.randomUUID();
}

interface UseSendMessageOptions {
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  documentIds: string[];
  onError: (message: string) => void;
}

export function useSendMessage({
  sessionId,
  setSessionId,
  setMessages,
  documentIds,
  onError,
}: UseSendMessageOptions) {
  return useMutation({
    mutationFn: async (message: string) => {
      const assistantId = createId();

      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '' },
      ]);

      const result = await sendChatStream(
        message,
        sessionId ?? undefined,
        documentIds.length > 0 ? documentIds : undefined,
        {
          onSessionId: (id) => {
            setSessionId(id);
            storeSessionId(id);
          },
          onToken: (token) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + token } : m,
              ),
            );
          },
          onSources: (sources: SourceCitation[]) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, sources } : m,
              ),
            );
          },
        },
      );

      return { sessionId: result.sessionId, assistantId, sources: result.sources };
    },
    onMutate: (message) => {
      const userMessage: ChatMessage = { id: createId(), role: 'user', content: message };
      setMessages((prev) => [...prev, userMessage]);
      onError('');
      return { userMessage };
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      storeSessionId(data.sessionId);
      if (data.sources.length > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.assistantId ? { ...m, sources: data.sources } : m,
          ),
        );
      }
    },
    onError: (error, _message, context) => {
      setMessages((prev) => {
        let next = prev;
        if (context?.userMessage) {
          next = next.filter((m) => m.id !== context.userMessage.id);
        }
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && last.content === '') {
          next = next.slice(0, -1);
        }
        return next;
      });
      onError(error instanceof Error ? error.message : 'Something went wrong');
    },
  });
}
