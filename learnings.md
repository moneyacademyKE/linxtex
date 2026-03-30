# Project Learnings & Philosophies

## Rich Hickey Quality (Audit 2026-03-29)
*   **De-complecting is a continuous process**: Moving from a sequential, mutation-heavy loop to a pure functional core significantly reduced cognitive load and improved testability.
*   **State as a Value over Time**: Treating the processing state as a series of immutable values transformed by `integrateObservation` and `decideNextEffects` makes the system predictable.
*   **Parallelism via Data, not Mutexes**: By returning multiple effects from the pure core, the imperative shell can execute them in parallel (using `Promise.all`) without any risk of race conditions, as the core itself is stateless.
*   **Managed Hashing**: Elevating hashing to a first-class effect (`CALCULATE_HASH`) ensures that even expensive synchronous operations are orchestrated within the managed lifecycle rather than hidden inside pure functions.
*   **De-complecting Config from State**: Removing static data (like `parsingRules`) from the `ProcessingState` ensures the state only represents the evolving "Value" of the link enrichment process. Config is passed as a dependency or parameter instead.
*   **Explicit Healing States**: Moving "Self-Correction" into a first-class `HEALING` phase makes the AI's internal feedback loop observable and prevents it from being a "hidden" side-effect of the enrichment logic.
*   **Granular Persistence Effects**: Splitting coarse effects (like `RECORD_INSIGHT`) into granular ones (`PERSIST_RELATIONAL`, `LOG_TRACE`, `CACHE_VIEW`) allows the core to orchestrate data across different durability layers independently.
*   **Fact Collection Pattern**: Accumulating structured data points (Observations) throughout the lifecycle, rather than just updating a single "Insight" string, provides better traceability.

## Architectural Learnings
- **De-complecting Orchestration**: In a Cloudflare Worker, keeping the "Imperative Shell" thin is crucial. By moving deciding "what to do" into a pure transducer-driven state machine in `domain.ts`, we made the logic testable and easier to reason about.
- **Effects as Data**: Defining side effects as data (e.g., `Effect` union type) allowed us to separate the "Request" for an action from its "Execution".
- **Speculative Parallelism**: Combining pure state transitions with `Promise.all` in the imperative shell allowed us to perform AI synthesis and Telegra.ph publishing concurrently without complecting their individual logics.
- **Memoization Strategy**: The L1/L2 cache (KV/D1) strategy works best when it's the very first thing checked, keeping the Godmode speed for the "View Layer".
- **Multi-stage Dependencies**: By making `decideNextEffects` dependency-aware, we can orchestrate multi-step AI pipelines (e.g., General -> Financial -> Stock Analysis) purely as data-driven states.
- **Durable Job Processing**: Migrating from `ctx.waitUntil` to **Cloudflare Queues** transformed the bot into a rock-solid background processor.
- **Exactly-Once Semantics**: Using a `trace_id` as a deduplication token in the projection layer is the simplest way to achieve idempotency.
- **Autonomic Self-Healing**: De-complecting error recovery from terminal failure by treating "Retries" and "Healing" as valid state transitions.
- **Observation-Driven Transitions**: Moving phase transitions into the `integrateObservation` function ensures that every "Fact" integrated into the system evolves the phase correctly.
- **Zero-Mutation Enforcement**: Absolute purity in the core is required for the Digital Twin testing model to remain high-fidelity.
- **Heuristic Link Selection**: In multi-link messages, using a "path-depth + domain-penalty" scoring system correctly identifies primary content (blogposts) vs. metadata (parent links).
- **In-place Reflection**: For high-trust channels, editing the source message to reflect the IV link reduces friction (No "double post").
- **Universalizing Premium Logic**: Removing channel-specific hardcoding simplifies the substrate. Premium, high-conviction processing should be the default for 100% of signals.
- **Adaptive Projection Philosophy**: Frictionless delivery is paramount. Small content (< 4000 chars) is better served as direct text (Insight + Article) than as a required click to an external mirror.
- **Automated Data Hygiene (Janitor Pattern)**: In high-velocity signal processing, facts older than 24 hours provide diminishing returns. Using a Cron-driven janitor keeps the database lean and focus "Urgent".
- **Zero-Signal Suppression**: Distinguishing between "Brief Content" and "Zero Content" (< 100 chars) prevents the bot from broadcasting failed extractions or landing/blocked pages.
- **Nitter Redirection Strategy**: Pivoting internally to Nitter instances bypasses X.com's aggressive anti-scraping more reliably than direct browser rendering, providing clean, scrape-ready HTML.
- **Thread Unrolling for Contextual Synthesis**: For high-conviction signals from X.com, capturing the entire thread is non-negotiable. Fragments lead to hallucinations or incomplete insights; deep thread capture provides the AI with the full discussion context.
- **Specialization within Universality**: While the orchestrator remains universal, specialized parsing branches for high-velocity domains (like Nitter) preserve the "High-Conviction" requirement.

