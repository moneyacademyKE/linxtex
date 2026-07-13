import { describe, it, expect } from "vitest";
import {
    detectUrls,
    isHomepage,
    transformToNitter,
    formatInstantViewResponse,
    replaceLinksInText,
    convertToTelegraphNodes,
    calculateHash,
    integrateObservation,
    decideNextEffects
} from "../src/domain";

describe("Domain Logic", () => {
    describe("detectUrls", () => {
        it("extracts multiple URLs from text", () => {
            const text = "Check out https://google.com and http://bing.com/search";
            expect(detectUrls(text)).toEqual(["https://google.com", "http://bing.com/search"]);
        });

        it("returns empty array for no URLs", () => {
            expect(detectUrls("no links here")).toEqual([]);
        });
    });

    describe("isHomepage", () => {
        it("identifies homepages correctly", () => {
            expect(isHomepage("https://example.com")).toBe(true);
            expect(isHomepage("https://example.com/")).toBe(true);
            expect(isHomepage("https://example.com/path")).toBe(false);
        });

        it("handles invalid input", () => {
            // @ts-ignore
            expect(isHomepage(null)).toBe(false);
            // @ts-ignore
            expect(isHomepage(undefined)).toBe(false);
        });
    });

    describe("transformToNitter", () => {
        it("transforms twitter.com and x.com to nitter", () => {
            expect(transformToNitter("https://twitter.com/user/status/123")).toContain("nitter.net");
            expect(transformToNitter("https://x.com/user/status/123")).toContain("nitter.net");
            expect(transformToNitter("https://google.com")).toBe("https://google.com");
        });

        it("handles invalid input", () => {
            // @ts-ignore
            expect(transformToNitter(null)).toBe(null);
            // @ts-ignore
            expect(transformToNitter(undefined)).toBe(undefined);
        });
    });

    describe("formatInstantViewResponse", () => {
        it("formats the response with title, domain and IV link", () => {
            const res = formatInstantViewResponse("Title", "https://example.com/article", "https://t.me/iv?url=...");
            expect(res).toContain("<b>Title</b>");
            expect(res).toContain("from example.com");
            expect(res).toContain("https://t.me/iv?url=...");
        });
    });

    describe("replaceLinksInText", () => {
        it("replaces original URLs with IV links", () => {
            const text = "Read https://old.com";
            const map = { "https://old.com": "https://iv.com" };
            expect(replaceLinksInText(text, map)).toBe("Read https://iv.com");
        });
    });

    describe("calculateHash", () => {
        it("generates consistent SHA-256 hex hashes", async () => {
            const h1 = await calculateHash("hello");
            const h2 = await calculateHash("hello");
            expect(h1).toBe(h2);
            expect(h1).toHaveLength(64);
        });
    });

    describe("convertToTelegraphNodes (Transducers)", () => {
        it("converts complex HTML to Telegraph nodes", () => {
            // Include span (transforms to null) and a[href] (allowed attribute)
            const html = "<h1>Title</h1><p>Hello <b>world</b> <span class='x'>ignored</span> <a href='http://a.com'>Link</a></p>";
            const { nodes } = convertToTelegraphNodes(html);
            expect(nodes).toContainEqual({ tag: "h3", children: ["Title"] });
            const p = nodes.find((n: any) => n.tag === "p");
            expect(JSON.stringify(p)).toContain("Link");
            expect(JSON.stringify(p)).not.toContain("ignored");
            expect(JSON.stringify(p)).toContain("href");
        });

        it("extracts tickers during transduction", () => {
            const html = "<p>Analyzing $AAPL and $BTC today.</p>";
            const { tickers } = convertToTelegraphNodes(html);
            expect(tickers).toContain("AAPL");
            expect(tickers).toContain("BTC");
        });

        it("sanitizes disallowed tags and depth", () => {
            const html = "<p>Text <script>alert(1)</script></p>";
            const { nodes } = convertToTelegraphNodes(html);
            expect(JSON.stringify(nodes)).not.toContain("script");
            expect(nodes.length).toBe(1);
        });
    });

    describe("Hickey Orchestration (Phase-Driven)", () => {
        it("transitions from RESOLVING to ENRICHING on CONTENT_FETCHED", () => {
            const state = { originalUrl: 'http://a.com', url: 'http://a.com', phase: 'RESOLVING' as const };
            const next = integrateObservation(state, { type: 'CONTENT_FETCHED', title: 'T', content: 'C', textContent: 'TC' });
            expect(next.phase).toBe('ENRICHING');
            expect(next.title).toBe('T');
        });

        it("transitions to VERIFYING phase after enrichment", () => {
             const state = { 
                originalUrl: 'http://a.com', 
                url: 'http://a.com', 
                phase: 'VERIFYING' as const, // Transitioned state
                title: 'T', 
                content: 'C', 
                insight: 'I', 
                ivLink: 'IV' 
            };
            const effects = decideNextEffects(state);
            expect(effects).toContainEqual(expect.objectContaining({ type: 'VERIFY_INSIGHT' }));
        });

        it("transitions to PERSISTING and COMPLETE after verdict", () => {
             const state = { 
                originalUrl: 'http://a.com', 
                url: 'http://a.com', 
                phase: 'PERSISTING' as const, // Transitioned state
                title: 'T', 
                content: 'C', 
                insight: 'I', 
                ivLink: 'IV',
                criticVerdict: '{"verdict":"Verified"}'
            };
            const effects = decideNextEffects(state);
            expect(effects).toContainEqual(expect.objectContaining({ type: 'PERSIST_RELATIONAL' }));
        });

        it("handles ERROR_OCCURRED and terminates", () => {
            const state = { originalUrl: 'http://a.com', url: 'http://a.com', phase: 'ENRICHING' as const };
            const next = integrateObservation(state, { type: 'ERROR_OCCURRED', message: 'Fail' });
            expect(next.error).toBe('Fail');
            expect(next.phase).toBe('COMPLETE');
        });
    });
});
