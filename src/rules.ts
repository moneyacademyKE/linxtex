import { type ProcessingState, type Effect } from './types';

export type Rule = (state: ProcessingState) => Effect[];

const discoveryRule: Rule = (state) => {
    if (state.phase === 'RESOLVING' && !state.content) {
        return [{ type: 'FETCH_LINK', payload: { url: state.url } }];
    }
    return [];
};

const hashingRule: Rule = (state) => {
    if (state.phase === 'ENRICHING' && state.content && !state.hash) {
        return [{ type: 'CALCULATE_HASH', payload: { content: state.textContent || state.content || '' } }];
    }
    return [];
};

const deduplicationRule: Rule = (state) => {
    if (state.phase === 'ENRICHING' && state.hash && !state.dedupChecked) {
        return [{ type: 'CHECK_CONTENT_HASH', payload: { hash: state.hash } }];
    }
    return [];
};

const metadataRule: Rule = (state) => {
    const isDedupOk = state.hash ? state.dedupChecked === true : true;
    if ((state.phase === 'ENRICHING' || state.phase === 'HEALING') && !state.insight && !state.metadataAttempted && isDedupOk) {
        const content = state.textContent || state.content || '';
        const hints = state.healingHints;
        const perspective = state.perspective;
        if (content) {
            return [{
                type: 'GENERATE_METADATA',
                payload: {
                    content,
                    hints,
                    perspective,
                    publishedTime: state.publishedTime,
                    model: 'gemini-3.1-flash-lite-preview'
                }
            }];
        }
    }
    return [];
};

const fallbackSummaryRule: Rule = (state) => {
    if (state.phase === 'ENRICHING' && !state.insight && state.metadataAttempted && !state.qualityTier) {
        const content = state.textContent || state.content || '';
        if (content) {
            return [{ type: 'GENERATE_GENERAL_SUMMARY', payload: { content, model: 'gemini-3.1-flash-lite-preview' } }];
        }
    }
    return [];
};

const synthesisRule: Rule = (state) => {
    if (state.phase === 'ENRICHING' && state.insight && !state.stockAnalysis) {
        const financial = state.financialData;
        if (financial && (financial.tickers?.length > 0)) {
            return [{
                type: 'GENERATE_DEEP_INSIGHT',
                payload: {
                    content: state.textContent || state.content || '',
                    hints: state.healingHints,
                    perspective: state.perspective,
                    model: 'gemini-3.1-flash-lite-preview'
                }
            }];
        }
    }
    return [];
};

const publishingRule: Rule = (state) => {
    if (state.content && state.insight && !state.ivLink) {
        if (state.content.length >= 4000) {
            return [{
                type: 'PUBLISH_TELEGRAPH',
                payload: { title: state.title || 'Untitled', content: state.content, baseUrl: state.url }
            }];
        }
    }
    return [];
};

const criticRule: Rule = (state) => {
    if (state.phase === 'VERIFYING' && !state.criticVerdict) {
        return [{ type: 'VERIFY_INSIGHT', payload: { content: state.textContent || state.content || '', insight: state.insight || '', model: 'gemini-3.1-flash-lite-preview' } }];
    }
    return [];
};

const persistenceRule: Rule = (state) => {
    const skipIV = state.content && state.content.length < 4000;
    if (state.phase === 'PERSISTING' && state.title && state.insight && (state.ivLink || skipIV)) {
        const effects: Effect[] = [];
        
        if (!state.persistedRelational) {
            effects.push({ 
                type: 'PERSIST_RELATIONAL', 
                payload: { url: state.url, title: state.title, ivLink: state.ivLink || '' } 
            });
        }
        
        if (!state.persistedTrace) {
            effects.push({ 
                type: 'LOG_TRACE', 
                payload: {
                    traceId: state.traceId || 'unknown',
                    url: state.url,
                    hash: state.hash || '',
                    insight: state.stockAnalysis || state.insight,
                    title: state.title || '',
                    ivLink: state.ivLink || '',
                    metadata: {
                        model: 'gemini-3.1-flash-lite-preview',
                        timestamp: Date.now(),
                        perspective: state.perspective,
                        retryCount: state.retryCount || 0,
                        healingHints: state.healingHints
                    }
                }
            });
        }
        
        if (!state.persistedCache) {
            effects.push({ 
                type: 'CACHE_VIEW', 
                payload: {
                    url: state.url,
                    payload: { 
                        title: state.title, 
                        ivLink: state.ivLink, 
                        insight: state.stockAnalysis || state.insight, 
                        hash: state.hash 
                    }
                }
            });
        }
        
        return effects;
    }
    return [];
};

export function decideNextEffects(state: ProcessingState): Effect[] {
    if (state.phase === 'COMPLETE' || state.error) return [];
    const rules: Rule[] = [
        discoveryRule,
        hashingRule,
        deduplicationRule,
        metadataRule,
        fallbackSummaryRule,
        synthesisRule,
        publishingRule,
        criticRule,
        persistenceRule
    ];
    const effects = rules.flatMap(rule => rule(state));
    return effects;
}
