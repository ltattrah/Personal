# Content review and publishing workflow

## States

`draft` → `in_review` → `approved` → `published` → `retired`, with returns to `draft` at any point.

## Roles and permitted transitions

| From | To | Role |
| --- | --- | --- |
| draft | in_review | editor |
| in_review | approved / draft | reviewer (must differ from the submitter) |
| approved | published / draft | publisher / reviewer |
| published | retired / draft | publisher / editor |
| retired | draft | editor |

Enforced in `src/lib/admin/auth.ts` (`canTransition`) and in SQL (`kb_set_status` checks separation of duties and approved-before-published).

## Publish gates

1. At least one source with `verifiedOn` within the last 12 months.
2. Health entries carry `healthGeneralInfoOnly: true`.
3. Schema validity (Zod on write, constraints in SQL).
4. Recommended (process): every non-English rendering native-reviewed, or the entry is published English-only.

## Editing rules

- Any content change moves the entry back to draft and is recorded in `kb_status_audit`.
- `updatedOn` must be bumped when text changes; `reviewBy` is set to at most 12 months ahead, shorter for volatile facts (prices, deadlines).
- Prices, dates and quotas that change yearly should be described as such ("changes each season; confirm with…") rather than hard-coded.

## Sources and rights

- Prefer primary government publications; record publisher, title, URL, publication date, verification date and a rights statement.
- Text is summarised in editors' own words; quotations must fall within the source's licence.
- The bundled sample content was written by the engineering team from public information and must be re-verified by the deploying institution before publishing (`npm run kb:seed -- --as-draft`).

## Feedback loop

- Citizen "translation" and "wrong" reports appear as counts in analytics and as suggestions in `feedback_suggestions`.
- Reviewers triage weekly; accepted suggestions become edits (back to draft) with the reviewer's name in the audit trail.

## Retirement

Retiring an entry removes it from retrieval immediately (index invalidation) and from newly downloaded packs; the pack manifest's `contentUpdatedOn` prompts clients to refresh.
