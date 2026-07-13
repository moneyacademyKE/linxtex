import { 
    detectUrls, 
    isHomepage, 
    extractUrlsFromEntities, 
    filterBlogpostLinks,
    WELCOME_MESSAGE,
    type TelegramEntity
} from './domain';
import { getPerspectiveForTelegramChat, getToneTemplateForTelegramChat } from './perspective';
import { executeEffect, type Env } from './executor';

type EventRow = { data: string | null };

type ReprocessDebugRow = { url: string; isHome: boolean };

type TelegramChat = {
    id: number;
    username?: string;
    title?: string;
    type?: string;
};

type TelegramMessage = {
    text?: string;
    chat: TelegramChat;
    entities?: TelegramEntity[];
    caption_entities?: TelegramEntity[];
    message_id: number;
};

type TelegramUpdate = {
    message?: TelegramMessage;
    channel_post?: TelegramMessage;
    edited_message?: TelegramMessage;
    edited_channel_post?: TelegramMessage;
};

export async function handleReprocess(env: Env, ctx: ExecutionContext) {
    console.log('[REPROCESS] Starting link recovery from D1 Event Log...');
    
    // Fetch ALL MESSAGE_RECEIVED events
    const events = await env.DB.prepare("SELECT data FROM events WHERE event_type = 'MESSAGE_RECEIVED'").all<EventRow>();
    
    if (!events.results || events.results.length === 0) {
        return { message: "No recent MESSAGE_RECEIVED events found in last 48h", results: 0 };
    }

    const urlsToEnrich = new Set<string>();
    const debug: ReprocessDebugRow[] = [];

    for (const row of events.results) {
        try {
            const data = JSON.parse(row.data as string);
            if (data.urls && Array.isArray(data.urls)) {
                for (const url of data.urls) urlsToEnrich.add(url);
            } else if (data.text) {
                const extracted = detectUrls(data.text);
                for (const url of extracted) {
                    const home = isHomepage(url);
                    debug.push({ url: url.substring(0, 50), isHome: home });
                    if (!home) urlsToEnrich.add(url);
                }
            }
        } catch (e) {
            console.error('[REPROCESS] Failed to parse event data:', e);
        }
    }

    console.log(`[REPROCESS] Extracted ${urlsToEnrich.size} unique URLs from events`);

    const results = [];
    for (const url of urlsToEnrich) {
        const traceId = crypto.randomUUID();
        const perspective = 'default';
        
        // Force re-ingestion
        await env.DB.prepare("DELETE FROM urls WHERE url = ?").bind(url).run();
        await env.ENRICHMENT_QUEUE.send({ url, traceId, perspective });
        
        results.push({ url, traceId, perspective });
    }

    return {
        events_scanned: events.results.length,
        enqueued_links: results.length,
        links: results.map(r => r.url),
        debug: debug
    };
}

export async function handleUpdate(update: TelegramUpdate, env: Env, ctx: ExecutionContext) {
    console.log('--- HANDLE UPDATE START ---');
    const message = update.message || update.channel_post || update.edited_message || update.edited_channel_post;
    if (!message || !message.text) return;

    const text = message.text;
    const chat = message.chat;
    const chatId = chat.id;
    const entities = message.entities || message.caption_entities;
    const perspective = getPerspectiveForTelegramChat(chat);
    const toneTemplate = getToneTemplateForTelegramChat(chat);

    if (text === '/start') {
        await executeEffect({ type: 'SEND_TELEGRAM', payload: { chatId, text: WELCOME_MESSAGE } }, env);
        return;
    }

    const detected = detectUrls(text);
    const fromEntities = extractUrlsFromEntities(text, entities);
    const allUrls = Array.from(new Set([...detected, ...fromEntities])).filter(url => !isHomepage(url));

    if (allUrls.length === 0) return;

    // Universal High-Conviction Logic (Filtering & Multi-post Isolation)
    let targetUrls: string[] = allUrls;
    let isMultiPost = false;
    
    const scores = filterBlogpostLinks(allUrls);
    const validLinks = scores.filter(s => s.score > -100).map(s => s.url); // Filter out social profiles
    
    if (validLinks.length > 3) {
        targetUrls = validLinks.slice(0, 50); // Cap at top 50
        isMultiPost = true;
        console.log(`[INGEST] Isolated Broadcast Mode (selected top ${targetUrls.length} from ${validLinks.length} total)`);
    } else if (validLinks.length > 0) {
        targetUrls = [validLinks[0]]; // Take highest score
        console.log(`[INGEST] Single Mode (highest score link processed)`);
    } else {
        targetUrls = [];
    }

    // Telemetry
    await env.DB.prepare("INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)")
        .bind('MESSAGE_RECEIVED', JSON.stringify({ 
            text, 
            urlCount: targetUrls.length, 
            mode: isMultiPost ? 'ISOLATED' : 'SINGLE',
            perspective,
            chatUsername: chat.username,
            chatTitle: chat.title
        }), chatId)
        .run();

    for (const url of targetUrls) {
        try {
            const traceId = crypto.randomUUID();
            await env.ENRICHMENT_QUEUE.send({ 
                url, 
                traceId, 
                perspective, 
                toneTemplate,
                chatId, 
                messageId: message.message_id, 
                text, 
                entities,
                isMultiPost 
            });
        } catch (e) {
            console.error('Queue error:', e);
            await env.DB.prepare("INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)")
                .bind('QUEUE_SEND_FAILURE', JSON.stringify({ url, error: String(e) }), chatId)
                .run();
        }
    }
}
