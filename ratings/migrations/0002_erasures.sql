CREATE TABLE erasures(credential_hash TEXT NOT NULL,project_id TEXT NOT NULL,erased_at INTEGER NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(credential_hash,project_id)) WITHOUT ROWID;
