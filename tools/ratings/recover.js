import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function recoverySQL(snapshot,ledger,catalog,time=Math.floor(Date.now()/1000)){
 if(!Number.isSafeInteger(snapshot.exported_at)||snapshot.exported_at>time||time-snapshot.exported_at>604800)throw Error('Snapshot less than seven days old required');
 if(!Number.isSafeInteger(ledger.exported_at)||ledger.exported_at>time||time-ledger.exported_at>300||ledger.exported_at<snapshot.exported_at)throw Error('Fresh current deletion/exclusion ledger required');
 if(!Array.isArray(snapshot.votes)||!Array.isArray(ledger.erasures)||!Array.isArray(ledger.excluded_credentials)||!Array.isArray(catalog.projects))throw Error('Invalid recovery input');
 const ids=new Set(catalog.projects.filter(p=>p.availability==='available').map(p=>p.id)),rows=[],seen=new Set(),validHash=h=>typeof h==='string'&&/^[A-Za-z0-9_-]{43}$/.test(h);
 for(const e of ledger.erasures)if(!validHash(e.credential_hash)||!(e.project_id==='*'||/^(?:gh-[0-9]+|ext-[a-z0-9]{12})$/.test(e.project_id))||!Number.isSafeInteger(e.erased_at)||e.erased_at<0||e.erased_at>time)throw Error('Invalid deletion ledger');
 for(const e of ledger.excluded_credentials)if(!validHash(e.credential_hash))throw Error('Invalid exclusion ledger');
 for(const vote of snapshot.votes){
  if(!/^(?:gh-[0-9]+|ext-[a-z0-9]{12})$/.test(vote.project_id)||!validHash(vote.credential_hash)||!Number.isInteger(vote.score)||vote.score<1||vote.score>7||![0,1].includes(vote.excluded))throw Error('Invalid vote');const key=vote.project_id+':'+vote.credential_hash;if(seen.has(key))throw Error('Duplicate vote');seen.add(key);
  if(!ids.has(vote.project_id)||ledger.erasures.some(e=>e.credential_hash===vote.credential_hash&&(e.project_id==='*'||e.project_id===vote.project_id)&&e.erased_at>=snapshot.exported_at))continue;
  const excluded=ledger.excluded_credentials.some(e=>e.credential_hash===vote.credential_hash)?1:0;
  rows.push(`INSERT INTO votes VALUES('${vote.project_id}','${vote.credential_hash}',${vote.score},${excluded});`);
 }
 for(const row of ledger.excluded_credentials)rows.push(`INSERT OR IGNORE INTO excluded_credentials VALUES('${row.credential_hash}','recovered-exclusion');`);
 for(const row of ledger.erasures)if(row.erased_at+604800>time)rows.push(`INSERT INTO erasures VALUES('${row.credential_hash}','${row.project_id}',${row.erased_at},${row.erased_at+604800});`);
 return rows.join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [snapshotFile,ledgerFile,catalogFile,output]=process.argv.slice(2);if(!output)throw Error('Usage: recover.js votes.json freshest-ledger.json approved-catalog.json output.sql');const read=async f=>JSON.parse(await fs.readFile(f));await fs.writeFile(output,await recoverySQL(await read(snapshotFile),await read(ledgerFile),await read(catalogFile)),{flag:'wx',mode:0o600});console.log('Recovery SQL prepared; import and verification require owner incident authorization.');
}
