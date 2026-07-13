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

export function replaceLinksInText(text: string, map: Record<string, string>): string {
    let result = text;
    for (const [oldUrl, newUrl] of Object.entries(map)) {
        result = result.replace(oldUrl, newUrl);
    }
    return result;
}

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

export function isHomepage(url: string | null | undefined): boolean {
    if (!url) return false;
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

export function formatInstantViewResponse(title: string, originalUrl: string, ivLink: string): string {
    const domain = new URL(originalUrl).hostname;
    return `<b>${title}</b>\n\nfrom ${domain}\n${ivLink}`;
}
