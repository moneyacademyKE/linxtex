# Architecture Document - LinxtexBot

## 1. System Overview
LinxtexBot is a **Bun-native** Cloudflare application that processes Telegram link updates via webhooks.

## 2. Component Diagram
```mermaid
graph TD
    TG[Telegram] -->|Webhook| W[Worker]
    W -->|Parallel| G[Gemini AI]
    W -->|Sync Check| D1[(D1 Cache)]
    W -->|Async| EXT[Extraction Engine]
    EXT -->|Nodes| TP[Telegra.ph]
    W -->|Serve| WEB[Public Dashboard]
    WEB -->|JSON| W
    G -->|Insights| W
    TP -->|Link| W
    W -->|Reply| TG
```

## 3. Modules
- `src/index.ts`: Entry point, API routes, and update handler.
- `src/domain.ts`: Core transducers and schema definitions.
- `src/parser.ts`: Article extraction and sanitization.
- `src/gemini.ts`: Epistemic synthesis (Macro/Finance).
- `src/twitter.ts`: Twitter API and redirect resolution.
- `src/projections.ts`: Formatting and stats delivery.
- `public/index.html`: Aggregator dashboard frontend.
