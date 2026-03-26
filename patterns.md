# Patterns

## Hickey-Mode De-complecting Machine
**Problem**: Mixed orchestration of asynchronous side effects with business logic results in "complected" code that is hard to test and maintain.
**Pattern**:
1. Define a `ProcessingState` record to capture all known observations.
2. Define `Effect` types as data representating future actions.
3. Define a `decideNextEffects(state: ProcessingState): Effect[]` pure function for orchestration.
4. Define an `integrateObservation(state: ProcessingState, observation: Observation): ProcessingState` pure function for state transitions.
5. In an "Imperative Shell" (e.g., Worker handler), run a loop:
    - Get `effects` from `decideNextEffects`.
    - Break if empty.
    - Execute `effects` concurrently (`Promise.all`).
    - Integrate results back into `state` via `integrateObservation`.

## Global Fact Memoization
**Problem**: Redundant, expensive processing (e.g., AI synthesis) for the same source URL.
**Pattern**:
1. Use SHA256 as an immutable key for the source URL.
2. Check L1 -> L2 -> Process in sequence.

## Multi-stage Transducer Orchestration
**Problem**: Complex enrichment often requires results from one stage before triggering another (e.g., Financial Insight -> Stock Analysis).
**Pattern**:
1. `decideNextEffects` should be dependency-aware. It returns an effect only if its prerequisites are present in `ProcessingState`.
2. The imperative loop continues as long as `decideNextEffects` returns non-empty results.

## Federated Expert Pipeline
**Problem**: Single-model analysis is either slow or lacks depth.
**Pattern**:
1. Split analysis into "Tiers" (Metadata, Synthesis, Verification).
2. Assign each tier to a specialized model (e.g., Flash for speed, Pro for reasoning).
3. The orchestrator triggers each expert sequentially or in parallel based on state-readiness.

## Idempotent State Projection
**Problem**: Redundant side effects in distributed event systems.
**Pattern**:
1. Generate an immutable `trace_id` at the entry point.
2. Propagate it through the entire processing chain.
3. Use the `trace_id` as a unique lock in the database write layer (`INSERT OR IGNORE`).

## Autonomic Retry Pattern
**Problem**: Transient failures (e.g., fetch timeouts, AI rate limits) cause process termination.
**Pattern**:
1. Add `retryCount` and `lastError` to `ProcessingState`.
2. In the Imperative Shell, catch errors and classify them as transient.
3. Use `integrateObservation` to update state with the failure.
4. `decideNextEffects` checks `retryCount` against a budget before re-emitting the effect.

## Epistemic Self-Healing (The Critic)
**Problem**: AI models may generate low-quality or hallucinated content.
**Pattern**:
1. Define a `HEALING` phase in the state machine.
2. After verification, if the `Critic` verdict is poor, transition to `HEALING`.
3. Reset relevant state fields and return to `ENRICHING` with `healingHints` appended to the prompt.

## Pluggable Execution Engine
**Problem**: Orchestrators are often coupled to specific I/O libraries, making them impossible to test without complex mocks.
**Pattern**:
1. The orchestrator (`resolveLink`) accepts an optional `executor` function.
2. The `executor` is responsible for transforming `Effect` data into `Observation` data.
3. This "DI" approach allows tests to provide a `mockExecutor` that returns deterministic observations, certifying the state machine logic in total isolation.

## Terminal Fact Observation
**Problem**: A state machine might "hang" or loop indefinitely if it relies on empty effect lists to signal completion.
**Pattern**:
1. The final effect in a pipeline (e.g., `RECORD_INSIGHT`) must return a specific success observation (e.g., `PERSISTENCE_COMPLETE`).
2. `integrateObservation` uses this terminal fact to transition the phase to `COMPLETE`.
3. This creates a definitive "end-of-life" for the state object.

## Normalized Resource Transformation
**Problem**: Relative URLs (images/links) in extracted content break when rendered in third-party platforms like Telegra.ph.
**Pattern**:
1. Always pass a `baseUrl` (the source article's URL) to the tree transformation logic.
2. Recursively normalize `src`, `href`, and `data-src` attributes by resolving them against the `baseUrl`.

## Ingestion Resilience via Loose Validation
**Problem**: Strict Zod schemas (e.g., `.min(1)` for titles) cause pipeline crashes when processing non-article resources like raw images or truncated URLs.
**Pattern**:
1. Use optional or relaxed constraints for initial ingestion schemas to maximize throughput.
2. Implement robust fallback logic (e.g., filename-based titles) in the parsing layer before strict enrichment occurs.
