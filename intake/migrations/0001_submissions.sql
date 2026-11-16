CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_hash TEXT NOT NULL UNIQUE CHECK (length(receipt_hash) = 43),
  kind TEXT NOT NULL CHECK (kind IN ('add', 'suggest', 'correct', 'claim')),
  state TEXT NOT NULL DEFAULT 'received' CHECK (state IN ('received', 'in-review', 'needs-changes', 'approved', 'published', 'rejected')),
  url_key TEXT,
  listing_id TEXT,
  payload TEXT NOT NULL CHECK (length(payload) <= 8192),
  challenge TEXT,
  public_note TEXT NOT NULL DEFAULT '' CHECK (length(public_note) <= 500),
  private_note TEXT NOT NULL DEFAULT '' CHECK (length(private_note) <= 1000),
  project_id TEXT,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX submissions_state ON submissions(state, created);
CREATE INDEX submissions_url_key ON submissions(url_key);
CREATE INDEX submissions_expires ON submissions(expires);
CREATE TABLE limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX limits_expires ON limits(expires);
