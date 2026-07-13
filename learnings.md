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

## Audit & Modernization (July 2026)
*   **Modular File Splitting (<250 LOC)**: Forcing files to be under 250 lines of code enforces high cohesion, low coupling, and clear namespace separations. It transforms codebases into tiny, easily readable units.
*   **Sequential Transition Ordering**: Order of evaluation in `integrateObservation` matters. State transition validations must be evaluated after all facts from the current observation (like bad verdict indicators) have been fully parsed and applied.
*   **Decoupled Database Mocking**: Splitting a monolithic storage action into granular effects (`PERSIST_RELATIONAL`, `LOG_TRACE`, `CACHE_VIEW`) requires E2E test mock executors to mimic all separate side effects in order to satisfy downstream DB assertions.
*   **Dual API Reprocess & Root Routing**: Standardizing endpoints like root `/` (returning 200) and mapping dual paths (such as `/reprocess` and `/api/reprocess`) protects the edge router from mismatching test cases and local proxies.

## Phase 10 Improvements (July 2026)
*   **Structured Outputs (Zero-Egress JSON)**: Enforcing JSON Schemas directly at the API token generation level completely removes post-generation regex formatting hacks (`cleanJson`) and parser exceptions. It ensures schema conformity by contract.
*   **Content Hash Deduplication**: Using SHA-256 hashes of text content for lookup in historic logs enables semantic deduplication. This prevents duplicate AI generation costs for cross-posted articles and reduces API budget usage.
*   **Graceful Degradation Cascades**: Building a fallback hierarchy (`financial` -> `generalSummary` -> `extractive`) ensures the bot always delivers a useful response, preventing API/scraper failures from causing silent dropouts.
*   **Signal Confidence Routing**: Dynamically switching delivery output based on relevance score (suppressing low relevance, compacting medium relevance, full broadcast for high relevance) keeps the signal-to-noise ratio exceptionally high for the feed.
*   **Temporal Grounding (Decay)**: Calculating the age of the article from HTML metadata and injecting a temporal decay warning into the prompt keeps the AI grounded in real-time relevance, preventing it from treating stale reports as urgent.

## Phase 11 Improvements (July 2026)
*   **Context-Sensitive critic verification**: Mirroring guiding lens perspectives directly inside forensic verification prompts ensures that semantic assertions are checked under the exact same criteria that guided the synthesis.
*   **Pre-Scrape paywall detection**: Proactively matching premium financial domains (Bloomberg, FT, Economist) before attempting standard fetches avoids unnecessary fetch failures, network errors, and login redirection traps.
*   **Source Authority Pre-grounding**: Grounding LLM summarization with domain credibility configuration scores keeps the AI informed of news reliability upfront.
*   **Pre-Loop state accumulation**: Pre-querying historical database details like `previousInsight` and initializing the state machine core with these facts de-complectes processing flow loops, preventing recursive lookups inside the state machine.
*   **Live-Programmable Rules**: Fetching Allowed Tags configurations from KV/D1 at the imperative shell boundary enables logic rule adjustments without requiring worker rebuilds/re-deployments.

