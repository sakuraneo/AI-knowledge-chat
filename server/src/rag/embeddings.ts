import { Embeddings } from '@langchain/core/embeddings';
import { config } from '../config.js';

const DIMS = config.embeddingDimensions;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function embedText(text: string): number[] {
  const vec = new Float32Array(DIMS);

  for (const token of tokenize(text)) {
    const h = hashToken(token);
    vec[h % DIMS] += 1;
    vec[(h * 31) % DIMS] += 0.5;
  }

  let norm = 0;
  for (let i = 0; i < DIMS; i += 1) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1;

  return Array.from(vec, (v) => v / norm);
}

/**
 * 本地向量化（Feature Hashing），无 native 依赖、无需下载模型。
 * DeepSeek 无 Embedding API；@xenova/transformers 在 pnpm 下常因 sharp 原生模块失败。
 * 学习/demo 够用；生产可换 OpenAI/Cohere 等 Embedding API。
 */
class HashingEmbeddings extends Embeddings {
  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => embedText(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return embedText(text);
  }
}

let embeddings: HashingEmbeddings | null = null;

export function getEmbeddings(): Embeddings {
  if (!embeddings) {
    embeddings = new HashingEmbeddings({});
  }
  return embeddings;
}
