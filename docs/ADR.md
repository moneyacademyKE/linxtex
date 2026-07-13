# Architectural Decision Record (ADR) Log

## ADR-001: Pure Functional Core & Imperative Shell (Hickey Mode)
- **Status**: Accepted
- **Context**: Asynchronous link enrichment flows can quickly complect side-effects and state mutations.
- **Decision**: Separate the logic into a pure functional core (`domain.ts`, `state.ts`, `rules.ts`) and an imperative shell (`orchestrator.ts`, `executor.ts`).
- **Consequences**: Easy unit testing without mocks, predictable state transitions, and clean concurrent effect executions.

## ADR-002: Cloudflare Queues for Durable Processing
- **Status**: Accepted
- **Context**: Link resolution can take up to 30 seconds, exceeding direct webhook timeout limits.
- **Decision**: webhookHandler enqueues jobs to Cloudflare Queues, which handles background retries and durability.
- **Consequences**: Highly resilient background processing and zero webhook timeouts.

## ADR-003: Modular File Splitting (< 250 LOC)
- **Status**: Accepted
- **Context**: Monolithic codebase structures complect multiple layers of logic together.
- **Decision**: Restrict all source files to a strict maximum of 250 lines of code.
- **Consequences**: Forces high cohesion, low coupling, and clear namespace separations.

## ADR-004: Phase 11 Tier 2 Accumulation & Grounding Enhancements
- **Status**: Accepted
- **Context**: Improving signal accuracy, tone customization, and paywall handling.
- **Decision**: Implemented Domain-level authority weighting, proactive browser loading, extraction density warnings, custom tone templates, semantic diff re-enrichment via pre-loop database lookups, and dynamic allowedTags logic rules.
- **Consequences**: Extremely high-fidelity summarization, minimal hallucination rates, and fully custom format styling.
