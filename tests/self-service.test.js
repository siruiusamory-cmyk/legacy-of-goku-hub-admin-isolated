import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import YAML from 'yaml';
import {readJSON, saveJSON} from '../src/records.js';
import {GitHub, releaseInfo} from '../src/github.js';
import {contentDigest} from '../src/moderation.js';
import {inspectImages} from '../src/images.js';
import {loadManifest, manifestRecord, parseSubmission, digest} from '../src/intake.js';
import {publish, policyCheck, readSnapshot} from '../src/publishing.js';
import {selectSnapshot} from '../src/service-cli.js';
import {normalizeImage} from '../src/images.js';

const fixture = await readJSON(new URL('./fixtures/github.json', import.meta.url));
const repo = {...fixture.repository, owner: {...fixture.repository.owner, id: 99}};
const repository = {id: repo.id, owner_id: 99, owner: repo.owner.login, owner_type: 'User', url: repo.html_url};
const metadata = {schema_version: 1, title: 'TEST FIXTURE only', developer: 'Fixture team', description: 'Synthetic project used only for automated tests.', game: 'legacy-of-goku-2', category: 'rom-hack', status: 'in-development', cover: 'images/cover.png', screenshots: ['images/screen.png']};
const sha = 'a'.repeat(40);
const png = await sharp({create: {width: 80, height: 120, channels: 3, background: 'red'}}).png().toBuffer();
const fetchImages = async (_, options) => new Response(options.method === 'HEAD' ? null : png);
const fixtureApproval = {project_id: 'gh-123', content_digests: [contentDigest(manifestRecord(metadata, repository, sha), repository, await releaseInfo(api(), {}, repository))], artwork_sets: [(await inspectImages(manifestRecord(metadata, repository, sha), fetchImages)).artwork]};
const emptyPolicy = () => ({version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: []});
function issue({method = 'Repository manifest', number = 1, user_id = 99, action = 'Submit or update', data = metadata} = {}) {
  const fields = {'Repository URL': repo.html_url, 'Submission method': method, Request: action};
  if (method === 'Guided form') Object.assign(fields, {'Project title': data.title, 'Developer or team': data.developer, Description: data.description, 'Base game': data.game, Category: data.category, 'Development status': data.status, 'Cover image': data.cover, Screenshots: (data.screenshots || []).join('\n'), 'Project links': (data.links || []).map(l => `${l.label} ${l.url}`).join('\n')});
  return {number, user: {id: user_id, login: user_id === 99 ? 'fixture-owner' : 'third-party'}, title: '[Submission] test only', body: Object.entries(fields).map(([k, v]) => `### ${k}\n\n${v || '_No response_'}`).join('\n\n')};
}
function api(options = {}) {
  const client = new GitHub({token: '', fetcher: async url => {
    const r = options.repository || repo;
    if (options.failure) return new Response('{}', {status: options.failure});
    if (url.includes('/commits/HEAD')) return Response.json({sha: options.sha || sha});
    if (url.includes('/contents/.loghub.json')) {
      if (options.noManifest) return new Response('{}', {status: 404});
      const bytes = Buffer.from(JSON.stringify(options.metadata || metadata));
      return Response.json(options.file || {type: 'file', path: '.loghub.json', encoding: 'base64', size: bytes.length, content: bytes.toString('base64')});
    }
    if (url.includes('/releases/latest')) return new Response(JSON.stringify(fixture.release), {status: options.noRelease ? 404 : 200});
    if (url.includes('/assets?')) return Response.json((options.assets || fixture.assets).map(a => ({...a, browser_download_url: a.browser_download_url.replace(repo.html_url, r.html_url)})));
    return Response.json(r);
  }});
  return client;
}
async function setup(t, policy = emptyPolicy()) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'log-hub-self-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'records')); await saveJSON(path.join(root, 'policy/publishing.json'), policy);
  return root;
}
async function run(root, {client = api(), issues = [issue()], previous, name = 'first', fetcher = fetchImages} = {}) {
  const output = path.join(root, name);
  return {...await publish({root, output, api: client, issues, previous, fetcher}), snapshot: path.join(output, 'snapshot')};
}
function trusted() {return {...emptyPolicy(), trusted_owner_ids: [99], projects: [{...fixtureApproval, repository_id: 123, owner_id: 99, decision: 'approved'}]};}

test('manifest discovery is bounded, versioned and cannot override identity or policy', async () => {
  const loaded = await loadManifest(api(), repository);
  const r = manifestRecord(loaded.metadata, repository, loaded.commit);
  assert.equal(r.id, 'gh-123'); assert.equal(r.repository, repo.html_url);
  assert.equal(r.cover, `https://raw.githubusercontent.com/fixture-owner/fixture-repo/${sha}/images/cover.png`);
  for (const data of [{...metadata, repository_id: 123}, {...metadata, trusted: true}, {...metadata, schema_version: 2}, {...metadata, id: 'takeover'}, {...metadata, cover: '../secret.png'}, {...metadata, links: [{label: 'bad', url: 'http://127.0.0.1/'}]}, {...metadata, links: [{label: 'ROM', url: 'https://github.com/a/b/game.gba'}]}]) assert.throws(() => manifestRecord(data, repository, sha));
  await assert.rejects(loadManifest(api({file: {type: 'file', path: '.loghub.json', size: 16385, encoding: 'base64', content: 'e30='}}), repository), /16 KiB/);
  await assert.rejects(loadManifest(api({file: {type: 'symlink', path: '.loghub.json'}}), repository));
});
test('guided fields need no JSON and produce the same internal record as a manifest', () => {
  const parsed = parseSubmission(issue({method: 'Guided form'}));
  assert.deepEqual(manifestRecord(parsed.metadata, repository, sha), manifestRecord({...metadata, links: []}, repository, sha));
  assert.throws(() => parseSubmission({...issue(), body: issue().body + '\n\n### Repository URL\n\nhttps://github.com/attacker/repo'}), /duplicate/);
});
test('content-approved manifest owner publishes even if a third party points to it', async t => {
  const root = await setup(t, trusted()); const result = await run(root, {issues: [issue({user_id: 999})]});
  assert.equal(result.catalog.projects.length, 1); assert.equal(result.catalog.projects[0].ownership.claim, 'repository-controlled');
  assert.equal(result.catalog.projects[0].ownership.representation_verified, false);
});
test('new/untrusted manifest and guided submissions enter review', async t => {
  const root = await setup(t);
  for (const [name, candidate, client] of [['manifest', issue(), api()], ['guided', issue({method: 'Guided form'}), api({noManifest: true})]]) {
    const result = await run(root, {name, issues: [candidate], client});
    assert.equal(result.catalog.projects.length, 0); assert.ok(result.report.some(r => /review/.test(r.reason)));
  }
});
test('content-approved guided owner publishes; matching URL from an untrusted author grants no control', async t => {
  const root = await setup(t, trusted());
  const first = await run(root, {client: api({noManifest: true}), issues: [issue({method: 'Guided form'})]});
  const forged = issue({method: 'Guided form', user_id: 666, number: 2, action: 'Claim ownership', data: {...metadata, title: 'Takeover'}});
  const next = await run(root, {name: 'next', previous: first.snapshot, client: api({noManifest: true}), issues: [issue({method: 'Guided form'}), forged]});
  assert.equal(next.catalog.projects[0].title, metadata.title);
  assert.ok(next.report.some(r => r.issue === 2 && r.outcome === 'review'));
});
test('approved third-party submission stays unclaimed; edited body cannot reuse approval', async t => {
  const candidate = issue({method: 'Guided form', user_id: 666}); const approval = {...fixtureApproval, repository_id: 123, owner_id: 99, decision: 'approved', approved_issue: 1, approved_digest: parseSubmission(candidate).digest};
  const root = await setup(t, {...emptyPolicy(), projects: [approval]});
  const first = await run(root, {client: api({noManifest: true}), issues: [candidate]});
  assert.equal(first.catalog.projects[0].ownership.claim, 'unclaimed');
  const changed = issue({method: 'Guided form', user_id: 666, data: {...metadata, title: 'Unauthorized edit'}});
  const next = await run(root, {name: 'next', previous: first.snapshot, client: api({noManifest: true}), issues: [changed]});
  assert.equal(next.catalog.projects[0].title, metadata.title);
  assert.ok(next.report.some(r => r.outcome === 'retained'));
});
test('repository owner can claim an approved unclaimed project without seizing team representation', async t => {
  const third = issue({method: 'Guided form', user_id: 666});
  const root = await setup(t, {...emptyPolicy(), projects: [{...fixtureApproval, repository_id: 123, owner_id: 99, decision: 'approved', approved_issue: 1, approved_digest: parseSubmission(third).digest}]});
  const first = await run(root, {client: api({noManifest: true}), issues: [third]});
  const claim = issue({method: 'Guided form', number: 2, action: 'Claim ownership'});
  const next = await run(root, {name: 'next', previous: first.snapshot, client: api({noManifest: true}), issues: [third, claim]});
  assert.equal(next.catalog.projects[0].ownership.claim, 'repository-controlled');
  assert.equal(next.catalog.projects[0].ownership.representation_verified, false);
});
test('organization membership is not control; representatives require administrator policy', async t => {
  const org = {...repo, owner: {...repo.owner, type: 'Organization'}};
  const root = await setup(t, trusted());
  const candidate = issue({method: 'Guided form'});
  assert.equal((await run(root, {client: api({repository: org, noManifest: true}), issues: [candidate]})).catalog.projects.length, 0);
  await saveJSON(path.join(root, 'policy/publishing.json'), {...emptyPolicy(), projects: [{...fixtureApproval, repository_id: 123, owner_id: 99, decision: 'approved', representative_ids: [99], representation_verified: true}]});
  const result = await run(root, {name: 'second', client: api({repository: org, noManifest: true}), issues: [candidate]});
  assert.equal(result.catalog.projects[0].ownership.representation_verified, true);
});
test('approved manifest changes and releases synchronize with no metadata PR', async t => {
  const root = await setup(t, trusted()); const first = await run(root);
  const result = await run(root, {name: 'next', previous: first.snapshot, client: api({metadata: {...metadata, description: 'Updated repository-owned description for the test fixture.'}, assets: [{...fixture.assets[0], size: 8888}]})});
  assert.match(result.catalog.projects[0].description, /Updated/); assert.equal(result.catalog.projects[0].release.file_size, 8888);
});
test('sensitive attribution changes freeze until their exact metadata digest is approved', async t => {
  const root = await setup(t, trusted()); const first = await run(root); const changed = {...metadata, developer: 'Another team'};
  const held = await run(root, {name: 'held', previous: first.snapshot, client: api({metadata: changed})});
  assert.equal(held.catalog.projects[0].developer, metadata.developer); assert.match(held.report.at(-1).reason, /sensitive/);
  await saveJSON(path.join(root, 'policy/publishing.json'), {...emptyPolicy(), projects: [{...fixtureApproval, repository_id: 123, owner_id: 99, decision: 'approved', approved_metadata_digest: digest(changed)}]});
  assert.equal((await run(root, {name: 'approved', previous: held.snapshot, client: api({metadata: changed})})).catalog.projects[0].developer, changed.developer);
});
test('transfers freeze claims; same-ID renames work; explicit new-owner approval allows transfer', async t => {
  const root = await setup(t, trusted()); const first = await run(root);
  const transferred = {...repo, owner: {...repo.owner, id: 777}};
  const held = await run(root, {name: 'held', previous: first.snapshot, client: api({repository: transferred})});
  assert.equal((await readSnapshot(held.snapshot))[0].owner_id, 99); assert.match(held.report.at(-1).reason, /transfer/);
  const renamed = {...repo, full_name: 'fixture-owner/renamed', html_url: 'https://github.com/fixture-owner/renamed'};
  const renamedResult = await run(root, {name: 'renamed', previous: first.snapshot, client: api({repository: renamed})});
  assert.equal(renamedResult.catalog.projects[0].repository, renamed.html_url); assert.equal(renamedResult.catalog.projects[0].id, 'gh-123');
  await saveJSON(path.join(root, 'policy/publishing.json'), {...emptyPolicy(), projects: [{...fixtureApproval, content_digests: [...fixtureApproval.content_digests, contentDigest(manifestRecord(metadata, {...repository, owner_id: 777}, sha), {...repository, owner_id: 777}, await releaseInfo(api(), {}, repository))], repository_id: 123, owner_id: 777, decision: 'approved'}]});
  assert.equal((await readSnapshot((await run(root, {name: 'approved', previous: first.snapshot, client: api({repository: transferred})})).snapshot))[0].owner_id, 777);
});
test('revocation freezes; suspension and delisting omit projects but retain recovery snapshots', async t => {
  const root = await setup(t, trusted()); const first = await run(root);
  await saveJSON(path.join(root, 'policy/publishing.json'), {...trusted(), revoked_owner_ids: [99]});
  const held = await run(root, {name: 'held', previous: first.snapshot}); assert.match(held.report.at(-1).reason, /revoked/);
  for (const decision of ['suspended', 'delisted']) {
    await saveJSON(path.join(root, 'policy/publishing.json'), {...trusted(), projects: [{...fixtureApproval, repository_id: 123, owner_id: 99, decision}]});
    const result = await run(root, {name: decision, previous: first.snapshot});
    assert.equal(result.catalog.projects.length, 0); assert.equal((await readSnapshot(result.snapshot)).length, 1);
  }
});
test('dispute reports cannot change a listing; moderator hold freezes updates', async t => {
  const root = await setup(t, trusted()); const first = await run(root);
  const result = await run(root, {name: 'next', previous: first.snapshot, issues: [issue({number: 2, user_id: 666, action: 'Report ownership dispute'})]});
  assert.equal(result.catalog.projects[0].title, metadata.title); assert.ok(result.report.some(r => /dispute/.test(r.reason)));
});
test('temporary API/image/download failures retain data and recovery clears warnings', async t => {
  const root = await setup(t, trusted()); const first = await run(root);
  for (const status of [403, 404, 429, 500]) {
    const held = await run(root, {name: `error-${status}`, previous: first.snapshot, client: api({failure: status})});
    assert.equal(held.catalog.projects[0].release.file_size, 1234); assert.equal(held.catalog.projects[0].availability, 'unavailable');
    const recovered = await run(root, {name: `recovered-${status}`, previous: held.snapshot}); assert.equal(recovered.catalog.projects[0].warning, null);
  }
  const failed = await run(root, {name: 'download-failed', previous: first.snapshot, fetcher: async () => new Response(null, {status: 404})});
  assert.equal(failed.catalog.projects[0].release.file_size, 1234); assert.match(failed.report.at(-1).reason, /download/);
  const imageFailed = await run(root, {name: 'image-failed', previous: first.snapshot, client: api({metadata: {...metadata, cover: 'images/new.png'}}), fetcher: async (_, init) => new Response(init.method === 'HEAD' ? null : 'corrupt')});
  assert.equal(imageFailed.catalog.projects[0].cover, first.catalog.projects[0].cover); assert.equal(imageFailed.catalog.projects[0].warning !== null, true);
});
test('missing manifest does not release ownership; duplicates coalesce by numeric repository ID', async t => {
  const root = await setup(t, trusted()); const first = await run(root);
  const next = await run(root, {name: 'next', previous: first.snapshot, client: api({noManifest: true}), issues: [issue({method: 'Guided form', number: 2, user_id: 666})]});
  assert.equal(next.catalog.projects.length, 1); assert.match(next.report.at(-1).reason, /manifest missing/);
  const duplicate = await run(root, {name: 'duplicates', issues: [issue(), issue({number: 2})]}); assert.equal(duplicate.catalog.projects.length, 1);
});
test('catalog and registry builds are deterministic; invalid snapshots fail closed', async t => {
  const root = await setup(t, trusted()); const first = await run(root); const next = await run(root, {name: 'next'});
  for (const relative of ['work/dist/catalog.json', 'snapshot/registry.json', 'work/dist/assets/gh-123/cover.webp']) assert.deepEqual(await fs.readFile(path.join(root, 'first', relative)), await fs.readFile(path.join(root, 'next', relative)));
  await saveJSON(path.join(first.snapshot, 'registry.json'), {version: 1, entries: [{id: '../../escape', repository_id: 123, owner_id: 99, source: {method: 'manifest'}}]});
  await assert.rejects(run(root, {name: 'invalid', previous: first.snapshot}), /snapshot/);
  assert.throws(() => policyCheck({...trusted(), trusted_owner_ids: ['99']}));
});
test('artifact restore rejects untrusted runs and fails closed on expired state', async () => {
  const run = {id: 10, path: '.github/workflows/catalog.yml', event: 'schedule', head_branch: 'main', repository: {id: 42}, head_repository: {id: 42}};
  const client = (runs, artifacts) => ({request: async endpoint => endpoint.includes('/runs?') ? {workflow_runs: runs} : endpoint.includes('/jobs?') ? {jobs: [{name: 'publish', status: 'completed', conclusion: 'success'}]} : endpoint.includes('/artifacts?') ? {artifacts} : {id: 42, default_branch: 'main'}});
  assert.equal(await selectSnapshot(client([run], [{name: 'catalog-state', expired: false}, {name: 'catalog', expired: false}]), 'hub/repo', '11'), '10');
  assert.equal(await selectSnapshot(client([{...run, head_repository: {id: 666}}], []), 'hub/repo', '11'), '');
  await assert.rejects(selectSnapshot(client([run], [{name: 'catalog-state', expired: true}]), 'hub/repo', '11'), /restore a backup/);
});
test('publisher cannot write repository contents; only isolated feedback writes issue comments', async () => {
  const workflow = YAML.parse(await fs.readFile(new URL('../.github/workflows/catalog.yml', import.meta.url), 'utf8'));
  assert.deepEqual(workflow.jobs.publish.permissions, {contents: 'read', issues: 'read', actions: 'read'});
  assert.equal(workflow.jobs.feedback.permissions.issues, 'write');
  assert.equal(workflow.jobs.feedback.permissions.contents, 'read');
  assert.ok(!workflow.jobs.publish.steps.some(s => s.uses?.includes('create-pull-request')));
  for (const form of ['submit.yml', 'manifest.yml']) {
    const parsed = YAML.parse(await fs.readFile(new URL('../.github/ISSUE_TEMPLATE/' + form, import.meta.url), 'utf8'));
    assert.ok(!parsed.body.some(b => b.attributes?.render === 'json'));
  }
});
test('unauthorized manifest pointer cannot freeze an approved guided owner update', async t => {
  const root = await setup(t, trusted());
  const first = await run(root, {client: api({noManifest: true}), issues: [issue({method: 'Guided form'})]});
  const update = issue({method: 'Guided form', number: 2, data: {...metadata, title: 'Authorized newer title'}});
  const attacker = issue({number: 3, user_id: 666});
  const result = await run(root, {name: 'next', previous: first.snapshot, client: api({noManifest: true}), issues: [issue({method: 'Guided form'}), update, attacker]});
  assert.equal(result.catalog.projects[0].title, 'Authorized newer title');
  assert.equal(result.catalog.projects[0].availability, 'available');
});
test('missing newest guided source must not roll metadata back to an older issue', async t => {
  const root = await setup(t, trusted());
  const original = issue({method: 'Guided form'});
  const update = issue({method: 'Guided form', number: 2, data: {...metadata, title: 'Newest published title'}});
  const approved = trusted(); approved.projects[0].content_digests.push(contentDigest(manifestRecord(parseSubmission(update).metadata, repository, sha), repository, await releaseInfo(api(), {}, repository)));
  await saveJSON(path.join(root, 'policy/publishing.json'), approved);
  const first = await run(root, {client: api({noManifest: true}), issues: [original, update]});
  const result = await run(root, {name: 'next', previous: first.snapshot, client: api({noManifest: true}), issues: [original]});
  assert.equal(result.catalog.projects[0].title, 'Newest published title');
  assert.equal(result.catalog.projects[0].availability, 'unavailable');
});
test('feedback failure cannot make restoration skip an already successful publisher job', async () => {
  const completed = id => ({id, status: 'completed', conclusion: id === 11 ? 'failure' : 'success', path: '.github/workflows/catalog.yml', event: 'issues', head_branch: 'main', repository: {id: 42}, head_repository: {id: 42}});
  const client = {request: async endpoint => {
    if (endpoint.includes('/runs?')) return {workflow_runs: endpoint.includes('status=success') ? [completed(10)] : [completed(11), completed(10)]};
    if (endpoint.includes('/jobs?')) return {jobs: [{name: 'publish', status: 'completed', conclusion: 'success'}, {name: 'feedback', status: 'completed', conclusion: 'failure'}]};
    if (endpoint.includes('/artifacts?')) return {artifacts: [{name: 'catalog-state', expired: false}, {name: 'catalog', expired: false}]};
    return {id: 42, default_branch: 'main'};
  }};
  assert.equal(await selectSnapshot(client, 'hub/repo', '12'), '11');
});
test('interrupted publishers with partial artifacts never replace the prior complete snapshot', async () => {
  const completed = id => ({id, path: '.github/workflows/catalog.yml', event: 'schedule', head_branch: 'main', repository: {id: 42}, head_repository: {id: 42}});
  const client = {request: async endpoint => {
    if (endpoint.includes('/runs?')) return {workflow_runs: [completed(11), completed(10)]};
    if (endpoint.includes('/jobs?')) return {jobs: [{name: 'publish', status: 'completed', conclusion: endpoint.includes('/11/') ? 'failure' : 'success'}]};
    if (endpoint.includes('/artifacts?')) { assert.ok(!endpoint.includes('/11/')); return {artifacts: [{name: 'catalog-state', expired: false}, {name: 'catalog', expired: false}]}; }
    return {id: 42, default_branch: 'main'};
  }};
  assert.equal(await selectSnapshot(client, 'hub/repo', '12'), '10');
});
test('untrusted submissions still receive mechanical validation and never enter snapshots', async t => {
  const root = await setup(t);
  const result = await run(root, {client: api({metadata: {...metadata, category: 'unsupported'}})});
  assert.equal(result.catalog.projects.length, 0);
  assert.match(result.report.at(-1).reason, /manifest:/);
  assert.deepEqual((await readJSON(path.join(result.snapshot, 'registry.json'))).entries, []);
});
test('legacy migration without exact artwork approval is held even during an API outage', async t => {
  const root = await setup(t, {...emptyPolicy(), projects: [{...fixtureApproval, repository_id: 123, owner_id: 99, decision: 'approved'}]});
  const record = manifestRecord(metadata, repository, sha, 'legacy-fixture');
  await saveJSON(path.join(root, 'records/legacy-fixture.json'), record);
  await saveJSON(path.join(root, 'state/legacy-fixture.json'), {repository: {id: 123, url: repo.html_url, owner: 'fixture-owner', owner_type: 'User', archived: false, updated_at: '2026-01-02T00:00:00Z'}, release: null, availability: 'available', warning: null, last_updated: '2026-01-02T00:00:00Z'});
  await fs.mkdir(path.join(root, 'assets/legacy-fixture'), {recursive: true});
  await fs.writeFile(path.join(root, 'assets/legacy-fixture/cover.webp'), await normalizeImage(png, 'cover'));
  await fs.writeFile(path.join(root, 'assets/legacy-fixture/screenshot-1.webp'), await normalizeImage(png, 'screenshot'));
  const first = await run(root, {client: api({failure: 503}), issues: []});
  assert.equal(first.catalog.projects.length, 0);
  assert.equal((await readSnapshot(first.snapshot)).length, 0);
  const recovered = await run(root, {name: 'recovered', previous: first.snapshot, client: api({noManifest: true}), issues: []});
  assert.equal(recovered.catalog.projects.length, 0);
});

test('trusted owner still needs explicit first-content approval in both submission methods', async t => {
  for (const method of ['Repository manifest', 'Guided form']) {
    const root = await setup(t, {...emptyPolicy(), trusted_owner_ids: [99]});
    const held = await run(root, {client: api({noManifest: method === 'Guided form'}), issues: [issue({method})]});
    assert.equal(held.catalog.projects.length, 0);
    assert.equal((await readSnapshot(held.snapshot)).length, 0);
    assert.ok(held.report.some(r=>r.content_digest && r.artwork.length === 2));
    assert.deepEqual(await fs.readdir(path.join(root,'first')), ['report.json','snapshot','work']);
    assert.equal(await fs.stat(path.join(root,'first/candidates')).then(()=>true,()=>false), false);
  }
});

test('exact reviewed content publishes; post-review changes and approved artwork reordering are held', async t => {
  const root = await setup(t); const held = await run(root);
  const proposal = held.report.find(r=>r.content_digest);
  const approved = {...emptyPolicy(), projects: [{repository_id: 123, owner_id: 99, project_id: proposal.project_id, decision: 'approved', content_digests: [proposal.content_digest], artwork_sets: [proposal.artwork]}]};
  await saveJSON(path.join(root,'policy/publishing.json'), approved);
  const changed = await run(root,{name:'raced',client:api({metadata:{...metadata,title:'Changed after review'}})});
  assert.equal(changed.catalog.projects.length,0);
  const first = await run(root,{name:'approved'}); assert.equal(first.catalog.projects.length,1);
  const wrong = structuredClone(approved); wrong.projects[0].artwork_sets[0].reverse();
  await saveJSON(path.join(root,'policy/publishing.json'),wrong);
  const reordered = await run(root,{name:'wrong-order',previous:first.snapshot});
  assert.equal(reordered.catalog.projects.length,0);
});

test('changed cover at same URL cannot overwrite approved bytes or leak into artifacts', async t => {
  const root = await setup(t,trusted()); const first = await run(root);
  const replacement = await sharp({create:{width:80,height:120,channels:3,background:'blue'}}).png().toBuffer();
  const held = await run(root,{name:'replacement',previous:first.snapshot,fetcher:async (_,options)=>new Response(options.method==='HEAD'?null:replacement)});
  assert.equal(held.catalog.projects[0].title, metadata.title);
  const oldBytes=await fs.readFile(path.join(first.snapshot,'assets/gh-123/cover.webp'));
  assert.deepEqual(await fs.readFile(path.join(root,'replacement/work/dist/assets/gh-123/cover.webp')),oldBytes);
  assert.deepEqual(await fs.readFile(path.join(held.snapshot,'assets/gh-123/cover.webp')),oldBytes);
  assert.ok(held.report.some(r=>r.artwork && r.artwork[0].source_sha256 !== fixtureApproval.artwork_sets[0][0].source_sha256));
  assert.match(held.report.at(-1).reason,/pending/);
  const resumed=await run(root,{name:'resumed',previous:held.snapshot}); assert.equal(resumed.catalog.projects[0].warning,null);
});

test('raw bytes require approval even if normalization produces identical display bytes', async t => {
  const root=await setup(t,trusted()); const first=await run(root);
  const changed=await sharp(png).withMetadata({density:144}).png().toBuffer();
  const held=await run(root,{name:'raw-drift',previous:first.snapshot,fetcher:async (_,options)=>new Response(options.method==='HEAD'?null:changed)});
  assert.ok(held.report.some(r=>r.content_digest)); assert.match(held.report.at(-1).reason,/pending/);
});

test('new manifest commit with unchanged approved image content synchronizes normally', async t => {
  const root=await setup(t,trusted());const first=await run(root);
  const next=await run(root,{name:'new-commit',previous:first.snapshot,client:api({sha:'b'.repeat(40)})});
  assert.equal(next.catalog.projects.length,1);assert.equal(next.catalog.projects[0].warning,null);
});

test('project identity, owner identity, missing approval and current revocation cannot be restored around', async t => {
  const root=await setup(t,trusted());const first=await run(root);
  for(const [name,change] of [['project',p=>p.projects[0].project_id='other-id'],['owner',p=>p.projects[0].owner_id=777],['artwork',p=>p.projects[0].artwork_sets=[]],['content',p=>p.projects[0].content_digests=[]],['revoked',p=>p.revoked_owner_ids=[99]]]) {
    const p=trusted();change(p);await saveJSON(path.join(root,'policy/publishing.json'),p);
    const result=await run(root,{name,previous:first.snapshot});assert.equal(result.catalog.projects.length,0);
  }
});

test('blocked accounts, rejected issues and spam bursts cannot publish or multiply repository records', async t => {
  const root=await setup(t,trusted());const first=await run(root);
  const p=trusted();p.blocked_user_ids=[666];p.rejected_issue_numbers=[88];await saveJSON(path.join(root,'policy/publishing.json'),p);
  const burst=[...Array(100)].map((_,i)=>issue({user_id:666,number:i+2}));burst.push(issue({number:88}),issue());
  const next=await run(root,{name:'spam',previous:first.snapshot,issues:burst});
  assert.equal(next.catalog.projects.length,1);assert.equal((await readSnapshot(next.snapshot)).length,1);
  assert.ok(next.report.some(r=>/rejected/.test(r.reason)));
  const ownerBurst=await run(root,{name:'owner-spam',previous:first.snapshot,issues:[...Array(30)].map((_,i)=>issue({number:i+1}))});
  assert.equal(ownerBurst.catalog.projects.length,1);assert.ok(ownerBurst.report.some(r=>/intake limit/.test(r.reason)));
});

test('revoked-owner removal remains effective during a GitHub outage',async t=>{
 const root=await setup(t,trusted());const first=await run(root);
 await saveJSON(path.join(root,'policy/publishing.json'),{...trusted(),revoked_owner_ids:[99]});
 const result=await run(root,{name:'revoked-outage',previous:first.snapshot,client:api({failure:503})});
 assert.equal(result.catalog.projects.length,0);
});

test('approving a replacement resumes sync and rejected bytes never overwrite prior artwork',async t=>{
 const root=await setup(t,trusted());const first=await run(root);
 const replacement=await sharp({create:{width:80,height:120,channels:3,background:'blue'}}).png().toBuffer();
 const fetcher=async(_,options)=>new Response(options.method==='HEAD'?null:replacement);
 const held=await run(root,{name:'held-new',previous:first.snapshot,fetcher});
 const proposed=held.report.find(r=>r.artwork).artwork;
 const p=trusted();p.projects[0].artwork_sets.push(proposed);await saveJSON(path.join(root,'policy/publishing.json'),p);
 const approved=await run(root,{name:'approved-new',previous:held.snapshot,fetcher});
 assert.equal(approved.catalog.projects[0].warning,null);
 assert.deepEqual(await fs.readFile(path.join(approved.snapshot,'assets/gh-123/cover.webp')),await normalizeImage(replacement,'cover'));
});
