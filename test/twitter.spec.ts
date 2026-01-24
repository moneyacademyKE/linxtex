import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTweetContent, extractTweetId, resolveRedirects } from "../src/twitter";

describe("Twitter Integration", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    describe("getTweetContent", () => {
        it("extracts text and author name from valid response", async () => {
            const mockResponse = {
                data: { text: "Hello world" },
                includes: { users: [{ name: "Kingori" }] }
            };

            (fetch as any).mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));

            const tweet = await getTweetContent("123", "token");
            expect(tweet?.text).toBe("Hello world");
            expect(tweet?.author).toBe("Kingori");
        });

        it("returns null on API failure", async () => {
            (fetch as any).mockResolvedValue(new Response("Unauthorized", { status: 401 }));

            const tweet = await getTweetContent("123", "token");
            expect(tweet).toBeNull();
        });
    });

    describe("extractTweetId", () => {
        it("extracts ID from twitter.com URL", () => {
            expect(extractTweetId("https://twitter.com/user/status/123")).toBe("123");
        });

        it("returns null for non-status URLs", () => {
            expect(extractTweetId("https://twitter.com/home")).toBeNull();
        });
    });

    describe("resolveRedirects", () => {
        it("follows redirects and returns final URL", async () => {
            (fetch as any).mockResolvedValue({
                url: "https://final.com",
                headers: new Headers()
            });

            const url = await resolveRedirects("https://short.url");
            expect(url).toBe("https://final.com");
        });

        it("returns original URL on error", async () => {
            (fetch as any).mockImplementation(() => Promise.reject(new Error("Network fail")));

            const url = await resolveRedirects("https://bad.url");
            expect(url).toBe("https://bad.url");
        });
    });
});
