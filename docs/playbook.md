# LinxtexBot Playbook

This playbook outlines the standards, architectures, and operations for developers contributing to the LinxtexBot worker.

## 1. Code Standards
- **Pure Core / Imperative Shell**: Maintain absolute purity in `domain.ts`, `state.ts`, and `rules.ts`. Side effects must only be requested as data payloads via `Effect` schemas.
- **Strict LOC Limit**: All source files MUST remain strictly under 250 lines of code. Split files into cohesive sub-modules rather than growing single modules.
- **Intention-Revealing Naming**: Prefer descriptive domain names like `requiresBrowserRendering`, `getAuthorityScore`, `integrateObservation` over vague helper names.

## 2. Ingestion & Filtering Rules
- Ignore root homepages and common CDNs via `isHomepage`.
- Score links using `filterBlogpostLinks` to ingest primary articles over profiles.
- Fall back to standard templates or suppress alerts if content density is under 100 characters.

## 3. Deployment Procedures
- Always run tests and verify zero-failure runs locally before deploying:
  ```bash
  bun test
  ```
- Deploy to Cloudflare Workers using:
  ```bash
  bun run deploy
  ```
