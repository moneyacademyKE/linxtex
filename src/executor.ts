import { 
    EffectSchema, 
    transformToNitter, 
    calculateHash, 
    transduceContent 
} from './domain';
import { 
    generateFinancialInsight, 
    verifyInsight 
} from './gemini';
import { extractContent } from './parser';
import { makeTelegraphPage } from './telegraph';

export interface Env {
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAPH_TOKEN: string;
    GEMINI_API_KEY: string;
    DB: D1Database;
    FACTS: KVNamespace;
    ENRICHMENT_QUEUE: Queue;
    BROWSER: any;
}

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

        case 'GENERATE_METADATA': {
            const insights = await generateFinancialInsight(
                effect.payload.content,
                env.GEMINI_API_KEY,
                effect.payload.hints,
                undefined,
                effect.payload.perspective
            );
            return insights ? { type: 'INSIGHTS_GENERATED', insight: insights.summary, ...insights } : { type: 'ERROR_OCCURRED', message: 'Generation failed' };
        }

        case 'GENERATE_DEEP_INSIGHT': {
            const deep = await generateFinancialInsight(
                effect.payload.content,
                env.GEMINI_API_KEY,
                effect.payload.hints,
                undefined,
                effect.payload.perspective
            );
            return deep ? { type: 'STOCK_ANALYSIS_GENERATED', analysis: deep.analysis } : { type: 'ERROR_OCCURRED', message: 'Deep analysis failed' };
        }

        case 'VERIFY_INSIGHT': {
            const verification = await verifyInsight(effect.payload.content, effect.payload.insight, env.GEMINI_API_KEY);
            return verification ? { type: 'VERDICT_GENERATED', verdict: verification.verdict } : { type: 'ERROR_OCCURRED', message: 'Verification failed' };
        }

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
