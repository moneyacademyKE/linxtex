import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi, beforeEach, afterEach } from 'vitest';
import { webhookHandler, executeEffect, handleUpdate, resolveLink } from '../src';

describe('Linxtex Bot Direct Logic Spec (Final)', () => {
	const originalFetch = globalThis.fetch;
	const mockFetch = (url: string) => Promise.resolve({
		url, ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
		json: () => {
			if (url.includes('generativelanguage.googleapis.com')) return Promise.resolve({
				candidates: [{
					content: {
						parts: [{
							text: JSON.stringify({
								summary: 'S', sentiment: 'bullish', relevance_score: 90, tickers: ['AAPL'], tags: ['Stock'],
								fact_check: 'OK', analysis: 'D', is_urgent: false, triples: [],
								ticker: 'AAPL', executive_summary: 'E', points: ['P']
							})
						}]
					}
				}]
			});
			return Promise.resolve({ ok: true, result: { url: 'https://tg.ph/iv' } });
		},
		text: () => Promise.resolve('<html><head><title>T</title></head><body><p>Hello world $AAPL</p></body></html>')
	});

	beforeEach(() => { globalThis.fetch = vi.fn().mockImplementation(mockFetch); });
	afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });
	beforeAll(async () => {
		const shemas = ['CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, data TEXT, chat_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)', 'CREATE TABLE IF NOT EXISTS urls (url TEXT PRIMARY KEY, title TEXT, iv_link TEXT, insight TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)', 'CREATE TABLE IF NOT EXISTS content_hashes (hash TEXT PRIMARY KEY, title TEXT, iv_link TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)', 'CREATE TABLE IF NOT EXISTS insight_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, content_hash TEXT, raw_insight TEXT, relevance_score INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'];
		for (const s of shemas) { await env.DB.prepare(s).run(); }
	});

	const createBlockingCtx = () => {
		const promises: Promise<any>[] = [];
		const ctx = createExecutionContext();
		const originalWaitUntil = ctx.waitUntil.bind(ctx);
		ctx.waitUntil = (promise: Promise<any>) => { promises.push(promise); originalWaitUntil(promise); };
		return { ctx, wait: async () => { let l = 0; while (promises.length > l) { const t = promises.slice(l); l = promises.length; await Promise.all(t); } } };
	};

	it('covers all webhookHandler logic directly', async () => {
		const mEnv = { ...env, BROADCAST_CHAT_ID: "1", GEMINI_API_KEY: 'g', TELEGRAM_BOT_TOKEN: 't', FACTS: { get: vi.fn(), put: vi.fn() } };

		// 1. Reprocess
		await env.DB.prepare('INSERT OR REPLACE INTO urls (url, title, iv_link, insight) VALUES (?,?,?,?)').bind('http://re.com/1', 'T', 'iv', 'in').run();
		const { ctx: ctxR, wait: waitR } = createBlockingCtx();
		await webhookHandler(new Request('http://e.com/api/reprocess?broadcast=true'), mEnv as any, ctxR);
		await waitR();

		// 2. Feed
		await webhookHandler(new Request('http://e.com/api/feed'), mEnv as any, createExecutionContext());

		// 3. Webhook (Link)
		const { ctx: ctxW, wait: waitW } = createBlockingCtx();
		await webhookHandler(new Request('http://e.com/webhook', { method: 'POST', body: JSON.stringify({ message: { text: "https://a.com/1", chat: { id: 1 } } }) }), mEnv as any, ctxW);
		await waitW();

		// 4. Commands
		const { ctx: ctxH, wait: waitH } = createBlockingCtx();
		await handleUpdate({ message: { text: "/start", chat: { id: 1 } } }, mEnv as any, ctxH);
		await handleUpdate({ message: { text: "/stats", chat: { id: 1 } } }, mEnv as any, ctxH);
		await waitH();

		// 5. Root status
		const rootRes = await webhookHandler(new Request('http://e.com/'), mEnv as any, createExecutionContext());
		expect(await rootRes.text()).toContain('running');
	});

	it('covers resolveLink details', async () => {
		const mEnv = { ...env, GEMINI_API_KEY: 'g', FACTS: { get: vi.fn().mockResolvedValue({ title: 'L1', ivLink: 'iv', insight: 'in' }), put: vi.fn() } };
		const { ctx, wait } = createBlockingCtx();
		await resolveLink("http://l1.com", "http://l1.com", mEnv as any, ctx, 1);
		await wait();
	});

	it('covers executeEffect switch types', async () => {
		await executeEffect({ type: 'RECORD_INSIGHT', payload: { url: 'http://u', title: 't', ivLink: 'iv', insight: 'in', metadata: { traceId: 't1' } } }, env as any);
		(fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, result: { url: 'u' } }), text: () => Promise.resolve('OK') });
		await executeEffect({ type: 'GENERATE_METADATA', payload: { content: 'c' } }, env as any);
		await executeEffect({ type: 'EDIT_TELEGRAM_MESSAGE', payload: { chatId: 1, messageId: 1, text: 't' } }, env as any);
		await executeEffect({ type: 'PUBLISH_TELEGRAPH', payload: { title: 't', nodes: [] } }, env as any);
	});

	it('covers catches', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
		(fetch as any).mockImplementation(() => Promise.reject(new Error("Fail")));
		const { ctx, wait } = createBlockingCtx();
		try { await resolveLink("http://fail.com", "http://fail.com", env as any, ctx, 1); } catch { }
		await wait();
		expect(spy).toHaveBeenCalled();
	});
});
