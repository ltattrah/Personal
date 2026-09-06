import { z } from 'zod';
import type { GlossaryTerm, KnowledgeEntry } from './types';
import { LANGUAGE_CODES } from '@/lib/i18n/languages';

const languageSchema = z.enum(LANGUAGE_CODES as [string, ...string[]]);

export const sourceSchema = z.object({
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.string().url().optional(),
  publishedOn: z.string().optional(),
  verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rights: z.string().min(1),
});

export const renderingSchema = z.object({
  language: languageSchema,
  title: z.string().min(1),
  summary: z.string().min(1).max(600),
  body: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  origin: z.enum(['source', 'editor', 'machine']),
  nativeReviewed: z.boolean(),
  reviewedOn: z.string().optional(),
  reviewedBy: z.string().optional(),
});

export const entrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    domain: z.enum(['public-service', 'education', 'agriculture', 'health']),
    topic: z.string().min(1),
    healthGeneralInfoOnly: z.boolean().optional(),
    updatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reviewBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(['draft', 'in_review', 'approved', 'published', 'retired']),
    regions: z.array(z.string()).default([]),
    sources: z.array(sourceSchema).min(1, 'Every entry needs at least one source'),
    renderings: z.array(renderingSchema).min(1),
    escalation: z.object({ label: z.string(), phone: z.string().optional(), url: z.string().optional() }).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.domain === 'health' && e.healthGeneralInfoOnly !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Health entries must set healthGeneralInfoOnly: true' });
    }
    if (!e.renderings.some((r) => r.language === 'en')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'An English rendering is required as the reference text' });
    }
    // A rendering marked as native-reviewed must record who and when.
    for (const r of e.renderings) {
      if (r.nativeReviewed && (!r.reviewedOn || !r.reviewedBy)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${r.language}: nativeReviewed requires reviewedOn and reviewedBy` });
      }
    }
  });

export const glossarySchema = z.object({
  id: z.string(),
  concept: z.string(),
  domain: z.enum(['public-service', 'education', 'agriculture', 'health', 'general']),
  en: z.string(),
  renderings: z.record(z.object({ term: z.string(), note: z.string().optional(), approved: z.boolean() })),
  avoid: z.record(z.array(z.string())).optional(),
  updatedOn: z.string(),
});

export function parseEntries(raw: unknown[]): KnowledgeEntry[] {
  return raw.map((r) => entrySchema.parse(r) as KnowledgeEntry);
}

export function parseGlossary(raw: unknown[]): GlossaryTerm[] {
  return raw.map((r) => glossarySchema.parse(r) as GlossaryTerm);
}
