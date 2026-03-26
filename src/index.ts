import { 
	detectUrls, 
	isHomepage, 
	calculateHash, 
	decideNextEffects, 
	integrateObservation, 
	extractUrlsFromEntities,
    convertToTelegraphNodes,
	type ProcessingState,
	EffectSchema 
} from './domain';
import { 
	generateFinancialInsight, 
	verifyInsight 
} from './gemini';
import { extractContent } from './parser';
import { makeTelegraphPage } from './telegraph';
import { WELCOME_MESSAGE } from './domain';

export interface Env {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAPH_TOKEN: string;
	GEMINI_API_KEY: string;
	DB: D1Database;
	FACTS: KVNamespace;
	ENRICHMENT_QUEUE: Queue;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log(`[FETCH ROOT] ${request.method} ${request.url}`);
		const url = new URL(request.url);
		if (url.pathname === '/webhook' && request.method === 'POST') {
			try {
				const update = await request.json();
				await handleUpdate(update, env, ctx);
				return new Response('OK');
			} catch (e) {
				console.error('Webhook error:', e);
				return new Response('Error', { status: 500 });
			}
		}

		if (url.pathname === '/reprocess' && request.method === 'GET') {
			try {
				const result = await handleReprocess(env, ctx);
				return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
			} catch (e) {
				console.error('Reprocess error:', e);
				return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
			}
		}

		return new Response('Not Found', { status: 404 });
	},

	async queue(batch: any, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log(`[QUEUE] Received batch of ${batch.messages.length} messages`);
		for (const message of batch.messages) {
			const { url, traceId, perspective } = message.body;
			console.log(`[QUEUE] Processing: ${url} (trace: ${traceId})`);
			try {
				const result = await resolveLink(url, url, env, ctx, 0, traceId, perspective);
				console.log(`[QUEUE] Finished: ${url} -> ${result.ivLink}`);
			} catch (e) {
				console.error('[QUEUE] CRITICAL FAILURE:', e);
				if (env.DB) {
					await env.DB.prepare("INSERT INTO events (event_type, data) VALUES (?, ?)")
						.bind('QUEUE_PROCESS_FAILURE', JSON.stringify({ url, traceId, error: String(e) }))
						.run();
				}
			}
		}
	}
};

export async function executeEffect(effect: any, env: Env): Promise<any> {
    const validation = EffectSchema.safeParse(effect);
    if (!validation.success) {
        console.error('Effect validation failed:', JSON.stringify(effect, null, 2), validation.error);
        return null;
    }

	switch (effect.type) {
		case 'FETCH_LINK':
			const article = await extractContent(effect.payload.url);
			return article ? { type: 'CONTENT_FETCHED', ...article } : { type: 'ERROR_OCCURRED', message: 'Fetch failed' };

		case 'GENERATE_METADATA':
			const insights = await generateFinancialInsight(effect.payload.content, env.GEMINI_API_KEY);
			return insights ? { type: 'INSIGHTS_GENERATED', insight: insights.summary, ...insights } : { type: 'ERROR_OCCURRED', message: 'Generation failed' };

		case 'GENERATE_DEEP_INSIGHT':
			const deep = await generateFinancialInsight(effect.payload.content, env.GEMINI_API_KEY);
			return deep ? { type: 'STOCK_ANALYSIS_GENERATED', analysis: deep.analysis } : { type: 'ERROR_OCCURRED', message: 'Deep analysis failed' };

		case 'VERIFY_INSIGHT':
			const verification = await verifyInsight(effect.payload.content, effect.payload.insight, env.GEMINI_API_KEY);
			return verification ? { type: 'VERDICT_GENERATED', verdict: verification.verdict } : { type: 'ERROR_OCCURRED', message: 'Verification failed' };

		case 'PUBLISH_TELEGRAPH':
            // Logic moved from domain to execution layer
            const { nodes } = convertToTelegraphNodes(effect.payload.content, effect.payload.baseUrl);
            if (!nodes || nodes.length === 0) return { type: 'ERROR_OCCURRED', message: 'No content to publish' };
			const ivLink = await makeTelegraphPage(effect.payload.title, nodes, env.TELEGRAPH_TOKEN || '');
			return ivLink ? { type: 'IV_LINK_GENERATED', ivLink } : { type: 'ERROR_OCCURRED', message: 'Publishing failed' };

		case 'RECORD_INSIGHT':
			const { url, title, ivLink: link, insight, hash, metadata } = effect.payload;
			// D1 Persistence
			await env.DB.prepare("INSERT OR REPLACE INTO urls (url, title, iv_link, last_enriched) VALUES (?, ?, ?, ?)")
				.bind(url, title, link, Date.now())
				.run();
			
			if (hash) {
				await env.DB.prepare("INSERT INTO insight_logs (trace_id, url, hash, insight, metadata) VALUES (?, ?, ?, ?, ?)")
					.bind(metadata.traceId || 'unknown', url, hash, insight, JSON.stringify(metadata))
					.run();
			}

			// KV Persistence
			await env.FACTS.put(`insight:${url}`, JSON.stringify({ title, ivLink: link, insight, hash }), { expirationTtl: 86400 * 2 });
			return { type: 'PERSISTENCE_COMPLETE' };

		case 'SEND_TELEGRAM':
			await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(effect.payload)
			});
			return null;

		default:
			return null;
	}
}

export async function resolveLink(
    originalUrl: string, 
    expandedUrl: string, 
    env: Env, 
    ctx: ExecutionContext, 
    chatId?: number, 
    traceId?: string, 
    perspective?: string,
    executor: (effect: any, env: Env) => Promise<any> = executeEffect
): Promise<any> {
	console.log(`[RESOLVE_LINK] ENTERING for ${expandedUrl} (trace: ${traceId})`);
	let state: ProcessingState = { originalUrl, url: expandedUrl, phase: 'RESOLVING', traceId, perspective };

	let iterations = 0;
	while (state.phase !== 'COMPLETE' && iterations < 15) {
		iterations++;
		const effects = decideNextEffects(state);
		if (effects.length === 0) break;

		for (const effect of effects) {
			console.log(`[RESOLVE_LINK] Effect: ${effect.type} (trace: ${traceId})`);
			const result = await executor(effect, env);
			console.log(`[RESOLVE_LINK] Result: ${result?.type || 'null'} (trace: ${traceId})`);
			if (result) {
				state = integrateObservation(state, result);
				if (result.type === 'INSIGHTS_GENERATED') {
					state.hash = await calculateHash(state.textContent || state.content || '');
				}
			}
		}
	}

	return { 
		originalUrl, 
		ivLink: state.ivLink || expandedUrl, 
		title: state.title || 'Untitled', 
		insight: state.stockAnalysis || state.insight 
	};
}

export async function handleReprocess(env: Env, ctx: ExecutionContext) {
	console.log('[REPROCESS] Starting link recovery from D1 Event Log...');
	
	// 1. Fetch ALL MESSAGE_RECEIVED events
	const events = await env.DB.prepare("SELECT data FROM events WHERE event_type = 'MESSAGE_RECEIVED'").all();
	
	if (!events.results || events.results.length === 0) {
		return { message: "No recent MESSAGE_RECEIVED events found in last 48h", results: 0 };
	}

	const urlsToEnrich = new Set<string>();

	const debug: any[] = [];
	for (const row of events.results) {
		try {
			const data = JSON.parse(row.data as string);
			if (data.urls && Array.isArray(data.urls)) {
				for (const url of data.urls) urlsToEnrich.add(url);
			} else if (data.text) {
				const extracted = detectUrls(data.text);
				for (const url of extracted) {
					const home = isHomepage(url);
					debug.push({ url: url.substring(0, 50), isHome: home });
					if (!home) urlsToEnrich.add(url);
				}
			}
		} catch (e) {
			console.error('[REPROCESS] Failed to parse event data:', e);
		}
	}

	console.log(`[REPROCESS] Extracted ${urlsToEnrich.size} unique URLs from events`);

	const results = [];
	for (const url of urlsToEnrich) {
		const traceId = crypto.randomUUID();
		
		// Force re-ingestion
		await env.DB.prepare("DELETE FROM urls WHERE url = ?").bind(url).run();
		await env.ENRICHMENT_QUEUE.send({ url, traceId, perspective: 'default' });
		
		results.push({ url, traceId });
	}

	return {
		events_scanned: events.results.length,
		enqueued_links: results.length,
		links: results.map(r => r.url),
		debug: debug
	};
}

async function handleUpdate(update: any, env: Env, ctx: ExecutionContext) {
	console.log('--- HANDLE UPDATE START ---');
	const message = update.message || update.channel_post || update.edited_message || update.edited_channel_post;
	if (!message || !message.text) return;

	const text = message.text;
	const chatId = message.chat.id;
	const entities = message.entities || message.caption_entities;

	if (text === '/start') {
		await executeEffect({ type: 'SEND_TELEGRAM', payload: { chatId, text: WELCOME_MESSAGE } }, env);
		return;
	}

	const detected = detectUrls(text);
	const fromEntities = extractUrlsFromEntities(text, entities);
	const allUrls = Array.from(new Set([...detected, ...fromEntities])).filter(url => !isHomepage(url));

	if (allUrls.length === 0) return;

	// Telemetry
	await env.DB.prepare("INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)")
		.bind('MESSAGE_RECEIVED', JSON.stringify({ text, urlCount: allUrls.length }), chatId)
		.run();

	const traceId = crypto.randomUUID();
	for (const url of allUrls) {
		try {
			await env.ENRICHMENT_QUEUE.send({ url, traceId, perspective: 'default' });
		} catch (e) {
			console.error('Queue error:', e);
			await env.DB.prepare("INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)")
				.bind('QUEUE_SEND_FAILURE', JSON.stringify({ url, error: String(e) }), chatId)
				.run();
		}
	}
}
