import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateFinancialInsight, generateGeneralSummary, generateStockAnalysis } from "../src/gemini";

describe("Gemini Integration", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    describe("generateFinancialInsight", () => {
        it("successfully parses JSON", async () => {
            const mockResponse = { candidates: [{ content: { parts: [{ text: "{\"summary\":\"S\",\"sentiment\":\"bullish\",\"relevance_score\":90,\"tickers\":[],\"tags\":[],\"fact_check\":\"\",\"analysis\":\"\",\"is_urgent\":false,\"triples\":[]}" }] } }] };
            (fetch as any).mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));
            const result = await generateFinancialInsight("context", "key");
            expect(result?.summary).toBe("S");
        });

        it("returns null on API error", async () => {
            (fetch as any).mockResolvedValue(new Response("Error", { status: 500 }));
            expect(await generateFinancialInsight("context", "key")).toBeNull();
        });

        it("returns null on parse error", async () => {
            (fetch as any).mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
            expect(await generateFinancialInsight("context", "key")).toBeNull();

            (fetch as any).mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "invalid" }] } }] }), { status: 200 }));
            expect(await generateFinancialInsight("context", "key")).toBeNull();
        });
    });

    describe("generateGeneralSummary", () => {
        it("parses raw JSON strings", async () => {
            (fetch as any).mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"summary\": \"G\"}" }] } }] }), { status: 200 }));
            expect(await generateGeneralSummary("c", "k")).toBe("G");
        });

        it("returns null on catch (parse error)", async () => {
            (fetch as any).mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "invalid" }] } }] }), { status: 200 }));
            expect(await generateGeneralSummary("c", "k")).toBeNull();
        });
    });

    describe("generateStockAnalysis", () => {
        it("parses stock JSON", async () => {
            const mock = { candidates: [{ content: { parts: [{ text: JSON.stringify({ ticker: "A", points: ["P"], sentiment: "bullish", executive_summary: "E", summary: "S", analysis: "A", fact_check: "F", relevance_score: 90, is_urgent: false, tickers: ["A"], tags: ["S"] }) }] } }] };
            (fetch as any).mockResolvedValue(new Response(JSON.stringify(mock), { status: 200 }));
            const res = await generateStockAnalysis("A", "c", "k");
            expect(res?.ticker).toBe("A");
        });

        it("returns null on error", async () => {
            (fetch as any).mockResolvedValue(new Response("E", { status: 500 }));
            expect(await generateStockAnalysis("A", "c", "k")).toBeNull();
        });
    });
});
