# Product Requirements Document (PRD) - LinxtexBot

## 1. Goal
The primary goal of **LinxtexBot** is to enhance the user experience on Telegram by automatically generating **Instant View** pages for shared links.

## 2. Target Audience
- **Telegram Channel Administrators**
- **Content Curators**

## 3. Core Features
- **URL Expansion**: Speculative, parallel resolution of redirects.
- **Fact Storage**: Global memoization of URL -> IV Link + AI Insight.
- **De-complected Ingest**: < 5ms response time for webhook updates.
- **Projection Dashboard**: High-velocity aggregator for world signals.
- **Epistemic Engine**: Speculative parallelism for concurrent AI analysis.
- **Autonomic Self-Healing**: De-complecting error recovery with phase-aware retries and AI-driven "Critic" correction.
- **Dual Persistence**: Sequential storage (KV View Layer -> D1 System of Record).

## 4. Technical Constraints
- **Runtime**: **Bun**.
- **Edge Native**: Cloudflare Workers + D1 + Assets.
- **Parser**: Lightweight Mozilla Readability + Linkedom.
- **Epistemic Engine**: Gemini Pro/Flash Speculative Parallelism.
