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

## Phase 10 Patterns

### Structured Output Schema Enforcement
#### Problem
Parsing dynamic JSON string responses from LLMs is error-prone and requires string manipulation hacks to strip backticks, leading to runtime parse errors.

#### Solution
Define OpenAPI-compatible JSON Schemas inside the code and pass them to the API via `response_schema`. Enforces the schema shape at token emission time, guaranteeing valid JSON.

### Content Hash Deduplication (Semantic Cache)
#### Problem
Repetitive scraping and enrichment of identical articles shared via different URLs wastes LLM tokens and API budget.

#### Solution
Compute the SHA-256 hash of raw parsed content, lookup historically generated insights using the hash, and perform a fast-forward transition directly to relational persistence on cache hit.

### Graceful Degradation Cascade
#### Problem
 scraper failures or strict prompt scope limits (e.g. non-financial text) trigger complete pipeline processing failures, causing the bot to drop useful signals.

#### Solution
Construct a fallback hierarchy that degrades from deep financial analysis to a generic summary and finally to a direct extractive summary (first 3 sentences) if all LLM synthesis calls fail.

### Signal Confidence Routing
#### Problem
Channel members get overwhelmed by low-value, marginal signals or noisy posts.

#### Solution
Inspect the relevance score and route signals to three distinct output templates:
- `Score < 40`: Suppressed completely.
- `Score 40-70`: Compact inline text message with title, summary, and original URL.
- `Score > 70`: Full Instant View publication with stock ticker analysis.

### Temporal decay grounding
#### Problem
Stale or historical articles are synthesized as if they are breaking, urgent events.

#### Solution
Extract publication time metadata and inject a decay grounding warning prefix into the prompt context to adjust the urgency rating calculated by the model.

## Phase 11 Patterns

### Pre-scraped Browser Decoupling
#### Problem
Scraping paywalled or heavy client-rendered financial domains causes rate limiting and extraction failures.

#### Solution
Match the domain against a predetermined paywalled domain checklist at the start of the parse transaction. If a match occurs, route immediately to headless browser fetchers to bypass basic GET failures.

### Contextual Tone templates
#### Problem
Providing rigid message formatting styles doesn't fit the requirements of separate channels that favor emojis, high brevity, or detailed analysis.

#### Solution
Retrieve formatting tone instructions mapping chat candidates and structure output styles dynamically inside the projection layer (compact, verbose, standard).

### Pre-loop Fact Accumulation
#### Problem
Checking database tables inside state machine loop iterations complects the core and violates pure rules separation.

#### Solution
Query all necessary historical state information (like prior insights) before the loop execution starts, and pass it directly inside the initial state value.

### Dynamic Allowed-tag Transduction
#### Problem
Adding/modifying element parsing rules (e.g. allowing new block elements in IV generation) requires re-compiling and re-deploying the worker.

#### Solution
Lookup custom allowedTags arrays from D1/KV during telegraph publishing and override the default static config arrays dynamically.
