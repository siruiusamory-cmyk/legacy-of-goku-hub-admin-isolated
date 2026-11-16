import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {imageHash} from '../src/images.js';
import {assertPublicationPolicy, entryApproved, policyCheck} from '../src/moderation.js';
import {listSubmissions} from '../src/publishing.js';
import {reviewDestination} from '../tools/moderation-review.js';

const artwork=[{source_sha256:'a'.repeat(64),sha256:imageHash(Buffer.from('harmless hash fixture'))}];
const entry={id:'gh-123',repository_id:123,owner_id:99,record:{screenshots:[]},moderation:{initial_content_digest:'b'.repeat(64),artwork}};
const policy=()=>({version:1,trusted_owner_ids:[],revoked_owner_ids:[],projects:[{repository_id:123,owner_id:99,project_id:'gh-123',decision:'approved',content_digests:['b'.repeat(64)],artwork_sets:[artwork]}]});
test('last publication gate rechecks normalized bytes and current moderation policy',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'loghub-gate-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'assets/gh-123'),{recursive:true});await fs.writeFile(path.join(root,'assets/gh-123/cover.webp'),'harmless hash fixture');
 const catalog={projects:[{id:'gh-123',repository_id:123}]};
 await assertPublicationPolicy(root,catalog,policy(),[entry]);
 for(const decision of ['suspended','delisted']){const p=policy();p.projects[0].decision=decision;await assert.rejects(assertPublicationPolicy(root,catalog,p,[entry]),/excludes/);}
 const removed=policy();removed.projects[0].artwork_sets=[];await assert.rejects(assertPublicationPolicy(root,catalog,removed,[entry]),/approval/);
 await fs.writeFile(path.join(root,'assets/gh-123/cover.webp'),'changed bytes');await assert.rejects(assertPublicationPolicy(root,catalog,policy(),[entry]),/checksum/);
});
test('approval cannot be supplied by trust, wrong identities, malformed hashes or labels',()=>{
 assert.equal(entryApproved(entry,policy()),true);
 for(const mutation of [p=>p.projects=[],p=>p.projects[0].project_id='gh-456',p=>p.projects[0].owner_id=100,p=>p.projects[0].content_digests=[]]){const p=policy();p.trusted_owner_ids=[99];mutation(p);assert.ok(!entryApproved(entry,p));}
 const p=policy();p.projects[0].artwork_sets=[[{source_sha256:'URL',sha256:'not-a-hash'}]];assert.throws(()=>policyCheck(p));
 assert.throws(()=>policyCheck({...policy(),approved:true}));
});
test('intake bounds a saturated ledger without failing existing maintenance',async()=>{
 let calls=0;const issues=await listSubmissions({request:async endpoint=>{calls++;assert.match(endpoint,/state=open.*direction=desc/);return Array.from({length:100},(_,i)=>({number:calls*100+i,title:'[Submission] fixture'}));}},'owner/hub');
 assert.equal(calls,2);assert.equal(issues.length,200);
});
test('review staging refuses CI and paths in the public source tree',()=>{
 assert.throws(()=>reviewDestination(os.tmpdir(),{CI:'true'}),/local-only/);
 assert.throws(()=>reviewDestination(os.tmpdir(),{GITHUB_ACTIONS:'true'}),/local-only/);
 assert.throws(()=>reviewDestination(path.resolve('.review/private'),{}),/outside/);
 assert.equal(reviewDestination(path.join(os.tmpdir(),'private-review'),{}),path.join(os.tmpdir(),'private-review'));
});

test('real-repository preview cannot become a public CI artwork review channel',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['tools/site/build.js','--real-preview','unused'],{encoding:'utf8',env:{...process.env,CI:'true'},windowsHide:true});
 assert.notEqual(result.status,0);assert.match(result.stderr,/local-only/);
});

test('content reports notify humans without becoming submission or approval inputs',async()=>{
 const YAML=(await import('yaml')).default;
 const form=YAML.parse(await fs.readFile('.github/ISSUE_TEMPLATE/report.yml','utf8'));
 assert.equal(form.title,'[Content report] ');
 assert.ok(form.body.some(b=>b.id==='details'));
 const ledger=await listSubmissions({request:async()=>[{number:1,title:form.title,body:'anything',labels:['approved']} ]},'owner/hub');
 assert.equal(ledger.length,0);
});
