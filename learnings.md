# Learnings

## Rich Hickey Refactor (LinxtexBot)
- **De-complecting Orchestration**: In a Cloudflare Worker, keeping the "Imperative Shell" thin is crucial. By moving deciding "what to do" into a pure transducer-driven state machine in `domain.ts`, we made the logic testable and easier to reason about.
- **Effects as Data**: Defining side effects as data (e.g., `Effect` union type) allowed us to separate the "Request" for an action from its "Execution". This is classic Hickey-mode.
- **Speculative Parallelism**: Combining pure state transitions with `Promise.all` in the imperative shell allowed us to perform AI synthesis and Telegra.ph publishing concurrently without complecting their individual logics.
- **Memoization Strategy**: The L1/L2 cache (KV/D1) strategy works best when it's the very first thing checked, keeping the Godmode speed for the "View Layer".
- **Multi-stage Dependencies**: By making `decideNextEffects` dependency-aware, we can orchestrate multi-step AI pipelines (e.g., General -> Financial -> Stock Analysis) purely as data-driven states, avoiding nested callbacks or imperative branching.
- **Operational Integrity**: Implementing a **Vitals API** and monitoring "Success Rate" directly from the event log allows for proactive debugging before users notice failures.
- **Durable Job Processing**: Migrating from `ctx.waitUntil` to **Cloudflare Queues** transformed the bot into a rock-solid background processor, eliminating data loss during worker restarts.
- **Exactly-Once Semantics**: Using a `trace_id` as a deduplication token in the projection layer is the simplest way to achieve idempotency in a distributed queue environment.
- **Composable Machines**: Refactoring the state machine into a rules-based "Composite Decider" allows for adding new expert models without increasing the cognitive overhead of the core loop.
- **Autonomic Self-Healing**: De-complecting error recovery from terminal failure by treating "Retries" and "Healing" as valid state transitions. This ensures "Rich Hickey quality" by systematically improving results rather than accepting first-pass hallucinations.
- **Janitor Pattern**: Scheduled reconciliation (D1 -> KV) ensures the "View Layer" eventually aligns with the "System of Record", masking transient write failures in distributed environments.
- **Dependency-Injected Orchestration**: Decoupling the effect execution engine from the state derivation logic (via a pluggable `executor`) is the ultimate path to testability and Hickey-mode quality.
- **Observation-Driven Transitions**: Moving phase transitions into the `integrateObservation` function ensures that every "Fact" integrated into the system has the opportunity to evolve the system's phase, avoiding stale-state logic in the orchestrator.
- **Schema Resilience for Mixed Media**: Relaxing Zod constraints (e.g., non-empty titles) is necessary when a pipeline consumes both structured articles and raw media resources.
- **URL Normalization in Transformations**: Pure node transformations must explicitly handle `baseUrl` to resolve relative images, ensuring portable Instant View content. 
- **Grounding vs. JSON Mode**: In high-throughput Workers, prefer pure JSON schema generation over mixed Grounding (Search) + JSON to avoid 400 errors or non-deterministic stalls in JSON mode.
- **Event-Sourced Recovery**: Using a durable `events` table as the primary source for link reprocessing is more reliable than fetching historical updates from transient APIs (like Telegram).
