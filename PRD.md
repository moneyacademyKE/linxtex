# Product Requirements Document (PRD) - LinxtexBot

## 1. Goal
The primary goal of **LinxtexBot** is to enhance the user experience on Telegram by automatically generating **Instant View** pages for shared links.

## 2. Target Audience
- **Telegram Channel Administrators**
- **Content Curators**

## 3. Core Features
- **URL Expansion**: Resolves shortened links to source URLs pre-emptively.
- **Content Extraction**: Uses `@mozilla/readability` and Nitter fallbacks for clean extraction.
- **Telegra.ph Integration**: Publishes to Telegra.ph for Instant View support.
- **AI Synthesis**: Generates Macro and Financial insights using Gemini 2.0 Flash (Parallel).
- **Aggregator Dashboard**: Public AllTop-style list of processed links and insights.
- **Persistence**: Cloudflare D1 for URL and content hash caching.

## 4. Technical Constraints
- **Runtime**: **Bun**.
- **Edge Native**: Cloudflare Workers + D1 + Assets.
- **Parser**: Lightweight Mozilla Readability + Linkedom.
- **Epistemic Engine**: Gemini Pro/Flash Speculative Parallelism.
