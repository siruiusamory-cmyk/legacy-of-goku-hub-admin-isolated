import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const [config,database,destination,mode,persistTo]=process.argv.slice(2);
if(!config||!database||!destination||!['--local','--remote'].includes(mode))throw Error('Usage: export.js config database PRIVATE_NEW_DIRECTORY --local|--remote');
const root=path.resolve(destination);await fs.mkdir(root,{recursive:false,mode:0o700});
const wrangler=path.join(process.env.APPDATA||'', 'npm/node_modules/wrangler/bin/wrangler.js');
if(JSON.parse(await fs.readFile(path.join(wrangler,'../../package.json'))).version!=='4.105.0')throw Error('Pinned Wrangler 4.105.0 required');
if(persistTo&&mode!=='--local')throw Error('Local persistence cannot be used for remote export');
const ledger={exported_at:0};
for(const [name,query] of [['votes','SELECT project_id,credential_hash,score,excluded FROM votes'],['erasures','SELECT credential_hash,project_id,erased_at FROM erasures'],['excluded_credentials','SELECT credential_hash FROM excluded_credentials']]){
 const result=spawnSync(process.execPath,[wrangler,'d1','execute',database,'--config',config,mode,...(persistTo?['--persist-to',persistTo]:[]),'--command',query,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024,env:{...process.env,WRANGLER_WRITE_LOGS:'false',WRANGLER_SEND_METRICS:'false'}});
 if(result.status!==0)throw Error('Export failed; no data printed');let parsed;try{parsed=JSON.parse(result.stdout);}catch{throw Error('Export format rejected');}
 if(!Array.isArray(parsed)||!Array.isArray(parsed[0]?.results))throw Error('Export rows missing');
 if(name==='votes')await fs.writeFile(path.join(root,'votes.json'),JSON.stringify({exported_at:Math.floor(Date.now()/1000),votes:parsed[0].results}),{flag:'wx',mode:0o600});
 else ledger[name]=parsed[0].results;
}
ledger.exported_at=Math.floor(Date.now()/1000);await fs.writeFile(path.join(root,'ledger.json'),JSON.stringify(ledger),{flag:'wx',mode:0o600});
console.log('Private vote snapshot and deletion ledger exported. Secure directory permissions and seven-day retention are required.');

