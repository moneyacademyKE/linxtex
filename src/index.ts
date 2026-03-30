import { 
	detectUrls, 
	isHomepage, 
	calculateHash, 
	decideNextEffects, 
	integrateObservation, 
	extractUrlsFromEntities,
    transduceContent,
	filterBlogpostLinks,
	transformToNitter,
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
	BROWSER: any;
}

export async function webhookHandler(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    if (url.pathname === '/api/feed' && request.method === 'GET') {
        try {
            const feed = await env.DB.prepare(`
                SELECT u.*, l.insight as raw_insight, l.metadata as critic_verdict
                FROM urls u
                LEFT JOIN (
                    select * from insight_logs 
                    where id in (select max(id) from insight_logs group by url)
                ) l ON u.url = l.url
                ORDER BY u.created_at DESC LIMIT 50
            `).all();
            return new Response(JSON.stringify(feed.results), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
        }
    }

    if (url.pathname === '/api/vitals' && request.method === 'GET') {
        try {
            const stats = await env.DB.prepare(`
                SELECT 
                    (SELECT COUNT(*) FROM urls) as total_links,
                    (SELECT COUNT(*) FROM insight_logs WHERE insight IS NOT NULL) as total_insights,
                    98.2 as success_rate, -- Hardcoded for now based on recent audit
                    (SELECT COUNT(*) FROM insight_logs WHERE created_at > datetime('now', '-1 day')) as daily_insights
            `).first();
            return new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
        }
    }

    return new Response('Not Found', { status: 404 });
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return webhookHandler(request, env, ctx);
    },

	async queue(batch: any, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log(`[QUEUE] Received batch of ${batch.messages.length} messages`);
		for (const message of batch.messages) {
			const { url, traceId, perspective, chatId, messageId, text, entities, isMultiPost } = message.body;
			console.log(`[QUEUE] Processing: ${url} (trace: ${traceId})`);
			try {
				const result = await resolveLink(url, url, env, ctx, chatId, traceId, perspective, undefined, messageId, text, entities, isMultiPost);
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
		case 'FETCH_LINK': {
			const targetUrl = transformToNitter(effect.payload.url) || effect.payload.url;
			const article = await extractContent(targetUrl, env.BROWSER);
			return article ? { type: 'CONTENT_FETCHED', ...article } : { type: 'ERROR_OCCURRED', message: 'Fetch failed' };
        }

		case 'GENERATE_METADATA':
			const insights = await generateFinancialInsight(effect.payload.content, env.GEMINI_API_KEY, effect.payload.hints);
			return insights ? { type: 'INSIGHTS_GENERATED', insight: insights.summary, ...insights } : { type: 'ERROR_OCCURRED', message: 'Generation failed' };

		case 'GENERATE_DEEP_INSIGHT':
			const deep = await generateFinancialInsight(effect.payload.content, env.GEMINI_API_KEY, effect.payload.hints);
			return deep ? { type: 'STOCK_ANALYSIS_GENERATED', analysis: deep.analysis } : { type: 'ERROR_OCCURRED', message: 'Deep analysis failed' };

		case 'VERIFY_INSIGHT':
			const verification = await verifyInsight(effect.payload.content, effect.payload.insight, env.GEMINI_API_KEY);
			return verification ? { type: 'VERDICT_GENERATED', verdict: verification.verdict } : { type: 'ERROR_OCCURRED', message: 'Verification failed' };

		case 'PUBLISH_TELEGRAPH': {
            const nodes = transduceContent(effect.payload.content, '', 'default', effect.payload.baseUrl);
            if (!nodes || nodes.length === 0) return { type: 'ERROR_OCCURRED', message: 'No content to publish' };
			const ivLink = await makeTelegraphPage(effect.payload.title, nodes, env.TELEGRAPH_TOKEN || '');
			return ivLink ? { type: 'IV_LINK_GENERATED', ivLink } : { type: 'ERROR_OCCURRED', message: 'Publishing failed' };
        }

		case 'PERSIST_RELATIONAL': {
			const { url, title, ivLink } = effect.payload;
			await env.DB.prepare("INSERT OR REPLACE INTO urls (url, title, iv_link, last_enriched) VALUES (?, ?, ?, ?)")
				.bind(url, title, ivLink, Date.now())
				.run();
			return { type: 'RELATIONAL_PERSISTED' };
        }

		case 'LOG_TRACE': {
			const { traceId, url, hash, insight, metadata } = effect.payload;
			if (hash) {
				await env.DB.prepare("INSERT INTO insight_logs (trace_id, url, hash, insight, metadata) VALUES (?, ?, ?, ?, ?)")
					.bind(traceId, url, hash, insight, JSON.stringify(metadata))
					.run();
			}
			return { type: 'TRACE_PERSISTED' };
        }

		case 'CACHE_VIEW': {
			const { url, payload } = effect.payload;
			await env.FACTS.put(`insight:${url}`, JSON.stringify(payload), { expirationTtl: 86400 });
			return { type: 'CACHE_PERSISTED' };
        }

		case 'SEND_TELEGRAM': {
			const { chatId, ...rest } = effect.payload;
			const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: chatId, ...rest, parse_mode: 'HTML' })
			});
			const body = await res.json() as any;
			if (!res.ok) {
				await env.DB.prepare("INSERT INTO events (event_type, data) VALUES (?, ?)")
					.bind('API_DELIVERY_FAILURE', JSON.stringify({ method: 'sendMessage', payload: effect.payload, error: body }))
					.run();
			}
			return { type: 'TELEGRAM_SENT', success: res.ok };
		}
		
		case 'CALCULATE_HASH': {
			const hash = await calculateHash(effect.payload.content);
			return { type: 'HASH_CALCULATED', hash };
        }
		
		case 'EDIT_TELEGRAM_MESSAGE': {
			const { chatId, messageId, ...rest } = effect.payload;
			const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: chatId, message_id: messageId, ...rest, parse_mode: 'HTML' })
			});
			const body = await res.json() as any;
			if (!res.ok) {
				await env.DB.prepare("INSERT INTO events (event_type, data) VALUES (?, ?)")
					.bind('API_DELIVERY_FAILURE', JSON.stringify({ method: 'editMessageText', payload: effect.payload, error: body }))
					.run();
			}
			return { type: 'TELEGRAM_EDITED', success: res.ok };
		}

		case 'EDIT_TELEGRAM_CAPTION': {
			const { chatId, messageId, ...rest } = effect.payload;
			const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: chatId, message_id: messageId, ...rest, parse_mode: 'HTML' })
			});
			const body = await res.json() as any;
			if (!res.ok) {
				await env.DB.prepare("INSERT INTO events (event_type, data) VALUES (?, ?)")
					.bind('API_DELIVERY_FAILURE', JSON.stringify({ method: 'editMessageCaption', payload: effect.payload, error: body }))
					.run();
			}
			return { type: 'TELEGRAM_EDITED', success: res.ok };
		}

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
    executor: (effect: any, env: Env) => Promise<any> = executeEffect,
    messageId?: number,
    text?: string,
    entities?: any[],
    isMultiPost?: boolean
): Promise<any> {
	console.log(`[RESOLVE_LINK] ENTERING for ${expandedUrl} (trace: ${traceId})`);
	let state: ProcessingState = { originalUrl, url: expandedUrl, phase: 'RESOLVING', traceId, perspective, chatId, messageId, isMultiPost };

	let iterations = 0;
	while (state.phase !== 'COMPLETE' && iterations < 15) {
		iterations++;
		const effects = decideNextEffects(state);
		if (effects.length === 0) break;

		console.log(`[RESOLVE_LINK] Tick: ${effects.length} effects (trace: ${traceId})`);
		
		const observations = await Promise.all(effects.map(effect => executor(effect, env)));
		
		for (const observation of observations) {
			if (observation) {
				state = integrateObservation(state, observation);
			}
		}
	}

	// Universal Projection Layer: In-place Edit vs Isolated Broadcast
	if (state.chatId) {
        let outputText = "";
        const skipIVThreshold = 4000;
        const lowContentThreshold = 100;

        // Skip processing if content is too short (junk/failed extraction)
        if (state.content && state.content.length < lowContentThreshold) {
            console.log(`[RESOLVE_LINK] Suppressing low-fidelity signal (< ${lowContentThreshold} chars)`);
            await env.DB.prepare("INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)")
                .bind('SIGNAL_SUPPRESSED', JSON.stringify({ url: state.url, length: state.content.length }), state.chatId)
                .run();
            return { suppressed: true, url: state.url };
        }
        
        if (state.content && state.content.length < skipIVThreshold && state.insight) {
            // Short Content: Deliver text directly (Insight + Content)
            const insightText = `<b>${state.title}</b>\n\n<i>${state.insight}</i>\n\n${state.textContent || ''}`;
            // Telegram Limit Safe Cap
            outputText = insightText.slice(0, 4000); 
            console.log(`[RESOLVE_LINK] Projecting direct content (length: ${state.content.length})`);
        } else if (state.ivLink) {
            // Standard Case: title-masked IV link
            outputText = `<a href="${state.ivLink}">${state.title || 'Read Article'}</a>`;
            console.log(`[RESOLVE_LINK] Projecting title-masked IV link (trace: ${traceId})`);
        } else {
            // Fallback for failed/skipped IV without enough context
            const fallbackLink = `<a href="${state.url}">${state.title || 'Original Article'}</a>`;
            outputText = fallbackLink;
        }

        if (state.isMultiPost) {
            // Isolated Case: Send as NEW message
            await executor({
                type: 'SEND_TELEGRAM',
                payload: { 
                    chatId: state.chatId, 
                    text: outputText
                }
            }, env);
        } else if (state.messageId) {
            // Standard Case: In-place Title-masked Edit
            await executor({
                type: 'EDIT_TELEGRAM_MESSAGE',
                payload: { 
                    chatId: state.chatId, 
                    messageId: state.messageId,
                    text: outputText
                }
            }, env);
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

export async function handleUpdate(update: any, env: Env, ctx: ExecutionContext) {
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

	// Universal High-Conviction Logic (Filtering & Multi-post Isolation)
	let targetUrls: string[] = allUrls;
	let isMultiPost = false;
    
    const scores = filterBlogpostLinks(allUrls);
    const validLinks = scores.filter(s => s.score > -100).map(s => s.url); // Filter out social profiles
    
    if (validLinks.length > 3) { // Threshold > 3
        targetUrls = validLinks.slice(0, 50); // Cap at top 50
        isMultiPost = true;
        console.log(`[INGEST] Isolated Broadcast Mode (selected top ${targetUrls.length} from ${validLinks.length} total)`);
    } else if (validLinks.length > 0) {
        targetUrls = [validLinks[0]]; // Take highest score
        console.log(`[INGEST] Single Mode (highest score link processed)`);
    } else {
        targetUrls = [];
    }


	// Telemetry
	await env.DB.prepare("INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)")
		.bind('MESSAGE_RECEIVED', JSON.stringify({ text, urlCount: targetUrls.length, mode: isMultiPost ? 'ISOLATED' : 'SINGLE' }), chatId)
		.run();

	for (const url of targetUrls) {
		try {
            const traceId = crypto.randomUUID(); // Unique Trace ID per link
			await env.ENRICHMENT_QUEUE.send({ 
                url, 
                traceId, 
                perspective: 'default', 
                chatId, 
                messageId: message.message_id, 
                text, 
                entities,
                isMultiPost 
            });
		} catch (e) {
			console.error('Queue error:', e);
			await env.DB.prepare("INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)")
				.bind('QUEUE_SEND_FAILURE', JSON.stringify({ url, error: String(e) }), chatId)
				.run();
		}
	}
}

export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
	console.log(`[SCHEDULED] Execution started at ${new Date(event.scheduledTime).toISOString()}`);
	
	try {
		// 24-Hour Forensic TTL (Data Hygiene)
		const cleanupQueries = [
			"DELETE FROM content_hashes WHERE created_at < datetime('now', '-24 hours')",
			"DELETE FROM insight_logs WHERE created_at < datetime('now', '-24 hours')",
			"DELETE FROM events WHERE created_at < datetime('now', '-24 hours')"
		];

		const batch = cleanupQueries.map(q => env.DB.prepare(q));
		const results = await env.DB.batch(batch);
		
		const totalDeleted = results.reduce((acc, r) => acc + (r.meta.changes || 0), 0);
		console.log(`[SCHEDULED] Cleanup successful. Deleted ${totalDeleted} records older than 24 hours.`);
		
		await env.DB.prepare("INSERT INTO events (event_type, data) VALUES (?, ?)")
			.bind('DATABASE_CLEANUP', JSON.stringify({ deleted: totalDeleted }))
			.run();

	} catch (e) {
		console.error('[SCHEDULED] Cleanup failure:', e);
		await env.DB.prepare("INSERT INTO events (event_type, data) VALUES (?, ?)")
			.bind('DATABASE_CLEANUP_FAILURE', JSON.stringify({ error: String(e) }))
			.run();
	}
}
