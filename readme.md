# LinxtexBot 🤖

A high-reliability Telegram bot for financial link enrichment and Instant View publishing, built on Cloudflare Workers and Gemini AI.

## 🚀 Features

- **Automated Enrichment**: Extracts URLs from Telegram messages and generates deep financial insights.
- **Instant View Publishing**: Automatically publishes high-fidelity Instant View pages via Telegra.ph.
- **Critic Tier Verification**: Self-verifying AI pipeline that audits insights against source content to prevent hallucinations.
- **Edge-First Persistence**: Durable factual storage using Cloudflare D1 (SQL) and KV (Cache).
- **Idempotent Queue Processing**: Resilient, deduplicated background processing via Cloudflare Queues.

## 🏗️ Architecture (Hickey-Mode)

The bot uses a **Pure Functional Core** with a **Linear State Machine** orchestrator. 

- **State Machine**: Driven by immutable `ProcessingState` and pure `decideNextEffects` logic.
- **De-complectation**: Separation of Intent (Effects) from Execution (Shell) for 100% testability.
- **Persistence**: Hybrid D1/KV model for canonical truth and high-speed view projections.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed technical overview.

## 🧪 Testing

The system is certified with a 100% pass-rate E2E integration suite.

```bash
# Run the full integration suite
bun test test/e2e-integration.spec.ts
```

## 🛠️ Tech Stack

- **Platform**: Cloudflare Workers (Bun-native)
- **AI**: Google Gemini (Flash/Pro)
- **DB**: Cloudflare D1
- **Storage**: Cloudflare KV
- **Messaging**: Cloudflare Queues
- **Publishing**: Telegra.ph (Instant View)

## 📑 Link Processing Capabilities

The processing engine operates as a **Pure Functional Core / Imperative Shell** state machine over a 6-phase lifecycle:

- **Ingestion, Filtering, & Scoring Heuristics**: Automatically ignores root homepages and known CDN assets. Scores URLs using a scoring heuristic (`filterBlogpostLinks`) prioritizing deep-dive content (Substack, Medium) over social profile links.
- **Speculative Parallelism**: Messages with $> 3$ links trigger *Isolated Broadcast Mode*, splitting signals into concurrent events for parallel resolution.
- **Nitter Translation & Thread Unrolling**: Twitter/X.com links are redirected to Nitter instances, and thread CSS selectors unroll multi-tweet threads to preserve full context.
- **Readability & Transduction**: Uses Mozilla Readability for extraction, transduces HTML into safe Telegraph JSON nodes, extracts stock tickers (`$AAPL`), and suppresses failed/low-fidelity content (< 100 characters).
- **Epistemic Critic Verification & Healing**: AI insights are verified against source text. Hallucinations trigger the `HEALING` phase, feeding correction hints back to the generation pass.
- **Adaptive Delivery**: Short content (< 4000 characters) is posted directly as a text block; long content is published as a Telegra.ph Instant View page.

## 🧠 AI Synthesis Prompts

To keep the codebase clean, system instructions are decoupled and maintained as data in [prompts.ts](file:///Users/moe/Desktop/gh/linxtex/src/prompts.ts):

- **Financial Synthesis (`financial`)**: Acts as a Senior Equity Analyst. Fact-checks claims, writes a 10-sentence Investment Committee summary, and generates a deep analysis detailing variants, boundaries, and 6-12 month impacts.
- **Stock Analysis (`stockAnalysis`)**: Acts as a High-Conviction Investment Analyst. Evaluates a target ticker using a 13-point checklist grounded in real-time Web Search facts (price, market cap, news).
- **General Summary (`generalSummary`)**: Acts as a Professional Editor. Synthesizes short posts/tweets in 3-5 sentences, or longer articles in up to 10 sentences.
- **Forensic Critic (`critic`)**: Acts as a Forensic Auditor. Audits AI insights against source text to flag hallucinations, logical leaps, or omissions.

## 📑 Universal High-Conviction Processing

The bot implements a specialized **High-Conviction Logic Path** for 100% of ingested items to ensure a premium, signal-to-noise optimized experience.

- **Low-Content Filter (100 Chars)**: To maintain a high-conviction feed, articles with under 100 characters of meaningful content (junk, blockers, empty pages) are automatically suppressed and not broadcast.
- **In-line Content Threshold (4000 Chars)**: To minimize friction, short-form content (under 4000 characters) is delivered **directly** to Telegram as a text message including the AI Insight and core content.
- **Telegra.ph Fallback (>= 4000 Chars)**: Long-form content is automatically mirrored to a Telegra.ph Instant View page, with the original post transformed into a clickable, title-masked hyperlink.

## ⚡ Modern Enhancements (Phase 10 & Phase 11)

To ensure high accuracy, robust execution, and user personalization, the bot has been elevated with the following architectural components:

### Phase 10: Inference & Routing Reliability
- **Structured JSON Schemas**: Enforces native API schemas (via Zod/OpenAPI mappings) at token emission time, completely eliminating formatting hacks and parse failures.
- **Content Hash Deduplication**: Computes SHA-256 hashes of text content for fast-forward lookups in D1, preventing redundant LLM inference costs.
- **Graceful Degradation Cascades**: Implements a tier cascade (`financial` -> `general` -> `extractive`) to ensure the bot always delivers a useful response, even under rate limits.
- **Signal Confidence Routing**: Routes delivery to three distinct templates based on relevance score (suppresses < 40, compacts 40-70, full Instant View for > 70).
- **Temporal Grounding (Decay)**: Calculates article age and injects warning indicators to keep the model grounded in news freshness.

### Phase 11: Grounding & Personalization
- **Context-Sensitive Critic**: Evaluates target synthesis accuracy under the specific guiding lens perspective passed directly into the forensic critic verify engine.
- **Proactive Browser Bypass**: Bypasses HTTP fetches for paywalled domains (Bloomberg, FT, Economist) by immediately executing Puppeteer rendering.
- **Source Authority Grounding**: Ground prompt inputs using a predefined domain credibility scorecard (Bloomberg/Reuters = 95/100).
- **Extraction Fidelity Grading**: Automatically calculates HTML-to-text extraction ratios and warns the model if layout complexity caused text context loss.
- **Dynamic Projection Tone Templates**: Allows channel-specific custom format styling (verbosity level, ticker hashtags, and sentiment emojis).
- **Semantic Diff Re-enrichment**: Pre-queries historical insights of the url to focus summaries on new accretion details since the last crawl.
- **Live-Programmable Logic Rules**: Loads allowance rules dynamically from KV/D1 database configurations, eliminating worker redeployments.

---
*Built with Rich Hickey quality principles for simplicity and de-complectation.*
