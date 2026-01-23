export async function logEvent(env: any, type: string, data: any, chatId?: number) {
    try {
        await env.DB.prepare('INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)')
            .bind(type, JSON.stringify(data), chatId || null)
            .run();
    } catch (err) {
        console.error('Failed to log event:', err);
    }
}
