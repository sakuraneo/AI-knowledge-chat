import { ChatMessageHistory } from '@langchain/community/stores/message/in_memory';

const sessions = new Map<string, ChatMessageHistory>();

export function getSessionHistory(sessionId: string): ChatMessageHistory {
  let history = sessions.get(sessionId);
  if (!history) {
    history = new ChatMessageHistory();
    sessions.set(sessionId, history);
  }
  return history;
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}
