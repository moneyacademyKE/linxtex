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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Content Deduplication Store
CREATE TABLE IF NOT EXISTS content_hashes (
    hash TEXT PRIMARY KEY,
    title TEXT,
    iv_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Structured Insight Logs (Relational)
CREATE TABLE IF NOT EXISTS insight_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_hash TEXT,
    raw_insight TEXT,
    relevance_score INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Godmode Speeds
CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
