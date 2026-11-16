import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {readJSON, saveJSON} from '../src/records.js';
import {GitHub} from '../src/github.js';
import {publish} from '../src/publishing.js';
import {adoptListing, applyClaim, manualClaim, prepareListing, setDecision, verifyPageClaim, IntakeAPI} from '../src/intake-admin.js';
import {publicAddress, safeFetcher} from '../src/safe-fetch.js';
import {validateSiteCatalog} from '../tools/site/catalog.js';

const fixture = await readJSON(new URL('./fixtures/github.json', import.meta.url));
const png = await sharp({create: {width: 90, height: 140, channels: 3, background: 'green'}}).png().toBuffer();
const offline = new GitHub({token: '', fetcher: async () => { throw Error('offline'); }});
const fetcher = (pages = {}) => async url => {
  if (pages[url] !== undefined) return new Response(pages[url]);
  if (/\.(png|jpg|webp)$/.test(url)) return new Response(png);
  return new Response('missing', {status: 404});
};
const submission = (over = {}) => ({id: 7, payload: {kind: 'suggest', relation: 'third-party', url: 'https://forum.example.org/threads/cool-hack.55/', title: 'Cool Hack', category: 'rom-hack', description: 'A cool ROM hack discovered on a public forum thread.', artwork: ['https://img.example.org/cover.png', 'https://img.example.org/shot.png'], ...over}});
async function repo(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-admin-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'records'), {recursive: true});
  await saveJSON(path.join(root, 'policy/publishing.json'), {version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: [], external_projects: []});
  return root;
}
async function publishRoot(root, name = 'out', previous) {
  const output = path.join(root, name);
  return {...await publish({root, output, api: offline, issues: [], previous, fetcher: fetcher()}), snapshot: path.join(output, 'snapshot'), output};
}

test('third-party suggestion becomes an approved catalog entry through prepare, adopt and signed publication', async t => {
  const root = await repo(t);
  const staging = path.join(root, '..', path.basename(root) + '-private');
  t.after(() => fs.rm(staging, {recursive: true, force: true}));
  const prepared = await prepareListing({submission: submission(), directory: staging, api: offline, fetcher: fetcher(), overrides: {game: 'legacy-of-goku-2'}});
  assert.match(prepared.id, /^ext-[a-z2-7]{12}$/);
  assert.ok(prepared.warnings.some(w => /third party/.test(w)));
  assert.equal(prepared.listing.developer, 'Unknown creator');
  assert.equal((await publishRoot(root)).catalog.projects.length, 0);
  await adoptListing({directory: staging, root, approve: false});
  const held = await publishRoot(root, 'held');
  assert.equal(held.catalog.projects.length, 0);
  await fs.rm(path.join(root, 'listings'), {recursive: true});
  await adoptListing({directory: staging, root, approve: true});
  const live = await publishRoot(root, 'live');
  const [project] = live.catalog.projects;
  assert.equal(project.id, prepared.id); assert.equal(project.title, 'Cool Hack'); assert.equal(project.ownership.claim, 'unclaimed');
  assert.equal(project.screenshots.length, 1);
  await validateSiteCatalog(live.catalog);
  await assert.rejects(adoptListing({directory: staging, root, approve: true}));
});

test('GitHub project submitted through the form gets its real repository ID and owner', async t => {
  const root = await repo(t);
  const staging = path.join(root, '..', path.basename(root) + '-gh');
  t.after(() => fs.rm(staging, {recursive: true, force: true}));
  const github = new GitHub({token: '', fetcher: async url => url.includes('/releases/latest') ? new Response('{}', {status: 404}) : Response.json({...fixture.repository, owner: {...fixture.repository.owner, id: 99}})});
  const prepared = await prepareListing({submission: submission({url: 'https://github.com/fixture-owner/fixture-repo', creator: 'Fixture Owner', game: 'buus-fury', status: 'released'}), directory: staging, api: github, fetcher: fetcher()});
  assert.equal(prepared.id, 'gh-123'); assert.equal(prepared.proposed.owner_id, 99); assert.equal(prepared.listing.source.type, 'github');
  await adoptListing({directory: staging, root, approve: true});
  const result = await publish({root, output: path.join(root, 'out'), api: github, issues: [], fetcher: fetcher()});
  assert.equal(result.catalog.projects[0].id, 'gh-123'); assert.equal(result.catalog.projects[0].release, null);
});

test('prepare refuses submissions without artwork, with bad fields or non-listing kinds', async t => {
  const root = await repo(t);
  const target = name => path.join(root, name);
  await assert.rejects(prepareListing({submission: submission({artwork: undefined}), directory: target('a'), api: offline, fetcher: fetcher()}), /cover artwork is required/);
  await assert.rejects(prepareListing({submission: submission({title: ''}), directory: target('b'), api: offline, fetcher: fetcher()}), /invalid/);
  await assert.rejects(prepareListing({submission: {id: 1, payload: {kind: 'claim', listing_id: 'ext-abcdefghijkl', note: 'mine'}}, directory: target('c'), api: offline, fetcher: fetcher()}), /only add and suggest/);
  await assert.rejects(prepareListing({submission: submission({artwork: ['https://img.example.org/page.png']}), directory: target('d'), api: offline, fetcher: async () => new Response(Buffer.from('not an image'))}));
  const withCover = await prepareListing({submission: submission({artwork: undefined}), directory: target('e'), api: offline, fetcher: fetcher(), overrides: {cover: png}});
  assert.equal(withCover.listing.cover, 'cover.png');
});

test('project without any web page can be listed, with patch distribution labelled accurately', async t => {
  const root = await repo(t);
  const prepared = await prepareListing({submission: submission({url: undefined, no_page: true, patch_url: 'https://files.example.org/hack.bps'}), directory: path.join(root, 'none'), api: offline, fetcher: fetcher()});
  assert.deepEqual(prepared.listing.source, {type: 'none'});
  assert.deepEqual(prepared.listing.distribution, {label: 'Download Patch', url: 'https://files.example.org/hack.bps', kind: 'patch'});
  const page = await prepareListing({submission: submission({patch_url: 'https://files.example.org/hack-download/'}), directory: path.join(root, 'page'), api: offline, fetcher: fetcher()});
  assert.equal(page.listing.distribution.kind, 'page'); assert.equal(page.listing.distribution.label, 'Patch Page');
});

test('ownership claim is verified only when the challenge is on the project page; impersonation is rejected', async t => {
  const listing = {id: 'ext-abcdefghijkl', source: {type: 'website', url: 'https://forum.example.org/threads/cool-hack.55/'}};
  const real = 'loghub-claim-' + 'a'.repeat(24), impostor = 'loghub-claim-' + 'b'.repeat(24);
  const pages = {[listing.source.url]: `<p>My hack. ${real}</p>`};
  const good = await verifyPageClaim({listing, challenge: real, fetcher: fetcher(pages)});
  assert.equal(good.verified, true); assert.match(good.claim.proof_digest, /^[a-f0-9]{64}$/);
  assert.equal((await verifyPageClaim({listing, challenge: impostor, fetcher: fetcher(pages)})).verified, false);
  assert.equal((await verifyPageClaim({listing, challenge: real, fetcher: async () => { throw Error('down'); }})).verified, false);
  await assert.rejects(verifyPageClaim({listing, challenge: 'short', fetcher: fetcher(pages)}), /unexpected format/);
  await assert.rejects(verifyPageClaim({listing: {id: 'ext-abcdefghijkl', source: {type: 'none'}}, challenge: real, fetcher: fetcher(pages)}), /manually/);
  assert.throws(() => manualClaim({listing, challenge: real, reason: 'short'}), /reason/);
  await assert.rejects(verifyPageClaim({listing: {...listing, source: {type: 'forum', url: listing.source.url}}, challenge: real, fetcher: fetcher({[listing.source.url]: `<article>Original</article><div class="reply">${real}</div>`})}), /manually/);
  assert.equal(manualClaim({listing, challenge: real, reason: 'Confirmed through the developer Discord account'}).method, 'manual');
});

test('recorded claims cannot be replaced without an explicit transfer, and published listings show the claim', async t => {
  const root = await repo(t);
  const staging = path.join(root, '..', path.basename(root) + '-claim');
  t.after(() => fs.rm(staging, {recursive: true, force: true}));
  const prepared = await prepareListing({submission: submission(), directory: staging, api: offline, fetcher: fetcher(), overrides: {game: 'buus-fury'}});
  await assert.rejects(applyClaim({root, listingId: prepared.id, claim: {method: 'page-token', proof_digest: 'a'.repeat(64), verified_at: '2026-11-01T00:00:00Z'}}), /approve the listing/);
  await adoptListing({directory: staging, root, approve: true});
  const owner = {method: 'page-token', proof_digest: 'a'.repeat(64), verified_at: '2026-11-01T00:00:00Z'};
  await applyClaim({root, listingId: prepared.id, claim: owner});
  const first = await publishRoot(root);
  assert.equal(first.catalog.projects[0].ownership.claim, 'verified-claim');
  const rival = {...owner, proof_digest: 'b'.repeat(64)};
  await assert.rejects(applyClaim({root, listingId: prepared.id, claim: rival}), /already has a verified claim/);
  await applyClaim({root, listingId: prepared.id, claim: rival, transfer: true});
  const policy = await readJSON(path.join(root, 'policy/publishing.json'));
  assert.equal(policy.external_projects[0].claim.transfer_from, 'a'.repeat(64));
  const moved = await publishRoot(root, 'moved', first.snapshot);
  assert.equal(moved.catalog.projects[0].ownership.claim, 'verified-claim');
});

test('suspend, delist and restore are policy edits that the publisher honors and signed state keeps', async t => {
  const root = await repo(t);
  const staging = path.join(root, '..', path.basename(root) + '-state');
  t.after(() => fs.rm(staging, {recursive: true, force: true}));
  const prepared = await prepareListing({submission: submission(), directory: staging, api: offline, fetcher: fetcher(), overrides: {game: 'buus-fury'}});
  await adoptListing({directory: staging, root, approve: true});
  const live = await publishRoot(root);
  await setDecision(root, prepared.id, 'suspended', 'reported');
  const suspended = await publishRoot(root, 'suspended', live.snapshot);
  assert.equal(suspended.catalog.projects.length, 0);
  await setDecision(root, prepared.id, 'delisted', 'removed');
  assert.equal((await publishRoot(root, 'delisted', suspended.snapshot)).catalog.projects.length, 0);
  await setDecision(root, prepared.id, 'approved');
  assert.equal((await publishRoot(root, 'restored', suspended.snapshot)).catalog.projects.length, 1);
  assert.throws(() => setDecision(root, prepared.id, 'bogus'));
  await assert.rejects(setDecision(root, 'ext-zzzzzzzzzzzz', 'suspended'), /no policy rule/);
});

test('safe fetcher blocks private, loopback, link-local and mixed DNS answers before connecting', async () => {
  for (const address of ['127.0.0.1', '10.0.0.5', '172.16.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '::ffff:c0a8:101', '0:0:0:0:0:ffff:7f00:1', '::7f00:1', '2002:7f00:1::', '64:ff9b::a00:1', 'nonsense']) assert.equal(publicAddress(address), false, address);
  for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '::ffff:808:808']) assert.equal(publicAddress(address), true, address);
  const resolve = answers => (host, options, callback) => callback(null, answers);
  await assert.rejects(safeFetcher({lookup: resolve([{address: '127.0.0.1', family: 4}])})('https://rebind.example.org/x'), /non-public/);
  await assert.rejects(safeFetcher({lookup: resolve([{address: '93.184.216.34', family: 4}, {address: '10.0.0.1', family: 4}])})('https://mixed.example.org/x'), /non-public/);
  await assert.rejects(safeFetcher({lookup: resolve([])})('https://empty.example.org/x'), /non-public/);
  for (const bad of ['http://example.org/x', 'https://user:pw@example.org/x', 'https://example.org:8443/x', 'https://localhost/x', 'file:///etc/passwd', undefined]) await assert.rejects(safeFetcher()(bad), /public HTTPS/);
});

test('moderator API client sends credentials only to the configured base and surfaces failures', async () => {
  const calls = [];
  const api = new IntakeAPI({base: 'https://intake.example', token: 'tok', fetcher: async (url, options) => { calls.push({url, options}); return Response.json(url.endsWith('bad') ? {error: 'nope'} : {items: []}, {status: url.endsWith('bad') ? 400 : 200}); }});
  await api.queue('received'); await api.decide(3, 'rejected', {publicNote: 'No', projectId: 'ext-abcdefghijkl'});
  assert.equal(calls[0].url, 'https://intake.example/admin/queue?state=received');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[1].options.body), {id: 3, state: 'rejected', public_note: 'No', project_id: 'ext-abcdefghijkl'});
  await assert.rejects(api.call('/bad'), /nope/);
});
