export interface UserStats {
    messagesReceived: number;
    linksProcessed: number;
    cacheHits: number;
    errors: number;
}

export interface ProjectionInsight {
    summary: string;
    sentiment: 'bullish' | 'bearish' | 'neutral' | string;
    tickers: string[];
    tags?: string[];
    relevance_score: number;
    fact_check?: string;
    analysis?: string;
    is_urgent?: boolean;
}

export interface StockAnalysisProjection {
    ticker: string;
    points: string[];
    sentiment: 'bullish' | 'bearish' | 'neutral' | string;
    executive_summary: string;
}

export async function getUserStats(db: D1Database, chatId: number): Promise<UserStats> {
    const results = await db.prepare(`
		SELECT 
			COUNT(CASE WHEN event_type = 'MESSAGE_RECEIVED' THEN 1 END) as messagesReceived,
			COUNT(CASE WHEN event_type = 'LINK_PROCESSED' THEN 1 END) as linksProcessed,
			COUNT(CASE WHEN event_type = 'CACHE_HIT' THEN 1 END) as cacheHits,
			COUNT(CASE WHEN event_type = 'PROCESSING_ERROR' THEN 1 END) as errors
		FROM events 
		WHERE chat_id = ?
	`).bind(chatId).first();

    if (!results) {
        return { messagesReceived: 0, linksProcessed: 0, cacheHits: 0, errors: 0 };
    }

    return {
        messagesReceived: Number(results.messagesReceived),
        linksProcessed: Number(results.linksProcessed),
        cacheHits: Number(results.cacheHits),
        errors: Number(results.errors)
    };
}

export function formatInsight(insight: ProjectionInsight): string {
    const sentimentEmoji = insight.sentiment === 'bullish' ? '🟢' : insight.sentiment === 'bearish' ? '🔴' : '🟡';
    const tickers = insight.tickers.length > 0 ? `\n\n<b>Tickers:</b> ${insight.tickers.join(', ')}` : '';

    return `🧠 <b>EPISTEMIC INSIGHT</b> [${insight.relevance_score}%] ${sentimentEmoji}
	
<b>Signal:</b> ${insight.summary}

<b>Evidence Map:</b>
${insight.fact_check || ''}

<b>Deep Dive:</b>
${insight.analysis || ''}${tickers}

---
`;
}

export function formatStockAnalysis(analysis: StockAnalysisProjection): string {
    const sentimentEmoji = analysis.sentiment === 'bullish' ? '🟢' : analysis.sentiment === 'bearish' ? '🔴' : '🟡';
    return `📈 <b>13-POINT ANALYSIS: ${analysis.ticker}</b> ${sentimentEmoji}

<b>Executive Summary:</b>
${analysis.executive_summary}

${analysis.points.join('\n\n')}

---
`;
}

export function formatGeneralSummary(summary: string): string {
    return `📝 <b>EXECUTIVE SUMMARY</b>

${summary}

---
`;
}

export function formatStatsMessage(stats: UserStats): string {
    return `📊 <b>Your Bot Usage Stats</b>

💬 Messages sent: ${stats.messagesReceived}
🔗 Links processed: ${stats.linksProcessed}
⚡️ Cache hits: ${stats.cacheHits}
⚠️ Errors: ${stats.errors}

<i>Facts derived from your event history.</i>`;
}

