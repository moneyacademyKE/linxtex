import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractContent } from "../src/parser";

describe("Content Extraction (Parser)", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("successfully extracts content", async () => {
        (fetch as any).mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("<html><head><title>T</title></head><body><article>H</article></body></html>") });
        const result = await extractContent("https://test.com", null as any);
        expect(result.title).toBe("T");
    });

    it("falls back to browser rendering", async () => {
        (fetch as any).mockResolvedValueOnce({ ok: false, status: 403, text: () => Promise.resolve("") });

        const mFetcher = {
            fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
                sessionId: "123",
                debuggerUrl: "ws://test"
            })))
        };

        const puppeteer = await import('@cloudflare/puppeteer');
        vi.spyOn(puppeteer.default, 'launch').mockResolvedValue({
            newPage: vi.fn().mockResolvedValue({
                goto: vi.fn().mockResolvedValue({}),
                content: vi.fn().mockResolvedValue("<html><head><title>Browser Title</title></head><body>Browser Content</body></html>"),
                close: vi.fn()
            }),
            close: vi.fn()
        } as any);

        const result = await extractContent("https://blocked.com", mFetcher as any);
        expect(result.content).toContain("Browser Content");
        expect(result.title).toBe("Browser Title");
    });

    it("uses raw text fallback when Readability fails", async () => {
        (fetch as any).mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("<html><head><title>T</title></head><body>Raw</body></html>"), url: "http://a.com" });
        const result = await extractContent("http://a.com", null as any);
        expect(result.content).toContain("DIV");
    });
});
