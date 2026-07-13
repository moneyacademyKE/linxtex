import { 
    decideNextEffects, 
    integrateObservation, 
    type ProcessingState 
} from './domain';
import { executeEffect, type Env } from './executor';

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
    isMultiPost?: boolean,
    toneTemplate?: any
): Promise<any> {
    console.log(`[RESOLVE_LINK] ENTERING for ${expandedUrl} (trace: ${traceId})`);
    
    let previousInsight: string | undefined = undefined;
    try {
        if (env.DB) {
            const stmt = env.DB.prepare("SELECT insight FROM urls WHERE url = ? LIMIT 1").bind(expandedUrl);
            if (typeof stmt.first === 'function') {
                const cached = await stmt.first();
                if (cached && cached.insight) {
                    previousInsight = cached.insight as string;
                }
            }
        }
    } catch (e) {
        console.error("Failed to pre-lookup previous insight:", e);
    }

    let state: ProcessingState = { originalUrl, url: expandedUrl, phase: 'RESOLVING', traceId, perspective, chatId, messageId, isMultiPost, previousInsight };

    let iterations = 0;
    while (state.phase !== 'COMPLETE' && iterations < 15) {
        iterations++;
        const effects = decideNextEffects(state);
        if (effects.length === 0) break;

        console.log(`[RESOLVE_LINK] Tick: ${effects.length} effects (trace: ${traceId})`);
        
        const observations = await Promise.all(effects.map(async effect => {
            const obs = await executor(effect, env);
            if (!obs) {
                if (effect.type === 'LOOKUP_PREVIOUS_INSIGHT') {
                    return { type: 'PREVIOUS_INSIGHT_MISS' };
                }
                if (effect.type === 'CHECK_CONTENT_HASH') {
                    return { type: 'DEDUP_MISS' };
                }
            }
            return obs;
        }));
        
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
        const tone = toneTemplate || { useEmoji: true, showFactCheck: true, verbosity: 'standard' };

        // Skip processing if content is too short (junk/failed extraction)
        if (state.content && state.content.length < lowContentThreshold) {
            console.log(`[RESOLVE_LINK] Suppressing low-fidelity signal (< ${lowContentThreshold} chars)`);
            await env.DB.prepare("INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)")
                .bind('SIGNAL_SUPPRESSED', JSON.stringify({ url: state.url, length: state.content.length }), state.chatId)
                .run();
            return { suppressed: true, url: state.url };
        }

        if (state.relevanceScore !== undefined && state.relevanceScore < 40) {
            console.log(`[RESOLVE_LINK] Suppressing low-relevance signal (relevance_score: ${state.relevanceScore})`);
            await env.DB.prepare("INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)")
                .bind('SIGNAL_LOW_CONVICTION', JSON.stringify({ url: state.url, score: state.relevanceScore }), state.chatId)
                .run();
            return { suppressed: true, url: state.url };
        }

        let titlePrefix = "";
        let tickersSuffix = "";
        if (tone.useEmoji && state.financialData?.sentiment) {
            const sentiment = state.financialData.sentiment;
            titlePrefix = sentiment === 'bullish' ? '🟢 ' : sentiment === 'bearish' ? '🔴 ' : '⚪ ';
        }
        if (tone.useEmoji && state.tickers?.length) {
            tickersSuffix = ` #${state.tickers.join(' #')}`;
        }

        const baseTitle = state.title || 'Read Article';
        const displayTitle = `${titlePrefix}${baseTitle}${tickersSuffix}`;

        const isCompact = (state.relevanceScore !== undefined && state.relevanceScore <= 70) || tone.verbosity === 'compact';
        const isVerbose = tone.verbosity === 'verbose';
        
        if (isCompact && state.insight) {
            // Compact Inline Delivery: Title + Summary only (no full textContent)
            outputText = `<b>${displayTitle}</b>\n\n<i>${state.insight}</i>\n\n<a href="${state.url}">Original Source</a>`;
            console.log(`[RESOLVE_LINK] Projecting compact content (score: ${state.relevanceScore})`);
        } else if (state.content && state.content.length < skipIVThreshold && state.insight) {
            // Short Content: Deliver text directly (Insight + Content)
            let insightText = `<b>${displayTitle}</b>\n\n<i>${state.insight}</i>\n\n${state.textContent || ''}`;
            if (isVerbose && state.financialData?.fact_check) {
                insightText += `\n\n<b>Fact Check:</b>\n${state.financialData.fact_check}`;
            }
            outputText = insightText.slice(0, 4000); 
            console.log(`[RESOLVE_LINK] Projecting direct content (length: ${state.content.length})`);
        } else if (state.ivLink) {
            // Standard Case: title-masked IV link
            outputText = `<a href="${state.ivLink}">${displayTitle}</a>`;
            if (isVerbose && state.insight) {
                outputText += `\n\n<i>${state.insight}</i>`;
            }
            if (isVerbose && tone.showFactCheck && state.financialData?.fact_check) {
                outputText += `\n\n<b>Fact Check:</b>\n${state.financialData.fact_check}`;
            }
            console.log(`[RESOLVE_LINK] Projecting title-masked IV link (trace: ${traceId})`);
        } else {
            // Fallback for failed/skipped IV without enough context
            const fallbackLink = `<a href="${state.url}">${displayTitle}</a>`;
            outputText = fallbackLink;
        }

        if (state.isMultiPost) {
            await executor({
                type: 'SEND_TELEGRAM',
                payload: { chatId: state.chatId, text: outputText }
            }, env);
        } else if (state.messageId) {
            await executor({
                type: 'EDIT_TELEGRAM_MESSAGE',
                payload: { chatId: state.chatId, messageId: state.messageId, text: outputText }
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
