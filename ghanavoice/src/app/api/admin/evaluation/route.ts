import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateAdmin, hasRole } from '@/lib/admin/auth';
import { getPipeline } from '@/lib/rag/pipeline';
import { datasets, DATASET_VERSION } from '@/lib/evaluation/datasets';
import { runRetrievalEval, runSafetyEval } from '@/lib/evaluation/runners';
import { LANGUAGE_CODES, LANGUAGES } from '@/lib/i18n/languages';
import { uiCoverage } from '@/lib/i18n/strings';
import { getRepository } from '@/lib/db/repository-factory';
import type { EvaluationRun } from '@/lib/evaluation/types';
import { badRequest, forbidden, json, serverError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';

// In demo mode recorded runs live in memory for the process lifetime.
const demoRuns: EvaluationRun[] = [];

export async function GET(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  try {
    const { index } = await getPipeline();
    const repo = await getRepository();
    const entries = await repo.listEntries();
    const [safety, retrieval] = await Promise.all([
      runSafetyEval(datasets.safety, DATASET_VERSION, admin.email),
      runRetrievalEval(index, datasets.retrieval, DATASET_VERSION, admin.email),
    ]);
    const recorded = await loadRecordedRuns();

    const languages = LANGUAGE_CODES.map((code) => {
      const renderings = entries.flatMap((e) => e.renderings.filter((r) => r.language === code));
      const sttRuns = recorded.filter((r) => r.task === 'stt' && r.language === code);
      const mtRuns = recorded.filter((r) => r.task === 'translation' && r.language === code);
      return {
        code,
        name: LANGUAGES[code].nameEn,
        status: LANGUAGES[code].defaultStatus,
        content: { renderings: renderings.length, nativeReviewed: renderings.filter((r) => r.nativeReviewed).length },
        ui: uiCoverage(code),
        datasets: {
          stt: datasets.stt.filter((i) => i.language === code).length,
          translation: datasets.translation.filter((i) => i.targetLanguage === code).length,
          safety: datasets.safety.filter((i) => i.language === code).length,
          retrieval: datasets.retrieval.filter((i) => i.language === code).length,
        },
        latestStt: sttRuns.at(-1) ?? null,
        latestTranslation: mtRuns.at(-1) ?? null,
      };
    });

    return json({
      datasetVersion: DATASET_VERSION,
      computedNow: { safety, retrieval },
      recordedRuns: recorded,
      languages,
      variation: { items: datasets.variation.length, judged: datasets.variation.filter((v) => v.mutuallyIntelligible !== undefined).length },
    });
  } catch (e) {
    return serverError(e);
  }
}

const runSchema = z.object({
  task: z.enum(['stt', 'translation', 'safety', 'retrieval', 'variation']),
  language: z.enum(LANGUAGE_CODES as [string, ...string[]]).optional(),
  provider: z.string(),
  model: z.string().optional(),
  datasetVersion: z.string(),
  itemCount: z.number().int().positive(),
  metrics: z.record(z.number()),
  caveats: z.array(z.string()).default([]),
  nativeReferences: z.boolean(),
});

/** Record a run produced offline by evaluation/scripts (e.g. WER from native-speaker references). */
export async function POST(req: NextRequest) {
  const admin = await authenticateAdmin(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, 'reviewer')) return forbidden();
  const parsed = runSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest('Invalid run', parsed.error.issues);
  const run: EvaluationRun = { id: `${parsed.data.task}-${Date.now()}`, ranAt: new Date().toISOString(), ranBy: admin.email, ...(parsed.data as unknown as Omit<EvaluationRun, "id" | "ranAt" | "ranBy">) };
  try {
    if (process.env.GHANAVOICE_MODE === 'full') {
      const { getServiceClient } = await import('@/lib/db/supabase');
      const { error } = await getServiceClient().from('evaluation_runs').insert({
        id: run.id,
        task: run.task,
        language: run.language ?? null,
        provider: run.provider,
        model: run.model ?? null,
        dataset_version: run.datasetVersion,
        item_count: run.itemCount,
        metrics: run.metrics,
        ran_at: run.ranAt,
        ran_by: run.ranBy,
        caveats: run.caveats,
        native_references: run.nativeReferences,
      });
      if (error) throw error;
    } else demoRuns.push(run);
    return json({ ok: true, run });
  } catch (e) {
    return serverError(e);
  }
}

async function loadRecordedRuns(): Promise<EvaluationRun[]> {
  if (process.env.GHANAVOICE_MODE !== 'full') return demoRuns;
  const { getServiceClient } = await import('@/lib/db/supabase');
  const { data, error } = await getServiceClient().from('evaluation_runs').select('*').order('ran_at');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    task: r.task,
    language: r.language ?? undefined,
    provider: r.provider,
    model: r.model ?? undefined,
    datasetVersion: r.dataset_version,
    itemCount: r.item_count,
    metrics: r.metrics,
    ranAt: r.ran_at,
    ranBy: r.ran_by,
    caveats: r.caveats ?? [],
    nativeReferences: r.native_references,
  }));
}
