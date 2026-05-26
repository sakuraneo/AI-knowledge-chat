import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config.js';
import { getSessionHistory } from '../memory/sessions.js';

const prompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    'You are a helpful assistant. Answer clearly and concisely in the same language as the user.',
  ],
  new MessagesPlaceholder('chat_history'),
  ['human', '{input}'],
]);

const model = new ChatOpenAI({
  apiKey: config.deepseekApiKey,
  model: config.model,
  streaming: true,
  configuration: { baseURL: config.deepseekBaseUrl },
});

const chain = prompt.pipe(model).pipe(new StringOutputParser());

const chainWithHistory = new RunnableWithMessageHistory({
  runnable: chain,
  getMessageHistory: async (sessionId: string) => getSessionHistory(sessionId),
  inputMessagesKey: 'input',
  historyMessagesKey: 'chat_history',
});

const runConfig = (sessionId: string) => ({ configurable: { sessionId } });

export async function runChat(input: string, sessionId: string): Promise<string> {
  return chainWithHistory.invoke({ input }, runConfig(sessionId));
}

export async function* streamChat(
  input: string,
  sessionId: string,
): AsyncGenerator<string, void, unknown> {
  const stream = await chainWithHistory.stream({ input }, runConfig(sessionId));

  for await (const chunk of stream) {
    if (typeof chunk === 'string' && chunk.length > 0) {
      yield chunk;
    }
  }
}
