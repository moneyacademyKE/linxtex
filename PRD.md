# Product Requirements Document (PRD): LinxtexBot

**Version**: 3.1
**Status**: Active
**Architectural Mode**: Functional Core / Imperative Shell

---

## 1. Executive Summary & North Star

**LinxtexBot** is a Telegram-driven link enrichment worker running on Cloudflare Workers. Its job is to turn shared links into readable, finance-aware output without forcing users to leave Telegram.

The product does four things well when it is healthy:

1. ingests Telegram messages that contain links
2. extracts and cleans article content from the best candidate URL
3. generates and verifies summary/insight output with Gemini
4. returns the result to Telegram as either inline text or a Telegraph-backed reading link

The system is designed around **de-complecting** concerns:

- domain/state transitions stay data-driven
- side effects stay in the executor
- final presentation to Telegram is handled as projection after the machine completes

---

## 2. Problem Space

Shared links in Telegram channels and chats are often bad UX and worse signal:

- **Friction**: opening links is slow and annoying, especially on mobile
- **Noise**: many links are homepages, profiles, or low-value repost sludge
- **Extraction failure**: some sites are cluttered, dynamic, or hostile to simple scraping
- **Hallucination risk**: AI summaries can invent confidence they did not earn
- **Trust gap**: users need enough traceability to know the system is not making shit up

LinxtexBot exists to reduce that friction while keeping output useful and auditable.

---

## 3. Primary Users and User Stories

### 3.1 Signal-focused reader

- **Need**: get the gist of a shared article fast
- **User story**: “When someone drops a link in Telegram, I want a readable summary or a clean reading link in the same chat so I don’t waste time context-switching.”

### 3.2 Channel/admin operator

- **Need**: keep a channel readable and consistently presented
- **User story**: “When links are shared in my channel, I want the bot to filter garbage, enrich useful content, and post in a tone that fits the audience.”

### 3.3 Trust-but-verify reader

- **Need**: avoid low-quality or hallucinated AI output
- **User story**: “If the source is weak or the generated insight is shaky, I want the bot to suppress or downgrade the result instead of bluffing.”

---

## 4. Functional Scope

### 4.1 Telegram ingestion

The worker must accept Telegram updates from:

- `message`
- `channel_post`
- `edited_message`
- `edited_channel_post`

For each update it should:

- extract URLs from both text and Telegram entities
- discard obvious homepage/profile junk where possible
- rank remaining candidates and choose either a single best link or an isolated multi-post set
- enqueue work on `ENRICHMENT_QUEUE`
- log ingress events to D1

### 4.2 Enrichment lifecycle

The current implemented machine phases are:

1. `RESOLVING`
2. `ENRICHING`
3. `VERIFYING`
4. `HEALING`
5. `PERSISTING`
6. `COMPLETE`

Important truth: **projection is not a machine phase**. Telegram output formatting/delivery happens after the state loop exits.

### 4.3 Content extraction and enrichment

The system must:

- fetch article content from the selected URL
- use parser/browser fallbacks where needed
- generate finance-aware insight when content supports it
- fall back to more general or extractive output when richer insight is not justified
- compute content hashes for deduplication and reuse

### 4.4 Verification and healing

The system should:

- run a critic/verification pass on generated insight
- retry through a `HEALING` phase when the verdict indicates weak or hallucinated output
- avoid infinite repair loops by using bounded retries/fallbacks in code

The present codebase contains the healing path and critic flow; exact retry policy should remain documented in code/tests, not hand-waved in this doc.

### 4.5 Telegram projection

Final delivery behavior currently includes:

- editing the original Telegram message in single-message flow
- sending a new message in isolated/multi-post flow
- suppressing output when extracted content is too thin (`< 100` chars)
- suppressing output when `relevanceScore < 40`
- choosing among compact inline output, direct content output, Telegraph link, or original-link fallback

### 4.6 Perspective and tone routing

The product already has structural support for per-chat customization via `src/perspective.ts`.

A matched chat rule can provide:

- a **perspective** override for Gemini synthesis
- a **tone template** controlling emoji, verbosity, and fact-check display

Current reality: the routing plumbing exists, but the rule map is mostly scaffolded rather than fully populated.

---

## 5. Data and Persistence Requirements

### 5.1 D1 as system of record

The worker currently relies on these D1 tables:

| Table | Purpose |
|---|---|
| `events` | operational telemetry and ingest/suppression/failure logs |
| `urls` | flattened current record for each URL |
| `content_hashes` | dedupe/reuse index |
| `insight_logs` | append-only forensic trace of generated output |
| `logic_rules` | runtime-configurable parsing/config rules |

The `urls` table includes runtime fields such as:

- `url`
- `title`
- `iv_link`
- `insight`
- `trace_id`
- `last_enriched`
- `created_at`

### 5.2 Migration discipline

Schema evolution is **migration-first**.

- canonical D1 schema changes live in `migrations/`
- `schema.sql` is a bootstrap/snapshot convenience file only
- tests that inline schema setup must match the latest migration baseline

This is now a product requirement because schema drift already bit the repo once.

### 5.3 KV usage

KV is used as a fast view/cache layer for URL insight projections and can also support cached runtime rules.

---

## 6. Infrastructure Requirements

### 6.1 Cloudflare-native runtime

Current runtime/bindings:

- **Compute**: Cloudflare Workers
- **Relational storage**: Cloudflare D1
- **Fast view cache**: Cloudflare KV
- **Async orchestration**: Cloudflare Queue `linxtex-enrichment`
- **Browser fallback**: Cloudflare Browser binding
- **Static assets**: `public/`

### 6.2 Worker endpoints and triggers

Current public/operational routes:

- `GET /`
- `POST /webhook`
- `GET /reprocess`
- `GET /api/reprocess`
- `GET /api/feed`
- `GET /api/vitals`

Current trigger config:

- queue consumer: `linxtex-enrichment`
- daily cron cleanup: `0 0 * * *`

### 6.3 AI orchestration

The codebase currently uses Gemini-based generation and verification flows. Prompting and runtime configuration should stay isolated from the core state-machine rules.

---

## 7. Reliability and Product Quality Requirements

The product should optimize for:

- fast webhook acknowledgement
- asynchronous throughput via queueing
- traceable persistence of successful enrichments
- suppression of weak/low-value outputs rather than fake confidence
- graceful fallback when enrichment cannot support a strong financial read

Hard-coded fake precision in this doc is useless, so exact SLO numbers should only appear here if they are actually measured and enforced. Right now, they are not.

---

## 8. Security and Resilience

The system must:

- isolate secrets in Cloudflare secrets/config rather than code
- avoid unbounded retry or healing loops
- tolerate malformed webhook payloads and queue failures with logged events
- degrade safely when extraction, Telegraph publishing, or enrichment fails

For hostile or JS-heavy pages, browser-assisted extraction may be used through the Cloudflare Browser binding.

---

## 9. Near-term Product Direction

These are the real next-step directions that fit the current codebase:

1. **Populate perspective/tone rules for real channels**
   - the routing surface exists but is mostly empty
2. **Harden operational APIs and metrics**
   - `/api/feed`, `/api/vitals`, and reprocess behavior should stay honest and useful
3. **Improve type safety and executor consistency**
   - keep shrinking loose seams around enrichment and persistence
4. **Expand migration discipline**
   - every schema change should land with matching tests and docs
5. **Improve extraction quality on hostile sites**
   - especially where browser fallback materially improves output quality

---

## 10. Success Metrics

Useful product metrics for Linxtex are:

- **processed link volume**
- **successful completion rate** to `COMPLETE`
- **time from share to Telegram result**
- **suppression rate** for low-value links
- **healing/verification intervention rate**
- **reprocess recovery success**

Those are the right metrics. Anything more specific should come from instrumentation, not imagination.

---

*This PRD is intended to reflect the repo as it exists now. If the code changes, this document should follow reality instead of cosplaying as prophecy.*
