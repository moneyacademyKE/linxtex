import { describe, it, expect, vi } from "vitest";
import { composeMiddleware, errorMiddleware, logMiddleware } from "../src/middleware";

describe("Middleware System", () => {
    it("composes multiple middlewares", async () => {
        const m1 = vi.fn((req, env, ctx, next) => next());
        const m2 = vi.fn((req, env, ctx, next) => next());
        const handler = vi.fn(() => new Response("OK"));

        const composed = composeMiddleware([m1, m2, handler]);
        await composed(new Request("http://t.com"), {}, {} as any);

        expect(m1).toHaveBeenCalled();
        expect(m2).toHaveBeenCalled();
        expect(handler).toHaveBeenCalled();
    });

    it("handles next() errors", async () => {
        const errorMiddlewareLocal = vi.fn((req, env, ctx, next) => next());
        const failingHandler = () => { throw new Error("Fail"); };

        const composed = composeMiddleware([errorMiddlewareLocal, failingHandler]);
        await expect(composed(new Request("http://t.com"), {}, {} as any)).rejects.toThrow("Fail");
    });

    it("prevents multiple next() calls", async () => {
        const badMiddleware = async (req: any, env: any, ctx: any, next: any) => {
            await next();
            await next();
            return new Response("BAD");
        };
        const composed = composeMiddleware([badMiddleware, () => new Response("OK")]);
        await expect(composed(new Request("http://t.com"), {}, {} as any)).rejects.toThrow("next() called multiple times");
    });

    it("errorMiddleware catches errors", async () => {
        const failingHandler = () => { throw new Error("Critical"); };
        const composed = composeMiddleware([errorMiddleware, failingHandler]);
        const res = await composed(new Request("http://t.com"), {}, {} as any);
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: "Critical" });
    });

    it("logMiddleware logs duration", async () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const composed = composeMiddleware([logMiddleware, () => new Response("OK")]);
        await composed(new Request("http://t.com"), {}, {} as any);
        expect(spy).toHaveBeenCalled();
    });
});
