import type { ToneTemplate } from './types';

export type TelegramPromptRule = {
    perspective: string;
    aliases?: string[];
    toneTemplate?: {
        useEmoji: boolean;
        showFactCheck: boolean;
        verbosity: 'compact' | 'standard' | 'verbose';
    };
};

const DEFAULT_PERSPECTIVE = 'default';

const DEFAULT_TONE: ToneTemplate = {
    useEmoji: true,
    showFactCheck: true,
    verbosity: 'standard'
};

const TELEGRAM_CHANNEL_PROMPTS: Record<string, TelegramPromptRule> = {
    // Example:
    // '@moneyacademyke': { perspective: 'Kenyan retail investor lens', aliases: ['moneyacademyke'] }
};

function normalizeChannelKey(value: string | number | undefined | null): string | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return null;
    return normalized;
}

function buildChannelPromptLookup(): Map<string, TelegramPromptRule> {
    const lookup = new Map<string, TelegramPromptRule>();

    for (const [rawKey, rule] of Object.entries(TELEGRAM_CHANNEL_PROMPTS)) {
        const keys = [rawKey, ...(rule.aliases || [])];
        for (const key of keys) {
            const normalized = normalizeChannelKey(key);
            if (normalized) lookup.set(normalized, rule);
        }
    }

    return lookup;
}

const TELEGRAM_CHANNEL_PROMPT_LOOKUP = buildChannelPromptLookup();

export function getPerspectiveForTelegramChat(chat: { id?: number; username?: string; title?: string; type?: string } | undefined): string {
    if (!chat) return DEFAULT_PERSPECTIVE;

    const candidates = [
        chat.username ? `@${chat.username}` : undefined,
        chat.username,
        chat.id,
        chat.title
    ];

    for (const candidate of candidates) {
        const normalized = normalizeChannelKey(candidate);
        if (!normalized) continue;
        const matched = TELEGRAM_CHANNEL_PROMPT_LOOKUP.get(normalized);
        if (matched?.perspective) return matched.perspective;
    }

    return DEFAULT_PERSPECTIVE;
}

export function getToneTemplateForTelegramChat(chat: { id?: number; username?: string; title?: string; type?: string } | undefined) {
    if (!chat) return DEFAULT_TONE;

    const candidates = [
        chat.username ? `@${chat.username}` : undefined,
        chat.username,
        chat.id,
        chat.title
    ];

    for (const candidate of candidates) {
        const normalized = normalizeChannelKey(candidate);
        if (!normalized) continue;
        const matched = TELEGRAM_CHANNEL_PROMPT_LOOKUP.get(normalized);
        if (matched?.toneTemplate) return matched.toneTemplate;
    }

    return DEFAULT_TONE;
}
