import { mock } from "bun:test";
import { Database } from "bun:sqlite";
import { vi } from "vitest";

// Create a real in-memory SQLite DB for tests
const db = new Database(":memory:");

// Initialize minimal schema for tests to match src/index.ts
db.run(`
    CREATE TABLE IF NOT EXISTS urls (
        url TEXT PRIMARY KEY,
        title TEXT,
        iv_link TEXT,
        insight TEXT,
        trace_id TEXT,
        last_enriched INTEGER
    );
`);

db.run(`
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        data TEXT,
        chat_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

db.run(`
    CREATE TABLE IF NOT EXISTS insight_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT,
        url TEXT,
        hash TEXT,
        insight TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

db.run(`
    CREATE TABLE IF NOT EXISTS logic_rules (
        rule_key TEXT PRIMARY KEY,
        rule_value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

db.run(`
    CREATE TABLE IF NOT EXISTS content_hashes (
        hash TEXT PRIMARY KEY,
        title TEXT,
        iv_link TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

const mockDb = {
    prepare: (query: string) => {
        const stmt = db.prepare(query);
        return {
            bind: (...args: unknown[]) => ({
                first: () => Promise.resolve(stmt.get(...args)),
                all: () => Promise.resolve({ results: stmt.all(...args) }),
                run: () => {
                    stmt.run(...args);
                    return Promise.resolve({ success: true });
                }
            }),
            all: () => Promise.resolve({ results: stmt.all() }),
            run: () => {
                stmt.run();
                return Promise.resolve({ success: true });
            }
        };
    },
    batch: (stmts: any[]) => Promise.resolve(stmts.map(() => ({ results: [] }))),
    exec: (sql: string) => {
        db.run(sql);
        return Promise.resolve();
    }
};

mock.module("cloudflare:test", () => ({
    env: {
        DB: mockDb,
        FACTS: {
            get: vi.fn().mockResolvedValue(null),
            put: vi.fn().mockResolvedValue({})
        },
        ENRICHMENT_QUEUE: {
            send: vi.fn().mockResolvedValue({})
        }
    },
    createExecutionContext: () => ({
        waitUntil: (p: Promise<any>) => { if (p && p.catch) p.catch(() => { }) }
    }),
    waitOnExecutionContext: () => Promise.resolve(),
    SELF: { fetch: fetch }
}));

// Mock global Cloudflare objects
// @ts-ignore
globalThis.caches = {
    default: {
        match: async () => null,
        put: async () => { }
    }
};
