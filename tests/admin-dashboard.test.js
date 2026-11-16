import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {fixture, origin} from '../tools/admin/test-fixture.js';
import {preparePackage, createPublicationPR} from '../tools/admin/process.js';
import {handle as intake, random} from '../intake/worker.js';
import {publish} from '../src/publishing.js';
import {readJSON} from '../src/records.js';
import {GitHub} from '../src/github.js';
import {imageHash} from '../src/images.js';
const main = 'a'.repeat(40);
async function setup(t) { const x = await fixture(); const original = globalThis.fetch; globalThis.fetch = x.fetcher; t.after(() => { globalThis.fetch = original; x.db.close(); }); return x; }
const data = async res => { assert.equal(res.ok, true, await res.clone().text()); return res.json(); };

test('Access signature, issuer, audience, allowlist, expiry, CSRF, revocation and default-off gate', async t => {
  const x = await setup(t);
  assert.equal((await x.call('/api/queue', undefined, {'Cf-Access-Jwt-Assertion': ''})).status, 401);
  for (const claims of [{email: 'stranger@example.org'}, {aud: ['other']}, {iss: 'https://attacker.example'}, {exp: 1}, {iat: 9999999999}, {type: 'org'}]) assert.ok([401, 403].includes((await x.call('/api/login', {}, {'Cf-Access-Jwt-Assertion': await x.jwt(claims)})).status));
  assert.equal((await x.call('/api/login', {}, {'Cf-Access-Jwt-Assertion': x.token.slice(0, -8) + 'aaaaaaaa'})).status, 401);
  assert.equal((await x.call('/api/login', {}, {Origin: 'https://attacker.example'})).status, 403);
  const login = await x.login(); assert.equal(login.res.status, 200); assert.match(login.res.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await x.call('/api/logout', {}, {'X-CSRF-Token': 'wrong'})).status, 403);
  assert.equal((await x.call('/api/logout', {})).status, 200);
  assert.equal((await x.call('/api/session')).status, 401); assert.equal((await x.call('/api/login', {})).status, 401);
  x.env.ADMIN_ENABLED = 'false'; assert.equal((await x.call('/')).status, 404);
});

test('owner lifecycle: anonymous correction, exact artwork approval, protected PR, actual deployment distinction, suspension and restore', async t => {
  const x = await setup(t); await x.login(); const sub = await x.seed();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-013-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'policy')); await fs.mkdir(path.join(root, 'records')); await fs.mkdir(path.join(root, 'state'));
  const policy = {version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: [], external_projects: []};
  await fs.writeFile(path.join(root, 'policy/publishing.json'), JSON.stringify(policy, null, 2) + '\n');
  let detail = await data(await x.call('/api/detail?id=' + sub.id));
  assert.equal(JSON.stringify(detail).includes('receipt_hash'), false);
  await data(await x.call('/api/decision', {id: sub.id, revision: 1, state: 'in-review'}));
  await data(await x.call('/api/decision', {id: sub.id, revision: 2, state: 'needs-changes', public_note: 'Please correct the description.', private_note: 'Private training evidence'}));
  const intakeEnv = {...x.env, INTAKE_ENABLED: 'true', RATE_SALT: random(), API_ORIGIN: 'https://intake.example', SITE_ORIGIN: 'https://site.example'};
  const publicCall = (route, value) => intake(new Request('https://intake.example' + route, {method: 'POST', headers: {Origin: intakeEnv.SITE_ORIGIN, 'Content-Type': 'application/json'}, body: JSON.stringify(value)}), intakeEnv);
  const receipt = await data(await publicCall('/status', {receipt: sub.receipt})); assert.equal(receipt.note, 'Please correct the description.'); assert.equal(JSON.stringify(receipt).includes('Private training'), false);
  await data(await publicCall('/revise', {receipt: sub.receipt, changes: {description: 'A corrected fictional training project description.'}}));
  detail = await data(await x.call('/api/detail?id=' + sub.id)); assert.equal(detail.submission.revision, 4);
  const made = await data(await x.call('/api/prepare', {operation: 'submission', submission_id: sub.id, revision: 4, payload: detail.submission.payload}));
  assert.equal(x.state.dispatched[0].inputs.action, 'prepare');
  await data(await x.processCall(made.id, '/claim', {action: 'prepare'}));
  const row = await data(await x.processCall(made.id));
  const png = await sharp({create: {width: 70, height: 40, channels: 3, background: '#546fa1'}}).png().toBuffer();
  const fetcher = async () => new Response(png);
  const result = await preparePackage({row, root, fetcher, base: main});
  for (const f of result.buffers) { const b64 = f.bytes.toString('base64'); for (let part = 0; part * 262144 < b64.length; part++) await data(await x.processCall(made.id, '/file', {name: f.name, part, data: b64.slice(part * 262144, (part + 1) * 262144)})); }
  await data(await x.processCall(made.id, '/ready', {package: result.package}));
  let r = (await data(await x.call('/api/reviews'))).items[0]; assert.equal(r.state, 'ready');
  assert.equal((await x.call('/api/publish', {id: r.id, digest: r.digest})).status, 409);
  assert.equal((await x.call('/api/approve', {id: r.id, version: r.version, digest: r.digest, content_reviewed: true})).status, 409);
  const approval = {id: r.id, version: r.version, digest: r.digest, content_reviewed: true, artwork_reviewed: true, public_note: 'Approved exact training package.', private_note: 'Never public'};
  const approvals = await Promise.all([x.call('/api/approve', approval), x.call('/api/approve', approval)]); assert.deepEqual(approvals.map(r => r.status).sort(), [200, 409]);
  await data(await x.call('/api/publish', {id: r.id, digest: r.digest}));
  await data(await x.processCall(r.id, '/claim', {action: 'publish'}));
  r = await data(await x.processCall(r.id));
  const calls = [], api = {request: async (endpoint, options = {}) => {
    calls.push({endpoint, ...options});
    if (endpoint.endsWith('/git/ref/heads/main')) return {object: {sha: main}};
    if (endpoint.endsWith('/git/commits/' + main)) return {tree: {sha: 'b'.repeat(40)}};
    if (endpoint.endsWith('/git/blobs') || endpoint.endsWith('/git/trees') || endpoint.endsWith('/git/commits')) return {sha: 'c'.repeat(40)};
    if (endpoint.endsWith('/git/refs')) return {};
    if (endpoint.endsWith('/pulls')) return {number: 42};
    throw Error('Unexpected GitHub API');
  }};
  const pr = await createPublicationPR({row: r, api, repo: 'fictional/hub', loadFile: async f => result.buffers.find(b => b.name === f.name).bytes}); assert.equal(pr, 42);
  assert.equal(JSON.stringify(calls).includes('Never public'), false); assert.equal(JSON.stringify(calls).includes('Private training'), false);
  const tree = calls.find(c => c.endpoint.endsWith('/git/trees')).body.tree; assert.deepEqual(tree.map(f => f.path).sort(), [`listings/${r.project_id}/cover.png`, `listings/${r.project_id}/listing.json`, 'policy/publishing.json'].sort());
  await data(await x.processCall(r.id, '/published-pr', {pr}));
  x.state.pr = {head: {sha: main}, merged: true, state: 'closed', merge_commit_sha: main, html_url: 'https://github.com/fictional/hub/pull/42'};
  let status = await data(await x.call('/api/publication?id=' + r.id)); assert.equal(status.status, 'awaiting-deployment');
  assert.equal((await data(await publicCall('/status', {receipt: sub.receipt}))).status, 'approved');
  x.state.manifest = {build_commit: main}; x.state.runs = [{id: 1, head_sha: main, event: 'push', html_url: 'https://github.com/fictional/hub/actions/runs/1'}];
  x.state.jobs = ['synchronize', 'backup', 'anchor', 'publish', 'website', 'deploy-website'].map(name => ({name, conclusion: 'success'}));
  x.state.projects = [{id: r.project_id}];
  status = await data(await x.call('/api/publication?id=' + r.id)); assert.equal(status.status, 'published');
  assert.equal((await data(await publicCall('/status', {receipt: sub.receipt}))).status, 'published');
  for (const file of tree) { const target = path.join(root, file.path); await fs.mkdir(path.dirname(target), {recursive: true}); await fs.writeFile(target, file.content || result.buffers[0].bytes); }
  const initial = await publish({root, output: path.join(root, 'initial'), api: {}, issues: [], fetcher}); assert.equal(initial.catalog.projects[0].id, r.project_id);
  for (const [operation, expected] of [['suspend', 0], ['restore', 1], ['delist', 0]]) {
    const managed = {id: 'isolated-policy-review', project_id: r.project_id, operation, payload: {value: {}, reason: 'Isolated training policy decision'}};
    const prepared = await preparePackage({row: managed, root, fetcher, base: main});
    await fs.writeFile(path.join(root, 'policy/publishing.json'), JSON.stringify(prepared.package.policy));
    const output = await publish({root, previous: path.join(root, 'initial/snapshot'), output: path.join(root, operation), api: {}, issues: [], fetcher}); assert.equal(output.catalog.projects.length, expected);
    if (expected) assert.equal(output.catalog.projects[0].id, r.project_id);
  }
  const unchanged = await readJSON(path.join(root, 'initial/snapshot/registry.json')); assert.equal(unchanged.entries[0].id, r.project_id);
});

test('private routes reject bearer reuse, stale submissions, tampered package and excessive requests', async t => {
  const x = await setup(t); await x.login(); const sub = await x.seed({title: '<script>alert(1)</script>'});
  assert.equal((await x.call('/processor/' + 'a'.repeat(24))).status, 401);
  assert.equal((await x.call('/api/decision', {id: sub.id, revision: 999, state: 'rejected', public_note: 'A reason'})).status, 409);
  const created = await data(await x.call('/api/prepare', {operation: 'submission', submission_id: sub.id, revision: 1, payload: sub.payload}));
  await data(await x.call('/api/decision', {id: sub.id, revision: 1, state: 'needs-changes', public_note: 'Please change the description'}));
  assert.equal((await x.processCall(created.id, '/claim', {action: 'prepare'})).status, 409);
  assert.equal((await x.call('/api/decision', {id: sub.id, revision: 2, state: 'published'})).status, 400);
  assert.equal((await x.call('/api/logout', {}, {'Sec-Fetch-Site': 'cross-site'})).status, 403);
  const withdrawn = await data(await x.call('/api/listing?id=ext-abcdefghijkl')); assert.equal(withdrawn.editable, false); assert.match(withdrawn.message, /Restore/);
  x.state.projects = [{id: 'ext-abcdefghijkl', title: 'Live training project'}];
  const live = await data(await x.call('/api/listing?id=ext-abcdefghijkl')); assert.equal(live.editable, true); assert.equal(live.record.title, 'Live training project');
  for (let n = 0; n < 125; n++) await x.call('/api/session');
  assert.equal((await x.call('/api/session')).status, 429);
});

test('legacy GitHub managed replacement preserves identity and requires exact replacement approval', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-013-migrate-')); t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'records')); await fs.mkdir(path.join(root, 'policy'));
  const fixtureData = await readJSON(new URL('./fixtures/github.json', import.meta.url));
  const api = new GitHub({token: '', fetcher: async url => url.includes('/releases/latest') ? new Response('{}', {status: 404}) : Response.json({...fixtureData.repository, owner: {...fixtureData.repository.owner, id: 99}})});
  const png = await sharp({create: {width: 70, height: 40, channels: 3, background: '#68914a'}}).png().toBuffer();
  const project = {id: 'gh-123', title: 'Legacy fictional project', developer: 'Training team', description: 'Legacy fictional listing for isolated migration tests.', game: 'multiple', category: 'resource', status: 'in-development', repository: fixtureData.repository.html_url, cover: 'assets/gh-123/cover.webp', screenshots: [], links: []};
  const fetcher = async url => String(url).endsWith('/catalog.json') ? Response.json({projects: [project]}) : new Response(png);
  const legacyRule = {repository_id: 123, owner_id: 99, project_id: 'gh-123', decision: 'approved', content_digests: ['1'.repeat(64)], artwork_sets: [[{source_sha256: '2'.repeat(64), sha256: '3'.repeat(64)}]]};
  await fs.writeFile(path.join(root, 'policy/publishing.json'), JSON.stringify({version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: [legacyRule]}));
  const prepared = await preparePackage({row: {project_id: 'gh-123', operation: 'edit', payload: {value: {title: 'Managed fictional project'}, reason: ''}}, root, api, fetcher, site: 'https://site.example', base: main});
  assert.equal(prepared.package.project_id, 'gh-123'); assert.equal(prepared.package.rule.owner_id, 99); assert.equal(prepared.package.policy.projects[0].decision, 'delisted');
  const dir = path.join(root, 'listings/gh-123'); await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(path.join(dir, 'listing.json'), JSON.stringify(prepared.package.listing));
  for (const f of prepared.buffers.filter(f => !f.name.startsWith('preview-'))) await fs.writeFile(path.join(dir, f.name), f.bytes);
  await fs.writeFile(path.join(root, 'policy/publishing.json'), JSON.stringify(prepared.package.policy));
  const first = await publish({root, output: path.join(root, 'first'), api, issues: [], fetcher}); assert.equal(first.catalog.projects[0].id, 'gh-123');
  const snapshot = path.join(root, 'first/snapshot'), registryFile = path.join(snapshot, 'registry.json');
  const registry = await readJSON(registryFile); registry.entries[0].source = {method: 'guided'}; await fs.writeFile(registryFile, JSON.stringify(registry));
  const recordFile = path.join(snapshot, 'records/gh-123.json'); const record = await readJSON(recordFile); delete record.source; delete record.schema_version; delete record.approved_at; record.repository = project.repository; record.cover = `https://raw.githubusercontent.com/fixture-owner/fixture-repo/${'a'.repeat(40)}/cover.png`; await fs.writeFile(recordFile, JSON.stringify(record));
  const migrated = await publish({root, previous: snapshot, output: path.join(root, 'migrated'), api, issues: [], fetcher}); assert.equal(migrated.catalog.projects.length, 1); assert.equal(migrated.catalog.projects[0].id, 'gh-123'); assert.equal(migrated.catalog.projects[0].title, 'Managed fictional project');
  const invalidPolicy = structuredClone(prepared.package.policy); invalidPolicy.external_projects[0].artwork_sets = [];
  await fs.writeFile(path.join(root, 'policy/publishing.json'), JSON.stringify(invalidPolicy));
  const blocked = await publish({root, previous: snapshot, output: path.join(root, 'blocked'), api, issues: [], fetcher}); assert.equal(blocked.catalog.projects.length, 0);
  const publishing = {state: 'publishing', digest: 'invalid', approved_digest: 'invalid', package: prepared.package};
  await assert.rejects(createPublicationPR({row: publishing, api, repo: 'fictional/hub', loadFile: async () => png}), /digest mismatch/);
});

test('reviewer regression: a correction racing approval leaves no approval or approval-history record', async t => {
  const x = await setup(t); await x.login(); const sub = await x.seed();
  const id = 'a'.repeat(24), time = Math.floor(Date.now() / 1000);
  x.db.prepare("UPDATE submissions SET state='needs-changes' WHERE id=?").run(sub.id);
  x.db.prepare("INSERT INTO admin_reviews(id,submission_id,revision,operation,payload,state,version,digest,created,updated) VALUES(?,?,1,'submission','{}','ready',1,'digest',?,?)").run(id, sub.id, time, time);
  const prepare = x.env.DB.prepare.bind(x.env.DB);
  x.env.DB.prepare = query => { const q = prepare(query); return {bind(...args) { const statement = q.bind(...args); if (query.includes("SET state='approved',approved_digest")) { const run = statement.run; statement.run = async () => { x.db.prepare("UPDATE submissions SET revision=revision+1,state='received' WHERE id=?").run(sub.id); return run(); }; } return statement; }}; };
  assert.equal((await x.call('/api/approve', {id, version: 1, digest: 'digest', content_reviewed: true, artwork_reviewed: true})).status, 409);
  assert.equal(x.db.prepare('SELECT state FROM admin_reviews').get().state, 'ready');
  assert.equal(x.db.prepare("SELECT count(*) n FROM admin_history WHERE action='exact-approval'").get().n, 0);
});

test('reviewer regressions: previews freeze resolved hosted content and clearing an existing download removes it', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-013-hosted-')); t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'policy')); await fs.mkdir(path.join(root, 'records'));
  await fs.writeFile(path.join(root, 'policy/publishing.json'), JSON.stringify({version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: []}));
  const submitted = await sharp({create: {width: 80, height: 40, channels: 3, background: 'red'}}).png().toBuffer();
  const actual = await sharp({create: {width: 80, height: 40, channels: 3, background: 'blue'}}).png().toBuffer();
  const manifest = {schema_version: 1, title: 'Resolved hosted title', developer: 'Hosted training team', description: 'The resolved hosted description differs from the submission.', game: 'buus-fury', category: 'fan-project', status: 'in-development', cover: 'images/actual.png'};
  const fetcher = async url => {
    const target = new URL(url);
    if (target.hostname === 'submitted.example.org') return new Response(submitted);
    if (target.pathname === '/api/v4/projects/fixture%2Ftraining') return Response.json({id: 777, visibility: 'public', archived: false, namespace: {id: 55}, path_with_namespace: 'fixture/training', last_activity_at: '2026-10-01T00:00:00Z'});
    if (target.pathname.endsWith('/repository/commits')) return Response.json([{id: 'c'.repeat(40)}]);
    if (target.pathname.includes('/repository/files/')) return Response.json(manifest);
    if (target.pathname.includes('/-/raw/')) return new Response(actual);
    throw Error('Unexpected isolated request');
  };
  const payload = {kind: 'suggest', title: 'Submitted title', description: 'Submitted project metadata is deliberately different.', category: 'resource', url: 'https://gitlab.com/fixture/training', artwork: ['https://submitted.example.org/cover.png'], patch_url: 'https://submitted.example.org/patch.bps'};
  const prepared = await preparePackage({row: {operation: 'submission', payload: {value: payload}}, root, fetcher, base: main});
  assert.equal(prepared.package.listing.title, manifest.title);
  assert.equal(prepared.package.listing.description, manifest.description);
  const raw = prepared.buffers.find(f => f.name === 'cover.png'); assert.equal(imageHash(raw.bytes), imageHash(actual)); assert.notEqual(imageHash(raw.bytes), imageHash(submitted));
  assert.equal(prepared.package.rule.artwork_sets[0][0].source_sha256, imageHash(raw.bytes));
  assert.equal(prepared.package.rule.artwork_sets[0][0].sha256, imageHash(prepared.buffers.find(f => f.name === 'preview-0.webp').bytes));
  const id = prepared.package.project_id, dir = path.join(root, 'listings', id); await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(path.join(dir, 'listing.json'), JSON.stringify(prepared.package.listing)); await fs.writeFile(path.join(dir, 'cover.png'), raw.bytes);
  await fs.writeFile(path.join(root, 'policy/publishing.json'), JSON.stringify(prepared.package.policy));
  const result = await publish({root, output: path.join(root, 'published'), api: {}, issues: [], fetcher}); assert.equal(result.catalog.projects[0].title, manifest.title);
  const cleared = await preparePackage({row: {project_id: id, operation: 'edit', payload: {value: {patch_url: ''}}}, root, fetcher, base: main});
  assert.equal(Object.hasOwn(cleared.package.listing, 'distribution'), false);
});
