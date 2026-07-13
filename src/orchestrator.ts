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
