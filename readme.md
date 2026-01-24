# LinxtexBot ☁️

Cloudflare-native Telegram bot for generating Instant View pages.

## Getting Started

1. **Install Dependencies**:
   ```bash
   bun install
   ```

2. **Local Development**:
   ```bash
   bun run dev
   ```

3. **Test (Native Speed)**:
   ```bash
   bun test
   ```

4. **Deploy**:
   ```bash
   bun run deploy
   ```

## Stack
- **Runtime**: **Bun** (Pure native, zero Node.js)
- **Database**: Cloudflare D1 (L2 System of Record)
- **Persistence**: Cloudflare KV (L1 View Layer)
- **Logic**: Hickey-Mode Functional (De-complectened)
