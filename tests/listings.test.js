import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {generateKeyPairSync} from 'node:crypto';
import sharp from 'sharp';
import {readJSON, saveJSON} from '../src/records.js';
import {GitHub} from '../src/github.js';
import {publish, readSnapshot} from '../src/publishing.js';
import {evaluateListing} from '../src/listings.js';
import {buildCatalog} from '../src/catalog.js';
import {validateListing, newExternalId} from '../src/listing-schema.js';
import {payloadFiles, seal, verifyEnvelope, materialize} from '../src/recovery.js';
import {validateSiteCatalog} from '../tools/site/catalog.js';
import {urlKey, sourceKind} from '../src/urlkey.js';

const fixture = await readJSON(new URL('./fixtures/github.json', import.meta.url));
const png = await sharp({create: {width: 80, height: 120, channels: 3, background: 'red'}}).png().toBuffer();
const blue = await sharp({create: {width: 80, height: 120, channels: 3, background: 'blue'}}).png().toBuffer();
const emptyPolicy = () => ({version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: [], external_projects: []});
const forum = (over = {}) => ({schema_version: 1, id: 'ext-abcdefghijkl', title: 'Forum Hack', developer: 'Sir Hacker', description: 'A forum hosted ROM hack used by automated tests only.', game: 'legacy-of-goku-2', category: 'rom-hack', status: 'released',
  source: {type: 'forum', url: 'https://forum.example.org/threads/forum-hack.123/'}, distribution: {label: 'Download Patch', url: 'https://files.example.org/forum-hack.bps', kind: 'patch'}, cover: 'cover.png', approved_at: '2026-11-01T00:00:00Z', ...over});
const offline = new GitHub({token: '', fetcher: async () => { throw Error('offline'); }});
const quiet = async url => { throw Error('unexpected network request ' + url); };
async function workspace(t, listings = [], policy = emptyPolicy()) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-listings-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'records'));
  await saveJSON(path.join(root, 'policy/publishing.json'), policy);
  for (const item of listings) await writeListing(root, item);
  return root;
}
async function writeListing(root, listing, image = png) {
  const dir = path.join(root, 'listings', listing.id);
  await fs.mkdir(dir, {recursive: true});
  await saveJSON(path.join(dir, 'listing.json'), listing);
  await fs.writeFile(path.join(dir, 'cover.png'), image);
  return dir;
}
async function approval(root, listing, {fetcher = quiet, api = offline, extra = {}} = {}) {
  const done = await evaluateListing({listing, dir: path.join(root, 'listings', listing.id), rule: {owner_id: extra.owner_id}, api, fetcher});
  return {project_id: listing.id, decision: 'approved', content_digests: [done.initialDigest], artwork_sets: [done.inspected.artwork], ...extra};
}
async function setPolicy(root, rules) { await saveJSON(path.join(root, 'policy/publishing.json'), {...emptyPolicy(), external_projects: rules}); }
async function run(root, {name = 'first', previous, api = offline, fetcher = quiet} = {}) {
  const output = path.join(root, name);
  return {...await publish({root, output, api, issues: [], previous, fetcher}), snapshot: path.join(output, 'snapshot'), output};
}

test('unapproved submissions publish nothing and stage no artwork', async t => {
  const root = await workspace(t, [forum()]);
  const result = await run(root);
  assert.equal(result.catalog.projects.length, 0);
  assert.ok(result.report.some(r => r.project_id === 'ext-abcdefghijkl' && r.outcome === 'review'));
  await assert.rejects(fs.access(path.join(result.output, 'snapshot/assets')));
  await assert.rejects(fs.access(path.join(result.output, 'work/assets')));
});

test('forum ROM hack with a patch link publishes natively after exact approval without invented repository identity', async t => {
  const root = await workspace(t, [forum()]);
  await setPolicy(root, [await approval(root, forum())]);
  const result = await run(root);
  const [project] = result.catalog.projects;
  assert.equal(project.id, 'ext-abcdefghijkl');
  assert.equal(project.repository, undefined); assert.equal(project.repository_id, undefined); assert.equal(project.release, null);
  assert.deepEqual(project.source, {type: 'forum', url: 'https://forum.example.org/threads/forum-hack.123/'});
  assert.deepEqual(project.distribution, forum().distribution);
  assert.equal(project.ownership.claim, 'unclaimed');
  await validateSiteCatalog(result.catalog);
  const entries = await readSnapshot(result.snapshot);
  assert.equal(entries[0].repository_id, undefined); assert.equal(entries[0].source.method, 'listing');
});

test('edited listing text or swapped artwork needs new approval and keeps the last approved listing', async t => {
  const root = await workspace(t, [forum()]);
  await setPolicy(root, [await approval(root, forum())]);
  const first = await run(root);
  await writeListing(root, forum({title: 'Edited Title'}));
  const edited = await run(root, {name: 'edited', previous: first.snapshot});
  assert.equal(edited.catalog.projects[0].title, 'Forum Hack');
  assert.ok(edited.report.some(r => r.outcome === 'review' && /approval/.test(r.reason)));
  await writeListing(root, forum(), blue);
  const swapped = await run(root, {name: 'swapped', previous: first.snapshot});
  assert.equal(swapped.catalog.projects[0].title, 'Forum Hack');
  assert.ok(swapped.report.some(r => r.outcome === 'review'));
  assert.deepEqual(await fs.readFile(path.join(swapped.output, 'work/assets/ext-abcdefghijkl/cover.webp')), await fs.readFile(path.join(first.output, 'work/assets/ext-abcdefghijkl/cover.webp')));
});

test('third-party suggestions stay unclaimed; a verified claim cannot be hijacked without a recorded transfer', async t => {
  const root = await workspace(t, [forum()]);
  const base = await approval(root, forum());
  await setPolicy(root, [base]);
  const suggested = await run(root);
  assert.equal(suggested.catalog.projects[0].ownership.claim, 'unclaimed');
  const owner = {method: 'page-token', proof_digest: 'a'.repeat(64), verified_at: '2026-11-02T00:00:00Z'};
  await setPolicy(root, [{...base, claim: owner}]);
  const claimed = await run(root, {name: 'claimed', previous: suggested.snapshot});
  assert.equal(claimed.catalog.projects[0].ownership.claim, 'verified-claim');
  await setPolicy(root, [{...base, claim: {...owner, proof_digest: 'b'.repeat(64)}}]);
  const hijack = await run(root, {name: 'hijack', previous: claimed.snapshot});
  assert.ok(hijack.report.some(r => r.outcome === 'retained' && /transfer/.test(r.reason)));
  assert.equal((await readSnapshot(hijack.snapshot))[0].source.claim_digest, 'a'.repeat(64));
  await setPolicy(root, [{...base, claim: {...owner, proof_digest: 'b'.repeat(64), transfer_from: 'a'.repeat(64)}}]);
  const moved = await run(root, {name: 'moved', previous: claimed.snapshot});
  assert.equal((await readSnapshot(moved.snapshot))[0].source.claim_digest, 'b'.repeat(64));
});

test('suspend, delist and restore leave signed recovery verifiable and never expose hidden projects', async t => {
  const root = await workspace(t, [forum()]);
  const base = await approval(root, forum());
  await setPolicy(root, [base]);
  const first = await run(root);
  await setPolicy(root, [{...base, decision: 'suspended', reason: 'under review'}]);
  const suspended = await run(root, {name: 'suspended', previous: first.snapshot});
  assert.equal(suspended.catalog.projects.length, 0);
  assert.equal((await readSnapshot(suspended.snapshot)).length, 1);
  await setPolicy(root, [{...base, decision: 'delisted', reason: 'removed'}]);
  assert.equal((await run(root, {name: 'delisted', previous: suspended.snapshot})).catalog.projects.length, 0);
  await setPolicy(root, [base]);
  const restored = await run(root, {name: 'restored', previous: suspended.snapshot});
  assert.equal(restored.catalog.projects[0].id, 'ext-abcdefghijkl');
  const pair = generateKeyPairSync('ed25519');
  const config = {version: 1, enabled: true, source_repository: 'test-owner/test-hub', source_repository_id: 42, backup_repository: 'test-owner/private-vault', backup_repository_id: 84, default_branch: 'main', signing_key_id: 'test', public_keys: {test: pair.publicKey.export({format: 'pem', type: 'spki'})}};
  const files = await payloadFiles(restored.snapshot, path.join(restored.output, 'work/dist/catalog.json'));
  const envelope = seal(config, files, {source_commit: 'a'.repeat(40), run_id: 7, workflow: '.github/workflows/catalog.yml', ref: 'refs/heads/main', kind: 'publication'}, pair.privateKey.export({format: 'pem', type: 'pkcs8'}));
  verifyEnvelope(config, envelope);
  const destination = path.join(root, 'recovered');
  await materialize({point: `7-${envelope.snapshot_id}`, envelope, files}, destination);
  assert.equal((await readSnapshot(destination))[0].id, 'ext-abcdefghijkl');
  const tampered = new Map(files); tampered.set('registry.json', Buffer.from(files.get('registry.json').toString().replace('listing', 'manifest')));
  await assert.rejects(materialize({point: `7-${envelope.snapshot_id}`, envelope, files: tampered}, path.join(root, 'tampered')));
});

test('duplicate URLs, renamed addresses and moved hosts resolve to one listing', async t => {
  const second = forum({id: 'ext-mnopqrstuvwx', title: 'Same Project Again', source: {type: 'website', url: 'https://WWW.forum.example.org/threads/forum-hack.123?utm_source=x'}});
  const moved = forum({id: 'ext-yyyyyyyyyyyy', title: 'Moved Project', source: {type: 'website', url: 'https://newhome.example.net/forum-hack/', also_known_at: ['https://forum.example.org/threads/forum-hack.123/']}});
  const root = await workspace(t, [forum(), second, moved]);
  await setPolicy(root, await Promise.all([forum(), second, moved].map(item => approval(root, item))));
  const result = await run(root);
  assert.deepEqual(result.catalog.projects.map(p => p.id), ['ext-abcdefghijkl']);
  assert.equal(result.report.filter(r => /duplicate project address/.test(r.reason || '')).length, 2);
  assert.equal(urlKey(second.source.url), urlKey(forum().source.url));
  const root2 = await workspace(t, [{...moved, id: 'ext-yyyyyyyyyyyy'}]);
  await setPolicy(root2, [await approval(root2, moved)]);
  const keep = await run(root2);
  assert.deepEqual(keep.catalog.projects[0].source.also_known_at, ['https://forum.example.org/threads/forum-hack.123/']);
  await assert.rejects(buildCatalog(await (async () => {
    const dir = path.join(root2, 'dup'); await fs.cp(path.join(keep.output, 'work'), dir, {recursive: true});
    const copy = {...moved, id: 'ext-zzzzzzzzzzzz', source: {type: 'website', url: 'https://newhome.example.net/forum-hack'}};
    await saveJSON(path.join(dir, 'records', copy.id + '.json'), copy);
    await saveJSON(path.join(dir, 'state', copy.id + '.json'), JSON.parse(await fs.readFile(path.join(dir, 'state', 'ext-yyyyyyyyyyyy.json'))));
    await fs.cp(path.join(dir, 'assets/ext-yyyyyyyyyyyy'), path.join(dir, 'assets', copy.id), {recursive: true});
    return dir;
  })()), /duplicate project address/);
});

function hostedFetcher({manifest, id = 777, ownerId = 55, sha = 'c'.repeat(40), host = 'gitlab.com', path: repo = 'fixture/hack'}) {
  return async url => {
    const target = new URL(url);
    if (host === 'gitlab.com') {
      if (target.pathname === `/api/v4/projects/${encodeURIComponent(repo)}`) return Response.json({id, visibility: 'public', archived: false, namespace: {id: ownerId}, path_with_namespace: repo, last_activity_at: '2026-10-01T00:00:00Z'});
      if (target.pathname.endsWith('/repository/commits')) return Response.json([{id: sha}]);
      if (target.pathname.includes('/repository/files/')) return manifest ? new Response(JSON.stringify(manifest)) : new Response('{}', {status: 404});
      if (target.pathname.startsWith(`/${repo}/-/raw/${sha}/`)) return new Response(png);
    } else {
      if (target.pathname === `/api/v1/repos/${repo}`) return Response.json({id, private: false, archived: false, owner: {id: ownerId}, full_name: repo, updated_at: '2026-10-01T00:00:00Z'});
      if (target.pathname.endsWith('/commits')) return Response.json([{sha}]);
      if (target.pathname.includes('/raw/.loghub.json')) return manifest ? new Response(JSON.stringify(manifest)) : new Response('{}', {status: 404});
      if (target.pathname.startsWith(`/${repo}/raw/commit/${sha}/`)) return new Response(png);
    }
    throw Error('unexpected network request ' + url);
  };
}
const manifestFile = (over = {}) => ({schema_version: 1, title: 'Hosted Hack', developer: 'Hosted Dev', description: 'A hosted project whose maintainer keeps its own details.', game: 'buus-fury', category: 'fan-project', status: 'in-development', cover: 'images/cover.png', ...over});

test('GitLab maintainer manifests synchronize after exact approval; sensitive changes and identity changes are held', async t => {
  const listing = forum({id: 'ext-gitlabproj01', title: 'Local Draft', source: {type: 'git', url: 'https://gitlab.com/fixture/hack'}, distribution: undefined, status: 'in-development'});
  delete listing.distribution;
  const root = await workspace(t, [listing]);
  const fetcher = hostedFetcher({manifest: manifestFile()});
  await setPolicy(root, [await approval(root, listing, {fetcher})]);
  const first = await run(root, {fetcher});
  assert.equal(first.catalog.projects[0].title, 'Hosted Hack');
  assert.equal(first.catalog.projects[0].ownership.claim, 'repository-controlled');
  assert.equal(first.catalog.projects[0].repository_id, undefined);
  assert.equal(first.catalog.projects[0].source.type, 'git');
  const edited = await run(root, {name: 'edited', previous: first.snapshot, fetcher: hostedFetcher({manifest: manifestFile({title: 'Hosted Hack Deluxe'})})});
  assert.equal(edited.catalog.projects[0].title, 'Hosted Hack Deluxe');
  const sensitive = await run(root, {name: 'sensitive', previous: first.snapshot, fetcher: hostedFetcher({manifest: manifestFile({developer: 'Someone Else'})})});
  assert.equal(sensitive.catalog.projects[0].developer, 'Hosted Dev');
  assert.ok(sensitive.report.some(r => /sensitive attribution/.test(r.reason || '')));
  const reused = await run(root, {name: 'reused', previous: first.snapshot, fetcher: hostedFetcher({manifest: manifestFile(), id: 888})});
  assert.equal(reused.catalog.projects[0].title, 'Hosted Hack');
  assert.ok(reused.report.some(r => /identity changed/.test(r.reason || '')));
  const gone = await run(root, {name: 'gone', previous: first.snapshot, fetcher: hostedFetcher({manifest: null})});
  assert.ok(gone.report.some(r => /manifest missing/.test(r.reason || '')));
  assert.equal(gone.catalog.projects[0].title, 'Hosted Hack');
});

test('a changed moderated patch link on a manifested listing needs fresh approval', async t => {
  const withPatch = url => forum({id: 'ext-gitlabproj02', source: {type: 'git', url: 'https://gitlab.com/fixture/hack'}, distribution: {kind: 'patch', label: 'Download Patch', url}});
  const approved = withPatch('https://files.example.org/approved.bps');
  const root = await workspace(t, [approved]);
  const fetcher = hostedFetcher({manifest: manifestFile()});
  await setPolicy(root, [await approval(root, approved, {fetcher})]);
  const first = await run(root, {fetcher});
  assert.equal(first.catalog.projects[0].distribution.url, 'https://files.example.org/approved.bps');
  await writeListing(root, withPatch('https://files.example.org/UNREVIEWED.bps'));
  const changed = await run(root, {name: 'changed', previous: first.snapshot, fetcher});
  assert.equal(changed.catalog.projects[0].distribution.url, 'https://files.example.org/approved.bps');
  assert.ok(changed.report.some(r => r.outcome === 'review'));
});

test('Codeberg projects without a manifest use the approved listing and never fetch arbitrary addresses', async t => {
  const listing = forum({id: 'ext-codeberg0001', source: {type: 'git', url: 'https://codeberg.org/fixture/hack'}});
  delete listing.distribution;
  const root = await workspace(t, [listing]);
  const fetcher = hostedFetcher({manifest: null, host: 'codeberg.org'});
  await setPolicy(root, [await approval(root, listing, {fetcher})]);
  const result = await run(root, {fetcher});
  assert.equal(result.catalog.projects[0].title, 'Forum Hack');
  assert.equal(result.catalog.projects[0].ownership.claim, 'unclaimed');
  const other = forum({id: 'ext-otherhost001', source: {type: 'git', url: 'https://git.example.net/fixture/hack'}});
  const root2 = await workspace(t, [other]);
  await setPolicy(root2, [await approval(root2, other)]);
  assert.equal((await run(root2)).catalog.projects[0].source.url, 'https://git.example.net/fixture/hack');
});

function githubApi({noRelease = true} = {}) {
  const repo = {...fixture.repository, owner: {...fixture.repository.owner, id: 99}};
  return new GitHub({token: '', fetcher: async url => {
    if (url.includes('/releases/latest')) return new Response(JSON.stringify(fixture.release), {status: noRelease ? 404 : 200});
    if (url.includes('/assets?')) return Response.json(fixture.assets);
    return Response.json(repo);
  }});
}

test('GitHub projects submitted through the form use the real repository identity and need no release', async t => {
  const listing = forum({id: 'gh-123', title: 'Form Submitted GitHub Hack', source: {type: 'github', url: 'https://github.com/fixture-owner/fixture-repo'}});
  delete listing.distribution;
  const root = await workspace(t, [listing]);
  const api = githubApi();
  await setPolicy(root, [await approval(root, listing, {api, extra: {owner_id: 99}})]);
  const result = await run(root, {api});
  const [project] = result.catalog.projects;
  assert.equal(project.id, 'gh-123'); assert.equal(project.repository_id, 123); assert.equal(project.release, null);
  assert.equal(project.source.type, 'github'); assert.equal(project.ownership.claim, 'unclaimed');
  await validateSiteCatalog(result.catalog);
  const wrong = {...listing, id: 'gh-124'};
  const root2 = await workspace(t, [wrong]);
  await setPolicy(root2, [{project_id: 'gh-124', owner_id: 99, decision: 'approved', content_digests: [], artwork_sets: []}]);
  const rejected = await run(root2, {api});
  assert.equal(rejected.catalog.projects.length, 0);
  assert.ok(rejected.report.some(r => /does not match the listing ID/.test(r.reason || '')));
});

test('listing validation rejects unsafe addresses, game files and identity confusion', () => {
  assert.doesNotThrow(() => validateListing(forum()));
  for (const bad of [
    forum({source: {type: 'forum', url: 'http://forum.example.org/t/1'}}),
    forum({source: {type: 'forum', url: 'https://user:pass@forum.example.org/t/1'}}),
    forum({source: {type: 'forum', url: 'https://127.0.0.1/t/1'}}),
    forum({source: {type: 'forum', url: 'https://localhost/t/1'}}),
    forum({source: {type: 'forum', url: 'https://forum.example.org:8443/t/1'}}),
    forum({source: {type: 'forum', url: 'https://forum.example.org/game.gba'}}),
    forum({source: {type: 'none', url: 'https://forum.example.org/t/1'}}),
    forum({source: {type: 'github', url: 'https://github.com/a/b'}}),
    forum({id: 'gh-1'}),
    forum({distribution: {label: 'Get ROM', url: 'https://files.example.org/game.gba', kind: 'patch'}}),
    forum({distribution: {label: 'Page', url: 'https://files.example.org/x.zip', kind: 'page'}}),
    forum({links: [{label: 'x', url: 'javascript:alert(1)'}]}),
    forum({title: '<b>x</b>'}),
    forum({cover: '../../etc/passwd'}),
    {...forum(), extra: true}
  ]) assert.throws(() => validateListing(bad));
  assert.doesNotThrow(() => validateListing(forum({source: {type: 'none'}})));
  assert.match(newExternalId(Buffer.alloc(12, 7)), /^ext-[a-z0-9]{12}$/);
  assert.equal(sourceKind('https://romhacking.net/hacks/1/'), 'platform');
  assert.equal(sourceKind('https://codeberg.org/a/b'), 'codeberg');
});
