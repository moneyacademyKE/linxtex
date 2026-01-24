import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeTelegraphPage, htmlToTelegraph } from "../src/telegraph";

describe("Telegraph Integration", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("successfully creates a page", async () => {
        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ok: true, result: { url: "https://tg.ph/test" } })
        });

        const url = await makeTelegraphPage("Title", [], "token");
        expect(url).toBe("https://tg.ph/test");
    });

    it("throws error if creation fails", async () => {
        (fetch as any).mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: () => Promise.resolve("Error"),
            json: () => Promise.resolve({ ok: false })
        });

        await expect(makeTelegraphPage("Title", [], "token")).rejects.toThrow();
    });

    it("converts html to nodes", () => {
        expect(htmlToTelegraph("<b>B</b>")[0].tag).toBe("p");
    });
});
