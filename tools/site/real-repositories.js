import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {GitHub} from '../../src/github.js';
import {repositoryInfo, releaseInfo} from '../../src/github.js';
import {parseSubmission, manifestRecord, loadManifest} from '../../src/intake.js';
import {normalizeImage} from '../../src/images.js';
import {publish} from '../../src/publishing.js';
import {buildCatalog} from '../../src/catalog.js';
import {readJSON, saveJSON} from '../../src/records.js';
import {validateSiteCatalog} from './catalog.js';

export const realRepositoryIds = [1398951057,1429329775,1429374563,1432341427];
export const previewOwner = 287528505;
export function guidedBody(project) {
  const m=project.metadata;
  return Object.entries({'Repository URL':project.repository,'Submission method':'Guided form',Request:'Submit or update','Project title':m.title,'Developer or team':m.developer,Description:m.description,'Base game':m.game,Category:m.category,'Development status':m.status,'Cover image':m.cover || '',Screenshots:(m.screenshots || []).join('\n'),'Project links':(m.links || []).map(l=>l.label+' '+l.url).join('\n')}).map(([k,v])=>'### '+k+'\n\n'+(v || '_No response_')).join('\n\n');
}
export function combinePreview(projects) {
  const compare=(a,b)=>a<b?-1:a>b?1:0;
  projects.sort((a,b)=>compare(a.id,b.id));
  const sorted=key=>[...projects].sort((a,b)=>compare(key(b),key(a))||compare(a.id,b.id)).map(p=>p.id);
  return {schema_version:1,projects,filters:{games:[...new Set(projects.map(p=>p.game))].sort(),categories:[...new Set(projects.map(p=>p.category))].sort(),statuses:[...new Set(projects.map(p=>p.status))].sort()},sort:{name:[...projects].sort((a,b)=>compare(a.title.toLowerCase(),b.title.toLowerCase())||compare(a.id,b.id)).map(p=>p.id),release_date:sorted(p=>p.release?.release_date || ''),update_date:sorted(p=>p.last_updated)}};
}
export async function makeNeutralPlaceholder() {
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#202040"/><g fill="#f8f8f8" text-anchor="middle" font-family="Arial"><text x="320" y="135" font-size="29">DragonByte Z / Webfoot SDK</text><text x="320" y="190" font-size="20">Current artwork not supplied</text><text x="320" y="238" font-size="16">NEUTRAL PREVIEW PLACEHOLDER</text></g></svg>';
  return normalizeImage(await sharp(Buffer.from(svg)).png().toBuffer(),'cover');
}
export async function ingestRealRepositories(api, output) {
  if (process.env.GITHUB_ACTIONS || process.env.CI) throw Error('real-repository artwork review is local-only');
  const plan=await readJSON('proposals/log-hub-004a/repositories.json');
  assert.deepEqual(plan.projects.map(p=>p.repository_id).sort((a,b)=>a-b),realRepositoryIds);
  const actor=await api.request('/user');
  assert.equal(actor.id,previewOwner);
  const policy={version:1,trusted_owner_ids:[],revoked_owner_ids:[],projects:[]};
  const validationRoot=path.join(output,'untrusted-hub');
  await fs.mkdir(path.join(validationRoot,'records'),{recursive:true});
  await saveJSON(path.join(validationRoot,'policy/publishing.json'),policy);
  const issues=plan.projects.map((p,i)=>({number:i+1,user:{id:actor.id},body:guidedBody(p)}));
  const blocked=[];
  const fetched=[];
  const imageCache=new Map();
  const fetchImages=async (url,options) => {
    if (/dbz-layout-editor|dbz-map-browser/.test(url)) throw Error('obsolete artwork prohibited');
    const allowed=plan.projects.filter(p=>p.metadata.cover).some(p=>url===`${p.repository.replace('https://github.com/','https://raw.githubusercontent.com/')}/${p.inspected_commit}/${p.metadata.cover}`);
    if (!allowed) throw Error('unreviewed artwork URL');
    if (imageCache.has(url)) return new Response(imageCache.get(url));
    const response=await fetch(url,options);if(!response.ok)return response;
    const {boundedBody,MAX_IMAGE_BYTES}=await import('../../src/images.js');
    const bytes=await boundedBody(response,MAX_IMAGE_BYTES);imageCache.set(url,bytes);fetched.push(url);return new Response(bytes);
  };
  const repos=[];
  for (const p of plan.projects) {
    const repository=await repositoryInfo(api,{repository:p.repository},p.repository_id);
    assert.equal(repository.owner_id,previewOwner);assert.equal(repository.url,p.repository);
    const details=await api.request(`/repositories/${p.repository_id}`);
    assert.equal(details.default_branch,'master');assert.equal(details.description,p.github_description);
    const head=await api.request(`/repos/${details.full_name}/commits/HEAD`);
    assert.equal(head.sha,p.inspected_commit,'repository changed since editorial inspection; inspect current source before continuing');
    await assert.rejects(loadManifest(api,repository),e=>e.status===404);
    const releases=await api.request(`/repos/${details.full_name}/releases?per_page=100`);assert.ok(Array.isArray(releases));assert.equal(releases.length,0,'release availability changed; inspect before continuing');
    const release=await releaseInfo(api,{},repository);assert.equal(release,null);
    const candidate=parseSubmission(issues[plan.projects.indexOf(p)]);
    let record;
    if (p.metadata.cover) {
      record=manifestRecord(p.metadata,repository,head.sha);
      assert.deepEqual(record,manifestRecord(candidate.metadata,repository,head.sha));
    } else {
      assert.throws(()=>manifestRecord(p.metadata,repository,head.sha),/cover/);
      assert.throws(()=>manifestRecord(candidate.metadata,repository,head.sha),/cover/);
      blocked.push({repository_id:p.repository_id,reason:'Current approved repository cover art required; neutral preview placeholder is not submission-ready artwork.'});
    }
    repos.push({plan:p,repository,record,release,commit:head.sha});
  }
  const validation=await publish({root:validationRoot,output:path.join(output,'validation'),api,issues,fetcher:fetchImages});
  assert.equal(validation.catalog.projects.length,0);
  assert.ok(validation.report.every(r=>r.outcome==='review'));
  const work=path.join(output,'work');await fs.mkdir(path.join(work,'records'),{recursive:true});
  const sourceFacts=[];
  for (const r of repos) {
    const id=`gh-${r.repository.id}`;
    const state={repository:r.repository,release:r.release,availability:r.repository.archived?'archived':'available',warning:null,last_updated:r.repository.updated_at,ownership:{claim:'unclaimed',representation_verified:false}};
    if (r.record) {
      const {processImages}=await import('../../src/images.js');
      await processImages(r.record,work,fetchImages);
      await saveJSON(path.join(work,'records',id+'.json'),r.record);await saveJSON(path.join(work,'state',id+'.json'),state);
    }
    sourceFacts.push({repository:r.repository.url,repository_id:r.repository.id,owner_id:r.repository.owner_id,default_branch:'master',commit:r.commit,release:null,manifest_discovery:'absent',guided_source:'local form event; no hosted issue created',manifest_proposal_valid:!!r.record,production_approved:false,artwork:r.plan.metadata.cover?{path:r.plan.metadata.cover,source_dimensions:[1800,450],normalized_dimensions:[640,360]}:{placeholder:true,reason:'No current suitable artwork established'}});
  }
  const generated=await buildCatalog(work);
  const dbz=repos.find(r=>!r.record);const m=dbz.plan.metadata;const id=`gh-${dbz.repository.id}`;
  const target=path.join(work,'dist/assets',id);await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(target,'cover.webp'),await makeNeutralPlaceholder());
  const {schema_version,...editorial}=m;
  const placeholderProject={...editorial,id,featured:true,repository:dbz.repository.url,repository_id:dbz.repository.id,archived:dbz.repository.archived,availability:'available',warning:null,cover:`assets/${id}/cover.webp`,screenshots:[],release:null,last_updated:dbz.repository.updated_at,search_text:[m.title,m.developer,m.description,m.game,m.category].join(' ').normalize('NFKC').toLowerCase(),ownership:{claim:'unclaimed',representation_verified:false}};
  const catalog=combinePreview([...generated.projects,placeholderProject]);await validateSiteCatalog(catalog);
  await saveJSON(path.join(work,'dist/catalog.json'),catalog);
  await saveJSON(path.join(output,'preview-provenance.json'),{purpose:'real-preview',repository_ids:realRepositoryIds,placeholder_repository_ids:[dbz.repository.id],preview_spotlight_only:dbz.repository.id,production_approved:false,sources:sourceFacts});
  await saveJSON(path.join(output,'verification.json'),{read_only_github:true,remote_writes:0,live_owner:{id:actor.id,login:actor.login},projects:sourceFacts,blocked,untrusted_submission_report:validation.report,production_catalog_unchanged:true,artwork_requests:fetched,obsolete_artwork_requests:0});
  return catalog;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--live')) throw Error('Use --live for the explicitly requested read-only integration exercise');
  const auth=spawnSync('gh',['auth','token'],{encoding:'utf8',windowsHide:true});if(auth.status!==0)throw Error('GitHub authentication unavailable');
  const github=new GitHub({token:auth.stdout.trim()});
  const api={request:(endpoint,options={})=>{if(options.method && options.method!=='GET')throw Error('real preview is read-only');return github.request(endpoint,options);}};
  const catalog=await ingestRealRepositories(api,path.resolve('.review/004a/real-input'));
  console.log(`Read-only preview ingestion complete: ${catalog.projects.length} real repositories; no production approvals.`);
}
