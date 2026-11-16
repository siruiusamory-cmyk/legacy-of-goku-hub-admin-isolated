import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {GitHub, APIError, repositoryInfo, synchronize, verifySubmitter, date} from '../src/github.js';
import {readJSON, saveJSON, validateRecord, parseIssue, loadRecords, imageURL} from '../src/records.js';
import {normalizeImage, MAX_IMAGE_BYTES, boundedBody} from '../src/images.js';
import {validateSubmission, refresh, checkDownload, copyStaged, checkPendingDuplicates} from '../src/pipeline.js';
import {buildCatalog} from '../src/catalog.js';

const record = await readJSON(new URL('./fixtures/project.json', import.meta.url));
const fixture = await readJSON(new URL('./fixtures/github.json', import.meta.url));
const body = r => `### Project record\n\n\`\`\`json\n${JSON.stringify(r)}\n\`\`\`\n`;
const png = await sharp({create: {width: 100, height: 200, channels: 3, background: '#ff0000'}}).png().toBuffer();
const imageFetch = async () => new Response(png);
function api(options = {}) {
  const calls = [];
  const client = new GitHub({token: '', fetcher: async (url, init) => {
    calls.push({url, init});
    if (options.failure) return new Response('{}', {status: options.failure, headers: {'retry-after': '60'}});
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify(options.release ?? fixture.release), {status: options.noRelease ? 404 : 200});
    if (url.includes('/assets?')) return new Response(JSON.stringify(options.assets ?? fixture.assets));
    return new Response(JSON.stringify(options.repository ?? fixture.repository), {headers: {etag: '"repo"'}});
  }});
  client.calls = calls;
  return client;
}
async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'log-hub-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  for (const d of ['records', 'state', 'assets']) await fs.mkdir(path.join(root, d));
  return root;
}
async function submit(root, client = api(), r = record) {
  return validateSubmission({root, output: root, body: body(r), login: 'fixture-owner', api: client, fetcher: imageFetch});
}

test('valid record, form parsing, schema lengths and required fields', () => {
  assert.deepEqual(validateRecord(parseIssue(body(record))), record);
  for (const key of ['id', 'title', 'developer', 'description', 'game', 'category', 'status', 'repository', 'cover']) {
    const r = {...record}; delete r[key]; assert.throws(() => validateRecord(r), /record:/);
  }
  for (const patch of [{title: 'x'.repeat(101)}, {id: '../escape'}, {title: ' hi '}, {description: '<script>untrusted text here</script>'}, {category: 'other'}, {download_url: 'https://bad.test'}, {asset_name: 'game.gba'}]) assert.throws(() => validateRecord({...record, ...patch}));
  assert.throws(() => parseIssue('not a form'));
  assert.throws(() => parseIssue(body(record) + body(record)));
});
test('unsafe repository and image URLs are rejected', () => {
  for (const repository of ['http://github.com/a/b', 'https://github.com.evil/a/b', 'https://github.com/a/b.git', 'https://github.com/a/..', 'https://github.com/a/b?x=1', 'https://user@github.com/a/b', 'file:///etc/passwd']) assert.throws(() => validateRecord({...record, repository}));
  for (const cover of [record.cover.replace('/aaaa', '/main/aaaa'), record.cover.replace('/images/', '/../'), record.cover.replace('fixture-owner', 'other-owner'), 'http://127.0.0.1/x.png', record.cover + '?x=1']) assert.throws(() => imageURL(cover, record.repository));
});
test('duplicate ID and repository (case insensitive)', () => {
  assert.throws(() => validateRecord(record, [record]), /duplicate/);
  assert.throws(() => validateRecord({...record, id: 'other'}, [{...record, repository: record.repository.toUpperCase()}]), /duplicate/);
});
test('images resize without distortion, with deterministic bytes and stripped metadata', async () => {
  for (const [kind, width, height] of [['cover', 640, 360], ['screenshot', 480, 320]]) {
    const bytes = await normalizeImage(png, kind);
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.width, width); assert.equal(meta.height, height); assert.equal(meta.format, 'webp'); assert.equal(meta.exif, undefined);
    assert.deepEqual(bytes, await normalizeImage(png, kind));
    const {data, info} = await sharp(bytes).raw().toBuffer({resolveWithObject: true});
    assert.ok(data[0] < 30, 'letterbox padding is dark');
    const center = ((height / 2 | 0) * width + (width / 2 | 0)) * info.channels;
    assert.ok(data[center] > 200 && data[center + 1] < 30, 'center retains red content');
  }
});
test('invalid, corrupt, unsupported, oversized and pixel-bomb images fail', async () => {
  for (const bytes of [Buffer.from('broken'), Buffer.alloc(0), Buffer.alloc(MAX_IMAGE_BYTES + 1), Buffer.from('<svg width="10" height="10"></svg>'), png.subarray(0, 40)]) await assert.rejects(normalizeImage(bytes, 'cover'));
  const wide = await sharp({create: {width: 8193, height: 1, channels: 3, background: 'red'}}).png().toBuffer();
  await assert.rejects(normalizeImage(wide, 'cover'));
  const huge = await sharp({create: {width: 4500, height: 4500, channels: 3, background: 'red'}}).png().toBuffer();
  await assert.rejects(normalizeImage(huge, 'cover'));
  await assert.rejects(boundedBody(new Response(Buffer.alloc(20)), 10), /exceeds/);
});
test('repository checks reject private, malformed and ownership mismatch metadata', async () => {
  for (const repository of [{...fixture.repository, private: true}, {...fixture.repository, id: '123'}, {...fixture.repository, owner: {login: 'other', type: 'User'}}, {}]) await assert.rejects(repositoryInfo(api({repository}), record));
  await assert.rejects(verifySubmitter(api(), {owner: 'fixture-owner', owner_type: 'User'}, 'imposter'), /must own/);
});
test('no release produces a valid in-development catalog listing', async t => {
  const root = await workspace(t); await submit(root, api({noRelease: true}));
  const catalog = await buildCatalog(root);
  assert.equal(catalog.projects[0].release, null);
  assert.equal(catalog.projects[0].status, 'in-development');
  await assert.rejects(synchronize(api({noRelease: true}), {...record, status: 'released'}), /requires/);
});
test('missing and ambiguous release assets fail; explicit filename selects one', async () => {
  await assert.rejects(synchronize(api({assets: []}), record), /distribution asset/);
  const assets = [...fixture.assets, {...fixture.assets[0], name: 'other.bps', browser_download_url: fixture.assets[0].browser_download_url.replace('fixture.bps', 'other.bps')}];
  await assert.rejects(synchronize(api({assets}), record), /asset_name/);
  assert.equal((await synchronize(api({assets}), {...record, asset_name: 'fixture.bps'})).release.file_size, 1234);
});
test('unexpected release metadata and malicious download URLs are rejected', async () => {
  for (const patch of [{size: -1}, {digest: 'sha256:wrong'}, {browser_download_url: 'https://evil.test/file.zip'}, {state: 'new'}, {updated_at: 'tomorrow'}]) await assert.rejects(synchronize(api({assets: [{...fixture.assets[0], ...patch}]}), record));
  await assert.rejects(synchronize(api({release: {...fixture.release, draft: true}}), record));
  assert.throws(() => date('2026-02-30T00:00:00Z'));
});
test('404, 403, 429, 500 and network failures retain valid prior release data', async () => {
  const previous = await synchronize(api(), record);
  for (const failure of [404, 403, 429, 500]) {
    await assert.rejects(synchronize(api({failure}), record), /GitHub HTTP/);
    const state = await synchronize(api({failure}), record, previous);
    assert.equal(state.availability, 'unavailable'); assert.deepEqual(state.release, previous.release); assert.equal(state.last_updated, previous.last_updated);
  }
  const network = new GitHub({fetcher: async () => {throw Error('connection');}});
  assert.deepEqual((await synchronize(network, record, previous)).release, previous.release);
  assert.deepEqual((await synchronize(api({noRelease: true}), record, previous)).release, previous.release);
});
test('renamed/archived repos work; identity reuse fails; duplicates by stable ID fail', async t => {
  const repository = {...fixture.repository, archived: true};
  assert.equal((await synchronize(api({repository, noRelease: true}), record)).availability, 'archived');
  const previous = await synchronize(api(), record);
  assert.match((await synchronize(api({repository: {...fixture.repository, id: 999}}), record, previous)).warning, /identity changed/);
  const root = await workspace(t); await submit(root);
  const renamed = {...record, id: 'different-id', repository: 'https://github.com/fixture-owner/renamed', cover: record.cover.replace('fixture-repo', 'renamed'), screenshots: []};
  await assert.rejects(submit(root, api(), renamed), /duplicate GitHub repository identity/);
});
test('ETag cache, safe API redirects, invalid JSON, response caps and rate messages', async () => {
  let count = 0;
  const client = new GitHub({fetcher: async (_, options) => {
    count++;
    if (count === 1) return new Response('{"ok":true}', {headers: {etag: '"test"'}});
    assert.equal(options.headers['If-None-Match'], '"test"'); return new Response(null, {status: 304});
  }});
  assert.deepEqual(await client.request('/repos/a/b'), await client.request('/repos/a/b'));
  for (const response of [new Response('not json'), new Response('{}', {headers: {'content-length': '99999999'}}), new Response(null, {status: 301, headers: {location: 'https://evil.test'}})]) await assert.rejects(new GitHub({fetcher: async () => response}).request('/repos/a/b'));
  let calls = 0;
  const moved = new GitHub({fetcher: async url => ++calls === 1 ? new Response(null, {status: 301, headers: {location: 'https://api.github.com/repositories/123'}}) : new Response(JSON.stringify(fixture.repository))});
  assert.equal((await repositoryInfo(moved, record)).id, 123);
  await assert.rejects(api({failure: 429}).request('/repos/a/b'), /retry time 60/);
});
test('complete form-to-approved-files-to-catalog fixture; repeatable output; no executable download', async t => {
  const root = await workspace(t); const client = api(); await submit(root, client);
  assert.equal((await loadRecords(root)).length, 1);
  const result = await buildCatalog(root);
  assert.equal(result.projects[0].release.sha256, 'a'.repeat(64));
  assert.equal(result.projects[0].release.file_size, 1234);
  assert.deepEqual(result.sort.name, [record.id]);
  assert.deepEqual(result.filters.games, ['legacy-of-goku-2']);
  const first = await fs.readFile(path.join(root, 'dist/catalog.json'));
  const cover = await fs.readFile(path.join(root, 'dist/assets/fixture-only/cover.webp'));
  await buildCatalog(root);
  assert.deepEqual(await fs.readFile(path.join(root, 'dist/catalog.json')), first);
  assert.deepEqual(await fs.readFile(path.join(root, 'dist/assets/fixture-only/cover.webp')), cover);
  assert.ok(client.calls.every(c => c.url.startsWith('https://api.github.com/') && !c.url.includes('/releases/download/')));
  const report = await refresh(root, api({failure: 500}), async () => new Response(null, {status: 404}));
  assert.equal(report[0].image_warnings.length, 2);
  assert.equal((await buildCatalog(root)).projects[0].release.version, 'v1.0.0');
});
test('failed image validation writes no approved record', async t => {
  const root = await workspace(t);
  await assert.rejects(validateSubmission({root, output: root, body: body(record), login: 'fixture-owner', api: api(), fetcher: async () => new Response('corrupt')}));
  assert.deepEqual(await loadRecords(root), []);
});
test('empty production catalog never includes fixtures', async t => {
  const root = await workspace(t);
  assert.deepEqual((await buildCatalog(root)).projects, []);
});
test('download checks use HEAD only, limit redirects and never allow arbitrary hosts', async () => {
  const seen = [];
  await checkDownload(fixture.assets[0].browser_download_url, async (url, init) => {
    seen.push(url); assert.equal(init.method, 'HEAD'); assert.equal(init.redirect, 'manual');
    return seen.length === 1 ? new Response(null, {status: 302, headers: {location: 'https://release-assets.githubusercontent.com/test'}}) : new Response(null);
  });
  assert.equal(seen.length, 2);
  await assert.rejects(checkDownload(fixture.assets[0].browser_download_url, async () => new Response(null, {status: 302, headers: {location: 'http://127.0.0.1/internal'}})), /unsafe/);
  await assert.rejects(checkDownload(fixture.assets[0].browser_download_url, async () => new Response(null, {status: 404})), /404/);
});
test('staged artifacts are not approved until copied, and approval cannot overwrite files', async t => {
  const root = await workspace(t); const staged = await workspace(t);
  await validateSubmission({root, output: staged, body: body(record), login: 'fixture-owner', api: api(), fetcher: imageFetch});
  assert.equal((await buildCatalog(root)).projects.length, 0);
  await copyStaged(root, staged);
  assert.equal((await buildCatalog(root)).projects.length, 1);
  await assert.rejects(copyStaged(root, staged), /exist/i);
});
test('pending duplicate submissions favor the oldest valid open issue', async () => {
  const client = {request: async () => [
    {number: 1, title: '[Submission] old', body: body(record)},
    {number: 5, title: '[Submission] newer', body: body(record)}
  ]};
  await assert.rejects(checkPendingDuplicates(client, 'hub/repo', '3', record), /issue #1/);
  await checkPendingDuplicates(client, 'hub/repo', '1', record);
  await checkPendingDuplicates({request: async () => [{number: 1, title: '[Submission]', body: 'invalid'}]}, 'hub/repo', '3', record);
});
test('animated WebP and PNG are rejected', async () => {
  const animated = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {raw: {width: 1, height: 2, channels: 3, pageHeight: 1}}).webp({loop: 0, delay: [100, 100]}).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(normalizeImage(animated, 'cover'), /static/);
  const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8, 0); chunk.write('acTL', 4);
  await assert.rejects(normalizeImage(Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]), 'cover'), /animated PNG/);
});
test('sorts and filters are deterministic across multiple approved records', async t => {
  const root = await workspace(t); await submit(root);
  const other = {...record, id: 'another-fixture', title: 'AAA test fixture', game: 'buus-fury', category: 'tool', status: 'released', repository: 'https://github.com/fixture-owner/another-fixture', cover: record.cover.replace('fixture-repo', 'another-fixture'), screenshots: [], featured: false};
  await saveJSON(path.join(root, 'records', other.id + '.json'), other);
  const state = await synchronize(api(), record);
  await saveJSON(path.join(root, 'state', other.id + '.json'), {...state, repository: {...state.repository, id: 999}, last_updated: '2026-01-03T00:00:00Z'});
  await fs.mkdir(path.join(root, 'assets', other.id));
  await fs.copyFile(path.join(root, 'assets', record.id, 'cover.webp'), path.join(root, 'assets', other.id, 'cover.webp'));
  const result = await buildCatalog(root);
  assert.deepEqual(result.sort.name, [other.id, record.id]);
  assert.deepEqual(result.sort.update_date, [other.id, record.id]);
  assert.deepEqual(result.filters.categories, ['rom-hack', 'tool']);
  assert.deepEqual(result.projects.map(p => p.id), [other.id, record.id]);
});
