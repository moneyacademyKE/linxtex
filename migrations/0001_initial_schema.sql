-- 0001_initial_schema.sql
-- Baseline D1 schema for Linxtex.

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    data TEXT,
    chat_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS urls (
    url TEXT PRIMARY KEY,
    title TEXT,
    iv_link TEXT,
    insight TEXT,
    trace_id TEXT UNIQUE,
    last_enriched INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_hashes (
    hash TEXT PRIMARY KEY,
    title TEXT,
    iv_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insight_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT,
    url TEXT,
    hash TEXT,
    insight TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logic_rules (
    rule_key TEXT PRIMARY KEY,
    rule_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insight_logs_created_at ON insight_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insight_logs_url_created_at ON insight_logs(url, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insight_logs_hash_created_at ON insight_logs(hash, created_at DESC);
