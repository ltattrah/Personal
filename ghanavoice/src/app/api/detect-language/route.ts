import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServices } from '@/lib/ai/registry';
import { badRequest, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const parsed = z.object({ text: z.string().min(1).max(1000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('text is required');
  const { detector } = getServices();
  return json({ ...detector.detect(parsed.data.text), detector: detector.name });
}
