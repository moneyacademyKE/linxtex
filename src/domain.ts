import { parseHTML } from 'linkedom';
import { z } from 'zod';
import PARSING_RULES from './parsing_rules.json';

// --- Phase 2: Schema First ---

export const ArticleSchema = z.object({
    title: z.string().min(1),
    content: z.string(),
    textContent: z.string().optional(),
    url: z.string().optional(),
    tickers: z.array(z.string()).optional()
});

export type Article = z.infer<typeof ArticleSchema>;

export type LegacyTelegraphNode = string | {
    tag: string;
    attrs?: Record<string, string>;
    children?: LegacyTelegraphNode[];
};

export const TelegraphNodeSchema: z.ZodType<LegacyTelegraphNode> = z.lazy(() =>
    z.union([
        z.string(),
        z.object({
            tag: z.string(),
            attrs: z.record(z.string(), z.string()).optional(),
            children: z.array(TelegraphNodeSchema).optional()
        })
    ])
);

export type TelegraphNode = z.infer<typeof TelegraphNodeSchema>;

// --- Effects as Values (Hickey Dispatched) ---

export const EffectSchema = z.union([
    z.object({
        type: z.literal('SEND_TELEGRAM'),
        payload: z.object({
            chatId: z.number(),
            text: z.string(),
            isHtml: z.boolean().optional()
        })
    }),
    z.object({
        type: z.literal('PUBLISH_TELEGRAPH'),
        payload: z.object({
            title: z.string(),
            nodes: z.array(TelegraphNodeSchema)
        })
    }),
    z.object({
        type: z.literal('DB_WRITE_URL'),
        payload: z.object({
            url: z.string(),
            title: z.string(),
            ivLink: z.string(),
            insight: z.string().optional()
        })
    }),
    z.object({
        type: z.literal('DB_WRITE_HASH'),
        payload: z.object({
            hash: z.string(),
            title: z.string(),
            ivLink: z.string()
        })
    }),
    z.object({
        type: z.literal('EDIT_TELEGRAM_MESSAGE'),
        payload: z.object({
            chatId: z.number(),
            messageId: z.number(),
            text: z.string(),
            isHtml: z.boolean().optional()
        })
    }),
    z.object({
        type: z.literal('EDIT_TELEGRAM_CAPTION'),
        payload: z.object({
            chatId: z.number(),
            messageId: z.number(),
            caption: z.string(),
            isHtml: z.boolean().optional()
        })
    }),
    z.object({
        type: z.literal('LOG_EVENT'),
        payload: z.object({
            eventType: z.string(),
            data: z.any(),
            chatId: z.number().optional()
        })
    }),
    z.object({
        type: z.literal('LOG_INSIGHT'),
        payload: z.object({
            contentHash: z.string(),
            rawInsight: z.string(),
            relevanceScore: z.number()
        })
    })
]);

export type Effect = z.infer<typeof EffectSchema>;

// --- Pure Transformations (The Core) ---

export function detectUrls(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

export function isHomepage(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.pathname === '/' || parsed.pathname === '';
    } catch {
        return false;
    }
}

export function transformToNitter(url: string, instance: string = 'nitter.net'): string {
    try {
        const parsed = new URL(url);
        if (parsed.hostname === 'twitter.com' || parsed.hostname === 'x.com' || parsed.hostname === 'www.twitter.com' || parsed.hostname === 'www.x.com') {
            parsed.hostname = instance;
            return parsed.toString();
        }
        return url;
    } catch {
        return url;
    }
}

export function formatInstantViewResponse(title: string, originalUrl: string, ivLink: string): string {
    const domain = new URL(originalUrl).hostname;
    return `<b>${title}</b>\n\nfrom ${domain}\n${ivLink}`;
}

export function replaceLinksInText(text: string, linkMap: Record<string, string>): string {
    let newText = text;
    for (const [originalUrl, ivLink] of Object.entries(linkMap)) {
        newText = newText.replace(originalUrl, ivLink);
    }
    return newText;
}

export const WELCOME_MESSAGE = `Hi, send me any message which contains a links:

- From a channel/group by "Forward" a message links.
- By a direct text message links to me.`;

// --- Transducers: Composable Transformations ---

type Transducer = (node: any) => any | null;

const sanitizeTag: Transducer = (domNode) => {
    if (domNode.nodeType === 3) return domNode.textContent || '';
    if (domNode.nodeType !== 1) return null;

    let tag = domNode.tagName.toLowerCase();

    // Data-Driven Transformation
    const transformMap: any = PARSING_RULES.transformations;
    if (transformMap[tag]) {
        tag = transformMap[tag];
    } else if (transformMap[tag] === null) {
        return null; // Discarded
    }

    if (!PARSING_RULES.allowedTags.includes(tag)) return null;

    return { tag, domNode };
};

const cleanAttributes: Transducer = (result) => {
    if (typeof result === 'string' || result === null) return result;

    const { tag, domNode } = result;
    const attrs: Record<string, string> = {};

    for (const attr of domNode.attributes) {
        if (PARSING_RULES.allowedAttributes.includes(attr.name)) {
            attrs[attr.name] = attr.value;
        }
    }

    return { tag, attrs, domNode };
};


// The Pipeline (Manual Dispatch Transducer)
function pipeline(domNode: any, state: { tickers: Set<string> }): any {
    if (domNode.nodeType === 3) { // Text Node - Ticker Extraction
        const text = domNode.textContent || '';
        const tickerRegex = /\$([A-Z]{1,10})/g;
        let match;
        while ((match = tickerRegex.exec(text)) !== null) {
            state.tickers.add(match[1]);
        }
    }

    let res = sanitizeTag(domNode);
    res = cleanAttributes(res);

    // Recursive transform with state passing
    if (typeof res === 'string' || res === null) return res;
    const { tag, attrs, domNode: originalDom } = res;
    const children = Array.from(originalDom.childNodes)
        .map(n => pipeline(n, state))
        .flat()
        .filter(c => c !== null && c !== '');

    const node: any = { tag };
    if (Object.keys(attrs).length > 0) node.attrs = attrs;
    if (children.length > 0) node.children = children;

    return node;
}

export function convertToTelegraphNodes(html: string): { nodes: TelegraphNode[], tickers: string[] } {
    // Ensure we have a body by wrapping snippet if missing html tag
    const fullHtml = html.includes("<html") ? html : `<html><body>${html}</body></html>`;
    const { window } = parseHTML(fullHtml);
    const body = window.document.body;
    const state = { tickers: new Set<string>() };

    const nodes = Array.from(body.childNodes)
        .map(n => pipeline(n, state))
        .flat()
        .filter((n): n is TelegraphNode => n !== null && n !== '');

    return { nodes, tickers: Array.from(state.tickers) };
}

export async function calculateHash(text: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
