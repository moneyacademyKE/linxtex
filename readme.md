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

---
*Built with Rich Hickey quality principles for simplicity and de-complectation.*
