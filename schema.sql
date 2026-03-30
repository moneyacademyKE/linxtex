-- Events Log
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    data TEXT,
    chat_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Flattened Facts (The System of Record)
CREATE TABLE IF NOT EXISTS urls (
    url TEXT PRIMARY KEY,
    title TEXT,
    iv_link TEXT,
    insight TEXT, -- Flattened for Godmode dashboard performance
    trace_id TEXT UNIQUE, -- Added for Phase 5 Idempotency
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Content Deduplication Store
CREATE TABLE IF NOT EXISTS content_hashes (
    hash TEXT PRIMARY KEY,
    title TEXT,
    iv_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Structured Insight Logs (Forensic Trace)
CREATE TABLE IF NOT EXISTS insight_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT,
    url TEXT,
    hash TEXT,
    insight TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Phase 8: Live-Programmable Logic (Code as Data)
CREATE TABLE IF NOT EXISTS logic_rules (
    rule_key TEXT PRIMARY KEY,
    rule_value TEXT NOT NULL, -- JSON blob of rules (tags, attributes, prompts)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Incremental Alterations (Hickey: Accumulation)
-- Note: These might fail if already applied, but SQLite won't block the file execution if they are handled correctly.
-- For Wrangler/D1, we use separate commands or handle errors.
-- ALTER TABLE insight_logs ADD COLUMN perspective TEXT DEFAULT 'default';

-- Indexes for Godmode Speeds
CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_logs_perspective ON insight_logs(perspective);
