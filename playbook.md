# Linxtex Playbook

This playbook is the operator/developer guide for the Linxtex Cloudflare Worker. It is grounded in the repo as it exists now, not in some fantasy architecture from three commits ago.

## Purpose

Linxtex ingests Telegram messages containing links, selects the strongest candidate URLs, extracts article content, generates finance-aware insight with Gemini, verifies that output with a critic pass, persists the result in D1/KV, and projects the final output back to Telegram.

Primary product docs:

- `readme.md` — runtime overview and local/dev commands
- `ARCHITECTURE.md` — current orchestration/runtime shape
- `PRD.md` — product intent and longer-range requirements
- `docs/database.md` — migration workflow and D1 schema ownership

## Repo shape

| Path | Role |
|---|---|
| `src/index.ts` | Worker entrypoints: fetch, queue, scheduled cleanup |
| `src/handlers.ts` | Telegram webhook ingestion, reprocess, enqueue logic |
| `src/orchestrator.ts` | State-machine loop for a single URL |
| `src/domain.ts` | Domain decisions/effects/schemas/helpers |
| `src/state.ts` | Observation integration and phase transitions |
| `src/executor.ts` | Side-effect interpreter: fetch, Gemini, D1/KV, Telegram, Telegraph |
| `src/parser.ts` | Content extraction |
| `src/telegram_projection.ts` | Telegram output selection and suppression |
| `src/perspective.ts` | Per-chat perspective and tone-template routing |
| `migrations/` | Ordered D1 migrations; current source of schema truth |
| `test/` | Vitest suite covering domain, routes, lifecycle, projections, parser, etc. |
| `public/` | Static assets served by the worker |

## Code standards

- **Pure core / imperative shell**: keep domain decisions and state integration pure in `src/domain.ts` and `src/state.ts`. Side effects should be requested as explicit effects and executed in `src/executor.ts`.
- **Strict module discipline**: prefer files under roughly 250 LOC when splitting improves cohesion. Do not split purely for aesthetics, but do not tolerate swollen everything-files either.
- **Intention-revealing naming**: favor domain names like `requiresBrowserRendering`, `getAuthorityScore`, and `integrateObservation` over vague helper sludge.


### 1. Ingress

`src/handlers.ts` accepts Telegram updates from:

- `message`
- `channel_post`
- `edited_message`
- `edited_channel_post`

For each message it:

1. extracts URLs from text and Telegram entities
2. filters homepage/junk/profile links
3. ranks candidates with `filterBlogpostLinks(...)`
4. chooses either:
   - single-link mode: best candidate only
   - isolated/multi-post mode: top valid links when the message contains many links
5. logs a `MESSAGE_RECEIVED` event to D1
6. enqueues queue jobs on `ENRICHMENT_QUEUE`

### 2. Queue processing

`src/index.ts` consumes queue messages and calls:

- `resolveLink(...)` in `src/orchestrator.ts`

Queue payload currently carries:

- `url`
- `traceId`
- optional `perspective`
- optional `toneTemplate`
- optional Telegram context: `chatId`, `messageId`, `text`, `entities`, `isMultiPost`

### 3. State-machine phases

The actual implemented `MachinePhase` values are:

1. `RESOLVING`
2. `ENRICHING`
3. `VERIFYING`
4. `HEALING`
5. `PERSISTING`
6. `COMPLETE`

There is **no standalone `PROJECTING` phase** in the current runtime. Telegram projection happens after the orchestration loop exits.

### 4. Projection back to Telegram

`src/telegram_projection.ts` handles final delivery rules:

- suppresses very low-content signals (`content.length < 100`)
- suppresses low-conviction signals (`relevanceScore < 40`)
- sends a fresh message for multi-post mode
- edits the original Telegram message when `messageId` exists in single-message flow
- chooses among compact inline output, direct output, Telegraph link, or original-link fallback

## Perspective and tone routing

`src/perspective.ts` exposes a small routing layer for per-chat customization.

Matching candidates are checked in this order:

1. `@username`
2. bare `username`
3. numeric `chat.id`
4. `chat.title`

Each matched rule can provide:

- `perspective`: injected into Gemini as a `PERSPECTIVE OVERRIDE`
- `toneTemplate`: controls emoji use, verbosity, and fact-check visibility in Telegram output

Important current state:

- the plumbing is real
- the mapping object is still scaffolded/mostly empty
- default behavior is effectively `perspective = 'default'` plus the default tone template unless real channel rules are added

If you add channel-specific behavior, update `src/perspective.ts` and the relevant tests in `test/`.

## Persistence model

D1 tables are currently defined by `migrations/0001_initial_schema.sql`.

| Table | Purpose |
|---|---|
| `events` | Operational telemetry, ingest events, suppression logs, failures |
| `urls` | Flattened current URL record |
| `content_hashes` | Deduplication store |
| `insight_logs` | Append-only forensic trace of enrichments |
| `logic_rules` | Runtime rules/config data |

Current `urls` shape includes important runtime fields:

- `url`
- `title`
- `iv_link`
- `insight`
- `trace_id`
- `last_enriched`
- `created_at`

Persistence behavior worth knowing:

- `PERSIST_RELATIONAL` writes/refreshes the flattened `urls` row
- `LOG_TRACE` appends to `insight_logs` and updates `urls.insight`, `urls.trace_id`, and `urls.last_enriched`
- `CACHE_VIEW` writes a one-day KV projection under `insight:<url>`
- scheduled cleanup removes records older than 24 hours from `content_hashes`, `insight_logs`, and `events`

## Schema discipline

The repo used to drift. Don’t revive that bullshit.

Rules:

1. **Schema truth lives in `migrations/`**.
2. `schema.sql` is a snapshot/bootstrap convenience file only.
3. Any new D1 shape change gets a new ordered migration file.
4. Tests that inline schema setup must stay aligned with the latest migration baseline.

Apply migrations with:

```text
wrangler d1 migrations apply iv-cache --local
wrangler d1 migrations apply iv-cache --remote
```

## Commands that matter

Install:

```text
bun install
```

Run locally:

```text
bun run dev
```

Type-check:

```text
bun run typecheck
```

Test:

```text
bun test
```

Deploy:

```text
bun run deploy
```

## Deployment and bindings

Defined in `wrangler.jsonc`:

| Binding | Resource |
|---|---|
| `DB` | D1 database `iv-cache` |
| `FACTS` | KV namespace |
| `ENRICHMENT_QUEUE` | Queue `linxtex-enrichment` |
| `BROWSER` | Cloudflare Browser binding |

Triggers/routes currently implemented:

- `POST /webhook`
- `GET /reprocess`
- `GET /api/reprocess`
- `GET /api/feed`
- `GET /api/vitals`
- scheduled cron: `0 0 * * *`
- queue consumer for `linxtex-enrichment`

## Testing expectations

Before pushing meaningful changes:

1. run `bun run typecheck`
2. run the relevant Vitest scope at minimum
3. run the full `bun test` suite for cross-cutting changes

At the time of inspection, the repo contains tests for:

- domain/state behavior
- queue/webhook lifecycle
- parser and telegraph logic
- Telegram projections
- middleware/helpers
- Twitter/X utilities
- several improvement/regression paths

If you change any of these areas, update or add tests in the matching `test/*.spec.ts` file instead of hand-waving.

## Code-shape guidance

The project is aiming for a functional-core / imperative-shell style. Keep it that way.

### Do

- keep decision logic/data transformations in domain/state modules
- keep side effects centralized in `src/executor.ts`
- treat `resolveLink(...)` as orchestration glue, not a junk drawer
- preserve explicit data flow: `state -> effects -> observations -> integrated state`
- prefer small cohesive modules over swollen everything-files

### Don’t

- smear ad hoc fetch/DB/Telegram logic across random files
- silently add runtime schema assumptions without a migration
- stuff presentation policy back into the core state machine
- add per-channel hacks in multiple places when `src/perspective.ts` should own that routing

## Operational notes

- The worker serves both ingestion and lightweight operational APIs.
- `events` is the main operational breadcrumb trail for ingestion, suppression, queue failures, and cleanup runs.
- `handleReprocess(...)` recovers URLs from historical `MESSAGE_RECEIVED` events and re-enqueues them.
- Browser-assisted extraction exists through the Cloudflare Browser binding for harder pages.
- `logic_rules` is present for runtime-configurable parsing/rules, with KV caching support in `src/executor.ts`.

## Known realities

These are true right now and should be documented honestly:

- `readme.md` is lowercase in this repo
- this root `playbook.md` is the canonical playbook; `docs/playbook.md` is now just a redirect stub to prevent drift
- per-channel prompt routing exists structurally but is not meaningfully populated yet
- projection is a post-loop concern, not a first-class machine phase

## Safe change checklist

Before merging a non-trivial change, verify:

- docs still match runtime behavior
- migrations and tests match each other
- queue payload shape still matches `src/index.ts` and `src/handlers.ts`
- Telegram projection behavior still respects suppression and tone rules
- persistence still keeps `urls` and `insight_logs` in sync

## If you are adding a feature

Route it to the right place:

| Kind of change | Primary file(s) |
|---|---|
| Ingest/filter/update handling | `src/handlers.ts`, `src/url_utils.ts`, `src/domain.ts` |
| Orchestration/state transitions | `src/orchestrator.ts`, `src/state.ts`, `src/domain.ts` |
| External effects/APIs/storage | `src/executor.ts` |
| Telegram rendering/suppression | `src/telegram_projection.ts` |
| Per-chat lens/tone customization | `src/perspective.ts` |
| Schema/data-model change | `migrations/`, test schema setup, `docs/database.md` |
| Runtime/docs alignment | `readme.md`, `ARCHITECTURE.md`, this playbook |

That’s the playbook. Keep it honest, keep it typed, and don’t let the repo drift back into swamp mode.
