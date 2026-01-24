import { mock } from "bun:test";
import { Database } from "bun:sqlite";

// Create a real in-memory SQLite DB for tests
const db = new Database(":memory:");

// Initialize minimal schema for tests if needed
db.run(`
    CREATE TABLE IF NOT EXISTS urls (
        url TEXT PRIMARY KEY,
        title TEXT,
        iv_link TEXT,
        insight TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

const mockDb = {
    prepare: (query: string) => {
        const stmt = db.prepare(query);
        return {
            bind: (...args: any[]) => ({
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
    batch: (stmts: any[]) => Promise.resolve(stmts.map(() => ({ results: [] }))), // Simple batch shim
    exec: (sql: string) => {
        db.run(sql);
        return Promise.resolve();
    }
};

mock.module("cloudflare:test", () => ({
    env: {
        DB: mockDb,
        FACTS: {
            get: () => Promise.resolve(null),
            put: () => Promise.resolve()
        }
    },
    createExecutionContext: () => ({
        waitUntil: (p: Promise<any>) => { if (p && p.catch) p.catch(() => { }) }
    }),
    waitOnExecutionContext: () => Promise.resolve(),
    SELF: {
        fetch: fetch
    }
}));

// Mock global Cloudflare objects
// @ts-ignore
globalThis.caches = {
    default: {
        match: () => Promise.resolve(null),
        put: () => Promise.resolve()
    }
};

// Mock vitest exports for bun:test compatibility
mock.module("vitest", () => require("bun:test"));
