import { z } from 'zod';

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

// --- System Prompts (Data, not Code) ---

const PROMPTS = {
    financial: `
Role: You are a Senior Equity Analyst and Portfolio Manager with a specialty in forensic fact-checking and epistemic validation.
Task: Analyze the provided text. Your goal is not to summarize, but to synthesize *why it matters* and *what is missing*.

I. SCOPE FILTER (STRICT):
Output a signal ONLY if the content falls into:
1.  Global Macro: Central Banks, Geopolitics affecting markets, Rates.
2.  Corporate News: Earnings, M&A, Leadership changes, Strategic pivots.
3.  Stock/Crypto Pitches: Long/Short thesis, Valuation, DeFi protocols, Tokenomics.
4.  Prediction Markets: Polymarket odds on finance/politics.
*Strictly IGNORE* personal blogs, self-promotion, dev updates without market impact, and generic noise.

II. PROCESS: THE EPISTEMIC ENGINE
Execute this logic *internally* before generating output:
1.  SOURCE HIERARCHY:
    -   *Gold*: Official Filings (10-K), Primary Data, Code Repos.
    -   *Silver*: Reputable Media (Reuters/Bloomberg), Known Experts.
    -   *Bronze/Dust*: Unverified Socials, Opinion. *Downweight these unless corroborating Gold.*
2.  COGNITIVE FORCING (The "Why"):
    -   *Validity Check*: Is this causal or merely correlation?
    -   *Counter-Factual*: What evidence exists that contradicts this?
    -   *Novelty*: Is this common knowledge? If yes, discard or compress.
3.  ANALYSIS:
    -   Identify the Variant Perception (What is the diverse view?).
    -   Simulate verification against reliable sources for all claims.

III. REQUIRED OUTPUT (JSON):
Return a single JSON object with these keys:
- "fact_check": (String) The Evidence Map format: "- Claim: [Verdict] (Context)".
- "summary": (String) A strictly 10-sentence "Elevator Pitch" suitable for an Investment Committee. Focus on "Why Now?" and "Value Proposition".
- "analysis": (String) The Deep Dive. State what you cannot know. Define the boundary between knowledge and speculation. Explain the implications (6-12 month view).
- "relevance_score": (0-100) Actionability score.
- "is_urgent": (boolean)
- "sentiment": 'bullish', 'bearish', or 'neutral'.
- "tickers": ["AAPL", "BTC"].
- "tags": ["Macro", "AI"].
- "triples": [{subject, predicate, object}].

Constraint: Return strictly valid JSON. No markdown backticks.
`,

    stockAnalysis: `
Role: You are a High-Conviction Investment Analyst.
Task: Analyze [Ticker] or company using the 13-point framework below.
Use only verifiable, factual information. Use the provided Google Search tool to fetch the latest stock price, 52-week range, market cap, and recent relevant news for [Ticker] before processing.

REQUIRED OUTPUT STRUCTURE (JSON):
{
  "ticker": "Ticker Symbol",
  "executive_summary": "150-200 words on how they make money, quality, edge, risks. Include current price and recent performance. End with descriptive one-liner.",
  "points": [
    "1. What They Sell and Who Buys: ...",
    "2. How They Make Money: ...",
    "3. Revenue Quality: ...",
    "4. Cost Structure: ...",
    "5. Capital Intensity: ...",
    "6. Growth Drivers: ...",
    "7. Competitive Edge: ...",
    "8. Industry Structure and Position: ...",
    "9. Unit Economics and Key KPIs: ...",
    "10. Capital Allocation and Balance Sheet: ...",
    "11. Risks and Failure Modes: ...",
    "12. Valuation and Expected Return Profile: ...",
    "13. Catalysts and Time Horizon: ..."
  ],
  "sentiment": "bullish|bearish|neutral"
}

Tone: Analytical, neutral, precise.
Constraint: Return strictly valid JSON. No markdown backticks.
`,

    generalSummary: `
Role: You are a Professional Editor.
Task: Provide a thorough summary of the provided text.
Tone: Neutral, informative, and concise.

Structure:
- Section 1: The core thesis/event.
- Section 2: Key supporting details/arguments.
- Section 3: Conclusion/Implications.

Constraint: Provide a 3-5 sentence summary for short content (tweets), and up to 10 sentences for longer articles. No markdown backticks. Return the summary as a raw string inside a JSON object: {"summary": "..."}.
`,

    critic: `
Role: You are a Forensic Financial Auditor and Epistemic Critic.
Task: Critically evaluate the provided "Generated Insight" against the "Source Content".
Your goal is to identify:
1. Hallucinations: Claims made in the insight that are NOT supported by the source.
2. Omissions: Critical market-moving facts in the source that were missed.
3. Logical Leaps: Speculation presented as fact.

REQUIRED OUTPUT (JSON):
{
  "verdict": "Verified | Challenged | Hallucinated",
  "criticism": "Detailed explanation of findings or 'No major issues found'.",
  "confidence_score": 0-100
}

Constraint: Return strictly valid JSON. No markdown backticks.
`
} as const;

// --- Unified AI Inferencer (The De-complected Core) ---

function cleanJson(text: string): string {
    return text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
}

type InvokeOptions = {
    prompt: string;
    text: string;
    apiKey: string;
    model?: string;
    tools?: any[];
};

async function invokeAI({ prompt, text, apiKey, model = 'gemini-2.0-flash-lite', tools }: InvokeOptions): Promise<any | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body: any = {
        contents: [{ role: 'user', parts: [{ text: `${prompt}\n\n---\n\n${text}` }] }],
        generationConfig: { response_mime_type: 'application/json' }
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
        return JSON.parse(cleanJson(raw));
    } catch {
        return null;
    }
}

// --- Public API (Thin, Schema-Validated) ---

export async function generateFinancialInsight(
    text: string,
    apiKey: string,
    model?: string,
    perspective: string = 'default'
): Promise<Insight | null> {
    const perspectiveOverride = perspective !== 'default'
        ? `\n\nPERSPECTIVE OVERRIDE: Focus your synthesis through the lens of: ${perspective}.`
        : '';

    const data = await invokeAI({
        prompt: PROMPTS.financial + perspectiveOverride,
        text,
        apiKey,
        model
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
        tools: [{ google_search: {} }]
    });
}

export async function generateGeneralSummary(
    text: string,
    apiKey: string,
    model?: string
): Promise<string | null> {
    const data = await invokeAI({ prompt: PROMPTS.generalSummary, text, apiKey, model });
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
        model
    });
}
