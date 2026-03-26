import { describe, it, expect } from "bun:test";
import { handleUpdate, resolveLink } from "../src/index";
import { env } from "cloudflare:test";

describe("E2E Integration Hardening", () => {
    it("Webhook to Queue Pipeline: should validate and enqueue valid links", async () => {
        const payload = {
            message: {
                text: "Check this out: https://example.com/some-article",
                chat: { id: 123 },
                entities: [{ type: "url", offset: 16, length: 28 }]
            }
        };

        const promises: Promise<any>[] = [];
        await handleUpdate(payload, env as any, { 
            waitUntil: (p: Promise<any>) => promises.push(p)
        } as any);

        await Promise.all(promises);

        // Verify Queue Enqueue
        expect(env.ENRICHMENT_QUEUE.send).toHaveBeenCalled();
    });

    it("Full Lifecycle: should handle enrichment and persistence", async () => {
        const traceId = "test-trace-full";
        const originalUrl = "https://example.com/article";
        
        // Mock Executor
        const mockExecutor = async (effect: any) => {
            switch (effect.type) {
                case 'FETCH_LINK':
                    return { 
                        type: 'CONTENT_FETCHED', 
                        title: "E2E Title", 
                        content: "<div><p>E2E Content</p></div>", 
                        textContent: "E2E Content" 
                    };
                case 'GENERATE_METADATA':
                    return { type: 'INSIGHTS_GENERATED', insight: "E2E Insight", rawInsight: "E2E Raw", relevanceScore: 90 };
                case 'PUBLISH_TELEGRAPH':
                    return { type: 'IV_LINK_GENERATED', ivLink: "https://telegra.ph/mock-page" };
                case 'VERIFY_INSIGHT':
                    return { type: 'VERDICT_GENERATED', verdict: "Verified" };
                case 'RECORD_INSIGHT':
                    const { url, title, ivLink, insight, hash, metadata } = effect.payload;
                    await env.DB.prepare("INSERT OR REPLACE INTO urls (url, title, iv_link, last_enriched) VALUES (?, ?, ?, ?)")
                        .bind(url, title, ivLink, Date.now())
                        .run();
                    await env.DB.prepare("INSERT INTO insight_logs (trace_id, url, hash, insight, metadata) VALUES (?, ?, ?, ?, ?)")
                        .bind(metadata.traceId, url, hash || 'abc', insight, JSON.stringify(metadata))
                        .run();
                    return null;
                default:
                    return null;
            }
        };

        // Run the orchestrator with mocked executor
        const result = await resolveLink(originalUrl, originalUrl, env as any, { 
            waitUntil: (p: any) => p 
        } as any, 123, traceId, 'default', mockExecutor);

        expect(result.title).toBe("E2E Title");
        expect(result.ivLink).toBe("https://telegra.ph/mock-page");

        // Verify D1 Persistence
        const urlRow = await env.DB.prepare("SELECT * FROM urls WHERE url = ?").bind(originalUrl).first();
        expect(urlRow).not.toBeNull();
        expect(urlRow!.title).toBe("E2E Title");

        const logRow = await env.DB.prepare("SELECT * FROM insight_logs WHERE trace_id = ?").bind(traceId).first();
        expect(logRow).not.toBeNull();
        expect(logRow!.insight).toBe("E2E Insight");
    });
});
