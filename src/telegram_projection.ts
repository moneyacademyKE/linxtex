import type { ProcessingState, ToneTemplate } from './types';
import type { Env, ExecuteEffect } from './executor';

const SKIP_IV_THRESHOLD = 4000;
const LOW_CONTENT_THRESHOLD = 100;

type SuppressedProjection = {
    suppressed: true;
    url: string;
};


const DEFAULT_TONE: ToneTemplate = {
    useEmoji: true,
    showFactCheck: true,
    verbosity: 'standard'
};

function getDisplayTitle(state: ProcessingState, tone: ToneTemplate): string {
    let titlePrefix = '';
    let tickersSuffix = '';

    if (tone.useEmoji && state.financialData?.sentiment) {
        const sentiment = state.financialData.sentiment;
        titlePrefix = sentiment === 'bullish' ? '🟢 ' : sentiment === 'bearish' ? '🔴 ' : '⚪ ';
    }

    if (tone.useEmoji && state.tickers?.length) {
        tickersSuffix = ` #${state.tickers.join(' #')}`;
    }

    const baseTitle = state.title || 'Read Article';
    return `${titlePrefix}${baseTitle}${tickersSuffix}`;
}

function buildOutputText(state: ProcessingState, tone: ToneTemplate): string {
    const displayTitle = getDisplayTitle(state, tone);
    const isCompact = (state.relevanceScore !== undefined && state.relevanceScore <= 70) || tone.verbosity === 'compact';
    const isVerbose = tone.verbosity === 'verbose';

    if (isCompact && state.insight) {
        return `<b>${displayTitle}</b>\n\n<i>${state.insight}</i>\n\n<a href="${state.url}">Original Source</a>`;
    }

    if (state.content && state.content.length < SKIP_IV_THRESHOLD && state.insight) {
        let insightText = `<b>${displayTitle}</b>\n\n<i>${state.insight}</i>\n\n${state.textContent || ''}`;
        if (isVerbose && state.financialData?.fact_check) {
            insightText += `\n\n<b>Fact Check:</b>\n${state.financialData.fact_check}`;
        }
        return insightText.slice(0, 4000);
    }

    if (state.ivLink) {
        let outputText = `<a href="${state.ivLink}">${displayTitle}</a>`;
        if (isVerbose && state.insight) {
            outputText += `\n\n<i>${state.insight}</i>`;
        }
        if (isVerbose && tone.showFactCheck && state.financialData?.fact_check) {
            outputText += `\n\n<b>Fact Check:</b>\n${state.financialData.fact_check}`;
        }
        return outputText;
    }

    return `<a href="${state.url}">${displayTitle}</a>`;
}

async function persistSuppressionEvent(env: Env, state: ProcessingState, eventType: string, data: Record<string, unknown>): Promise<void> {
    if (!env.DB || !state.chatId) return;
    await env.DB.prepare('INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)')
        .bind(eventType, JSON.stringify(data), state.chatId)
        .run();
}

export async function projectTelegramOutcome(
    state: ProcessingState,
    env: Env,
    executor: ExecuteEffect,
    toneTemplate?: ToneTemplate
): Promise<SuppressedProjection | null> {
    if (!state.chatId) {
        return null;
    }

    if (state.content && state.content.length < LOW_CONTENT_THRESHOLD) {
        console.log(`[RESOLVE_LINK] Suppressing low-fidelity signal (< ${LOW_CONTENT_THRESHOLD} chars)`);
        await persistSuppressionEvent(env, state, 'SIGNAL_SUPPRESSED', { url: state.url, length: state.content.length });
        return { suppressed: true, url: state.url };
    }

    if (state.relevanceScore !== undefined && state.relevanceScore < 40) {
        console.log(`[RESOLVE_LINK] Suppressing low-relevance signal (relevance_score: ${state.relevanceScore})`);
        await persistSuppressionEvent(env, state, 'SIGNAL_LOW_CONVICTION', { url: state.url, score: state.relevanceScore });
        return { suppressed: true, url: state.url };
    }

    const tone = toneTemplate || DEFAULT_TONE;
    const text = buildOutputText(state, tone);

    if (state.isMultiPost) {
        const effect = {
            type: 'SEND_TELEGRAM' as const,
            payload: { chatId: state.chatId, text }
        };
        await executor(effect, env);
        return null;
    }

    if (state.messageId) {
        const effect = {
            type: 'EDIT_TELEGRAM_MESSAGE' as const,
            payload: { chatId: state.chatId, messageId: state.messageId, text }
        };
        await executor(effect, env);
        return null;
    }

    return null;
}
