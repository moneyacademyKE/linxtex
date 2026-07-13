export interface EventLoggerEnv {
    DB: D1Database;
}

export async function logEvent(
    env: EventLoggerEnv,
    type: string,
    data: unknown,
    chatId?: number
): Promise<void> {
    try {
        await env.DB.prepare('INSERT INTO events (event_type, data, chat_id) VALUES (?, ?, ?)')
            .bind(type, JSON.stringify(data), chatId ?? null)
            .run();
    } catch (err) {
        console.error('Failed to log event:', err);
    }
}

