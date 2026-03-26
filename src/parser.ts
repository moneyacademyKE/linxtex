import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { ArticleSchema, type Article } from './domain';
import puppeteer from '@cloudflare/puppeteer';

export async function extractContent(url: string, browserBinding?: any): Promise<Article> {
    let html: string;
    let finalUrl = url;

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

    const { window } = parseHTML(html);
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

    // Validate against schema
    return ArticleSchema.parse({
        title: data.title || 'Untitled Resource',
        content: data.content || '',
        textContent: data.textContent || '',
        url: finalUrl
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
