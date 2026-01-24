import { describe, it, expect, vi } from "vitest";
import { formatInsight, formatStockAnalysis, formatGeneralSummary, formatStatsMessage, getUserStats } from "../src/projections";

describe("Projections & Formatting", () => {
    describe("formatInsight", () => {
        it("formats bullish insight", () => {
            const insight = {
                summary: "S",
                sentiment: "bullish",
                tickers: ["A"],
                tags: ["S"],
                relevance_score: 90,
                triples: [],
                fact_check: "OK",
                analysis: "D",
                is_urgent: false
            } as any;
            const res = formatInsight(insight);
            expect(res).toContain("🟢");
        });

        it("formats bearish/neutral sentiment", () => {
            expect(formatInsight({ sentiment: 'bearish', relevance_score: 90, tickers: [], tags: [] } as any)).toContain('🔴');
            expect(formatInsight({ sentiment: 'neutral', relevance_score: 50, tickers: [], tags: [] } as any)).toContain('🟡');
        });
    });

    describe("formatStockAnalysis", () => {
        it("formats stock analysis", () => {
            const res = formatStockAnalysis({ ticker: "A", points: ["P"], sentiment: "bullish", executive_summary: "E", summary: "S", analysis: "A", fact_check: "F", relevance_score: 90, is_urgent: false, tickers: ["A"], tags: ["S"] } as any);
            expect(res).toContain("13-POINT");
        });
    });

    describe("formatGeneralSummary", () => {
        it("formats summary", () => {
            expect(formatGeneralSummary("G")).toContain("G");
        });
    });

    describe("formatStatsMessage", () => {
        it("formats stats", () => {
            const res = formatStatsMessage({ messagesReceived: 1, linksProcessed: 1, cacheHits: 1, errors: 1 });
            expect(res).toContain("1");
        });
    });

    describe("getUserStats", () => {
        it("returns stats", async () => {
            const mock = {
                prepare: vi.fn().mockReturnThis(),
                bind: vi.fn().mockReturnThis(),
                first: vi.fn().mockResolvedValue({ messagesReceived: 1, linksProcessed: 1, cacheHits: 1, errors: 1 })
            };
            const stats = await getUserStats(mock as any, 1);
            expect(stats.messagesReceived).toBe(1);
        });

        it("returns zero stats on null", async () => {
            const mock = { prepare: vi.fn().mockReturnThis(), bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(null) };
            const stats = await getUserStats(mock as any, 1);
            expect(stats.messagesReceived).toBe(0);
        });
    });
});
