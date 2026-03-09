import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let _db: Database.Database | null = null;

const SCHEMA = `
-- Resources: skills, agents, tools stored as JSON
CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  data JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_resources_kind ON resources(kind);
CREATE INDEX IF NOT EXISTS idx_resources_name ON resources(name);

-- Federation peers
CREATE TABLE IF NOT EXISTS peers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  node_id TEXT,
  status TEXT DEFAULT 'healthy',
  last_synced TEXT,
  hop INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Audit log (NIST AU-2, AU-3)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  gaid TEXT,
  actor TEXT,
  detail JSON,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_gaid ON audit_log(gaid);

-- Feedback (360 feedback system)
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_gaid TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  dimensions JSON NOT NULL,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_target ON feedback(target_gaid);

-- Token usage analytics
CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_gaid TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  model TEXT,
  task_type TEXT,
  success INTEGER DEFAULT 1,
  cost_usd REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent_gaid);

-- Attestations (outcome records)
CREATE TABLE IF NOT EXISTS attestations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_gaid TEXT NOT NULL,
  task_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  attestor TEXT NOT NULL,
  attestor_did TEXT,
  signature TEXT,
  metrics JSON,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attestations_agent ON attestations(agent_gaid);

-- Revocations (propagated via federation gossip)
CREATE TABLE IF NOT EXISTS revocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gaid TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'unspecified',
  revoked_by TEXT,
  origin_node TEXT,
  propagated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_revocations_gaid ON revocations(gaid);
CREATE INDEX IF NOT EXISTS idx_revocations_name ON revocations(name);

-- Governance config (singleton)
CREATE TABLE IF NOT EXISTS governance (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data JSON NOT NULL
);
`;

export function initDb(path?: string): Database.Database {
  const dbPath = path ?? './data/duadp.db';
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  _db = db;
  return db;
}

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _db;
}
