import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config.js';
import { getSessionHistory } from '../memory/sessions.js';
import { formatContext, retrieveSources } from '../rag/retrieve.js';
import type { SourceCitation } from '../rag/types.js';

const BASE_SYSTEM =
  'You are a helpful assistant. Answer clearly and concisely in the same language as the user.';

const RAG_SYSTEM_APPENDIX =
  'Use the provided document excerpts to answer when they are relevant. Cite which excerpt(s) you used by number [1], [2], etc. If the excerpts do not contain the answer, say you cannot find it in the uploaded documents and answer from general knowledge only when appropriate.';

const prompt = ChatPromptTemplate.fromMessages([
  ['system', '{systemPrompt}'],
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

export interface ChatOptions {
  documentIds?: string[];
}

async function buildPromptInput(
  input: string,
  sessionId: string,
  options?: ChatOptions,
): Promise<{ systemPrompt: string; input: string; sources: SourceCitation[] }> {
  const sources = await retrieveSources(sessionId, input, options?.documentIds);

  if (sources.length === 0) {
    return { systemPrompt: BASE_SYSTEM, input, sources: [] };
  }

  const context = formatContext(sources);
  const systemPrompt = `${BASE_SYSTEM}\n\n${RAG_SYSTEM_APPENDIX}\n\nDocument excerpts:\n${context}`;

  return { systemPrompt, input, sources };
}

export async function runChat(
  input: string,
  sessionId: string,
  options?: ChatOptions,
): Promise<{ reply: string; sources: SourceCitation[] }> {
  const promptInput = await buildPromptInput(input, sessionId, options);
  const reply = await chainWithHistory.invoke(
    { input: promptInput.input, systemPrompt: promptInput.systemPrompt },
    runConfig(sessionId),
  );
  return { reply, sources: promptInput.sources };
}

export async function streamChatTokens(
  input: string,
  sessionId: string,
  options?: ChatOptions,
): Promise<{ stream: AsyncIterable<string>; sources: SourceCitation[] }> {
  const promptInput = await buildPromptInput(input, sessionId, options);

  const rawStream = await chainWithHistory.stream(
    { input: promptInput.input, systemPrompt: promptInput.systemPrompt },
    runConfig(sessionId),
  );

  async function* tokens(): AsyncGenerator<string, void, unknown> {
    for await (const chunk of rawStream) {
      if (typeof chunk === 'string' && chunk.length > 0) {
        yield chunk;
      }
    }
  }

  return { stream: tokens(), sources: promptInput.sources };
}
