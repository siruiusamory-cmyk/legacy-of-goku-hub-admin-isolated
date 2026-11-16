ALTER TABLE submissions ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
CREATE TABLE admin_sessions (hash TEXT PRIMARY KEY, subject TEXT NOT NULL, email TEXT NOT NULL, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE admin_revocations (subject TEXT PRIMARY KEY, before INTEGER NOT NULL);
CREATE TABLE admin_reviews (
 id TEXT PRIMARY KEY, submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
 revision INTEGER, project_id TEXT, operation TEXT NOT NULL, payload TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued', version INTEGER NOT NULL DEFAULT 1,
 package TEXT, digest TEXT, approved_digest TEXT, pr INTEGER, error TEXT,
 created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE UNIQUE INDEX admin_active_submission ON admin_reviews(submission_id) WHERE state IN ('queued','processing','ready','approved','publishing');
CREATE TABLE admin_files (review_id TEXT NOT NULL REFERENCES admin_reviews(id) ON DELETE CASCADE, name TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(review_id,name,part));
CREATE TABLE admin_history (id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id INTEGER, review_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, public_note TEXT NOT NULL DEFAULT '', private_note TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
CREATE INDEX admin_history_submission ON admin_history(submission_id,id);
