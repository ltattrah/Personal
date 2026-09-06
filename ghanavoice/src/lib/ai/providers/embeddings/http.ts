import type { EmbeddingProvider } from '@/lib/ai/types';

/** POST JSON { texts: string[] } -> { embeddings: number[][] } */
export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  constructor(
    private readonly url: string,
    readonly dimensions: number,
    private readonly token?: string,
    name = 'http-embeddings',
  ) {
    this.name = name;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: JSON.stringify({ texts }),
    });
    if (!res.ok) throw new Error(`Embedding endpoint returned ${res.status}`);
    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings;
  }
}
