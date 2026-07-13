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

---
*Built with Rich Hickey quality principles for simplicity and de-complectation.*
