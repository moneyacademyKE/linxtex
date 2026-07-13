import { describe, it, expect, beforeAll } from "bun:test";
import { env, createExecutionContext } from "cloudflare:test";
import { handleUpdate, resolveLink, webhookHandler } from "../src/index";

const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL, data TEXT, chat_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS urls (
        url TEXT PRIMARY KEY, title TEXT, iv_link TEXT, insight TEXT,
        trace_id TEXT, last_enriched INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS content_hashes (
        hash TEXT PRIMARY KEY, title TEXT, iv_link TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS insight_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_hash TEXT, raw_insight TEXT, relevance_score INTEGER,
        trace_id TEXT, url TEXT, hash TEXT, insight TEXT, metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
];

beforeAll(async () => {
    for (const sql of SCHEMA) {
        await env.DB.prepare(sql).run();
    }
});

function buildExecutor(overrides: Partial<Record<string, (...args: any[]) => any>> = {}) {
    const defaults: Record<string, () => any> = {
        FETCH_LINK: () => ({
            type: 'CONTENT_FETCHED',
            title: 'E2E Article',
            content: '<div><p>Market analysis: $AAPL is surging on earnings beat. </p></div>' + 'a'.repeat(4500),
            textContent: 'Market analysis: $AAPL is surging on earnings beat. ' + 'a'.repeat(4500)
        }),
        GENERATE_METADATA: () => ({
            type: 'INSIGHTS_GENERATED',
            insight: 'AAPL beat estimates by 12%. Bullish short-term.',
            rawInsight: 'raw',
            relevanceScore: 92
        }),
        VERIFY_INSIGHT: () => ({
            type: 'VERDICT_GENERATED',
            verdict: JSON.stringify({ verdict: 'Verified', score: 90, confidence_score: 90 })
        }),
        PUBLISH_TELEGRAPH: () => ({
            type: 'IV_LINK_GENERATED',
            ivLink: 'https://telegra.ph/e2e-mock-page'
        }),
        CALCULATE_HASH: () => ({
            type: 'HASH_CALCULATED',
            hash: 'abc123def456'
        }),
        PERSIST_RELATIONAL: async (effect: any) => {
            const { url, title, ivLink } = effect.payload;
            await env.DB.prepare(
                "INSERT OR REPLACE INTO urls (url, title, iv_link, last_enriched) VALUES (?, ?, ?, ?)"
            ).bind(url, title, ivLink, Date.now()).run();
            return { type: 'RELATIONAL_PERSISTED' };
        },
        LOG_TRACE: async (effect: any) => {
            const { traceId, url, hash, insight, metadata } = effect.payload;
            if (hash) {
                await env.DB.prepare(
                    "INSERT INTO insight_logs (trace_id, url, hash, insight, metadata) VALUES (?, ?, ?, ?, ?)"
                ).bind(traceId || 'test', url, hash, insight, JSON.stringify(metadata)).run();
                await env.DB.prepare(
                    "UPDATE urls SET insight = ? WHERE url = ?"
                ).bind(insight, url).run();
            }
            return { type: 'TRACE_PERSISTED' };
        },
        CACHE_VIEW: async () => {
            return { type: 'CACHE_PERSISTED' };
        }
    };

    return async (effect: any): Promise<any> => {
        const handler = overrides[effect.type] ?? defaults[effect.type];
        if (!handler) return null;
        return handler(effect);
    };
}

describe("E2E Smoke Tests", () => {
    it("Webhook to Queue Pipeline: should validate and enqueue valid links", async () => {
        const payload = {
            message: {
                text: "Check this out: https://example.com/some-article-smoke",
                chat: { id: 123 },
                entities: [{ type: "url", offset: 16, length: 34 }]
            }
        };

        const promises: Promise<any>[] = [];
        await handleUpdate(payload, env as any, {
            waitUntil: (p: Promise<any>) => promises.push(p)
        } as any);

        await Promise.all(promises);
        expect(env.ENRICHMENT_QUEUE.send).toHaveBeenCalled();
    });

    it("E2E: Retry Exhaustion > terminates after 3 transient fetch errors and does NOT persist", async () => {
        const traceId = "retry-exhaust-trace-smoke";
        const url = "https://example.com/broken-article-smoke";

        const executor = buildExecutor({
            FETCH_LINK: () => ({
                type: 'ERROR_OCCURRED',
                message: 'Connection timeout',
                isTransient: true
            }),
        });

        const result = await resolveLink(
            url, url, env as any,
            { waitUntil: (p: any) => p } as any,
            0, traceId, 'default', executor
        );

        expect(result.ivLink).toBe(url);

        const row = await env.DB.prepare("SELECT * FROM urls WHERE url = ?").bind(url).first();
        expect(row).toBeNull();
    });

    it("E2E: Status & Routing > returns 200 OK with status message at root", async () => {
        const res = await webhookHandler(
            new Request('http://linxtexbot.dev/'),
            env as any,
            createExecutionContext()
        );
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('LinxtexBot is running');
    });

    it("E2E: Status & Routing > returns 404 for unknown routes", async () => {
        const res = await webhookHandler(
            new Request('http://linxtexbot.dev/nonexistent-route'),
            env as any,
            createExecutionContext()
        );
        expect(res.status).toBe(404);
    });

    it("E2E: Status & Routing > returns 500 on malformed webhook payload", async () => {
        const res = await webhookHandler(
            new Request('http://linxtexbot.dev/webhook', {
                method: 'POST',
                body: 'NOT_JSON{{{',
                headers: { 'Content-Type': 'application/json' }
            }),
            env as any,
            createExecutionContext()
        );
        expect(res.status).toBe(500);
    });
});
