import { z } from 'zod';
import { PROMPTS } from './prompts';

// --- Schema Definitions ---

export const InsightSchema = z.object({
    fact_check: z.string(),
    summary: z.string(),
    analysis: z.string(),
    relevance_score: z.number(),
    is_urgent: z.boolean(),
    sentiment: z.enum(['bullish', 'bearish', 'neutral']),
    tickers: z.array(z.string()),
    tags: z.array(z.string()),
    triples: z.array(z.object({
        subject: z.string(),
        predicate: z.string(),
        object: z.string()
    }))
});

export type Insight = z.infer<typeof InsightSchema>;

const InsightJsonSchema = {
    type: 'object',
    properties: {
        fact_check: { type: 'string' },
        summary: { type: 'string' },
        analysis: { type: 'string' },
        relevance_score: { type: 'number' },
        is_urgent: { type: 'boolean' },
        sentiment: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
        tickers: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        triples: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    subject: { type: 'string' },
                    predicate: { type: 'string' },
                    object: { type: 'string' }
                },
                required: ['subject', 'predicate', 'object']
            }
        }
    },
    required: ['fact_check', 'summary', 'analysis', 'relevance_score', 'is_urgent', 'sentiment', 'tickers', 'tags', 'triples']
};

const StockAnalysisJsonSchema = {
    type: 'object',
    properties: {
        ticker: { type: 'string' },
        executive_summary: { type: 'string' },
        points: { type: 'array', items: { type: 'string' } },
        sentiment: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] }
    },
    required: ['ticker', 'executive_summary', 'points', 'sentiment']
};

const GeneralSummaryJsonSchema = {
    type: 'object',
    properties: {
        summary: { type: 'string' }
    },
    required: ['summary']
};

const CriticJsonSchema = {
    type: 'object',
    properties: {
        verdict: { type: 'string', enum: ['Verified', 'Challenged', 'Hallucinated'] },
        criticism: { type: 'string' },
        confidence_score: { type: 'number' }
    },
    required: ['verdict', 'criticism', 'confidence_score']
};

// --- Unified AI Inferencer (The De-complected Core) ---

type InvokeOptions = {
    prompt: string;
    text: string;
    apiKey: string;
    model?: string;
    tools?: any[];
    schema?: any;
};

async function invokeAI({ prompt, text, apiKey, model = 'gemini-3.1-flash-lite-preview', tools, schema }: InvokeOptions): Promise<any | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const generationConfig: any = { response_mime_type: 'application/json' };
    if (schema) {
        generationConfig.response_schema = schema;
    }

    const body: any = {
        contents: [{ role: 'user', parts: [{ text: `${prompt}\n\n---\n\n${text}` }] }],
        generationConfig
    };

    if (tools) body.tools = tools;

    let response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    // Fallback: If grounding (tools) fails, retry without tools
    if (!response.ok && tools) {
        console.warn(`Gemini API grounding failed (${response.status}), retrying without tools...`);
        const { tools: _tools, ...bodyWithoutTools } = body;
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyWithoutTools)
        });
    }

    if (!response.ok) {
        console.error(`[GEMINI] API Error: Gemini API error: ${response.status} ${await response.text()}`);
        return null;
    }

    const data: any = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// --- Public API (Thin, Schema-Validated) ---

export async function generateFinancialInsight(
    text: string,
    apiKey: string,
    hints?: string,
    model?: string,
    perspective: string = 'default'
): Promise<Insight | null> {
    const perspectiveOverride = perspective !== 'default'
        ? `\n\nPERSPECTIVE OVERRIDE: Focus your synthesis through the lens of: ${perspective}.`
        : '';
    
    const healingOverride = hints 
        ? `\n\nHEALING HINTS (CRITICAL): The previous generation was flagged for errors. Please correct based on this feedback:\n${hints}`
        : '';

    const data = await invokeAI({
        prompt: PROMPTS.financial + perspectiveOverride + healingOverride,
        text,
        apiKey,
        model,
        schema: InsightJsonSchema
    });

    if (!data) return null;
    const result = InsightSchema.safeParse(data);
    return result.success ? result.data : null;
}

export async function generateStockAnalysis(
    ticker: string,
    text: string,
    apiKey: string,
    model?: string
): Promise<any | null> {
    return invokeAI({
        prompt: `${PROMPTS.stockAnalysis}\n\nTarget Ticker: ${ticker}`,
        text,
        apiKey,
        model,
        tools: [{ google_search: {} }],
        schema: StockAnalysisJsonSchema
    });
}

export async function generateGeneralSummary(
    text: string,
    apiKey: string,
    model?: string
): Promise<string | null> {
    const data = await invokeAI({ prompt: PROMPTS.generalSummary, text, apiKey, model, schema: GeneralSummaryJsonSchema });
    return data?.summary ?? null;
}

export async function verifyInsight(
    sourceText: string,
    insightText: string,
    apiKey: string,
    model?: string
): Promise<any | null> {
    return invokeAI({
        prompt: PROMPTS.critic,
        text: `Source Content:\n${sourceText}\n\nGenerated Insight:\n${insightText}`,
        apiKey,
        model,
        schema: CriticJsonSchema
    });
}
