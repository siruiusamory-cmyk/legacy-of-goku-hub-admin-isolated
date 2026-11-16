import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {manifestRecord,parseSubmission} from '../../src/intake.js';
import {assertDeployable} from '../../tools/site/check-deployment.js';
import {guidedBody,makeNeutralPlaceholder,realRepositoryIds,combinePreview} from '../../tools/site/real-repositories.js';
import {copyRealPreview} from '../../tools/site/real-preview.js';
import {validateSiteCatalog} from '../../tools/site/catalog.js';
const plan=JSON.parse(await fs.readFile('proposals/log-hub-004a/repositories.json','utf8'));
test('four scoped identities have equivalent guided/manifest metadata; DragonByte Z fails closed without approved art',()=>{
  assert.deepEqual(plan.projects.map(p=>p.repository_id).sort((a,b)=>a-b),realRepositoryIds);
  for(const p of plan.projects){const repo={id:p.repository_id,url:p.repository};const guided=parseSubmission({number:1,user:{id:p.owner_id},body:guidedBody(p)}).metadata;
    if(p.metadata.cover)assert.deepEqual(manifestRecord(p.metadata,repo,p.inspected_commit),manifestRecord(guided,repo,p.inspected_commit));
    else {assert.throws(()=>manifestRecord(p.metadata,repo,p.inspected_commit),/cover/);assert.throws(()=>manifestRecord(guided,repo,p.inspected_commit),/cover/);}
    assert.equal(p.metadata.status,'in-development');assert.ok(['tool','resource'].includes(p.metadata.category));assert.equal(p.metadata.screenshots.length,0);
  }
});
test('neutral placeholder is preview-only; DragonByte Z has no approval and owner-wide trust stays absent',async()=>{
  const image=await sharp(await makeNeutralPlaceholder()).metadata();assert.equal(image.format,'webp');assert.equal(image.width,640);assert.equal(image.height,360);
  assert.throws(()=>assertDeployable({purpose:'real-preview'}),/production/);
  const policy=JSON.parse(await fs.readFile('policy/publishing.json','utf8'));
  assert.ok(!policy.trusted_owner_ids.includes(287528505));assert.ok(!policy.projects.some(p=>p.repository_id===1429329775&&p.decision==='approved'));
  assert.ok(plan.projects.filter(p=>p.metadata.cover).every(p=>p.metadata.cover==='docs/banner.png'));
});
test('real-preview reader rejects a wrong purpose and malformed catalog without treating preview as signed recovery',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'loghub-real-preview-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'preview-provenance.json'),JSON.stringify({purpose:'production',production_approved:false}));await assert.rejects(copyRealPreview(root,root),/provenance/);
  await fs.writeFile(path.join(root,'preview-provenance.json'),JSON.stringify({purpose:'real-preview',production_approved:false}));await fs.mkdir(path.join(root,'work/dist'),{recursive:true});await fs.writeFile(path.join(root,'work/dist/catalog.json'),'{}');await assert.rejects(copyRealPreview(root,root),/catalog/);
  const empty=combinePreview([]);await validateSiteCatalog(empty);assert.deepEqual(empty.sort.name,[]);
});
