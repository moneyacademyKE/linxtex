import { type ProcessingState, type Observation } from './types';

export function integrateObservation(state: ProcessingState, observation: Observation): ProcessingState {
    const next = { ...state };
    switch (observation.type) {
        case 'REDIRECT_RESOLVED':
            next.url = observation.url;
            next.phase = 'RESOLVING';
            break;
        case 'CONTENT_FETCHED':
            next.title = observation.title;
            next.content = observation.content;
            next.textContent = observation.textContent;
            next.publishedTime = observation.publishedTime;
            next.fidelityRatio = observation.fidelityRatio;
            next.phase = 'ENRICHING';
            break;
        case 'INSIGHTS_GENERATED':
            next.insight = observation.insight;
            next.metadataAttempted = true;
            next.qualityTier = 'financial';
            next.relevanceScore = observation.relevanceScore ?? (observation as any).relevance_score;
            next.tickers = (observation as any).tickers;
            next.financialData = {
                sentiment: (observation as any).sentiment,
                fact_check: (observation as any).fact_check,
                analysis: (observation as any).analysis,
                is_urgent: (observation as any).is_urgent,
                tags: (observation as any).tags
            };
            break;
        case 'GENERAL_SUMMARY_GENERATED':
            next.insight = observation.summary;
            next.qualityTier = 'general';
            break;
        case 'STOCK_ANALYSIS_GENERATED':
            next.stockAnalysis = observation.analysis;
            break;
        case 'VERDICT_GENERATED':
            next.criticVerdict = observation.verdict;
            break;
        case 'IV_LINK_GENERATED':
            next.ivLink = observation.ivLink;
            break;
        case 'HASH_CALCULATED':
            next.hash = observation.hash;
            break;
        case 'DEDUP_HIT':
            next.insight = observation.insight;
            next.title = observation.title;
            next.ivLink = observation.ivLink;
            next.dedupChecked = true;
            next.phase = 'PERSISTING';
            next.persistedTrace = true;
            next.persistedCache = true;
            break;
        case 'DEDUP_MISS':
            next.dedupChecked = true;
            break;
        case 'RELATIONAL_PERSISTED':
            next.persistedRelational = true;
            break;
        case 'TRACE_PERSISTED':
            next.persistedTrace = true;
            break;
        case 'CACHE_PERSISTED':
            next.persistedCache = true;
            break;
        case 'ERROR_OCCURRED':
            if (observation.message === 'Generation failed') {
                next.metadataAttempted = true;
            } else if (observation.message === 'General summary failed') {
                const text = next.textContent || next.content || '';
                const sentences = text.match(/[^.!?]+[.!?]*/g) || [];
                next.insight = sentences.slice(0, 3).map(s => s.trim()).join(' ');
                next.qualityTier = 'extractive';
            } else if (observation.message === 'Verification failed') {
                next.phase = 'PERSISTING';
            } else if (observation.isTransient) {
                next.lastError = observation.message;
                next.retryCount = (state.retryCount || 0) + 1;
                if (next.retryCount >= 3) {
                    next.error = `Failed to fetch link after 3 attempts: ${observation.message}`;
                    next.phase = 'COMPLETE';
                }
            } else {
                next.error = observation.message;
                next.phase = 'COMPLETE';
            }
            break;
    }

    // Process Critic Verdict while in VERIFYING phase
    if (next.criticVerdict && next.phase === 'VERIFYING') {
        try {
            const verdict = JSON.parse(next.criticVerdict);
            const isBad = verdict.verdict === 'Hallucinated' || 
                          verdict.score < 50 || 
                          verdict.hallucinated === true || 
                          verdict.hallucination === true ||
                          verdict.score <= 40;

            if (isBad) {
                 next.phase = 'HEALING';
                 next.healingHints = verdict.criticism || verdict.correction;
                 next.insight = undefined;
                 next.criticVerdict = undefined;
                 next.metadataAttempted = false;
                 next.deepInsightAttempted = false;
                 next.hash = undefined;
            } else {
                 next.phase = 'PERSISTING';
            }
        } catch {
            next.phase = 'PERSISTING';
        }
    }

    // Phase Transitions & Self-Healing (Pure)
    if (next.phase === 'ENRICHING' && next.insight) {
        if (next.qualityTier === 'financial') {
            next.phase = 'VERIFYING';
        } else {
            next.phase = 'PERSISTING';
        }
    }
    
    // Healing Trigger
    if (next.phase === 'HEALING') {
        const hasRestarted = !next.insight && !next.criticVerdict && !next.metadataAttempted;
        if (hasRestarted) {
            next.phase = 'ENRICHING';
        }
    }

    // Completion Check
    if (next.phase === 'PERSISTING' && next.persistedRelational && next.persistedTrace && next.persistedCache) {
        next.phase = 'COMPLETE';
    }

    return next;
}
