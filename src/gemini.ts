import { z } from 'zod';

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

function cleanJsonResponse(text: string): string {
    // Remove markdown code blocks if present (heuristic for Hickey Mode robustness)
    return text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
}

const SYSTEM_PROMPT = `
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
`;

const STOCK_ANALYSIS_PROMPT = `
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
`;

async function callGemini(url: string, body: any): Promise<any | null> {
    let response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    // Fallback: If grounding (tools) fails, retry without tools
    if (!response.ok && body.tools) {
        console.warn(`Gemini API grounding failed (${response.status}), retrying without tools...`);
        const { tools, ...bodyWithoutTools } = body;
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyWithoutTools)
        });
    }

    if (!response.ok) {
        const errorText = await response.text();
        return { error: `Gemini API error: ${response.status} ${errorText}` };
    }

    return await response.json();
}

export async function generateFinancialInsight(text: string, apiKey: string, model: string = 'gemini-3.1-flash-lite-preview', perspective: string = 'default'): Promise<Insight | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const perspectiveInstructions = perspective !== 'default' 
        ? `\n\nIV. PERSPECTIVE OVERRIDE: Focus your synthesis through the lens of: ${perspective}. Adjust your "ANALYSIS" and "SENTIMENT" accordingly.`
        : "";

    const data = await callGemini(url, {
        contents: [
            { role: 'user', parts: [{ text: `System Prompt: ${SYSTEM_PROMPT}${perspectiveInstructions}\n\nUser Input Topic: ${text}` }] }
        ],
        // Disabling search grounding as it conflicts with JSON schema mode in some Worker environments
        generationConfig: {
            response_mime_type: 'application/json'
        }
    });

    if (!data || data.error) {
        console.error('[GEMINI] API Error:', data?.error || 'No data');
        return null;
    }

    try {
        let content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`[GEMINI] Raw Response: ${content?.substring(0, 100)}...`);
        if (!content) return null;
        content = cleanJsonResponse(content);
        const json = JSON.parse(content);
        const result = InsightSchema.safeParse(json);
        return result.success ? result.data : null;
    } catch (err) {
        return null;
    }
}

export async function generateStockAnalysis(ticker: string, text: string, apiKey: string, model: string = 'gemini-3.1-flash-lite-preview'): Promise<any | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const data = await callGemini(url, {
        contents: [
            { role: 'user', parts: [{ text: `System Prompt: ${STOCK_ANALYSIS_PROMPT}\n\nTarget Ticker: ${ticker}\n\nContext: ${text}` }] }
        ],
        tools: [{ google_search: {} }],
        generationConfig: {
            response_mime_type: 'application/json'
        }
    });

    if (!data) return null;

    try {
        let content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) return null;
        content = cleanJsonResponse(content);
        return JSON.parse(content);
    } catch (err) {
        return null;
    }
}
const GENERAL_SUMMARY_PROMPT = `
Role: You are a Professional Editor.
Task: Provide a thorough summary of the provided text.
Tone: Neutral, informative, and concise.

Structure:
- Section 1: The core thesis/event.
- Section 2: Key supporting details/arguments.
- Section 3: Conclusion/Implications.

Constraint: Provide a 3-5 sentence summary for short content (tweets), and up to 10 sentences for longer articles. No markdown backticks. Return the summary as a raw string inside a JSON object: {"summary": "..."}.
`;

const CRITIC_PROMPT = `
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
`;

export async function generateGeneralSummary(text: string, apiKey: string, model: string = 'gemini-3.1-flash-lite-preview'): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                { role: 'user', parts: [{ text: `System Prompt: ${GENERAL_SUMMARY_PROMPT}\n\nContent: ${text}` }] }
            ],
            generationConfig: {
                response_mime_type: 'application/json'
            }
        }),
        signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
        console.error(`Gemini Summary API error: ${response.status} ${await response.text()}`);
        return null;
    }

    const data: any = await response.json();
    try {
        let content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) return null;
        content = cleanJsonResponse(content);
        const json = JSON.parse(content);
        return json.summary;
    } catch (err) {
        return null;
    }
}

export async function verifyInsight(sourceText: string, insightText: string, apiKey: string, model: string = 'gemini-3.1-flash-lite-preview'): Promise<any | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const data = await callGemini(url, {
        contents: [
            { role: 'user', parts: [{ text: `System Prompt: ${CRITIC_PROMPT}\n\nSource Content: ${sourceText}\n\nGenerated Insight: ${insightText}` }] }
        ],
        generationConfig: {
            response_mime_type: 'application/json'
        }
    });

    if (!data) return null;

    try {
        let content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) return null;
        content = cleanJsonResponse(content);
        return JSON.parse(content);
    } catch (err) {
        return null;
    }
}
