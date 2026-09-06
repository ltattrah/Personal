import type { EmbeddingProvider, LanguageDetector, LlmProvider, SttProvider, TtsProvider } from './types';
import { MockSttProvider } from './providers/stt/mock';
import { HttpSttProvider } from './providers/stt/http';
import { OpenAiSttProvider } from './providers/stt/openai';
import { BrowserTtsProvider } from './providers/tts/browser';
import { HttpTtsProvider } from './providers/tts/http';
import { MockTtsProvider } from './providers/tts/mock';
import { HashEmbeddingProvider } from './providers/embeddings/hash-local';
import { OpenAiEmbeddingProvider } from './providers/embeddings/openai';
import { HttpEmbeddingProvider } from './providers/embeddings/http';
import { ExtractiveAnswerer } from './providers/llm/extractive';
import { AnthropicAnswerer } from './providers/llm/anthropic';
import { OpenAiCompatibleAnswerer } from './providers/llm/openai-compatible';
import { HeuristicLanguageDetector } from './language-detect';

export interface AiServices {
  stt: SttProvider;
  tts: TtsProvider;
  embeddings: EmbeddingProvider;
  llm: LlmProvider;
  /** Fallback used when the primary LLM fails or times out */
  fallbackLlm: LlmProvider;
  detector: LanguageDetector;
}

type Env = Record<string, string | undefined>;

/** Build the service set from environment variables. Pure function for testability. */
export function buildServices(env: Env = process.env): AiServices {
  const stt = (() => {
    switch (env.STT_PROVIDER) {
      case 'http':
        if (!env.STT_HTTP_URL) throw new Error('STT_PROVIDER=http requires STT_HTTP_URL');
        return new HttpSttProvider(env.STT_HTTP_URL, env.STT_HTTP_TOKEN);
      case 'openai':
        if (!env.OPENAI_API_KEY) throw new Error('STT_PROVIDER=openai requires OPENAI_API_KEY');
        return new OpenAiSttProvider(env.OPENAI_API_KEY, env.OPENAI_BASE_URL, env.OPENAI_STT_MODEL);
      default:
        return new MockSttProvider();
    }
  })();

  const tts = (() => {
    switch (env.TTS_PROVIDER) {
      case 'http':
        if (!env.TTS_HTTP_URL) throw new Error('TTS_PROVIDER=http requires TTS_HTTP_URL');
        return new HttpTtsProvider(env.TTS_HTTP_URL, env.TTS_HTTP_TOKEN);
      case 'mock':
        return new MockTtsProvider();
      default:
        return new BrowserTtsProvider();
    }
  })();

  const embeddings = (() => {
    switch (env.EMBEDDING_PROVIDER) {
      case 'openai':
        if (!env.OPENAI_API_KEY) throw new Error('EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY');
        return new OpenAiEmbeddingProvider(env.OPENAI_API_KEY, env.OPENAI_BASE_URL, env.OPENAI_EMBEDDING_MODEL);
      case 'http':
        if (!env.EMBEDDING_HTTP_URL) throw new Error('EMBEDDING_PROVIDER=http requires EMBEDDING_HTTP_URL');
        return new HttpEmbeddingProvider(env.EMBEDDING_HTTP_URL, Number(env.EMBEDDING_HTTP_DIMENSIONS ?? 768), env.EMBEDDING_HTTP_TOKEN);
      default:
        return new HashEmbeddingProvider();
    }
  })();

  const fallbackLlm = new ExtractiveAnswerer();
  const llm = (() => {
    switch (env.LLM_PROVIDER) {
      case 'anthropic':
        if (!env.ANTHROPIC_API_KEY) throw new Error('LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
        return new AnthropicAnswerer(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
      case 'openai-compatible':
        if (!env.OPENAI_API_KEY) throw new Error('LLM_PROVIDER=openai-compatible requires OPENAI_API_KEY');
        return new OpenAiCompatibleAnswerer(env.OPENAI_API_KEY, env.OPENAI_MODEL ?? 'gpt-4o-mini', env.OPENAI_BASE_URL);
      default:
        return fallbackLlm;
    }
  })();

  return { stt, tts, embeddings, llm, fallbackLlm, detector: new HeuristicLanguageDetector() };
}

let cached: AiServices | null = null;
export function getServices(): AiServices {
  if (!cached) cached = buildServices();
  return cached;
}
