CREATE TABLE IF NOT EXISTS models (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS venues (id TEXT PRIMARY KEY, name TEXT NOT NULL, model_id TEXT NOT NULL REFERENCES models(id), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE IF NOT EXISTS launches (id TEXT PRIMARY KEY, venue_id TEXT NOT NULL REFERENCES venues(id), venue_name TEXT NOT NULL, model_id TEXT NOT NULL, model_version TEXT NOT NULL, platform TEXT NOT NULL CHECK(platform IN ('ios','android')), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX IF NOT EXISTS launches_created_at ON launches(created_at);
CREATE INDEX IF NOT EXISTS launches_venue ON launches(venue_id,created_at);
