# LinxtexBot

LinxtexBot is a Telegram-driven link enrichment worker built on Cloudflare Workers. It ingests links from Telegram chats and channels, extracts article content, generates finance-aware summaries and deep insights with Gemini, verifies those insights with a critic pass, and returns either inline Telegram output or a Telegraph/Instant View-style link depending on content quality and size.

## What it does

- Ingests links from Telegram `message`, `channel_post`, `edited_message`, and `edited_channel_post` updates
- Extracts URLs from both plain text and Telegram entities
- Filters junk/homepage/profile links and ranks candidate URLs before processing
- Fetches and parses content, including browser-assisted fallback for harder pages
- Generates structured metadata and insight output with Gemini
- Runs a critic/healing loop to catch weak or hallucinated output before persistence
- Persists current URL state in D1 and operational/forensic traces in D1/KV
- Projects the final result back to Telegram using channel-aware perspective and tone hooks

## Runtime shape

Linxtex follows a functional-core / imperative-shell design.

- **Domain / state core**: `src/domain.ts` and `src/state.ts`
- **Orchestration loop**: `src/orchestrator.ts`
- **Effect execution**: `src/executor.ts`
- **Telegram ingress**: `src/handlers.ts`
- **Worker entrypoints**: `src/index.ts`
- **Telegram output projection**: `src/telegram_projection.ts`
- **Chat perspective/tone routing**: `src/perspective.ts`

See `ARCHITECTURE.md` for the fuller breakdown, `playbook.md` for the operator/developer guide, and `docs/database.md` for migration discipline.

## Current processing lifecycle

The implemented machine phases are:

1. `RESOLVING`
2. `ENRICHING`
3. `VERIFYING`
4. `HEALING`
5. `PERSISTING`
6. `COMPLETE`

There is **no separate `PROJECTING` machine phase**. Final Telegram output is projected after the state loop exits.

## Telegram-specific routing

The worker already supports per-chat routing hooks in `src/perspective.ts`:

- **Perspective**: influences Gemini synthesis via a `PERSPECTIVE OVERRIDE`
- **Tone template**: controls things like emoji usage, verbosity, and fact-check display in Telegram output

The matching surface supports:

- `@username`
- bare `username`
- numeric `chat.id`
- `chat.title`

The mapping is currently scaffolded but not populated with real channel rules.

## Persistence model

Cloudflare D1 currently stores:

| Table | Purpose |
|---|---|
| `events` | operational telemetry including Telegram ingest events |
| `urls` | flattened current record for each processed URL |
| `content_hashes` | dedupe and content-reuse index |
| `insight_logs` | append-only forensic trace of insight output and metadata |
| `logic_rules` | live-programmable parsing/config rules |

The `urls` table now includes runtime fields such as:

- `insight`
- `trace_id`
- `last_enriched`

Schema evolution is migration-first now. See `docs/database.md`.

## Worker endpoints and triggers

Defined in `wrangler.jsonc`:

- **Webhook**: `POST /webhook`
- **Reprocess API**: `GET /reprocess` and `GET /api/reprocess`
- **Feed API**: `GET /api/feed`
- **Vitals API**: `GET /api/vitals`
- **Queue consumer**: `linxtex-enrichment`
- **Scheduled cleanup**: `0 0 * * *`

Bindings:

- `DB` → D1 database `iv-cache`
- `FACTS` → KV namespace
- `ENRICHMENT_QUEUE` → Cloudflare Queue
- `BROWSER` → Cloudflare Browser binding

## Local development

### Install dependencies

```bash
bun install
```

### Run locally

```bash
bun run dev
```

### Type-check

```bash
bun run typecheck
```

### Run tests

```bash
bun test
```

## Database migrations

Migrations now live in `migrations/` and are the source of truth for D1 schema evolution.

Apply them with Wrangler:

```bash
wrangler d1 migrations apply iv-cache --local
wrangler d1 migrations apply iv-cache --remote
```

`schema.sql` remains in the repo as a snapshot/bootstrap convenience file, not the authoritative migration history.

## Deployment

```bash
bun run deploy
```

That runs `wrangler deploy` using the current Worker config in `wrangler.jsonc`.

## Notes

- `readme.md` is lowercase in this repo, so keep links/scripts honest.
- The repo currently contains significant uncommitted application changes alongside these docs updates; commit carefully, not like a drunk raccoon with write access.
