const AUTHORITY_SCORES: Record<string, number> = {
    'bloomberg.com': 95,
    'reuters.com': 95,
    'ft.com': 90,
    'wsj.com': 90,
    'economist.com': 90,
    'cnbc.com': 80,
    'seekingalpha.com': 75,
    'marketwatch.com': 75,
    'barrons.com': 80,
    'nytimes.com': 85,
    'investing.com': 70,
    'zerohedge.com': 40,
    'coindesk.com': 65,
    'cointelegraph.com': 60
};

export const BROWSER_REQUIRED_DOMAINS = new Set([
    'bloomberg.com',
    'ft.com',
    'wsj.com',
    'economist.com',
    'barrons.com',
    'nytimes.com'
]);

export function getAuthorityScore(url: string): number {
    try {
        const hostname = new URL(url).hostname.replace('www.', '').toLowerCase();
        for (const [domain, score] of Object.entries(AUTHORITY_SCORES)) {
            if (hostname === domain || hostname.endsWith('.' + domain)) {
                return score;
            }
        }
    } catch {}
    return 50; // Unknown domains default to 50 (neutral)
}

export function requiresBrowserRendering(url: string): boolean {
    try {
        const hostname = new URL(url).hostname.replace('www.', '').toLowerCase();
        return Array.from(BROWSER_REQUIRED_DOMAINS).some(
            domain => hostname === domain || hostname.endsWith('.' + domain)
        );
    } catch {
        return false;
    }
}
