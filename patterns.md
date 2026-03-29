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
