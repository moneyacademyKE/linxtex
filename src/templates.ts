import { type Article, type TelegraphNode, convertToTelegraphNodes } from './domain';

export interface ExtractionTemplate {
    name: string;
    transform: (article: Article) => TelegraphNode[];
}

export const defaultTemplate: ExtractionTemplate = {
    name: 'default',
    transform: (article) => {
        const nodes = convertToTelegraphNodes(article.content);
        if (nodes.length === 0) {
            return [{ tag: 'p', children: [article.textContent || 'No content extracted'] }];
        }
        return nodes;
    }
};

export const markdownFallbackTemplate: ExtractionTemplate = {
    name: 'markdown-fallback',
    transform: (article) => {
        return [{ tag: 'pre', children: [article.textContent || 'No content'] }];
    }
};

export function getTemplate(name?: string): ExtractionTemplate {
    if (name === 'markdown') return markdownFallbackTemplate;
    return defaultTemplate;
}
