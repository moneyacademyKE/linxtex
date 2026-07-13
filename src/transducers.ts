import { parseHTML } from 'linkedom';
import PARSING_RULES from './parsing_rules.json';

export function convertToTelegraphNodes(html: string, baseUrl?: string, rules: any = PARSING_RULES): { nodes: any[], tickers: string[] } {
    const { window } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
    const body = window.document.body;
    if (!body) return { nodes: [], tickers: [] };
    const state = { tickers: new Set<string>(), rules, baseUrl };
    const nodes = Array.from(body.childNodes)
        .map(n => pipeline(n, state))
        .flat()
        .filter(n => {
            if (typeof n === 'string') return n.trim().length > 0;
            return n !== null;
        });
    return { nodes, tickers: Array.from(state.tickers) };
}

export function transduceContent(
    html: string,
    textFallback: string,
    format: 'default' | 'markdown' = 'default',
    baseUrl?: string
): any[] {
    if (format === 'markdown') {
        return [{ tag: 'pre', children: [textFallback || 'No content'] }];
    }
    const { nodes } = convertToTelegraphNodes(html, baseUrl);
    if (nodes.length === 0) return [{ tag: 'p', children: [textFallback || 'No content extracted'] }];
    return nodes;
}

function normalizeUrl(url: string, baseUrl?: string): string {
    if (!baseUrl) return url;
    try {
        return new URL(url, baseUrl).toString();
    } catch {
        return url;
    }
}

function pipeline(domNode: any, state: { tickers: Set<string>, rules: any, baseUrl?: string }): any {
    if (domNode.nodeType === 3) {
        const text = domNode.textContent || '';
        const tickerRegex = /\$([A-Z]{1,5})/g;
        let match;
        while ((match = tickerRegex.exec(text)) !== null) {
            state.tickers.add(match[1]);
        }
        return text;
    }
    if (domNode.nodeType !== 1) return null;
    const rules = state.rules || PARSING_RULES;
    let tag = (domNode.tagName || '').toLowerCase();
    if (rules.transformations && rules.transformations[tag] !== undefined) tag = rules.transformations[tag];
    if (!tag || !rules.allowedTags.includes(tag)) return null;
    const attrs: any = {};
    for (const attr of Array.from(domNode.attributes || [])) {
        const a = attr as any;
        if (rules.allowedAttributes.includes(a.name)) {
            let val = a.value;
            if ((tag === 'img' || tag === 'video' || tag === 'iframe') && a.name === 'src') {
                val = normalizeUrl(val, state.baseUrl);
            } else if (tag === 'a' && a.name === 'href') {
                val = normalizeUrl(val, state.baseUrl);
            }
            attrs[a.name] = val;
        }
    }
    const children = Array.from(domNode.childNodes)
        .map(n => pipeline(n, state))
        .flat()
        .filter(c => c !== null && c !== '');
    const node: any = { tag };
    if (Object.keys(attrs).length > 0) node.attrs = attrs;
    if (children.length > 0) node.children = children;
    return node;
}
