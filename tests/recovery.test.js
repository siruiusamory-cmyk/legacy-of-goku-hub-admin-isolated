import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {generateKeyPairSync} from 'node:crypto';
import sharp from 'sharp';
import YAML from 'yaml';
import {readJSON, saveJSON} from '../src/records.js';
import {buildCatalog} from '../src/catalog.js';
import {imageHash, normalizeImage} from '../src/images.js';
import {publish} from '../src/publishing.js';
import {recoveryConfig, RecoveryStore, payloadFiles, materialize, seal, verifyEnvelope, verifyExport} from '../src/recovery.js';
import {backupHealth, assertSourceRevision} from '../src/backup-cli.js';
import {gitVault, publicAnchors} from './helpers/git-vault.js';

const project = await readJSON(new URL('./fixtures/project.json', import.meta.url));
const gh = await readJSON(new URL('./fixtures/github.json', import.meta.url));
const pair = generateKeyPairSync('ed25519');
const privateKey = pair.privateKey.export({format: 'pem', type: 'pkcs8'});
const config = {version: 1, enabled: true, source_repository: 'test-owner/test-hub', source_repository_id: 42, backup_repository: 'test-owner/private-vault', backup_repository_id: 84, default_branch: 'main', signing_key_id: 'test', public_keys: {test: pair.publicKey.export({format: 'pem', type: 'spki'})}};
const sourceCommit = 'a'.repeat(40);
const provenance = run_id => ({source_commit: sourceCommit, run_id, workflow: '.github/workflows/catalog.yml', ref: 'refs/heads/main', kind: run_id === 1 ? 'initialization' : 'publication'});
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-recovery-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const snapshot = path.join(root, 'snapshot');
  const repository = {id: 123, owner_id: 99, url: project.repository, owner: 'fixture-owner', owner_type: 'User', archived: false, updated_at: gh.repository.updated_at};
  const state = {repository, release: null, availability: 'available', warning: null, last_updated: gh.repository.updated_at, ownership: {claim: 'repository-controlled', representation_verified: false}};
  await saveJSON(path.join(snapshot, 'registry.json'), {version: 1, entries: [{id: project.id, repository_id: 123, owner_id: 99, source: {method: 'manifest', issue: 1}}]});
  await saveJSON(path.join(snapshot, 'records', project.id + '.json'), project); await saveJSON(path.join(snapshot, 'state', project.id + '.json'), state);
  const png = await sharp({create: {width: 20, height: 30, channels: 3, background: 'red'}}).png().toBuffer();
  await fs.mkdir(path.join(snapshot, 'assets', project.id), {recursive: true});
  for (const [name, kind] of [['cover.webp', 'cover'], ['screenshot-1.webp', 'screenshot']]) await fs.writeFile(path.join(snapshot, 'assets', project.id, name), await normalizeImage(png, kind));
  const registry = await readJSON(path.join(snapshot, 'registry.json'));
  registry.entries[0].moderation = {initial_content_digest: 'c'.repeat(64), artwork: await Promise.all(['cover.webp','screenshot-1.webp'].map(async name => ({source_sha256: imageHash(png), sha256: imageHash(await fs.readFile(path.join(snapshot,'assets',project.id,name)))})))};
  await saveJSON(path.join(snapshot,'registry.json'),registry);
  await buildCatalog(snapshot);
  const catalog = path.join(snapshot, 'dist/catalog.json');
  const api = await gitVault(path.join(root, 'vault.git'), config); const anchors = publicAnchors(config, sourceCommit);
  const store = new RecoveryStore(config, api, anchors);
  return {root, snapshot, catalog, api, anchors, store, files: await payloadFiles(snapshot, catalog)};
}
async function protect(s, files, run = 1) {
  const point = await s.store.backup(files, provenance(run), privateKey, {initialize: run === 1});
  await s.store.anchor(point); return point;
}
test('signed complete snapshots use real Git objects, immutable releases and protected anchors', async t => {
  const s = await setup(t); const point = await protect(s, s.files);
  assert.equal((await s.store.latest()).point, point.point);
  await materialize(await s.store.latest(), path.join(s.root, 'restored'));
  assert.deepEqual(await fs.readFile(path.join(s.root, 'restored/assets', project.id, 'cover.webp')), s.files.get(`assets/${project.id}/cover.webp`));
  assert.ok(s.api.git(['rev-parse', `refs/tags/loghub-v1/${point.point}`]).toString().trim() === point.commit);
});
test('unchanged state is idempotent without new blobs, commits, releases or anchors', async t => {
  const s = await setup(t); const first = await protect(s, s.files); const before = s.api.calls.filter(c => c.method === 'POST').length;
  const reused = await s.store.backup(s.files, provenance(2), privateKey); await s.store.anchor(reused);
  assert.equal(reused.point, first.point); assert.equal(reused.reused, true);
  assert.equal(s.api.calls.filter(c => c.method === 'POST').length, before); assert.equal(s.anchors.anchors.size, 1);
});
test('interrupted writes cannot change the previously anchored recovery point', async t => {
  const s = await setup(t); const first = await protect(s, s.files);
  const changed = new Map(s.files); const record = JSON.parse(changed.get(`records/${project.id}.json`)); record.title = 'Changed fixture'; changed.set(`records/${project.id}.json`, Buffer.from(JSON.stringify(record)));
  const original = s.api.request.bind(s.api);
  s.api.request = async (endpoint, options) => {if (endpoint.endsWith('/git/commits') && options?.method === 'POST') throw Error('simulated interrupted commit'); return original(endpoint, options);};
  await assert.rejects(s.store.backup(changed, provenance(2), privateKey), /interrupted/);
  assert.equal((await s.store.latest()).point, first.point);
});
test('completed private backup without public anchor is not a publication or recovery authority', async t => {
  const s = await setup(t); await s.store.backup(s.files, provenance(1), privateKey, {initialize: true});
  await assert.rejects(s.store.latest(), /initialized/);
  assert.equal(s.anchors.anchors.size, 0);
});
test('missing/corrupted newest point exposes an older valid point but requires exact rollback policy', async t => {
  const s = await setup(t); const first = await protect(s, s.files);
  const fakePoint = '2-' + 'b'.repeat(64);
  s.anchors.anchors.set('refs/tags/loghub-anchor-v1/' + fakePoint + '-' + 'f'.repeat(40), sourceCommit);
  await assert.rejects(s.store.latest(), /rollback authorization/);
  assert.equal((await s.store.latest({inspect: true})).point, first.point);
  const authorized = new RecoveryStore({...config, rollback: {point: first.point, observed_newest: fakePoint, reason: 'Administrator-approved recovery from corrupt point'}}, s.api, s.anchors);
  assert.equal((await authorized.latest()).point, first.point);
  await materialize(await authorized.latest(), path.join(s.root, 'authorized-restore'));
});
test('wrong key, repository IDs, provenance, traversal and tampering are rejected', async t => {
  const s = await setup(t); const envelope = seal(config, s.files, provenance(1), privateKey);
  for (const patch of [{source_repository_id: 43}, {backup_repository_id: 85}, {schema_version: 2}, {signature: 'x'.repeat(88)}, {provenance: {...provenance(1), ref: 'refs/heads/untrusted'}}, {files: [{path: '../token', size: 1, sha256: 'a'.repeat(64)}]}]) assert.throws(() => verifyEnvelope(config, {...envelope, ...patch}));
  assert.throws(() => recoveryConfig({version: 1, enabled: false}), /disabled/);
  assert.throws(() => recoveryConfig({...config, public_keys: {test: privateKey}}), /public keys/);
  s.api.request = async () => ({id: 84, full_name: config.backup_repository, private: false});
  await assert.rejects(s.store.points(), /private backup/);
});
test('backup excludes raw caches, policy, environment files and refuses credential-like record values', async t => {
  const s = await setup(t);
  await saveJSON(path.join(s.snapshot, 'github-cache.json'), {untrusted: 'not-recovery-authority'});
  await fs.writeFile(path.join(s.snapshot, '.env'), 'not copied'); await saveJSON(path.join(s.snapshot, 'publishing.json'), {trusted_owner_ids: [666]});
  const files = await payloadFiles(s.snapshot, s.catalog);
  assert.ok(!files.has('.env') && !files.has('github-cache.json') && !files.has('publishing.json'));
  const record = {...project, description: 'Accidental token ghp_' + 'a'.repeat(30)};
  await saveJSON(path.join(s.snapshot, 'records', project.id + '.json'), record);
  await assert.rejects(payloadFiles(s.snapshot, s.catalog), /credential/);
});
test('immutable-release verification failure prevents protected publication', async t => {
  const s = await setup(t); const point = await protect(s, s.files);
  s.api.releases.get('loghub-v1/' + point.point).immutable = false;
  await assert.rejects(s.store.latest(), /no valid recovery point/);
});
test('restoring never overwrites existing directories and re-applies current delisting/revocation policy', async t => {
  const s = await setup(t); await protect(s, s.files); const destination = path.join(s.root, 'restored');
  await materialize(await s.store.latest(), destination);
  await assert.rejects(materialize(await s.store.latest(), destination), /overwrite/);
  const current = path.join(s.root, 'current'); await fs.mkdir(path.join(current, 'records'), {recursive: true});
  await saveJSON(path.join(current, 'policy/publishing.json'), {version: 1, trusted_owner_ids: [], revoked_owner_ids: [99], projects: [{repository_id: 123, owner_id: 99, project_id: project.id, content_digests: ['c'.repeat(64)], artwork_sets: [JSON.parse(s.files.get('registry.json')).entries[0].moderation.artwork], decision: 'delisted'}]});
  const result = await publish({root: current, previous: destination, output: path.join(s.root, 'output'), issues: [], api: {request: async () => {throw Error('API outage');}}});
  assert.equal(result.catalog.projects.length, 0);
  assert.equal((await readJSON(path.join(s.root, 'output/snapshot/registry.json'))).entries.length, 1);
});
test('empty replacement and stale concurrent writers are refused', async t => {
  const s = await setup(t); const first = await protect(s, s.files);
  const empty = new Map([['registry.json', Buffer.from('{"version":1,"entries":[]}')], ['catalog.json', s.files.get('catalog.json')]]);
  await assert.rejects(s.store.backup(empty, provenance(2), privateKey), /empty/);
  const changed = new Map(s.files); changed.set('registry.json', Buffer.from(JSON.stringify(JSON.parse(s.files.get('registry.json')), null, 1)));
  await assert.rejects(s.store.backup(changed, provenance(1), privateKey), /backward|reuse/);
  assert.equal((await s.store.latest()).point, first.point);
});
test('backup-health alerts on API outages, no verified publications and stale runs', async t => {
  const s = await setup(t); await protect(s, s.files); const now = Date.now();
  const run = {id: 2, repository: {id: 42}, head_repository: {id: 42}, path: '.github/workflows/catalog.yml', head_branch: 'main', event: 'schedule', updated_at: new Date(now).toISOString()};
  const api = {request: async endpoint => endpoint.includes('/runs?') ? {workflow_runs: [run]} : {jobs: [{name: 'publish', status: 'completed', conclusion: 'success'}]}};
  assert.equal((await backupHealth(api, s.store, now)).verified_publication_run, 2);
  await assert.rejects(backupHealth(api, s.store, now + 49 * 3600000), /stale/);
  await assert.rejects(backupHealth({request: async () => {throw Error('API unavailable');}}, s.store), /unavailable/);
});
test('every operational job pins the triggering revision rather than a moving default branch', async () => {
  for (const name of ['catalog.yml', 'initialize-backup.yml', 'backup-health.yml']) {
    const workflow = YAML.parse(await fs.readFile(new URL('../.github/workflows/' + name, import.meta.url), 'utf8'));
    for (const job of Object.values(workflow.jobs)) for (const step of job.steps) if (step.uses?.startsWith('actions/checkout@')) assert.equal(step.with.ref, '${{ github.sha }}');
  }
});
test('final publication verification reads actual dist images and rejects changed, missing or extra files', async t => {
  const s = await setup(t); const protectedPoint = await protect(s, s.files);
  const module = await import('../src/recovery.js');
  assert.equal(typeof module.verifyPublicationFiles, 'function');
  const directory = path.join(s.snapshot, 'dist');
  await module.verifyPublicationFiles(protectedPoint, directory);
  const cover = path.join(directory, 'assets', project.id, 'cover.webp');
  await fs.writeFile(cover, 'replaced only in dist');
  await assert.rejects(module.verifyPublicationFiles(protectedPoint, directory), /publication/);
  await fs.unlink(cover);
  await assert.rejects(module.verifyPublicationFiles(protectedPoint, directory), /publication/);
  await fs.writeFile(cover, s.files.get(`assets/${project.id}/cover.webp`));
  await fs.writeFile(path.join(directory, 'unexpected.txt'), 'extra');
  await assert.rejects(module.verifyPublicationFiles(protectedPoint, directory), /publication/);
});
test('immutable release must lock the exact signed private commit', async t => {
  const s = await setup(t); const point = await protect(s, s.files);
  s.api.git(['update-ref', 'refs/tags/loghub-v1/' + point.point, s.api.initial]);
  await assert.rejects(s.store.latest(), /no valid recovery point/);
});
test('a moderation-policy merge invalidates an in-flight candidate before publication', async () => {
  const original = 'a'.repeat(40); const updated = 'b'.repeat(40);
  const current = {request: async () => ({object: {type: 'commit', sha: updated}})};
  await assert.rejects(assertSourceRevision(current, config, original), /stale candidate/);
  await assertSourceRevision(current, config, updated);
});
test('integration snapshots cannot be restored as production even with the same verification key', async t => {
  const s = await setup(t);
  const envelope = seal({...config, purpose: 'integration'}, s.files, {...provenance(1), workflow: '.github/workflows/hosted-integration.yml'}, privateKey);
  assert.throws(() => verifyEnvelope(config, envelope), /integration/);
});
test('signed off-platform exports verify without GitHub and reject tampering', async t => {
  const s = await setup(t); await protect(s, s.files); const directory = path.join(s.root, 'offline-export');
  await materialize(await s.store.latest(), directory);
  s.api.request = async () => {throw Error('GitHub unavailable');}; s.anchors.request = s.api.request;
  assert.equal((await verifyExport(config, directory)).files.size, s.files.size);
  await fs.writeFile(path.join(directory, 'assets', project.id, 'cover.webp'), 'changed');
  await assert.rejects(verifyExport(config, directory), /checksum/);
});

test('revoking the last artwork publishes an empty protected catalog only under explicit delisting policy',async t=>{
 const s=await setup(t);const old=await protect(s,s.files);
 const root=path.join(s.root,'moderation-root');await fs.mkdir(path.join(root,'records'),{recursive:true});
 const policy={version:1,trusted_owner_ids:[],revoked_owner_ids:[],projects:[{repository_id:123,owner_id:99,project_id:project.id,decision:'delisted',content_digests:[],artwork_sets:[]}]};
 await saveJSON(path.join(root,'policy/publishing.json'),policy);
 const output=path.join(s.root,'removed');
 const result=await publish({root,previous:s.snapshot,output,issues:[],api:{request:async()=>{throw Error('outage');}}});
 assert.equal(result.catalog.projects.length,0);
 const files=await payloadFiles(path.join(output,'snapshot'),path.join(output,'work/dist/catalog.json'));
 assert.equal(JSON.parse(files.get('registry.json')).entries.length,0);
 assert.equal([...files.keys()].some(n=>n.startsWith('assets/')),false);
 for(const mutate of [p=>p.projects[0].decision='approved',p=>p.projects[0].project_id='wrong-project',p=>p.projects[0].owner_id=666,p=>p.projects=[]]){
  const wrong=structuredClone(policy);mutate(wrong);
  await assert.rejects(s.store.backup(files,provenance(2),privateKey,{policy:wrong}),/empty catalog/);
 }
 const point=await s.store.backup(files,provenance(2),privateKey,{policy});await s.store.anchor(point);
 const latest=await s.store.latest();assert.equal(latest.point,point.point);
 const {verifyPublicationFiles}=await import('../src/recovery.js');
 await verifyPublicationFiles(latest,path.join(output,'work/dist'));
 assert.equal(JSON.parse((await s.store.read(old)).files.get('registry.json')).entries.length,1);
});
