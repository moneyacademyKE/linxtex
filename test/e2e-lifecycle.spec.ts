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

describe("E2E Lifecycle Tests", () => {
    it("Full Lifecycle: should handle enrichment and persistence", async () => {
        const traceId = "test-trace-full";
        const originalUrl = "https://example.com/article-full";

        const mockExecutor = buildExecutor();
        const result = await resolveLink(
            originalUrl, originalUrl, env as any,
            { waitUntil: (p: any) => p } as any,
            123, traceId, 'default', mockExecutor
        );

        expect(result.title).toBe("E2E Article");
        expect(result.ivLink).toBe("https://telegra.ph/e2e-mock-page");

        const urlRow = await env.DB.prepare("SELECT * FROM urls WHERE url = ?").bind(originalUrl).first();
        expect(urlRow).not.toBeNull();
        expect(urlRow!.title).toBe("E2E Article");

        const logRow = await env.DB.prepare("SELECT * FROM insight_logs WHERE trace_id = ?").bind(traceId).first();
        expect(logRow).not.toBeNull();
        expect(logRow!.insight).toBe("AAPL beat estimates by 12%. Bullish short-term.");
    });

    it("E2E: Self-Healing Path > re-enriches after a bad critic verdict and eventually persists", async () => {
        const traceId = "self-heal-trace-01";
        const url = "https://example.com/heal-article";

        let healed = false;

        const executor = buildExecutor({
            VERIFY_INSIGHT: () => {
                if (!healed) {
                    healed = true;
                    return {
                        type: 'VERDICT_GENERATED',
                        verdict: JSON.stringify({ verdict: 'Hallucinated', score: 20, hallucinated: true, criticism: 'Missing key facts' })
                    };
                }
                return {
                    type: 'VERDICT_GENERATED',
                    verdict: JSON.stringify({ verdict: 'Verified', score: 88 })
                };
            },
            GENERATE_METADATA: () => ({
                type: 'INSIGHTS_GENERATED',
                insight: healed
                    ? 'Improved insight after self-healing.'
                    : 'AAPL beat estimates by 12%. Bullish short-term.',
                rawInsight: 'raw',
                relevanceScore: 95
            }),
        });

        const result = await resolveLink(
            url, url, env as any,
            { waitUntil: (p: any) => p } as any,
            0, traceId, 'default', executor
        );

        expect(healed).toBe(true);
        expect(result.ivLink).toBe("https://telegra.ph/e2e-mock-page");

        const row = await env.DB.prepare("SELECT * FROM urls WHERE url = ?").bind(url).first();
        expect(row).not.toBeNull();
        expect(row!.iv_link).toBe("https://telegra.ph/e2e-mock-page");
    });

    it("E2E: Idempotency / Deduplication > re-submitting the same URL overwrites the existing record (INSERT OR REPLACE)", async () => {
        const url = "https://example.com/idempotency-test";

        await resolveLink(url, url, env as any, { waitUntil: (p: any) => p } as any,
            0, "trace-A", 'default', buildExecutor());

        await resolveLink(url, url, env as any, { waitUntil: (p: any) => p } as any,
            0, "trace-B", 'default', buildExecutor({
                GENERATE_METADATA: () => ({
                    type: 'INSIGHTS_GENERATED',
                    insight: 'Updated insight after re-enrichment.',
                    rawInsight: 'raw',
                    relevanceScore: 95
                }),
            }));

        const rows = await env.DB.prepare("SELECT count(*) as c FROM urls WHERE url = ?").bind(url).first();
        expect(rows!.c).toBe(1);

        const row = await env.DB.prepare("SELECT insight FROM urls WHERE url = ?").bind(url).first();
        expect(row!.insight).toBe('Updated insight after re-enrichment.');
    });

    it("E2E: Reprocess Pipeline > extracts URLs from the events log and enqueues them", async () => {
        await env.DB.prepare("INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)")
            .bind('MESSAGE_RECEIVED', JSON.stringify({ text: 'Check https://example.com/reprocess-me out!', urlCount: 1 }), 999)
            .run();

        const res = await webhookHandler(
            new Request('http://linxtexbot.dev/reprocess'),
            env as any,
            createExecutionContext()
        );

        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.enqueued_links).toBeGreaterThanOrEqual(1);
        expect(body.links).toContain('https://example.com/reprocess-me');
    });
});
