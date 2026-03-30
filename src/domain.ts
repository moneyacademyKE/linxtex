import { parseHTML } from 'linkedom';
import { z } from 'zod';
import PARSING_RULES from './parsing_rules.json';

// v1.0.5 - Ultimate Decoupled Orchestration

// --- Phase 2: Schema First ---

export const LinkInsightSchema = z.object({
    url: z.string(),
    title: z.string(),
    ivLink: z.string(),
    insight: z.string(),
    hash: z.string().optional(),
    metadata: z.object({
        model: z.string().optional(),
        timestamp: z.number().optional(),
        traceId: z.string().optional(),
        isTwitter: z.boolean().optional(),
        perspective: z.string().optional(),
        retryCount: z.number().optional(),
        criticVerdict: z.string().optional(),
        healingHints: z.string().optional()
    }).passthrough().optional()
});

export type LinkInsight = z.infer<typeof LinkInsightSchema>;

export const ArticleSchema = z.object({
    title: z.string(),
    content: z.string(),
    textContent: z.string().optional(),
    url: z.string().optional(),
    tickers: z.array(z.string()).optional()
});

export type Article = z.infer<typeof ArticleSchema>;

export const TelegraphNodeSchema: z.ZodType<any> = z.lazy(() =>
    z.union([
        z.string(),
        z.object({
            tag: z.string(),
            attrs: z.record(z.string(), z.string()).optional(),
            children: z.array(z.any()).optional()
        })
    ])
);

export const EffectSchema = z.union([
    z.object({ type: z.literal('SEND_TELEGRAM'), payload: z.any() }),
    z.object({ type: z.literal('PUBLISH_TELEGRAPH'), payload: z.any() }),
    z.object({ type: z.literal('PERSIST_RELATIONAL'), payload: z.object({ url: z.string(), title: z.string(), ivLink: z.string().optional() }) }),
    z.object({ type: z.literal('LOG_TRACE'), payload: z.object({ traceId: z.string(), url: z.string(), hash: z.string().optional(), insight: z.string(), metadata: z.any() }) }),
    z.object({ type: z.literal('CACHE_VIEW'), payload: z.object({ url: z.string(), payload: z.any() }) }),
    z.object({ type: z.literal('EDIT_TELEGRAM_MESSAGE'), payload: z.object({ chatId: z.number(), messageId: z.number(), text: z.string(), entities: z.any().optional() }) }),
    z.object({ type: z.literal('EDIT_TELEGRAM_CAPTION'), payload: z.object({ chatId: z.number(), messageId: z.number(), caption: z.string(), entities: z.any().optional() }) }),
    z.object({ type: z.literal('LOG_EVENT'), payload: z.any() }),
    z.object({ type: z.literal('LOG_INSIGHT'), payload: z.any() }),
    z.object({ type: z.literal('FETCH_LINK'), payload: z.any() }),
    z.object({ type: z.literal('GENERATE_METADATA'), payload: z.any() }),
    z.object({ type: z.literal('GENERATE_DEEP_INSIGHT'), payload: z.any() }),
    z.object({ type: z.literal('VERIFY_INSIGHT'), payload: z.any() }),
    z.object({ type: z.literal('RESOLVE_REDIRECTS'), payload: z.any() }),
    z.object({ type: z.literal('CALCULATE_HASH'), payload: z.object({ content: z.string() }) })
]);

export type Effect = z.infer<typeof EffectSchema>;

export type MachinePhase = 'RESOLVING' | 'ENRICHING' | 'VERIFYING' | 'HEALING' | 'PERSISTING' | 'COMPLETE';

export type ProcessingState = {
    originalUrl: string;
    url: string;
    phase: MachinePhase;
    traceId?: string;
    chatId?: number;
    messageId?: number;
    isMultiPost?: boolean;
    perspective?: string;
    title?: string;
    content?: string;
    textContent?: string;
    hash?: string;
    ivLink?: string;
    insight?: string;
    stockAnalysis?: string;
    financialData?: any;
    tickers?: string[];
    criticVerdict?: string;
    error?: string;
    retryCount?: number;
    lastError?: string;
    healingHints?: string;
    metadataAttempted?: boolean;
    deepInsightAttempted?: boolean;
    persistedRelational?: boolean;
    persistedTrace?: boolean;
    persistedCache?: boolean;
};

export type Observation = 
    | { type: 'REDIRECT_RESOLVED', url: string }
    | { type: 'CONTENT_FETCHED', title: string, content: string, textContent: string }
    | { type: 'INSIGHTS_GENERATED', insight: string, rawInsight: string, relevanceScore: number, financialData?: any }
    | { type: 'STOCK_ANALYSIS_GENERATED', analysis: string }
    | { type: 'VERDICT_GENERATED', verdict: string }
    | { type: 'IV_LINK_GENERATED', ivLink: string }
    | { type: 'HASH_CALCULATED', hash: string }
    | { type: 'RELATIONAL_PERSISTED' }
    | { type: 'TRACE_PERSISTED' }
    | { type: 'CACHE_PERSISTED' }
    | { type: 'ERROR_OCCURRED', message: string, isTransient?: boolean };

// --- Pure Orchestration ---

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
            next.phase = 'ENRICHING';
            break;
        case 'INSIGHTS_GENERATED':
            next.insight = observation.insight;
            next.financialData = observation.financialData;
            next.metadataAttempted = true;
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
            if (observation.isTransient) {
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

    // Completion Check
    if (next.phase === 'PERSISTING' && next.persistedRelational && next.persistedTrace && next.persistedCache) {
        next.phase = 'COMPLETE';
    }

    // Phase Transitions & Self-Healing (Pure)
    if (next.phase === 'ENRICHING' && next.insight) next.phase = 'VERIFYING';
    
    // Healing Trigger
    if (next.phase === 'HEALING') {
        const hasRestarted = !next.insight && !next.criticVerdict && !next.metadataAttempted;
        if (hasRestarted) {
            next.phase = 'ENRICHING';
        }
    }

    if (next.criticVerdict && next.phase === 'VERIFYING') {
        try {
            const verdict = JSON.parse(next.criticVerdict);
            // Self-Healing Detection Logic (Data-driven intent)
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
    return next;
}

export function transformToNitter(url: string | null | undefined): string | null | undefined {
    if (!url) return url;
    try {
        const hasTrailingSlash = url.endsWith('/');
        const parsed = new URL(url);
        if (parsed.hostname.includes('twitter.com') || parsed.hostname.includes('x.com')) {
            parsed.hostname = 'nitter.net';
        }
        let result = parsed.toString();
        if (!hasTrailingSlash && result.endsWith('/')) {
            result = result.slice(0, -1);
        }
        return result;
    } catch {
        return url;
    }
}

// --- Rule Definitions (Hickey: Functional Intent) ---

export type Rule = (state: ProcessingState) => Effect[];

const discoveryRule: Rule = (state) => {
    if (state.phase === 'RESOLVING' && !state.content) return [{ type: 'FETCH_LINK', payload: { url: state.url } }];
    return [];
};

const hashingRule: Rule = (state) => {
    // Only calculate hash during enrichment phase to keep other phases clean
    if (state.phase === 'ENRICHING' && state.content && !state.hash) {
        return [{ type: 'CALCULATE_HASH', payload: { content: state.textContent || state.content || '' } }];
    }
    return [];
};

const metadataRule: Rule = (state) => {
    if ((state.phase === 'ENRICHING' || state.phase === 'HEALING') && !state.insight && !state.metadataAttempted) {
        const content = state.textContent || state.content || '';
        const hints = state.healingHints;
        if (content) return [{ type: 'GENERATE_METADATA', payload: { content, hints } }];
    }
    return [];
};

const synthesisRule: Rule = (state) => {
    if (state.phase === 'ENRICHING' && state.insight && !state.stockAnalysis) {
        const financial = state.financialData;
        if (financial && (financial.tickers?.length > 0)) {
            return [{ type: 'GENERATE_DEEP_INSIGHT', payload: { content: state.textContent || state.content || '' } }];
        }
    }
    return [];
};

const publishingRule: Rule = (state) => {
    // Intent: We want an Instant View page if we have content and insight, AND content is long enough
    if (state.content && state.insight && !state.ivLink) {
        if (state.content.length >= 4000) {
            return [{ type: 'PUBLISH_TELEGRAPH', payload: { title: state.title || 'Untitled', content: state.content, baseUrl: state.url } }];
        }
    }
    return [];
};

const criticRule: Rule = (state) => {
    if (state.phase === 'VERIFYING' && !state.criticVerdict) {
        return [{ type: 'VERIFY_INSIGHT', payload: { content: state.textContent || state.content || '', insight: state.insight || '' } }];
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
    const rules: Rule[] = [discoveryRule, hashingRule, metadataRule, synthesisRule, publishingRule, criticRule, persistenceRule];
    const effects = rules.flatMap(rule => rule(state));
    return effects;
}

export function replaceLinksInText(text: string, map: Record<string, string>): string {
    let result = text;
    for (const [oldUrl, newUrl] of Object.entries(map)) {
        result = result.replace(oldUrl, newUrl);
    }
    return result;
}

// --- Transformation Utilities ---

export function detectUrls(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls: string[] = [];
    let match;
    while ((match = urlRegex.exec(text)) !== null) urls.push(match[1]);
    return urls;
}

export function extractUrlsFromEntities(text: string, entities?: any[]): string[] {
    const urls = new Set<string>();
    if (entities) {
        for (const entity of entities) {
            if (entity.type === 'url') urls.add(text.substring(entity.offset, entity.offset + entity.length));
            else if (entity.type === 'text_link') urls.add(entity.url);
        }
    }
    return Array.from(urls);
}

export function isHomepage(url: string): boolean {
    try {
        const parsed = new URL(url);
        // Reject root pages
        if (parsed.pathname === '/' || parsed.pathname === '') return true;
        // Reject CDN image/media URLs
        const isImagePath = /\.(png|jpg|jpeg|gif|webp|svg|mp4|pdf|mp3|wav)(\?|$)/i.test(parsed.pathname);
        if (isImagePath) return true;
        // Reject known CDN/media-only hostnames
        const ignoredHosts = ['cdn-cgi', 'media.beehiiv.com', 'substackcdn.com', 'pbs.twimg.com'];
        if (ignoredHosts.some(h => parsed.hostname.includes(h))) return true;
        return false;
    } catch {
        return true; // Malformed URL → ignore
    }
}

/** 
 * Heuristic to distinguish "Blogpost" links from "Parent" links.
 * Prefers links with deeper paths and avoids root domains or social profiles if a subpage exists.
 * Returns all URLs sorted by their heuristic quality score.
 */
export function filterBlogpostLinks(urls: string[]): { url: string, score: number }[] {
    const scores = urls.map(url => {
        try {
            const parsed = new URL(url);
            let score = 0;
            
            // Prefer deeper paths (indicates article vs homepage)
            const pathParts = parsed.pathname.split('/').filter(Boolean);
            score += pathParts.length * 10;
            
            // Penalize root domains
            if (pathParts.length === 0) score -= 50;
            
            // Specialized Social Profile detection (e.g. x.com/user vs x.com/user/status/123)
            const socialDomains = ['twitter.com', 'x.com', 'farcaster.xyz', 'instagram.com', 'facebook.com', 'linkedin.com', 'binance.com', 'coinmarketcap.com'];
            if (socialDomains.some(d => parsed.hostname.includes(d))) {
                // If it's just a profile (path length <= 1 for X/Twitter/Farcaster)
                if (pathParts.length <= 1) {
                    score -= 150; // Heavily penalize social profiles
                } else {
                    score -= 50; // Still penalize social content relative to blogs
                }
            }

            // Prefer known blog/research platforms
            const blogPlatforms = ['substack.com', 'medium.com', 'ghost.io', 'wordpress.com', 'mirror.xyz', 'paragraph.xyz', 'youtube.com', 'github.com'];
            if (blogPlatforms.some(d => parsed.hostname.includes(d))) {
                score += 50;
            }

            return { url, score };
        } catch {
            return { url, score: -1000 };
        }
    });

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);
    return scores;
}

export async function calculateHash(content: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function convertToTelegraphNodes(html: string, baseUrl?: string, rules: any = PARSING_RULES): { nodes: any[], tickers: string[] } {
    const { window } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
    const body = window.document.body;
    if (!body) return { nodes: [], tickers: [] };
    const state = { tickers: new Set<string>(), rules, baseUrl };
    const nodes = Array.from(body.childNodes)
        .map(n => pipeline(n, state))
        .flat()
        .filter(n => {
            if (typeof n === 'string') return n.trim().length > 0;
            return n !== null;
        });
    return { nodes, tickers: Array.from(state.tickers) };
}

/** Template-aware HTML→Telegraph conversion (absorbs templates.ts) */
export function transduceContent(
    html: string,
    textFallback: string,
    format: 'default' | 'markdown' = 'default',
    baseUrl?: string
): any[] {
    if (format === 'markdown') {
        return [{ tag: 'pre', children: [textFallback || 'No content'] }];
    }
    const { nodes } = convertToTelegraphNodes(html, baseUrl);
    if (nodes.length === 0) return [{ tag: 'p', children: [textFallback || 'No content extracted'] }];
    return nodes;
}

function normalizeUrl(url: string, baseUrl?: string): string {
    if (!baseUrl) return url;
    try {
        return new URL(url, baseUrl).toString();
    } catch {
        return url;
    }
}

function pipeline(domNode: any, state: { tickers: Set<string>, rules: any, baseUrl?: string }): any {
    if (domNode.nodeType === 3) {
        const text = domNode.textContent || '';
        // Extract tickers from text nodes
        const tickerRegex = /\$([A-Z]{1,5})/g;
        let match;
        while ((match = tickerRegex.exec(text)) !== null) {
            state.tickers.add(match[1]);
        }
        return text;
    }
    if (domNode.nodeType !== 1) return null;
    const rules = state.rules || PARSING_RULES;
    let tag = (domNode.tagName || '').toLowerCase();
    if (rules.transformations && rules.transformations[tag] !== undefined) tag = rules.transformations[tag];
    if (!tag || !rules.allowedTags.includes(tag)) return null;
    const attrs: any = {};
    for (const attr of Array.from(domNode.attributes || [])) {
        const a = attr as any;
        if (rules.allowedAttributes.includes(a.name)) {
            let val = a.value;
            if ((tag === 'img' || tag === 'video' || tag === 'iframe') && a.name === 'src') {
                val = normalizeUrl(val, state.baseUrl);
            } else if (tag === 'a' && a.name === 'href') {
                val = normalizeUrl(val, state.baseUrl);
            }
            attrs[a.name] = val;
        }
    }
    const children = Array.from(domNode.childNodes)
        .map(n => pipeline(n, state))
        .flat()
        .filter(c => c !== null && c !== '');
    const node: any = { tag };
    if (Object.keys(attrs).length > 0) node.attrs = attrs;
    if (children.length > 0) node.children = children;
    return node;
}

export function formatInstantViewResponse(title: string, originalUrl: string, ivLink: string): string {
    const domain = new URL(originalUrl).hostname;
    return `<b>${title}</b>\n\nfrom ${domain}\n${ivLink}`;
}

export const WELCOME_MESSAGE = `Welcome to LinxtexBot! 🤖\n\nSend me any link, and I will enrich it with AI-powered insights and an Instant View page.`;
