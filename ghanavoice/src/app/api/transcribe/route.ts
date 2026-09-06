import { NextRequest } from 'next/server';
import { getServices } from '@/lib/ai/registry';
import { isLanguageCode, LANGUAGES } from '@/lib/i18n/languages';
import { badRequest, json, serverError } from '@/lib/http';
import { effectiveRetentionDays, audioExpiryIso } from '@/lib/privacy/consent';

export const runtime = 'nodejs';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB: ~60 s of Opus at 24 kbps, sized for 2G/3G uploads

/**
 * multipart/form-data:
 *   audio          (file)   required
 *   language       (text)   LanguageCode hint
 *   storeConsent   (text)   "true" only if the user granted audioStorage consent
 *   retentionDays  (text)   1 | 7 | 30 (clamped to policy)
 *   sessionId      (text)   anonymous id
 *
 * Audio is processed in memory and discarded unless storeConsent is true, in
 * which case (full mode) it is written to the private `audio-samples` bucket
 * with an expiry that the scheduled `purge_expired_audio` job enforces.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('audio');
    if (!(file instanceof Blob)) return badRequest('audio file is required');
    if (file.size > MAX_BYTES) return badRequest(`audio larger than ${MAX_BYTES} bytes`);
    const languageRaw = form.get('language');
    const language = isLanguageCode(languageRaw) ? languageRaw : undefined;
    const storeConsent = form.get('storeConsent') === 'true';
    const retentionDays = effectiveRetentionDays(Number(form.get('retentionDays') ?? NaN), Number(process.env.AUDIO_RETENTION_DAYS_MAX ?? 30));

    const services = getServices();
    const audio = await file.arrayBuffer();
    const result = await services.stt.transcribe({ audio, mimeType: file.type || 'audio/webm', language });

    let stored: { id: string; expiresAt: string } | null = null;
    if (storeConsent && process.env.GHANAVOICE_MODE === 'full') {
      const { getServiceClient } = await import('@/lib/db/supabase');
      const db = getServiceClient();
      const id = crypto.randomUUID();
      const expiresAt = audioExpiryIso(retentionDays);
      const path = `${language ?? 'und'}/${id}.${(file.type || 'audio/webm').split('/')[1]?.split(';')[0] ?? 'webm'}`;
      const { error: upErr } = await db.storage.from('audio-samples').upload(path, Buffer.from(audio), { contentType: file.type || 'audio/webm' });
      if (upErr) throw upErr;
      const { error } = await db.from('audio_samples').insert({
        id,
        storage_path: path,
        language: language ?? null,
        transcript_machine: result.text,
        stt_provider: result.provider,
        stt_confidence: result.confidence ?? null,
        consent_text_version: form.get('consentVersion') ?? null,
        expires_at: expiresAt,
      });
      if (error) throw error;
      stored = { id, expiresAt };
    }

    return json({
      text: result.text,
      confidence: result.confidence ?? null,
      detectedLanguage: result.detectedLanguage ?? null,
      provider: result.provider,
      model: result.model ?? null,
      /** Honest claim: whether the provider even claims to support this language */
      providerClaimsSupport: language ? services.stt.supports(language) : null,
      languageStatus: language ? LANGUAGES[language].defaultStatus : null,
      stored,
    });
  } catch (e) {
    return serverError(e);
  }
}
