# Provider adapters

All AI capabilities sit behind interfaces in `src/lib/ai/types.ts` and are chosen in `src/lib/ai/registry.ts` from environment variables. Adding a provider means implementing one interface and one `case` in the registry; nothing else changes.

| Capability | Env | Options | Notes |
| --- | --- | --- | --- |
| Speech-to-text | `STT_PROVIDER` | `mock` (default), `http`, `openai` | `openai` claims English only. `http` is the intended slot for a Ghanaian-language ASR service. |
| Text-to-speech | `TTS_PROVIDER` | `browser` (default), `http`, `mock` | `browser` costs nothing but has no Ghanaian voices; the client says so. |
| Embeddings | `EMBEDDING_PROVIDER` | `hash-local` (default), `openai`, `http` | `hash-local` is a lexical fingerprint, not semantic. SQL column is 1536-d. |
| Answer generation | `LLM_PROVIDER` | `extractive` (default), `anthropic`, `openai-compatible` | Hosted models only rewrite passages; extractive is always the fallback. |
| Language suggestion | (fixed) | `HeuristicLanguageDetector` | Client and server share the same code. |

## Generic HTTP contracts

### STT (`STT_HTTP_URL`)

Request: `multipart/form-data` with `audio` (binary), `language` (BCP-47 primary: `ak`, `ee`, `gaa`, `en-GH`), `variety` (`ak-asante` etc.).

Response:

```json
{ "text": "…", "confidence": 0.82, "language": "ak", "model": "wav2vec2-akan-v3" }
```

`confidence` is optional. If your model does not produce a calibrated score, omit it rather than inventing one; the UI then shows "confidence not reported".

### TTS (`TTS_HTTP_URL`)

Request JSON `{ "text", "language", "variety", "voice" }`; response is audio bytes with a `content-type` header.

### Embeddings (`EMBEDDING_HTTP_URL`, `EMBEDDING_HTTP_DIMENSIONS`)

Request `{ "texts": [] }`; response `{ "embeddings": [[…]] }`.

## Hosted LLM prompt contract

`buildGroundedPrompt` produces a system prompt that forbids adding facts, requires the target variety (Asante vs Akuapem explicitly), adds HEALTH MODE constraints when relevant, injects approved glossary terms, and requires a trailing `USED: id, id` line or the single token `ABSTAIN`. `parseGroundedOutput` extracts used ids. Any parse failure, timeout (8 s) or health-rule violation falls back to the extractive answer.

## Anthropic

`LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5`). Uses the Messages API directly with `temperature: 0`, `max_tokens: 400`.

## Evaluating a new provider

1. Add the adapter and select it with env vars in a staging deployment.
2. Run `evaluation/scripts/compute_metrics.py` on the STT or translation set with native references.
3. POST the run to `/api/admin/evaluation`; the dashboard shows it with provider and caveats.
4. Only after a reviewer signs off may `languages.support_status` be changed.
