# Database migrations

Linxtex now treats `migrations/` as the source of truth for D1 schema evolution.

## Apply locally / remote

- Local D1:
  - `wrangler d1 migrations apply iv-cache --local`
- Remote D1:
  - `wrangler d1 migrations apply iv-cache --remote`

## Current baseline

- `0001_initial_schema.sql` creates:
  - `events`
  - `urls`
  - `content_hashes`
  - `insight_logs`
  - `logic_rules`
  - read/query indexes used by the worker

## Notes

- `schema.sql` is now just a snapshot/bootstrap convenience file.
- New schema changes should be added as a new ordered file in `migrations/`, never by silently editing runtime assumptions in code.
- Tests may still inline minimal setup SQL for speed, but that setup should match the latest migration baseline.
