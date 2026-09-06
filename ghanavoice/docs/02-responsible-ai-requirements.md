# Responsible-AI requirements

These are binding requirements, each mapped to code or process so they can be audited.

## 1. Truthfulness about capability

| Requirement | Where |
| --- | --- |
| No language is presented as supported until validated by native speakers; the UI shows "Experimental: not yet validated" | `LanguageDefinition.defaultStatus`, `LanguagePicker`, `languages.support_status` in SQL |
| Every non-English rendering carries `nativeReviewed` and reviewer sign-off; unreviewed translations are labelled in citations and reduce confidence | `KnowledgeRendering`, `Citations`, `computeConfidence` |
| Model or provider performance is never fabricated; dashboards show "not evaluated" until a run exists and always show caveats and whether references were native | `EvaluationRun.caveats`, `nativeReferences`, `/admin/evaluation` |
| STT confidence is shown only when the provider reports it; the mock returns undefined | `SttResult.confidence`, `MockSttProvider` |

## 2. Grounding and citations

- Answers come only from published knowledge-base entries. The extractive answerer copies curated text; hosted models receive only retrieved passages and must output `USED:` ids or `ABSTAIN` (`buildGroundedPrompt`).
- Every answer displays sources with publisher, title, link, verification date and content update date (`Citations`).
- Entries have a `reviewBy` date. Past it, the answer shows a staleness note and confidence is reduced. Publishing requires a source verified within 12 months.

## 3. Health boundaries

- Health entries must set `healthGeneralInfoOnly` (schema and SQL check constraint).
- Pre-retrieval rules block diagnosis and prescription intents and redirect to a health worker (`assessQuestion`).
- Post-generation rules reject hosted-model output that names doses or medicines or asserts a diagnosis; the pipeline falls back to curated text (`answerViolatesHealthRules`).
- All health answers carry a visible disclaimer; the global banner shows emergency numbers at all times.

## 4. Emergencies

- Emergency phrases route to a tap-to-call block for 112, 191, 192, 193 before anything else. GhanaVoice states that it cannot dispatch help.
- Self-harm phrases route to human support rather than information retrieval.

## 5. Uncertainty and escalation

- Below the abstention threshold the assistant says "I am not certain" and offers the nearest topics as suggestions, not answers.
- Every answer has an "Ask a person" action that creates a reference number and shows the responsible institution's contact.

## 6. Consent, privacy and data minimisation

- Audio is processed transiently; storage requires explicit opt-in with versioned consent text and a user-chosen deletion period (1, 7 or 30 days, capped by policy). Consent can be withdrawn in Settings.
- Analytics events cannot contain question text, transcripts, audio or identifiers (`assertNoPersonalContent`). Session ids are salted hashes rotating daily.
- Conversation history is stored only on the device with user-controlled expiry and deletion.
- Escalation tickets hold the question only because the user asked a human to read it; closed tickets are purged after 30 days.
- Reviewer access to stored audio is role-restricted at the database (RLS and storage policies).

## 7. Fairness across varieties and regions

- Asante and Akuapem Twi are distinct in the data model, glossary, retrieval fallback chain and evaluation sets so that one variety cannot silently stand in for the other without a visible label.
- Retrieval folds ɛ/ɔ/ɖ/ƒ/ɣ/ŋ/ʋ so speakers without special keyboards are not disadvantaged; the evaluation set includes no-special-character variants.
- Evaluation must stratify by region, gender, age band and recording condition (`SttItem`).

## 8. Human oversight

- Four roles with separation of duties; approvers cannot approve their own submissions (SQL function `kb_set_status`).
- A full audit trail of status changes.
- Feedback from citizens lands in a reviewer queue and is visible in analytics as counts.

## 9. Incident handling

- "Unsafe or inappropriate" feedback increments a visible counter; a spike is a trigger to pull the affected entry to draft (one click in the admin console).
- Retiring an entry removes it from retrieval on the next request (index invalidation) and from newly downloaded packs; pack manifests expose `contentUpdatedOn` so clients can prompt for updates.

## 10. Known limitations to disclose publicly

- Speech recognition for Ghanaian languages is unproven in this system; the default transcriber is a mock.
- Language suggestion is a keyword heuristic; it may confuse Asante and Akuapem or misread mixed English/Twi text, which is why it only suggests.
- The bundled content was drafted by the engineering team from public sources and needs re-verification by the deploying institution (seed with `--as-draft`).
