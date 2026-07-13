import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { ArticleSchema, type Article } from './domain';
import { requiresBrowserRendering } from './source_authority';
import puppeteer from '@cloudflare/puppeteer';

export async function extractContent(url: string, browserBinding?: any): Promise<Article> {
    let html: string;
    let finalUrl = url;

    const shouldForceBrowser = browserBinding && requiresBrowserRendering(url);
    if (shouldForceBrowser) {
        console.log(`[PROACTIVE BROWSER] Paywall/Heavy JS domain detected. Fetching ${url} with browser...`);
        html = await fetchWithBrowser(url, browserBinding);
    } else {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
                },
                redirect: 'follow',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            finalUrl = response.url;

            if (response.status === 403 || response.status === 401 || !response.ok) {
                if (browserBinding) {
                    console.log(`Fetch failed with ${response.status}, falling back to browser-rendering for ${url}`);
                    html = await fetchWithBrowser(url, browserBinding);
                } else {
                    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
                }
            } else {
                html = await response.text();
            }
        } catch (err) {
            if (browserBinding) {
                console.log(`Fetch error, falling back to browser-rendering for ${url}:`, err);
                html = await fetchWithBrowser(url, browserBinding);
            } else {
                throw err;
            }
        }
    }

    const { window } = parseHTML(html);

    // Specialized Logic: Nitter Thread Unrolling
    if (url.includes('nitter')) {
        const tweets = Array.from(window.document.querySelectorAll('.tweet-content, .main-tweet .tweet-content'));
        const author = window.document.querySelector('.main-tweet .fullname')?.textContent?.trim() || 'Twitter User';
        const title = `Twitter Thread by ${author}`;
        
        const threadContent = (tweets as any[]).map(t => t.innerHTML).join('<br><br>---<br><br>');
        const threadText = (tweets as any[]).map(t => t.textContent).join('\n\n---\n\n');

        return ArticleSchema.parse({
            title,
            content: threadContent,
            textContent: threadText,
            url: finalUrl,
            fidelityRatio: threadText.length / (html.length || 1)
        });
    }

    const reader = new Readability(window.document as any);
    let articleData = reader.parse();

    if (!articleData) {
        let fallbackTitle = 'Untitled Resource';
        try {
            const pathParts = new URL(url).pathname.split('/');
            const filename = pathParts[pathParts.length - 1];
            if (filename) fallbackTitle = filename;
        } catch {}

        articleData = {
            title: window.document.title || fallbackTitle,
            content: window.document.body.innerHTML,
            textContent: window.document.body.textContent || '',
            length: 0,
            excerpt: '',
            byline: '',
            dir: '',
            siteName: '',
            lang: '',
            publishedTime: ''
        };
    }

    const data = articleData as any;

    const publishedTime = window.document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
                          window.document.querySelector('meta[name="published_time"]')?.getAttribute('content') ||
                          window.document.querySelector('meta[name="date"]')?.getAttribute('content') ||
                          undefined;

    // Validate against schema
    return ArticleSchema.parse({
        title: data.title || 'Untitled Resource',
        content: data.content || '',
        textContent: data.textContent || '',
        url: finalUrl,
        publishedTime,
        fidelityRatio: (data.textContent || '').length / (html.length || 1)
    });
}

async function fetchWithBrowser(url: string, browserBinding: any): Promise<string> {
    const browser = await puppeteer.launch(browserBinding);
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const html = await page.content();
        return html;
    } finally {
        await browser.close();
    }
}
