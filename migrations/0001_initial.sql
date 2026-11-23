CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  payment_intent_id TEXT UNIQUE,
  checkout_session_id TEXT UNIQUE,
  amount INTEGER NOT NULL CHECK (amount = 3000),
  currency TEXT NOT NULL CHECK (currency = 'MNT'),
  status TEXT NOT NULL CHECK (status IN ('creating', 'pending', 'paid', 'expired', 'failed')),
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL
);