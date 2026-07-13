import { 
    EffectSchema, 
    transformToNitter, 
    calculateHash, 
    transduceContent,
    type Effect,
    type Observation,
    type ExecutorContext,
    type FinancialData
} from './domain';
import { 
    generateFinancialInsight, 
    verifyInsight,
    generateGeneralSummary
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
    BROWSER: Fetcher;
}

export type ExecuteEffect = (effect: Effect, env: Env, context?: ExecutorContext) => Promise<Observation | null>;

export async function executeEffect(effect: Effect, env: Env, _context?: ExecutorContext): Promise<Observation | null> {
    const validation = EffectSchema.safeParse(effect);
    if (!validation.success) {
        console.error('Effect validation failed:', JSON.stringify(effect, null, 2), validation.error);
        return null;
    }

    const normalizedEffect = validation.data;

    switch (normalizedEffect.type) {
        case 'FETCH_LINK': {
            const targetUrl = transformToNitter(effect.payload.url) || effect.payload.url;
            const article = await extractContent(targetUrl, env.BROWSER);
            return article
                ? {
                    type: 'CONTENT_FETCHED',
                    title: article.title,
                    content: article.content,
                    textContent: article.textContent || article.content,
                    publishedTime: article.publishedTime,
                    fidelityRatio: article.fidelityRatio
                }
                : { type: 'ERROR_OCCURRED', message: 'Fetch failed' };
        }

        case 'GENERATE_METADATA': {
            let content = effect.payload.content;
            if (effect.payload.previousInsight) {
                const diffInstruction = `[PREVIOUS INSIGHT]: The last time this URL was enriched, the generated insight was: "${effect.payload.previousInsight}". Compare the current content to the previous insight and summarize only new updates or diffs if they exist, maintaining historical context.\n\n`;
                content = diffInstruction + content;
            }
            if (effect.payload.publishedTime) {
                try {
                    const pubDate = new Date(effect.payload.publishedTime);
                    if (!isNaN(pubDate.getTime())) {
                        const daysAgo = Math.floor((Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24));
                        if (daysAgo >= 0) {
                            const warningText = `[TEMPORAL GROUNDING NOTE]: This article was published ${daysAgo} days ago. Discount urgency and news freshness parameters if the content is stale or already priced in by markets.\n\n`;
                            content = warningText + content;
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse publishedTime:", e);
                }
            }
            const insights = await generateFinancialInsight(
                content,
                env.GEMINI_API_KEY,
                effect.payload.hints,
                effect.payload.model,
                effect.payload.perspective
            );
            return insights
                ? {
                    type: 'INSIGHTS_GENERATED',
                    insight: insights.summary,
                    rawInsight: insights.summary,
                    relevanceScore: insights.relevance_score,
                    financialData: {
                        sentiment: insights.sentiment,
                        fact_check: insights.fact_check,
                        analysis: insights.analysis,
                        is_urgent: insights.is_urgent,
                        tags: insights.tags,
                        tickers: insights.tickers
                    } as FinancialData,
                    tickers: insights.tickers
                }
                : { type: 'ERROR_OCCURRED', message: 'Generation failed' };
        }

        case 'GENERATE_DEEP_INSIGHT': {
            const deep = await generateFinancialInsight(
                effect.payload.content,
                env.GEMINI_API_KEY,
                effect.payload.hints,
                effect.payload.model,
                effect.payload.perspective
            );
            return deep ? { type: 'STOCK_ANALYSIS_GENERATED', analysis: deep.analysis } : { type: 'ERROR_OCCURRED', message: 'Deep analysis failed' };
        }

        case 'VERIFY_INSIGHT': {
            const verification = await verifyInsight(
                effect.payload.content,
                effect.payload.insight,
                env.GEMINI_API_KEY,
                effect.payload.model,
                effect.payload.perspective
            );
            return verification ? { type: 'VERDICT_GENERATED', verdict: verification.verdict } : { type: 'ERROR_OCCURRED', message: 'Verification failed' };
        }

        case 'GENERATE_GENERAL_SUMMARY': {
            const summary = await generateGeneralSummary(effect.payload.content, env.GEMINI_API_KEY, effect.payload.model);
            return summary ? { type: 'GENERAL_SUMMARY_GENERATED', summary } : { type: 'ERROR_OCCURRED', message: 'General summary failed' };
        }

        case 'PUBLISH_TELEGRAPH': {
            let parsingRules: any = undefined;
            try {
                const cachedRules = await env.FACTS.get('rules:parsing');
                if (cachedRules) {
                    parsingRules = JSON.parse(cachedRules) as Record<string, unknown>;
                } else if (env.DB) {
                    const dbRule = await env.DB.prepare("SELECT rule_value FROM logic_rules WHERE rule_key = 'parsing' LIMIT 1").first<{ rule_value?: string }>();
                    if (dbRule?.rule_value) {
                        parsingRules = JSON.parse(dbRule.rule_value) as Record<string, unknown>;
                        await env.FACTS.put('rules:parsing', dbRule.rule_value, { expirationTtl: 300 });
                    }
                }
            } catch (err) {
                console.error("Failed to load custom logic rules:", err);
            }
            const nodes = transduceContent(effect.payload.content, '', 'default', effect.payload.baseUrl, parsingRules);
            if (!nodes || nodes.length === 0) return { type: 'ERROR_OCCURRED', message: 'No content to publish' };
            const ivLink = await makeTelegraphPage(effect.payload.title, nodes, env.TELEGRAPH_TOKEN || '');
            return ivLink ? { type: 'IV_LINK_GENERATED', ivLink } : { type: 'ERROR_OCCURRED', message: 'Publishing failed' };
        }

        case 'PERSIST_RELATIONAL': {
            const { url, title, ivLink } = effect.payload;
            await env.DB.prepare(
                "INSERT OR REPLACE INTO urls (url, title, iv_link, insight, last_enriched) VALUES (?, ?, ?, COALESCE((SELECT insight FROM urls WHERE url = ?), NULL), ?)"
            )
                .bind(url, title, ivLink, url, Date.now())
                .run();
            return { type: 'RELATIONAL_PERSISTED' };
        }

        case 'LOG_TRACE': {
            const { traceId, url, hash, insight, title, ivLink, metadata } = effect.payload;
            if (hash) {
                await env.DB.prepare("INSERT INTO insight_logs (trace_id, url, hash, insight, metadata) VALUES (?, ?, ?, ?, ?)")
                    .bind(traceId, url, hash, insight, JSON.stringify(metadata))
                    .run();
                await env.DB.prepare(
                    "UPDATE urls SET insight = ?, trace_id = COALESCE(?, trace_id), last_enriched = ? WHERE url = ?"
                )
                    .bind(insight, traceId ?? null, Date.now(), url)
                    .run();
                try {
                    await env.DB.prepare("INSERT OR IGNORE INTO content_hashes (hash, title, iv_link) VALUES (?, ?, ?)")
                        .bind(hash, title || '', ivLink || '')
                        .run();
                } catch (e) {
                    console.error("Failed to insert content hash:", e);
                }
            }
            return { type: 'TRACE_PERSISTED' };
        }

        case 'CACHE_VIEW': {
            const { url, payload } = effect.payload;
            await env.FACTS.put(`insight:${url}`, JSON.stringify(payload), { expirationTtl: 86400 });
            return { type: 'CACHE_PERSISTED' };
        }

        case 'CHECK_CONTENT_HASH': {
            try {
                const cached = await env.DB.prepare(
                    "SELECT l.insight, u.title, u.iv_link FROM insight_logs l LEFT JOIN urls u ON l.url = u.url WHERE l.hash = ? ORDER BY l.created_at DESC LIMIT 1"
                ).bind(effect.payload.hash).first<{ insight: string | null; title: string | null; iv_link: string | null }>();
                if (cached?.insight) {
                    return { 
                        type: 'DEDUP_HIT', 
                        insight: cached.insight, 
                        title: cached.title || 'Untitled', 
                        ivLink: cached.iv_link || '' 
                    };
                }
            } catch (err) {
                console.error("Deduplication lookup failed:", err);
            }
            return { type: 'DEDUP_MISS' };
        }

        case 'SEND_TELEGRAM': {
            const { chatId, ...rest } = effect.payload;
            const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, ...rest, parse_mode: 'HTML' })
            });
            const body = await res.json() as Record<string, unknown>;
            if (!res.ok) {
                await env.DB.prepare("INSERT INTO events (event_type, data) VALUES (?, ?)")
                    .bind('API_DELIVERY_FAILURE', JSON.stringify({ method: 'sendMessage', payload: effect.payload, error: body }))
                    .run();
            }
            return null;
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
            const body = await res.json() as Record<string, unknown>;
            if (!res.ok) {
                await env.DB.prepare("INSERT INTO events (event_type, data) VALUES (?, ?)")
                    .bind('API_DELIVERY_FAILURE', JSON.stringify({ method: 'editMessageText', payload: effect.payload, error: body }))
                    .run();
            }
            return null;
        }

        case 'EDIT_TELEGRAM_CAPTION': {
            const { chatId, messageId, ...rest } = effect.payload;
            const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, message_id: messageId, ...rest, parse_mode: 'HTML' })
            });
            const body = await res.json() as Record<string, unknown>;
            if (!res.ok) {
                await env.DB.prepare("INSERT INTO events (event_type, data) VALUES (?, ?)")
                    .bind('API_DELIVERY_FAILURE', JSON.stringify({ method: 'editMessageCaption', payload: effect.payload, error: body }))
                    .run();
            }
            return null;
        }

        default:
            return null;
    }
}
