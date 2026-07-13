import { describe, it, expect, vi } from "vitest";
import { decideNextEffects, integrateObservation, type ProcessingState } from "../src/domain";
import { getAuthorityScore, requiresBrowserRendering } from "../src/source_authority";
import { getToneTemplateForTelegramChat } from "../src/perspective";
import { resolveLink } from "../src/orchestrator";
import { convertToTelegraphNodes, transduceContent } from "../src/transducers";

describe("Tier 2 Improvements Suite", () => {
    describe("Source Authority and Paywall Logic", () => {
        it("returns the correct credibility score for domains", () => {
            expect(getAuthorityScore("https://bloomberg.com/news/1")).toBe(95);
            expect(getAuthorityScore("https://sub.ft.com/article")).toBe(90);
            expect(getAuthorityScore("https://zerohedge.com/post")).toBe(40);
            expect(getAuthorityScore("https://unknown.com/page")).toBe(50);
        });

        it("correctly identifies domains requiring proactive browser rendering", () => {
            expect(requiresBrowserRendering("https://bloomberg.com/news/1")).toBe(true);
            expect(requiresBrowserRendering("https://wsj.com/page")).toBe(true);
            expect(requiresBrowserRendering("https://medium.com/post")).toBe(false);
        });
    });

    describe("Context-Sensitive Critic", () => {
        it("passes perspective to the VERIFY_INSIGHT payload", () => {
            const state: ProcessingState = {
                originalUrl: "http://a.com",
                url: "http://a.com",
                phase: "VERIFYING",
                insight: "Standard insight",
                perspective: "Kenyan retail investor lens"
            };

            const effects = decideNextEffects(state);
            expect(effects).toContainEqual(expect.objectContaining({
                type: "VERIFY_INSIGHT",
                payload: expect.objectContaining({
                    perspective: "Kenyan retail investor lens"
                })
            }));
        });
    });

    describe("Extraction Fidelity", () => {
        it("prepends low fidelity warning when fidelityRatio is below 0.12", () => {
            const state: ProcessingState = {
                originalUrl: "http://a.com",
                url: "http://a.com",
                phase: "ENRICHING",
                content: "Article body text content here.",
                fidelityRatio: 0.05, // low fidelity ratio
                dedupChecked: true,
                previousInsightChecked: true
            };

            const effects = decideNextEffects(state);
            const metadataEffect = effects.find(e => e.type === 'GENERATE_METADATA');
            expect(metadataEffect).toBeDefined();
            expect(metadataEffect?.payload.content).toContain("[LOW FIDELITY EXTRACTION WARNING]");
        });

        it("does NOT prepend warning when fidelityRatio is high", () => {
            const state: ProcessingState = {
                originalUrl: "http://a.com",
                url: "http://a.com",
                phase: "ENRICHING",
                content: "Article body text content here.",
                fidelityRatio: 0.5, // high fidelity ratio
                dedupChecked: true,
                previousInsightChecked: true
            };

            const effects = decideNextEffects(state);
            const metadataEffect = effects.find(e => e.type === 'GENERATE_METADATA');
            expect(metadataEffect).toBeDefined();
            expect(metadataEffect?.payload.content).not.toContain("[LOW FIDELITY EXTRACTION WARNING]");
        });
    });

    describe("Projection Tone Matching", () => {
        it("applies emoji prefix and hashtags when useEmoji is enabled", async () => {
            const customExecutor = vi.fn().mockImplementation(async (effect) => {
                if (effect.type === 'FETCH_LINK') return { type: 'CONTENT_FETCHED', title: 'Tesla stock drops', content: 'Tesla corp '.repeat(20), textContent: 'Tesla corp '.repeat(20) };
                if (effect.type === 'CALCULATE_HASH') return { type: 'HASH_CALCULATED', hash: 'h1' };
                if (effect.type === 'CHECK_CONTENT_HASH') return { type: 'DEDUP_MISS' };
                if (effect.type === 'GENERATE_METADATA') return { type: 'INSIGHTS_GENERATED', insight: 'Synthesized Insight', rawInsight: 'Synthesized Insight', relevanceScore: 80, financialData: { sentiment: 'bearish' }, tickers: ['TSLA'] };
                if (effect.type === 'VERIFY_INSIGHT') return { type: 'VERDICT_GENERATED', verdict: JSON.stringify({ verdict: 'Verified', score: 95 }) };
                if (effect.type === 'PUBLISH_TELEGRAPH') return { type: 'IV_LINK_GENERATED', ivLink: 'https://t.me/iv?url=some' };
                if (effect.type === 'PERSIST_RELATIONAL') return { type: 'RELATIONAL_PERSISTED' };
                if (effect.type === 'LOG_TRACE') return { type: 'TRACE_PERSISTED' };
                if (effect.type === 'CACHE_VIEW') return { type: 'CACHE_PERSISTED' };
                if (effect.type === 'EDIT_TELEGRAM_MESSAGE') return { type: 'TELEGRAM_EDITED' };
                return null;
            });

            const mockEnv = {
                DB: { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }) }) },
                FACTS: { put: vi.fn() }
            } as any;

            const toneTemplate = {
                useEmoji: true,
                showFactCheck: false,
                verbosity: 'standard' as const
            };

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
                false,
                toneTemplate
            );

            const editCall = customExecutor.mock.calls.find(c => c[0].type === 'EDIT_TELEGRAM_MESSAGE');
            expect(editCall).toBeDefined();
            const text = editCall?.[0].payload.text;
            // Should contain bearish sentiment prefix (🔴) and hashtag suffix (#TSLA)
            expect(text).toContain("🔴 Tesla stock drops #TSLA");
        });
    });

    describe("Semantic Diff Re-enrichment", () => {
        it("passes previous insight to the GENERATE_METADATA payload", () => {
            const state: ProcessingState = {
                originalUrl: "http://a.com",
                url: "http://a.com",
                phase: "ENRICHING",
                content: "Current raw content",
                dedupChecked: true,
                previousInsight: "Prior version text"
            };

            const effects = decideNextEffects(state);
            const metadataEffect = effects.find(e => e.type === 'GENERATE_METADATA');
            expect(metadataEffect).toBeDefined();
            expect(metadataEffect?.payload.previousInsight).toBe("Prior version text");
        });
    });

    describe("Live-Programmable Logic Rules", () => {
        it("accepts custom rules overriding static allowedTags list", () => {
            const customRules = {
                allowedTags: ['div', 'p', 'img'],
                allowedAttributes: ['src'],
                transformations: {}
            };

            const html = `<div><p>Paragraph</p><span>Span text</span></div>`;
            const { nodes } = convertToTelegraphNodes(html, undefined, customRules);
            
            // Should contain 'p' but exclude 'span' (since span isn't allowed in customRules)
            const tags = nodes.flatMap(n => [n.tag, ...(n.children || []).map((c: any) => c.tag)]).filter(Boolean);
            expect(tags).toContain('p');
            expect(tags).not.toContain('span');
        });
    });
});
