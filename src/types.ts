import { z } from 'zod';

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
    tickers: z.array(z.string()).optional(),
    publishedTime: z.string().optional()
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
    z.object({ type: z.literal('GENERATE_METADATA'), payload: z.object({ content: z.string(), hints: z.string().optional(), perspective: z.string().optional(), publishedTime: z.string().optional(), model: z.string().optional() }) }),
    z.object({ type: z.literal('GENERATE_DEEP_INSIGHT'), payload: z.object({ content: z.string(), hints: z.string().optional(), perspective: z.string().optional(), model: z.string().optional() }) }),
    z.object({ type: z.literal('GENERATE_GENERAL_SUMMARY'), payload: z.object({ content: z.string(), model: z.string().optional() }) }),
    z.object({ type: z.literal('VERIFY_INSIGHT'), payload: z.any() }),
    z.object({ type: z.literal('RESOLVE_REDIRECTS'), payload: z.any() }),
    z.object({ type: z.literal('CALCULATE_HASH'), payload: z.object({ content: z.string() }) }),
    z.object({ type: z.literal('CHECK_CONTENT_HASH'), payload: z.object({ hash: z.string() }) })
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
    dedupChecked?: boolean;
    dedupCachedInsight?: string;
    qualityTier?: 'financial' | 'general' | 'extractive';
    relevanceScore?: number;
};

export type Observation = 
    | { type: 'REDIRECT_RESOLVED', url: string }
    | { type: 'CONTENT_FETCHED', title: string, content: string, textContent: string, publishedTime?: string }
    | { type: 'INSIGHTS_GENERATED', insight: string, rawInsight: string, relevanceScore: number, financialData?: any }
    | { type: 'STOCK_ANALYSIS_GENERATED', analysis: string }
    | { type: 'VERDICT_GENERATED', verdict: string }
    | { type: 'IV_LINK_GENERATED', ivLink: string }
    | { type: 'HASH_CALCULATED', hash: string }
    | { type: 'RELATIONAL_PERSISTED' }
    | { type: 'TRACE_PERSISTED' }
    | { type: 'CACHE_PERSISTED' }
    | { type: 'DEDUP_HIT', insight: string, title: string, ivLink: string }
    | { type: 'DEDUP_MISS' }
    | { type: 'GENERAL_SUMMARY_GENERATED', summary: string }
    | { type: 'ERROR_OCCURRED', message: string, isTransient?: boolean };

export const WELCOME_MESSAGE = `Welcome to LinxtexBot! 🤖\n\nSend me any link, and I will enrich it with AI-powered insights and an Instant View page.`;
