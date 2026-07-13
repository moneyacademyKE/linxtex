import { describe, it, expect, vi } from "vitest";
import { decideNextEffects, integrateObservation, type ProcessingState } from "../src/domain";
import { resolveLink } from "../src/orchestrator";
import { executeEffect } from "../src/executor";

describe("Tier 1 Improvements Suite", () => {
    describe("Content Hash Deduplication", () => {
        it("triggers CHECK_CONTENT_HASH when hash exists but dedupChecked is false", () => {
            const state: ProcessingState = {
                originalUrl: "http://a.com",
                url: "http://a.com",
                phase: "ENRICHING",
                content: "Sample content",
                hash: "xyz123"
            };

            const effects = decideNextEffects(state);
            expect(effects).toContainEqual(expect.objectContaining({
                type: "CHECK_CONTENT_HASH",
                payload: { hash: "xyz123" }
            }));
        });

        it("handles DEDUP_HIT transition: copies cached insight and moves to PERSISTING", () => {
            let state: ProcessingState = {
                originalUrl: "http://a.com",
                url: "http://a.com",
                phase: "ENRICHING",
                content: "Sample content",
                hash: "xyz123"
            };

            state = integrateObservation(state, {
                type: "DEDUP_HIT",
                insight: "Cached Insight Text",
                title: "Cached Title",
                ivLink: "https://t.me/iv?url=cached"
            });

            expect(state.insight).toBe("Cached Insight Text");
            expect(state.title).toBe("Cached Title");
            expect(state.ivLink).toBe("https://t.me/iv?url=cached");
            expect(state.phase).toBe("PERSISTING");
            // Only relational URL persistence should be left, trace/cache are bypass-marked
            expect(state.persistedTrace).toBe(true);
            expect(state.persistedCache).toBe(true);
            expect(state.persistedRelational).toBeUndefined();
        });

        it("handles DEDUP_MISS transition: sets dedupChecked to true to proceed with generation", () => {
            let state: ProcessingState = {
                originalUrl: "http://a.com",
                url: "http://a.com",
                phase: "ENRICHING",
                content: "Sample content",
                hash: "xyz123"
            };

            state = integrateObservation(state, { type: "DEDUP_MISS" });
            expect(state.dedupChecked).toBe(true);
            expect(state.insight).toBeUndefined();
            expect(state.phase).toBe("ENRICHING");

            const effects = decideNextEffects(state);
            expect(effects.map(e => e.type)).toContain("GENERATE_METADATA");
        });
    });

    describe("Graceful Degradation Ladder", () => {
        it("triggers fallback GENERATE_GENERAL_SUMMARY when metadata generation fails", () => {
            let state: ProcessingState = {
                originalUrl: "http://a.com",
                url: "http://a.com",
                phase: "ENRICHING",
                content: "Sample content",
                hash: "xyz123",
                dedupChecked: true
            };

            // Simulate metadata generation failure
            state = integrateObservation(state, { type: "ERROR_OCCURRED", message: "Generation failed" });
            expect(state.metadataAttempted).toBe(true);
            expect(state.insight).toBeUndefined();
            expect(state.phase).toBe("ENRICHING");

            const effects = decideNextEffects(state);
            expect(effects).toContainEqual(expect.objectContaining({
                type: "GENERATE_GENERAL_SUMMARY",
                payload: expect.objectContaining({ content: "Sample content" })
            }));
        });

        it("handles GENERAL_SUMMARY_GENERATED transition and bypasses critic verification", () => {
            let state: ProcessingState = {
                originalUrl: "http://a.com",
                url: "http://a.com",
                phase: "ENRICHING",
                content: "Sample content",
                hash: "xyz123",
                metadataAttempted: true
            };

            state = integrateObservation(state, { type: "GENERAL_SUMMARY_GENERATED", summary: "General Summary Text" });
            expect(state.insight).toBe("General Summary Text");
            expect(state.qualityTier).toBe("general");
            // General summaries bypass VERIFYING and transition directly to PERSISTING
            expect(state.phase).toBe("PERSISTING");
        });

        it("falls back to extractive summary if fallback general summary also fails", () => {
            let state: ProcessingState = {
                originalUrl: "http://a.com",
                url: "http://a.com",
                phase: "ENRICHING",
                content: "Failed content",
                textContent: "First sentence. Second sentence! Third sentence? Fourth sentence.",
                hash: "xyz123",
                metadataAttempted: true
            };

            // Simulate general summary failure
            state = integrateObservation(state, { type: "ERROR_OCCURRED", message: "General summary failed" });
            expect(state.insight).toBe("First sentence. Second sentence! Third sentence?");
            expect(state.qualityTier).toBe("extractive");
            expect(state.phase).toBe("PERSISTING");
        });
    });

    describe("Signal Confidence Routing", () => {
        it("suppresses low-relevance signal (< 40) in output projection", async () => {
            const mockDb = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        run: vi.fn().mockResolvedValue({})
                    })
                })
            };

            const mockEnv = {
                DB: mockDb,
                FACTS: { put: vi.fn() }
            } as any;

            const executor = vi.fn().mockImplementation(async (effect) => {
                if (effect.type === 'PERSIST_RELATIONAL') return { type: 'RELATIONAL_PERSISTED' };
                if (effect.type === 'LOG_TRACE') return { type: 'TRACE_PERSISTED' };
                if (effect.type === 'CACHE_VIEW') return { type: 'CACHE_PERSISTED' };
                return null;
            });

            // Set state as fully processed but with score 35
            const res = await resolveLink(
                "http://a.com",
                "http://a.com",
                mockEnv,
                {} as any,
                12345,
                "trace_abc",
                undefined,
                executor,
                undefined,
                undefined,
                undefined,
                false
            );

            // Wait, resolveLink executes internally. Let's make sure it returns suppressed output.
            // In resolveLink, if score < 40, it writes a SIGNAL_LOW_CONVICTION event and returns { suppressed: true }
            // Let's mock a fast loop execution by returning complete state in executor
            const customExecutor = vi.fn().mockImplementation(async (effect) => {
                if (effect.type === 'FETCH_LINK') return { type: 'CONTENT_FETCHED', title: 'T', content: 'Short description text', textContent: 'Short description text' };
                if (effect.type === 'CALCULATE_HASH') return { type: 'HASH_CALCULATED', hash: 'h1' };
                if (effect.type === 'CHECK_CONTENT_HASH') return { type: 'DEDUP_MISS' };
                if (effect.type === 'GENERATE_METADATA') return { type: 'INSIGHTS_GENERATED', insight: 'I', relevanceScore: 35 };
                if (effect.type === 'PERSIST_RELATIONAL') return { type: 'RELATIONAL_PERSISTED' };
                if (effect.type === 'LOG_TRACE') return { type: 'TRACE_PERSISTED' };
                if (effect.type === 'CACHE_VIEW') return { type: 'CACHE_PERSISTED' };
                return null;
            });

            const output = await resolveLink(
                "http://a.com",
                "http://a.com",
                mockEnv,
                {} as any,
                12345,
                "trace_abc",
                undefined,
                customExecutor,
                999, // messageId
                undefined,
                undefined,
                false
            );

            expect(output.suppressed).toBe(true);
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO events"));
        });

        it("projects compact message style for medium-relevance signal (40-70)", async () => {
            const mockDb = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        run: vi.fn().mockResolvedValue({})
                    })
                })
            };

            const mockEnv = {
                DB: mockDb,
                FACTS: { put: vi.fn() }
            } as any;

            const customExecutor = vi.fn().mockImplementation(async (effect) => {
                if (effect.type === 'FETCH_LINK') return { type: 'CONTENT_FETCHED', title: 'Article Title', content: 'a'.repeat(5000), textContent: 'a'.repeat(5000) };
                if (effect.type === 'CALCULATE_HASH') return { type: 'HASH_CALCULATED', hash: 'h1' };
                if (effect.type === 'CHECK_CONTENT_HASH') return { type: 'DEDUP_MISS' };
                if (effect.type === 'GENERATE_METADATA') return { type: 'INSIGHTS_GENERATED', insight: 'Synthesized Insight', relevanceScore: 55 };
                if (effect.type === 'PUBLISH_TELEGRAPH') return { type: 'IV_LINK_GENERATED', ivLink: 'https://t.me/iv?url=some' };
                if (effect.type === 'PERSIST_RELATIONAL') return { type: 'RELATIONAL_PERSISTED' };
                if (effect.type === 'LOG_TRACE') return { type: 'TRACE_PERSISTED' };
                if (effect.type === 'CACHE_VIEW') return { type: 'CACHE_PERSISTED' };
                if (effect.type === 'EDIT_TELEGRAM_MESSAGE') return { type: 'TELEGRAM_EDITED' };
                return null;
            });

            await resolveLink(
                "http://a.com",
                "http://a.com",
                mockEnv,
                {} as any,
                12345,
                "trace_abc",
                undefined,
                customExecutor,
                999, // messageId
                undefined,
                undefined,
                false
            );

            // Verify compact output is passed to edit message instead of title-masked IV link
            const editCall = customExecutor.mock.calls.find(c => c[0].type === 'EDIT_TELEGRAM_MESSAGE');
            expect(editCall).toBeDefined();
            const text = editCall?.[0].payload.text;
            expect(text).toContain("Synthesized Insight");
            expect(text).toContain("Original Source");
            expect(text).not.toContain("https://t.me/iv?url=some"); // Bypassed IV link formatting because of compact view
        });
    });
});
