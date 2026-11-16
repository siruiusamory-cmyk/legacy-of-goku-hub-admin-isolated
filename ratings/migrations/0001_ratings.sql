CREATE TABLE votes (
  project_id TEXT NOT NULL,
  credential_hash TEXT NOT NULL CHECK(length(credential_hash)=43),
  score INTEGER NOT NULL CHECK(typeof(score)='integer' AND score BETWEEN 1 AND 7),
  excluded INTEGER NOT NULL DEFAULT 0 CHECK(excluded IN (0,1)),
  PRIMARY KEY(project_id,credential_hash)
) WITHOUT ROWID;
CREATE INDEX votes_credential ON votes(credential_hash);
CREATE TABLE totals(project_id TEXT PRIMARY KEY,total INTEGER NOT NULL,count INTEGER NOT NULL CHECK(count>=0));
CREATE TRIGGER vote_insert AFTER INSERT ON votes BEGIN
  INSERT INTO totals VALUES(new.project_id,new.score*(1-new.excluded),1-new.excluded) ON CONFLICT(project_id) DO UPDATE SET total=total+new.score*(1-new.excluded),count=count+1-new.excluded;
END;
CREATE TRIGGER vote_update AFTER UPDATE ON votes BEGIN
  UPDATE totals SET total=total+new.score*(1-new.excluded)-old.score*(1-old.excluded),count=count+(1-new.excluded)-(1-old.excluded) WHERE project_id=new.project_id;
END;
CREATE TRIGGER vote_delete AFTER DELETE ON votes WHEN old.excluded=0 BEGIN
  UPDATE totals SET total=total-old.score,count=count-1 WHERE project_id=old.project_id;
END;
CREATE TABLE excluded_credentials(credential_hash TEXT PRIMARY KEY,reason TEXT NOT NULL);
CREATE TABLE limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
