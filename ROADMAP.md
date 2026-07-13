# Roadmap - LinxtexBot

This roadmap tracks the next useful work for LinxtexBot based on the code that actually exists today.

## Recently completed foundation

- [x] Cloudflare Worker runtime with queue-driven enrichment
- [x] D1-backed persistence for URL state, events, hashes, and insight logs
- [x] Telegraph publication path for longer-form reading
- [x] Functional-core / imperative-shell split across domain, state, executor, and orchestrator
- [x] Critic/healing loop in the enrichment lifecycle
- [x] Telegram projection extraction into `src/telegram_projection.ts`
- [x] Migration-first D1 schema baseline in `migrations/0001_initial_schema.sql`
- [x] README, architecture docs, database docs, and playbook brought closer to runtime truth

---

## Near-term roadmap

### P1 — Make channel routing real

- Populate `src/perspective.ts` with real per-channel rules where needed
- Add tests for real perspective/tone mappings
- Document the operational process for adding or changing channel rules

### P1 — Harden operational surfaces

- Make `/api/feed` and `/api/vitals` explicitly trustworthy and stable
- Improve reprocess visibility and guardrails
- Ensure event logging stays useful for queue failures, suppressions, and cleanup runs

### P1 — Tighten type and executor consistency

- Continue removing loose `any` seams in enrichment/executor boundaries
- Normalize D1 statement access patterns and persistence helpers
- Keep `urls` and `insight_logs` updates consistent during regeneration/reprocessing

### P2 — Extraction quality and hostile-page handling

- Improve browser-assisted fallback for JS-heavy or anti-scraping pages
- Add focused regression tests for extraction edge cases
- Make content fidelity behavior easier to inspect in logs/tests

### P2 — Migration and test discipline

- Add follow-up migrations when schema evolves
- Keep inline test schema setup aligned with the latest migration baseline
- Document schema changes in `docs/database.md` when behavior changes

### P3 — Better observability and dashboards

- Improve the usefulness of telemetry already written to `events`
- Consider a more honest dashboard/feed layer once the underlying metrics are reliable
- Avoid inventing product surfaces in docs before they exist in code

---

## Not on this roadmap until they are real

These ideas may be fine later, but they are **not current committed product reality** and should not be documented as completed work:

- D1 peer-stream/pub-sub browser feeds
- voice synthesis debriefs
- multi-LLM jury systems
- R2 cold-storage migration
- fully realized external aggregator product claims beyond the current worker routes

If one of these becomes real, add it back with code, tests, and docs.

---

## Roadmap rule

Linxtex has already suffered from doc fan fiction. Don’t do that again.

If a roadmap item moves to “completed,” it should be visible in code, tests, config, or deployed behavior — preferably more than one of those.
