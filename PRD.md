# Product Requirements Document (PRD): LinxtexBot Forensic Engine

**Version**: 3.0 (Hickey-Hardened & Forensic Substrate)
**Status**: Active / Hardened
**Architectural Mode**: De-complectated (Pure Core / Imperative Shell)

---

## 1. Executive Summary & North Star
**LinxtexBot** is a high-reliability, edge-native financial insight engine. Its mission is to transform the "Entropy of the Open Web" into verified, structured, and actionable financial signals. Shared links in high-velocity communication environments (Telegram) are often opaque, slow, or misleading. LinxtexBot acts as a **Forensic Filter**, ensuring that every insight provided is grounded in verifiable source content.

The system is built on **Rich Hickey's Principles of Simplicity**, where "de-complecting" (separating concerns) is not just a technical preference but a core product requirement for reliability and observability.

---

## 2. The Problem Space: Entropy in Financial Data
In fast-moving financial markets, high-conviction information is fragmented across disparate platforms (Twitter/X, Substack, Bloomberg, AEC, Gists).
- **Friction**: Manually opening links is slow, often hindered by ad-blockers, paywalls, or mobile-unfriendly layouts.
- **Information Density**: Most shared content contains 80% "Noise" (filler) and 20% "Signal" (alpha).
- **Hallucination Risk**: Standard AI summarization often introduces errors ("Ghost Data") that can lead to catastrophic financial decisions.
- **Lost Lineage**: Traditional bot-generated summaries lack forensic traces, making it impossible to audit *how* an assertion (e.g., "$AAPL Target Upgrade") was derived.

---

## 3. Target User Personas & User Stories

### 3.1. The High-Velocity Trader ("Signal Hunter")
- **Need**: Instant conviction on a shared link without leaving the Telegram environment.
- **User Story**: "As a trader, when a link is shared in my alpha-channel, I want a 3-sentence summary and a list of mentioned tickers within 10 seconds, so I can pivot faster than the competition."

### 3.2. The Content Curator ("Mastery Admin")
- **Need**: Provide a premium reading experience for their channel subscribers.
- **User Story**: "As an admin, I want every link shared in my channel to be converted into a clean, ad-free Telegram Instant View (IV) page with an AI-enriched header."

### 3.3. The Forensic Analyst ("Trust-but-Verify")
- **Need**: Audit the accuracy of AI-generated insights.
- **User Story**: "As an analyst, I want to see the 'Critic Verdict' for every insight, so I know if the AI had to self-correct during the enrichment process."

---

## 4. Functional Hierarchy: The 6-Phase Lifecycle
The engine MUST transition through the following explicit, observable phases for every URL:

### Phase 1: RESOLVING (Speculative Unwrapping)
- **Requirement**: Unpack shortened links (t.co, bit.ly) and resolve multi-level redirects.
- **Speculative Parallelism**: The system should speculatively resolve multiple entities in a single telegram message concurrently.
- **Success Criteria**: Discovery of the canonical source URL.

### Phase 2: ENRICHING (Synthesis & Extraction)
- **Extraction**: Clean, readability-optimized text extraction from the source HTML.
- **Synthesis**: Initial AI generation of "General Insight" and "Financial Insight" (Tickers, Sentiment, Key Facts).
- **Content Hashing**: Every extracted text block must be hashed for future de-duplication and change-tracking.

### Phase 3: VERIFYING (The Critic Protocol)
- **Epistemic Integrity**: An independent "Critic" tier (typically a higher-fidelity LLM or a specialized prompt) audits the enrichment output against the source text.
- **Fault Detection**: Identifying contradictions, hallucinations, or missing ticker data.

### Phase 4: HEALING (Self-Correction Loop)
- **Explicit Healing**: If the Critic detects a hallucination, the system MUST transition to a formal `HEALING` phase.
- **Hints Infusion**: The system generates "Healing Hints" (forensic context of the failure) and passes them back to the ENRICHING phase for a repair cycle.

### Phase 5: PERSISTING (Multi-Layered Durability)
- **Relational Trace (D1)**: Store the full forensic history (URL -> Hash -> Insight -> Verdict) for auditability.
- **Cache Projection (KV)**: Store the "ready-to-read" view for the Instant View and Dashboard layers.
- **Idempotency**: Use the `trace_id` to ensure that duplicate queue messages do not create redundant database entries.

### Phase 6: COMPLETE (Projection)
- **Instant View (IV)**: Generation of Telegra.ph nodes for edge-native, zero-latency mobile reading.
- **Dashboard API**: Providing a unified JSON feed for the external Aggregator Dashboard.

---

## 5. Technical Architecture: The "Hickey" Hardening
The product's reliability is derived from its "De-complectated" architectural substrate:

### 5.1. Pure Core / Imperative Shell
- **Pure Core (`domain.ts`)**: All decision logic (state transitions, effect generation, URL detection) MUST be pure functions. They transform `State + Input -> New State + Effects`.
- **Imperative Shell (`index.ts`)**: Responsible only for executing side effects (DB writes, AI calls, Network requests) and piping the results back into the pure core.

### 5.2. Config as Data
- **Logic Rules**: Parsing rules, ticker patterns, and AI prompts are stored as **Data** (D1 tables or JSON), not hardcoded in the logic. This allows "live-programmability" without redeployment.

### 5.3. Forensic Tracing
- **Trace correlation**: Every request triggers a unique `trace_id` that is passed through the entire 6-phase lifecycle.
- **Relational Logging**: All events are logged with the `trace_id`, enabling a single SQL query to reconstruct the entire "thought process" of a specific enrichment.

---

## 6. Infrastructure & Deployment Requirements

### 6.1. Cloudflare Native Stack
- **Compute**: Cloudflare Workers (Runtime compatibility with standard Web APIs).
- **Relational Storage**: Cloudflare D1 (SQL-based system of record).
- **Object Storage**: Cloudflare KV (Fast-access view layer).
- **Orchestration**: Cloudflare Queues (`linxtex-enrichment`) for asynchronous recovery and re-processing.
- **Verification**: Cloudflare Browser Rendering (Optional) for anti-scraping bypass on complex JS sites.

### 6.2. AI Orchestration
- **Inference**: Gemini 1.5 Flash-Lite (low latency) for synthesis; Gemini 1.5 Pro (high fidelity) for the Critic tier if needed.
- **Prompt Isolation**: System instructions must be isolated from the state machine to prevent "prompt injection" from influencing the core loop.

---

## 7. Performance & Reliability (SLIs/SLOs)
- **Submission ACK**: Acknowledgement of a Telegram message MUST occur in `< 5ms`.
- **Enrichment Throughput**: The system must support `50+ URLs/minute` via asynchronous queueing.
- **Durability**: 100% of successful enrichments must be retrievable from the D1 forensic log.
- **Availability**: 99.9% uptime at the Edge, ensuring the bot is always responsive to news signals.

---

## 8. Security & Resilience

### 8.1. Rate Limiting & Bot Protection
- **External Constraints**: Handling the shifting bot-protection of platforms like Twitter/X and Bloomberg via specialized proxy headers or headless browser rendering.
- **Internal Safety**: Throttling AI calls per URL to prevent "recursive healing loops" from consuming excessive API budget.

### 8.2. Hallucination Containment
- No insight is allowed to reach the "PERSISTING" phase without a `VERIFIED` verdict from the Critic.
- **Hard Stop**: After 3 failed healing attempts, the system MUST fallback to a "Simple Summary" or flag the link as `UNVERIFIED`.

---

## 9. Future Roadmap: The Velocity Plan

### Phase 10: Live-Programmable Rules
- Transitioning all `domain.ts` logic into D1-driven rulesets that can be tweaked via a "Godmode" dashboard.

### Phase 11: Multi-Perspective Synthesis
- Requirements for generating different summaries based on the user's perspective (e.g., "VC View" vs. "Day-Trader View").

### Phase 12: Real-time Signal Broadcast
- Automatic routing of verified high-conviction signals to specific Telegram sub-channels based on ticker relevance and sentiment scores.

---

## 10. Success Metrics (KPIs)
- **Mastery Count**: Absolute number of unique links processed in the last 24h.
- **Success Rate**: % of link enrichments that reach the `COMPLETE` phase without terminal error.
- **Alpha Latency**: Time from link share to verified insight broadcast.
- **Self-Healing Efficiency**: Measurement of how many hallucinated facts were caught and repaired by the Critic loop.

---

*This document serves as the single source of truth for the LinxtexBot Forensic Engine development and operation.*
