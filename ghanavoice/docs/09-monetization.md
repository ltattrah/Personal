# Monetisation

Principle: citizens never pay for basic access; institutions pay for reach, control and integration. Every paid tier inherits the same safety layer, citations and confidence indicator; health remains general-information-only on every plan.

| Plan | Who | What they get | Pricing basis |
| --- | --- | --- | --- |
| Citizen | Individuals | Full assistant, offline packs, history | Free |
| Institutional licence | Ministries, agencies, district assemblies, NGOs, schools | Custom glossary, branding, aggregate analytics export, SLA support, content workflow seats for their editors | Annual licence by population served or number of districts |
| Organisation-specific assistant | Cooperatives, universities, telcos, insurers, hospitals (administrative information only) | Private knowledge base scoped by topic prefix, own glossary, branding, API access, analytics | Setup fee + annual subscription; content review hours billed separately |
| API access | Developers, radio stations, USSD/IVR providers, researchers | `/api/v1/ask` with per-key monthly quota, aggregate analytics | Tiered by monthly questions |

## Implementation hooks

- `src/lib/billing/plans.ts` defines entitlements; `PLANS[plan].entitlements` gates features.
- `api_keys` are hashed; `api_key_increment_usage` enforces quotas per calendar month; `domain_scope` restricts retrieval for organisation assistants. Keys are issued and revoked in `/admin/api-keys` (admin role); the plaintext is shown once.
- Out-of-scope questions to a scoped assistant abstain rather than returning a marginal match (ambiguity rule in `computeConfidence`).
- `organisations.branding` (name, colours, logo URL) is applied by a small theme layer in the shell (not yet wired in v0.1 beyond the data model).
- Offline packs and the citizen PWA stay free; institutional packs may include private content for their staff.

## Affordability safeguards

- No paywall, ads or data-selling in the citizen app.
- Aggregate analytics only; institutions cannot access individual conversations.
- Public content produced by institutions under licence remains available to all citizens.
