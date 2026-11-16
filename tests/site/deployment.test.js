import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sealArtifact,verifyArtifact} from '../../tools/site/check-deployment.js';
import {checkCloudflareProject} from '../../tools/site/cloudflare-project.js';
const commit='a'.repeat(40), snapshot='b'.repeat(64);
async function artifact(t) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'loghub-deployment-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  for(const [name,bytes] of Object.entries({'index.html':'harmless unit test','404.html':'not found','catalog.json':'{}','site-provenance.json':JSON.stringify({purpose:'production',point:'1-'+snapshot,snapshot_id:snapshot,source_commit:commit,base:'/'})}))await fs.writeFile(path.join(directory,name),bytes);
  return directory;
}
test('sealed artifact survives transfer; modified, added or missing output bytes fail closed',async t=>{
  for(const mutation of [async d=>fs.writeFile(path.join(d,'index.html'),'changed'),async d=>fs.writeFile(path.join(d,'extra.txt'),'extra'),async d=>fs.unlink(path.join(d,'404.html'))]){
    const directory=await artifact(t);const digest=await sealArtifact(directory,commit);await verifyArtifact(directory,commit,digest);await mutation(directory);await assert.rejects(verifyArtifact(directory,commit,digest),/inventory/);
  }
});
test('manifest substitution, stale build rollback and revoked-policy replay are rejected',async t=>{
  const directory=await artifact(t);const digest=await sealArtifact(directory,commit);
  await assert.rejects(verifyArtifact(directory,'c'.repeat(40),digest),/Stale/);
  await assert.rejects(verifyArtifact(directory,commit,'d'.repeat(64)),/manifest changed/);
  const file=path.join(directory,'deployment-manifest.json');const manifest=JSON.parse(await fs.readFile(file));manifest.policy_sha256='e'.repeat(64);const bytes=JSON.stringify(manifest);await fs.writeFile(file,bytes);
  const {createHash}=await import('node:crypto');const alteredDigest=createHash('sha256').update(bytes).digest('hex');await assert.rejects(verifyArtifact(directory,commit,alteredDigest),/policy/);
});
test('previews, repository subpaths, dynamic execution and oversized assets cannot be sealed',async t=>{
  for(const change of [p=>p.purpose='fixture',p=>p.base='/legacy-of-goku-hub/',p=>p.snapshot_id='c'.repeat(64)]){const d=await artifact(t);const file=path.join(d,'site-provenance.json');const p=JSON.parse(await fs.readFile(file));change(p);await fs.writeFile(file,JSON.stringify(p));await assert.rejects(sealArtifact(d,commit),/production|root-path/);}
  for(const name of ['_worker.js','functions/api.js','.env','wrangler.toml']){const d=await artifact(t);await fs.mkdir(path.dirname(path.join(d,name)),{recursive:true});await fs.writeFile(path.join(d,name),'never upload');await assert.rejects(sealArtifact(d,commit),/static files only/);}
  const d=await artifact(t);const file=await fs.open(path.join(d,'too-large.bin'),'w');await file.truncate(25*1024*1024+1);await file.close();await assert.rejects(sealArtifact(d,commit),/Free limits/);
});
test('Cloudflare preflight is GET-only and requires the exact existing Direct Upload hostname/main',async()=>{
  const project={name:'loghub',subdomain:'loghub.pages.dev',production_branch:'main',source:null};
  const response=p=>async(url,options)=>{assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/pages/projects/loghub');assert.equal(options.method,undefined);assert.equal(options.redirect,'error');return Response.json({success:true,result:p});};
  assert.equal((await checkCloudflareProject('a'.repeat(32),'test-only',response(project))).url,'https://loghub.pages.dev/');
  for(const altered of [{...project,subdomain:'loghub-other.pages.dev'},{...project,production_branch:'other'},{...project,source:{type:'github'}}])await assert.rejects(checkCloudflareProject('a'.repeat(32),'test-only',response(altered)),/unavailable or mismatched/);
  await assert.rejects(checkCloudflareProject('a'.repeat(32),'test-only',async()=>new Response('',{status:404})),/lookup failed/);
  await assert.rejects(checkCloudflareProject('',null,response(project)),/credentials/);
});
