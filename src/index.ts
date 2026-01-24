import { extractContent } from './parser';
import { makeTelegraphPage } from './telegraph';
import { detectUrls, formatInstantViewResponse, WELCOME_MESSAGE, convertToTelegraphNodes, type Effect, EffectSchema, replaceLinksInText, isHomepage, calculateHash, transformToNitter } from './domain';
import { logEvent } from './logger';
import { composeMiddleware, errorMiddleware, logMiddleware } from './middleware';
import { getTemplate } from './templates';
import { getUserStats, formatStatsMessage, formatInsight, formatStockAnalysis, formatGeneralSummary } from './projections';
import { generateFinancialInsight, generateStockAnalysis, generateGeneralSummary } from './gemini';
import { getTweetContent, extractTweetId, resolveRedirects } from './twitter';

export interface Env {
	DB: D1Database;
	FACTS: KVNamespace;
	BROWSER: Fetcher;
	TELEGRAM_BOT_TOKEN: string;
	GEMINI_API_KEY: string;
	TELEGRAPH_TOKEN?: string;
	TWITTER_BEARER_TOKEN?: string;
	BROADCAST_CHAT_ID?: string;
}

// --- Imperative Shell ---

export const webhookHandler = async (request: Request, env: Env, ctx: ExecutionContext) => {
	const url = new URL(request.url);

	// Dashboard API
	if (request.method === 'GET' && url.pathname === '/api/reprocess') {
		const broadcast = url.searchParams.get('broadcast') === 'true';
		const limit = parseInt(url.searchParams.get('limit') || '30');

		const urls: any = await env.DB.prepare('SELECT url FROM urls ORDER BY created_at DESC LIMIT ?').bind(limit).all();

		ctx.waitUntil((async () => {
			for (const row of urls.results) {
				const u = row.url as string;
				try {
					const expanded = await resolveRedirects(u);
					const res = await resolveLink(u, expanded, env, ctx, 0); // Reprocess (Epistemic Backfill)

					if (broadcast && env.BROADCAST_CHAT_ID && res.ivLink) {
						const targets = env.BROADCAST_CHAT_ID.split(',').map(id => id.trim()).filter(id => id.length > 0);
						for (const targetId of targets) {
							const chatId = parseInt(targetId);
							if (isNaN(chatId)) continue;
							const responseText = (res.insight || '') + formatInstantViewResponse(res.title, res.originalUrl, res.ivLink);
							await executeEffect({ type: 'SEND_TELEGRAM', payload: { chatId, text: responseText, isHtml: true } }, env);
						}
					}
					console.log(`Reprocessed ${u} (Broadcast: ${broadcast})`);
				} catch (e) {
					console.error(`Failed to reprocess ${u}:`, e);
				}
			}
		})());

		return new Response(`Reprocessing ${limit} items in background (Broadcast: ${broadcast})...`, {
			headers: { 'Access-Control-Allow-Origin': '*' }
		});
	}

	if (request.method === 'GET' && url.pathname === '/api/feed') {
		const cacheKey = new Request(url.toString(), request);
		const cache = caches.default;
		let response = await cache.match(cacheKey);

		if (!response) {
			const result = await env.DB.prepare(`
				SELECT url, title, iv_link, insight, created_at
				FROM urls
				ORDER BY created_at DESC
				LIMIT 60
			`).all();

			response = new Response(JSON.stringify(result.results), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Cache-Control': 'public, s-maxage=60'
				}
			});
			ctx.waitUntil(cache.put(cacheKey, response.clone()));
		}
		return response;
	}

	if (request.method === 'POST' && url.pathname === '/webhook') {
		const payload: any = await request.json();
		// "De-complecting" Time: Hand off to background and return 200 immediately.
		ctx.waitUntil(handleUpdate(payload, env, ctx));
		return new Response('OK', { status: 200 });
	}
	return new Response('LinxtexBot Worker is running', { status: 200 });
};

export default {
	fetch: composeMiddleware([errorMiddleware, logMiddleware, webhookHandler])
};

export async function handleUpdate(update: any, env: Env, ctx: ExecutionContext) {
	const message = update.message || update.channel_post || update.edited_message || update.edited_channel_post;
	if (!message) return;

	const chatId = message.chat.id;
	const messageId = message.message_id;
	const text = message.text || message.caption;
	const isChannel = !!(update.channel_post || update.edited_channel_post || (message.chat && message.chat.type === 'channel'));
	const isMedia = !!message.caption;

	if (!text) return;

	ctx.waitUntil(executeEffect({ type: 'LOG_EVENT', payload: { eventType: 'MESSAGE_RECEIVED', data: { text, isChannel, chatType: message.chat.type }, chatId } }, env));

	if (text.startsWith('/start')) {
		await executeEffect({ type: 'SEND_TELEGRAM', payload: { chatId, text: WELCOME_MESSAGE } }, env);
		return;
	}

	if (text.startsWith('/stats')) {
		const stats = await getUserStats(env.DB, chatId);
		const statsText = formatStatsMessage(stats);
		await executeEffect({ type: 'SEND_TELEGRAM', payload: { chatId, text: statsText, isHtml: true } }, env);
		return;
	}

	const urls = detectUrls(text).filter(url => !isHomepage(url));
	if (urls.length === 0) return;

	// Roadmap 4.0: Speculative Resolution & Parallel Atomic Processing
	ctx.waitUntil((async () => {
		try {
			// Pre-emptively unroll all redirects in parallel
			const expandedUrls = await Promise.all(urls.map(url => resolveRedirects(url)));

			const results = await Promise.all(expandedUrls.map((expandedUrl, i) =>
				resolveLink(urls[i], expandedUrl, env, ctx, chatId)
			));

			let finalContentPrefix = '';
			const linkMap: Record<string, string> = {};

			for (const res of results) {
				if (res.insight) finalContentPrefix += res.insight;
				linkMap[res.originalUrl] = res.ivLink;
			}

			if (isChannel) {
				const newText = finalContentPrefix + replaceLinksInText(text, linkMap);
				// Shift back to sending NEW items for absolute reliability (Hickey: Simple > Easy)
				await executeEffect({ type: 'SEND_TELEGRAM', payload: { chatId, text: newText, isHtml: true } }, env);
				await executeEffect({ type: 'LOG_EVENT', payload: { eventType: 'BOT_RESPONSE_CHANNEL_SEND', data: { textLength: newText.length }, chatId } }, env);
			} else {
				for (const res of results) {
					const responseText = (res.insight || '') + formatInstantViewResponse(res.title, res.originalUrl, res.ivLink);
					await executeEffect({ type: 'SEND_TELEGRAM', payload: { chatId, text: responseText, isHtml: true } }, env);
					await executeEffect({ type: 'LOG_EVENT', payload: { eventType: 'BOT_RESPONSE_SEND', data: { textLength: responseText.length }, chatId } }, env);
				}
			}
		} catch (err: any) {
			console.error('HandleUpdate Error:', err);
			await executeEffect({ type: 'LOG_EVENT', payload: { eventType: 'CRITICAL_UPDATE_ERROR', data: { error: err.message }, chatId } }, env);
		}
	})());
}

export async function resolveLink(originalUrl: string, expandedUrl: string, env: Env, ctx: ExecutionContext, chatId: number): Promise<{ originalUrl: string, ivLink: string, title: string, insight?: string }> {
	// 1. L1 Discovery Path (KV - Ultra Fast Projection)
	const hash = calculateHash(expandedUrl);
	const kvFact = await env.FACTS.get(hash, 'json') as any;
	if (kvFact && kvFact.insight) {
		await executeEffect({ type: 'LOG_EVENT', payload: { eventType: 'GODMODE_L1_HIT', data: { url: expandedUrl, hash }, chatId } }, env);
		return { originalUrl, ivLink: kvFact.ivLink, title: kvFact.title, insight: kvFact.insight };
	}

	// 2. L2 Memoization Path (D1 - Consistent System of Record)
	const cachedUrl: any = await env.DB.prepare('SELECT title, iv_link, insight FROM urls WHERE url = ?').bind(expandedUrl).first();
	if (cachedUrl && cachedUrl.insight) {
		await executeEffect({ type: 'LOG_EVENT', payload: { eventType: 'GODMODE_L2_HIT', data: { url: expandedUrl }, chatId } }, env);
		// Repopulate L1 View Layer Projection
		ctx.waitUntil(env.FACTS.put(hash, JSON.stringify({ title: cachedUrl.title, ivLink: cachedUrl.iv_link, insight: cachedUrl.insight }), { expirationTtl: 604800 }));
		return { originalUrl, ivLink: cachedUrl.iv_link, title: cachedUrl.title, insight: cachedUrl.insight };
	}

	// 3. Persistent Enrichment (Hickey Phase): If hit but NO insight, or total miss, proceed to process.
	// (Note: If we hit L1/L2 but insight was null, we fall through here to re-generate it)

	try {
		let article: any;
		const tweetId = extractTweetId(expandedUrl);

		if (tweetId && env.TWITTER_BEARER_TOKEN) {
			// Phase 2: Official API
			const tweet = await getTweetContent(tweetId, env.TWITTER_BEARER_TOKEN);
			if (tweet) {
				article = {
					title: `Tweet by ${tweet.author}`,
					content: tweet.text,
					textContent: tweet.text,
					url: expandedUrl
				};
			}
		}

		if (!article) {
			// Phase 3: Nitter Fallback (Stable Extraction)
			const targetUrl = transformToNitter(expandedUrl);
			article = await extractContent(targetUrl, env.BROWSER);
		}

		// 2. Value Check (Content Hash Deduplication)
		const hash = await calculateHash(article.textContent || article.content);
		const cachedHash: any = await env.DB.prepare('SELECT title, iv_link FROM content_hashes WHERE hash = ?').bind(hash).first();

		if (cachedHash) {
			await executeEffect({ type: 'DB_WRITE_URL', payload: { url: expandedUrl, title: cachedHash.title, ivLink: cachedHash.iv_link } }, env);
			if (originalUrl !== expandedUrl) {
				await executeEffect({ type: 'DB_WRITE_URL', payload: { url: originalUrl, title: cachedHash.title, ivLink: cachedHash.iv_link } }, env);
			}
			return { originalUrl, ivLink: cachedHash.iv_link, title: cachedHash.title };
		}

		// 3. Parallel Synthesis (The Epistemic Engine)
		let insightStr = '';
		let insightObj: any = null;

		if (env.GEMINI_API_KEY) {
			const [financial, generalSummary] = await Promise.all([
				generateFinancialInsight(article.textContent || article.content, env.GEMINI_API_KEY),
				generateGeneralSummary(article.textContent || article.content, env.GEMINI_API_KEY)
			]);

			if (financial) {
				insightObj = financial;
				if (financial.tickers.length > 0 && (financial.tags.includes('Equity') || financial.tags.includes('Stock'))) {
					const stock = await generateStockAnalysis(financial.tickers[0], article.textContent || article.content, env.GEMINI_API_KEY);
					insightStr = stock ? formatStockAnalysis(stock) : formatInsight(financial);
				} else {
					insightStr = formatInsight(financial);
				}
				await executeEffect({ type: 'LOG_INSIGHT', payload: { contentHash: hash, rawInsight: JSON.stringify(insightObj), relevanceScore: insightObj.relevance_score } }, env);
				await executeEffect({ type: 'LOG_EVENT', payload: { eventType: 'INSIGHT_SYNTHESIZED', data: { url: expandedUrl, score: insightObj.relevance_score }, chatId } }, env);
			} else if (generalSummary) {
				insightStr = formatGeneralSummary(generalSummary);
				// Log general summary for dashboard visibility
				await executeEffect({ type: 'LOG_INSIGHT', payload: { contentHash: hash, rawInsight: JSON.stringify({ summary: generalSummary, relevance_score: 50, tickers: [], tags: ['General'] }), relevanceScore: 50 } }, env);
				await executeEffect({ type: 'LOG_EVENT', payload: { eventType: 'SUMMARY_GENERATED', data: { url: expandedUrl }, chatId } }, env);
			}
		}

		// 4. Telegra.ph Transformation
		const { nodes, tickers } = convertToTelegraphNodes(article.content);
		const token = env.TELEGRAPH_TOKEN || 'fa5aa2d8dbea74c2b2f05a04addcd68ec5b2f91a6aac7f8b1e2f4c5f5aba';
		const ivLink = await makeTelegraphPage(article.title, nodes, token);

		// 5. Persistence
		await executeEffect({ type: 'DB_WRITE_URL', payload: { url: expandedUrl, title: article.title, ivLink, insight: insightStr } }, env);
		if (originalUrl !== expandedUrl) {
			await executeEffect({ type: 'DB_WRITE_URL', payload: { url: originalUrl, title: article.title, ivLink, insight: insightStr } }, env);
		}
		await executeEffect({ type: 'DB_WRITE_HASH', payload: { hash, title: article.title, ivLink } }, env);
		await executeEffect({ type: 'LOG_EVENT', payload: { eventType: 'LINK_PROCESSED', data: { url: expandedUrl, hash }, chatId } }, env);

		return { originalUrl, ivLink, title: article.title, insight: insightStr };
	} catch (err: any) {
		console.error(`Error resolving ${expandedUrl}:`, err);
		await executeEffect({ type: 'LOG_EVENT', payload: { eventType: 'PROCESSING_ERROR', data: { url: originalUrl, error: err.message }, chatId } }, env);
		return { originalUrl, ivLink: originalUrl, title: 'Error' };
	}
}

// --- Imperative Execution Shell ---

export async function executeEffect(effect: any, env: Env) {
	const validatedEffect = EffectSchema.parse(effect);

	switch (validatedEffect.type) {
		case 'SEND_TELEGRAM': {
			const { chatId, text, isHtml } = validatedEffect.payload;
			const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: chatId, text, parse_mode: isHtml ? 'HTML' : undefined, disable_web_page_preview: false })
			});
			if (!res.ok) throw new Error(`Telegram error: ${res.status} ${await res.text()}`);
			break;
		}
		case 'DB_WRITE_URL': {
			const { url, title, ivLink, insight } = validatedEffect.payload;
			await env.DB.prepare('INSERT OR REPLACE INTO urls (url, title, iv_link, insight) VALUES (?, ?, ?, ?)')
				.bind(url, title, ivLink, insight)
				.run();
			// Hickey Mode: View Layer Projection (Keyed by SHA256(URL))
			const hash = calculateHash(url);
			await env.FACTS.put(hash, JSON.stringify({ title, ivLink, insight }), { expirationTtl: 604800 });
			return;
		}
		case 'DB_WRITE_HASH': {
			const { hash, title, ivLink } = validatedEffect.payload;
			await env.DB.prepare('INSERT INTO content_hashes (hash, title, iv_link) VALUES (?, ?, ?)')
				.bind(hash, title, ivLink)
				.run();
			break;
		}
		case 'LOG_INSIGHT': {
			const { contentHash, rawInsight, relevanceScore } = validatedEffect.payload;
			await env.DB.prepare('INSERT INTO insight_logs (content_hash, raw_insight, relevance_score) VALUES (?, ?, ?)')
				.bind(contentHash, rawInsight, relevanceScore)
				.run();
			break;
		}
		case 'EDIT_TELEGRAM_MESSAGE': {
			const { chatId, messageId, text, isHtml } = validatedEffect.payload;
			const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`;
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: isHtml ? 'HTML' : undefined, disable_web_page_preview: false })
			});
			if (!res.ok) throw new Error(`Telegram error: ${res.status} ${await res.text()}`);
			break;
		}
		case 'EDIT_TELEGRAM_CAPTION': {
			const { chatId, messageId, caption, isHtml } = validatedEffect.payload;
			const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageCaption`;
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: chatId, message_id: messageId, caption, parse_mode: isHtml ? 'HTML' : undefined })
			});
			if (!res.ok) throw new Error(`Telegram error: ${res.status} ${await res.text()}`);
			break;
		}
		case 'PUBLISH_TELEGRAPH': {
			const { title, nodes } = validatedEffect.payload;
			const token = env.TELEGRAPH_TOKEN || 'fa5aa2d8dbea74c2b2f05a04addcd68ec5b2f91a6aac7f8b1e2f4c5f5aba';
			return await makeTelegraphPage(title, nodes, token);
		}
		case 'LOG_EVENT': {
			const { eventType, data, chatId } = validatedEffect.payload;
			await logEvent(env, eventType, data, chatId);
			break;
		}
	}
}
