import { 
    type ProcessingState,
    type LinkResolutionResult,
    type ExecutorContext,
    type TelegramEntity,
    type ToneTemplate
} from './types';
import { decideNextEffects, integrateObservation } from './domain';
import { executeEffect, type Env, type ExecuteEffect } from './executor';
import { projectTelegramOutcome } from './telegram_projection';

export async function resolveLink(
    originalUrl: string, 
    expandedUrl: string, 
    env: Env, 
    ctx: ExecutionContext, 
    chatId?: number, 
    traceId?: string, 
    perspective?: string,
    executor: ExecuteEffect = executeEffect,
    messageId?: number,
    text?: string,
    entities?: TelegramEntity[],
    isMultiPost?: boolean,
    toneTemplate?: ToneTemplate
): Promise<LinkResolutionResult> {
    console.log(`[RESOLVE_LINK] ENTERING for ${expandedUrl} (trace: ${traceId})`);
    
    let previousInsight: string | undefined = undefined;
    try {
        if (env.DB) {
            const stmt = env.DB.prepare("SELECT insight FROM urls WHERE url = ? LIMIT 1").bind(expandedUrl);
            if (typeof stmt.first === 'function') {
                const cached = await stmt.first<{ insight: string | null }>();
                if (cached?.insight) {
                    previousInsight = cached.insight;
                }
            }
        }
    } catch (e) {
        console.error("Failed to pre-lookup previous insight:", e);
    }

    let state: ProcessingState = { originalUrl, url: expandedUrl, phase: 'RESOLVING', traceId, perspective, chatId, messageId, isMultiPost, previousInsight };
    const executorContext: ExecutorContext = { ctx, messageId, text, entities, toneTemplate };

    let iterations = 0;
    while (state.phase !== 'COMPLETE' && iterations < 15) {
        iterations++;
        const effects = decideNextEffects(state);
        if (effects.length === 0) break;

        console.log(`[RESOLVE_LINK] Tick: ${effects.length} effects (trace: ${traceId})`);
        
        const observations = await Promise.all(effects.map(async effect => {
            const obs = await executor(effect, env, executorContext);
            return obs;
        }));
        
        for (const observation of observations) {
            if (observation) {
                state = integrateObservation(state, observation);
            }
        }
    }

    const projection = await projectTelegramOutcome(state, env, executor, toneTemplate);
    if (projection?.suppressed) {
        return projection;
    }

    return { 
        originalUrl, 
        ivLink: state.ivLink || expandedUrl, 
        title: state.title || 'Untitled', 
        insight: state.stockAnalysis || state.insight 
    };
}

