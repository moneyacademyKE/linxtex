# Design & Code Patterns

## Pure Functional Core / Imperative Shell (Hickey Mode)
### Problem
Complex, multi-step asynchronous processes (like link enrichment) often become "complectated" with interleaved logic, side-effects, and state mutations, making them hard to test and slow to execute.

### Solution
Partition the system into:
1.  **Pure Functional Core**: A state machine that takes a state and an observation, returns a new state (`integrateObservation`), and a list of next effects (`decideNextEffects`). This part has zero I/O and zero mutations.
2.  **Imperative Shell**: An orchestrator that loops until the core reaches a terminal state. It executes the returned effects (in parallel where possible) and feeds the results back as observations.

### Benefits
*   **Testability**: The entire business logic can be tested with simple unit tests (no mocks required for the core).
*   **Performance**: Naturally enables parallel effect execution.
*   **De-coupled I/O**: The core doesn't care *how* a link is fetched or a hash is calculated, only that it *needs* to happen.

## Transducer-Driven Parser
### Problem
Extracting clean, structured content from diverse HTML sources while extracting metadata (like tickers) typically involves multiple passes or complex DOM walking.

### Solution
Use a single-pass transduction pipeline (`pipeline` function) that transforms DOM nodes into simplified Telegraph nodes while concurrently populating a shared results set (`tickers`).

### Autonomic Retry Pattern
### Problem
Transient errors in external APIs (Telegram, Gemini) can cause total process failure if handled imperatively with `try/catch` without state persistence.

### Solution
Treat "Transient Error" as a first-class observation (`ERROR_OCCURRED` with `isTransient: true`). The core integrates this observation by incrementing a `retryCount` and the `discoveryRule` re-emits the `FETCH_LINK` effect until a threshold is reached.

## The Critic Pattern (Epistemic Self-Healing)
### Problem
AI results (insights) may be hallucinated or low quality, but the system must maintain a high conviction for the "Digital Twin" output.

### Solution
Introduce a verification phase where a "Critic" model reviews the generated insight. If the verdict is negative, the core transition back to the `ENRICHING` phase, clears the bad data, and provides `healingHints` for the next generation pass.

## Explicit HEALING Phase
### Problem
When the Critic triggers a retry, transitioning directly back to `ENRICHING` makes it difficult to distinguish between the initial enrichment and a "Healing" attempt in logs and metrics.

### Solution
Introduce an explicit `HEALING` phase in the state machine. Transitions move from `VERIFYING` -> `HEALING` if a hallucination is detected. The `HEALING` phase then prepares the state (clears old insights, sets hints) and transitions back to `ENRICHING` for the next attempt. This makes the self-correction loop visible and measurable.

## Heuristic Link Selection Pattern
### Problem
High-velocity Telegram channels often share "parent" links (referrals, invites, profile homepages) alongside the primary "blogpost" content. Standard URL detection enqueues all links, leading to redundant or low-value processing.

### Solution
Implement a **Scoring Heuristic** that distinguishes content from metadata.
- **Positive Weights**: Path depth (`+10` per segment), Known platforms (`+50`).
- **Negative Weights**: Root domains (`-50`), Parent/Social domains (`-100`).
This ensures the system only processes the "Highest Conviction" link when multiple are present.

- **In-place Reflection Pattern (Message Editing)**: For high-trust channels, the bot modifies the *original* message using the Telegram `editMessageText` API. By replacing the source URL with the generated Instant View (`telegra.ph`) link, the enrichment becomes an integral part of the source post rather than an external commentary.
- **Adaptive Delivery Pattern**: To minimize read-friction, short-form content (< 4000 chars) is delivered **directly** to Telegram as a text block (Headline + Insight + Full Text). Long-form content automatically falls back to a mirrored Telegra.ph Instant View page.
- **Noise Reduction Gate Pattern**: To protect the feed from junk, a final quality gate suppresses any signal where the extracted article content is $< 100$ characters. These events are logged as `SIGNAL_SUPPRESSED`.
- **Scheduled Janitor Pattern**: In high-velocity data environments, stale facts are purged using a **Cron-driven Scheduled Worker**. A daily janitor deletes records older than 24 hours from SQL and expires them from the KV edge cache via `expirationTtl`.
- **Nitter Redirection & Thread Unrolling Pattern**: To capture complex conversation context from X.com, the bot transparently redirects URLs to Nitter and uses specialized DOM selectors (`.tweet-content`) within the parser. This transforms a single-link tweet into a multi-tweet "long-form" article for unified AI synthesis.

## Modular File Splitting Pattern (<250 LOC)
### Problem
Oversized files complect multiple responsibilities (e.g. types, state machine transitions, parser transducers, URL utilities) into a single module, violating the single responsibility principle and increasing cognitive load.

### Solution
Enforce a hard limit of <250 LOC on all source files. Split code into highly cohesive sub-modules:
- `types.ts` for schemas and types.
- `state.ts` for observation integration.
- `rules.ts` for pure next effect decisions.
- `url_utils.ts` and `transducers.ts` for pure transformations.
- `index.ts` for entry point routing, re-exporting modules to maintain backward compatibility.

### Benefits
- Code is instantly readable and fits entirely on a single screen page.
- Unit tests can target individual functions in complete isolation.
- Reduces Git merge conflicts and makes refactoring extremely simple.
