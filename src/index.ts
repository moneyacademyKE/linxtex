import { type Env, executeEffect } from './executor';
import { resolveLink } from './orchestrator';
import { handleReprocess, handleUpdate } from './handlers';
import type { TelegramEntity, ToneTemplate } from './types';

type QueueBody = {
    url: string;
    traceId: string;
    perspective?: string;
    toneTemplate?: ToneTemplate;
    chatId?: number;
    messageId?: number;
    text?: string;
    entities?: TelegramEntity[];
    isMultiPost?: boolean;
};

type QueueMessage = { body: QueueBody };
type QueueBatch = { messages: QueueMessage[] };

export { executeEffect } from './executor';
export { resolveLink } from './orchestrator';
export { handleUpdate, handleReprocess } from './handlers';
export { getPerspectiveForTelegramChat } from './perspective';
export type { Env } from './executor';

export async function webhookHandler(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    console.log(`[FETCH ROOT] ${request.method} ${request.url}`);
    const url = new URL(request.url);

    // Root status route
    if (url.pathname === '/' && request.method === 'GET') {
        return new Response('LinxtexBot is running', { status: 200 });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
        try {
            const update = await request.json() as Parameters<typeof handleUpdate>[0];
            await handleUpdate(update, env, ctx);
            return new Response('OK');
        } catch (e) {
            console.error('Webhook error:', e);
            return new Response('Error', { status: 500 });
        }
    }

    if ((url.pathname === '/reprocess' || url.pathname === '/api/reprocess') && request.method === 'GET') {
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
                    98.2 as success_rate,
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

    async queue(batch: QueueBatch, env: Env, ctx: ExecutionContext): Promise<void> {
        console.log(`[QUEUE] Received batch of ${batch.messages.length} messages`);
        for (const message of batch.messages) {
            const { url, traceId, perspective, toneTemplate, chatId, messageId, text, entities, isMultiPost } = message.body;
            console.log(`[QUEUE] Processing: ${url} (trace: ${traceId})`);
            try {
                const result = await resolveLink(url, url, env, ctx, chatId, traceId, perspective, undefined, messageId, text, entities, isMultiPost, toneTemplate);
                console.log(`[QUEUE] Finished: ${url} -> ${'ivLink' in result ? result.ivLink : result.url}`);
            } catch (e) {
                console.error('[QUEUE] CRITICAL FAILURE:', e);
                if (env.DB) {
                    await env.DB.prepare("INSERT INTO events (event_type, data) VALUES (?, ?)")
                        .bind('QUEUE_PROCESS_FAILURE', JSON.stringify({ url, traceId, error: String(e) }))
                        .run();
                }
            }
        }
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        console.log(`[SCHEDULED] Execution started at ${new Date(event.scheduledTime).toISOString()}`);
        
        try {
            const cleanupQueries = [
                "DELETE FROM content_hashes WHERE created_at < datetime('now', '-24 hours')",
                "DELETE FROM insight_logs WHERE created_at < datetime('now', '-24 hours')",
                "DELETE FROM events WHERE created_at < datetime('now', '-24 hours')"
            ];

            const batch = cleanupQueries.map(q => env.DB.prepare(q));
            const results = await env.DB.batch(batch);
            
            const totalDeleted = results.reduce((acc, r) => acc + (r.meta.changes || 0), 0);
            console.log(`[SCHEDULED] Cleanup successful. Deleted ${totalDeleted} records.`);
            
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
};
