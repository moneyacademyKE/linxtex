export async function getTweetContent(tweetId: string, bearerToken: string): Promise<{ text: string, author: string } | null> {
    const url = `https://api.twitter.com/2/tweets/${tweetId}?expansions=author_id&user.fields=username,name`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${bearerToken}`
            }
        });

        if (!response.ok) {
            console.error(`Twitter API error: ${response.status} ${await response.text()}`);
            return null;
        }

        const data: any = await response.json();
        if (!data.data) return null;

        const author = data.includes?.users?.[0]?.name || data.includes?.users?.[0]?.username || 'Twitter User';
        return {
            text: data.data.text,
            author: author
        };
    } catch (err) {
        console.error('Twitter fetch error:', err);
        return null;
    }
}

export function extractTweetId(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('twitter.com') || parsed.hostname.includes('x.com')) {
            const parts = parsed.pathname.split('/');
            const statusIndex = parts.indexOf('status');
            if (statusIndex !== -1 && parts[statusIndex + 1]) {
                return parts[statusIndex + 1].split('?')[0];
            }
        }
        return null;
    } catch {
        return null;
    }
}

export async function resolveRedirects(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
            }
        });
        return response.url;
    } catch (err) {
        console.error('Redirect resolution error:', err);
        return url;
    }
}
