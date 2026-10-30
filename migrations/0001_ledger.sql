-- D1 "moonsafe-ledger" (binding DB), functions/_lib/ledger.ts. Apply: bunx wrangler d1 migrations apply moonsafe-ledger --remote
-- counters: turns:<day>:<id>, events:<day>:<id> (expire after 2 days), power:<id> (bought messages, never expire).
CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  expires INTEGER
);
-- power_tx: one row per payment; status 'pending' while it is checked onchain, 'done' once credited (kept forever).
CREATE TABLE IF NOT EXISTS power_tx (
  hash TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  status TEXT NOT NULL,
  at INTEGER NOT NULL
);
