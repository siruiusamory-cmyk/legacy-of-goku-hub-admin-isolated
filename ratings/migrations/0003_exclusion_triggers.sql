CREATE TRIGGER credential_exclusion AFTER INSERT ON excluded_credentials BEGIN
  UPDATE votes SET excluded=1 WHERE credential_hash=new.credential_hash;
END;
CREATE TRIGGER credential_appeal AFTER DELETE ON excluded_credentials BEGIN
  UPDATE votes SET excluded=0 WHERE credential_hash=old.credential_hash;
END;
