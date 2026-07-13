# Tasks - LinxtexBot

## Completed baseline

- [x] Migrate runtime to Cloudflare Workers
- [x] Replace MongoDB-era persistence with D1-backed storage
- [x] Add queue-driven enrichment flow
- [x] Implement Telegra.ph publication for longer content
- [x] Rebrand as LinxtexBot
- [x] Shift local tooling/workflow to Bun
- [x] Build the functional-core / imperative-shell split
- [x] Add critic/healing flow to the enrichment lifecycle
- [x] Deploy to Cloudflare Workers
- [x] Establish migration-first schema discipline with `migrations/0001_initial_schema.sql`
- [x] Extract Telegram projection into `src/telegram_projection.ts`
- [x] Align README, architecture docs, database docs, and playbook with runtime behavior

## Current open tasks

### Documentation and product honesty

- [ ] Keep `PRD.md`, `ROADMAP.md`, `TASKS.md`, `readme.md`, and `ARCHITECTURE.md` aligned after behavior changes
- [ ] Remove or rewrite any remaining doc claims that are not grounded in code/config/tests

### Perspective and tone routing

- [ ] Populate real channel rules in `src/perspective.ts`
- [ ] Add tests for real perspective/tone mappings
- [ ] Document the procedure for maintaining channel routing safely

### Operational hardening

- [ ] Tighten `/api/feed` and `/api/vitals` so they reflect trustworthy metrics and shapes
- [ ] Improve reprocess visibility and failure handling
- [ ] Review event logging for suppressions, queue failures, and cleanup runs

### Type and persistence cleanup

- [ ] Continue removing loose `any` usage in executor/enrichment seams
- [ ] Normalize D1 access/persistence helper patterns
- [ ] Keep `urls` and `insight_logs` synchronized during regeneration/reprocessing edge cases

### Extraction and verification quality

- [ ] Improve hostile-page extraction/browser fallback behavior
- [ ] Add regression coverage for low-fidelity extraction and suppression behavior
- [ ] Review healing-loop bounds and fallback behavior for weak critic outcomes

### Schema and test discipline

- [ ] Add new ordered migrations for future D1 changes
- [ ] Keep inline test schema setup aligned with the latest migration baseline
- [ ] Update `docs/database.md` whenever persistence behavior changes

## Task rule

A completed task should correspond to something visible in code, tests, config, or deployed behavior — not just optimism and caffeine.
