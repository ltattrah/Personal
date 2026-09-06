import { getServices } from '@/lib/ai/registry';
import { getPipeline } from '@/lib/rag/pipeline';
import { json } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  const s = getServices();
  const { index, builtAt } = await getPipeline();
  return json({
    ok: true,
    mode: process.env.GHANAVOICE_MODE ?? 'demo',
    providers: { stt: s.stt.name, tts: s.tts.name, embeddings: s.embeddings.name, llm: s.llm.name, detector: s.detector.name },
    index: { renderings: index.size(), builtAt },
  });
}
