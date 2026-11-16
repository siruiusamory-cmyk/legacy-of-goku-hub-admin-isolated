import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {handle, random, digest, cleanup} from '../intake/worker.js';

const origin = 'https://site.example', api = 'https://intake.example';
function binding(db) {
  return {
    prepare(query) {
      return {bind(...args) {
        const stmt = db.prepare(query);
        return {first: async () => stmt.get(...args) || null, run: async () => ({meta: {changes: Number(stmt.run(...args).changes)}}), all: async () => ({results: stmt.all(...args)})};
      }};
    },
    batch: async statements => { for (const statement of statements) await statement.run(); }
  };
}
async function setup(t, overrides = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(await fs.readFile(new URL('../intake/migrations/0001_submissions.sql', import.meta.url), 'utf8'));
  const admin = random();
  const env = {DB: binding(db), INTAKE_ENABLED: 'true', SITE_ORIGIN: origin, API_ORIGIN: api, RATE_SALT: random(), TURNSTILE_SECRET: 'secret', ADMIN_HASH: await digest(admin), MAX_PENDING: '300', ...overrides};
  const state = {human: true, projects: [{id: 'ext-abcdefghijkl', title: 'Existing Hack', source: {type: 'forum', url: 'https://forum.example.org/threads/existing.5/'}}], siteDown: false};
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://challenges.cloudflare.com/')) return Response.json({success: state.human});
    if (url === origin + '/catalog.json') { if (state.siteDown) throw Error('offline'); return Response.json({projects: state.projects}); }
    throw Error('unexpected request ' + url);
  };
  t.after(() => { globalThis.fetch = original; db.close(); });
  const call = (path, method = 'POST', data, extra = {}) => handle(new Request(api + path, {method, headers: {Origin: origin, ...(data !== undefined ? {'Content-Type': 'application/json'} : {}), ...extra.headers}, body: data === undefined ? undefined : JSON.stringify(data)}), env);
  const asAdmin = (path, method = 'GET', data) => call(path, method, data, {headers: {Authorization: 'Bearer ' + admin, Origin: ''}});
  return {db, env, state, call, asAdmin, admin};
}
const suggestion = (over = {}) => ({kind: 'suggest', url: 'https://forum.example.org/threads/new-hack.77/', title: 'New Hack', category: 'rom-hack', description: 'A new ROM hack found on a public forum thread.', token: 'human-token-123', ...over});

test('anyone can suggest a project without an account and keep only a private receipt', async t => {
  const x = await setup(t);
  const response = await x.call('/submissions', 'POST', suggestion());
  assert.equal(response.status, 201);
  const {receipt, status} = await response.json();
  assert.equal(status, 'received'); assert.match(receipt, /^[A-Za-z0-9_-]{43}$/);
  const row = x.db.prepare('SELECT * FROM submissions').get();
  assert.equal(row.receipt_hash, await digest(receipt));
  assert.doesNotMatch(JSON.stringify(row), new RegExp(receipt));
  assert.equal(JSON.parse(row.payload).relation, 'third-party');
  const check = await (await x.call('/status', 'POST', {receipt})).json();
  assert.equal(check.status, 'received'); assert.equal(check.note, null);
  assert.equal(JSON.stringify(check).includes('private'), false);
});

test('validation returns field errors and stores nothing', async t => {
  const x = await setup(t);
  for (const bad of [suggestion({url: 'http://insecure.example/x'}), suggestion({url: 'https://user:pw@forum.example.org/x'}), suggestion({title: ''}), suggestion({description: 'too short'}), suggestion({category: 'nonsense'}), suggestion({url: 'https://files.example.org/game.gba'}), suggestion({kind: 'delete'}), suggestion({artwork: ['https://example.org/page.html']})]) {
    const response = await x.call('/submissions', 'POST', bad);
    assert.equal(response.status, 422);
    assert.ok(Object.keys((await response.json()).errors).length > 0);
  }
  assert.equal(x.db.prepare('SELECT count(*) n FROM submissions').get().n, 0);
});

test('already listed projects are reported instead of queued, including address variants', async t => {
  const x = await setup(t);
  const response = await x.call('/submissions', 'POST', suggestion({url: 'https://WWW.forum.example.org/threads/existing.5?utm_source=x'}));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).duplicate.id, 'ext-abcdefghijkl');
  assert.equal(x.db.prepare('SELECT count(*) n FROM submissions').get().n, 0);
});

test('pending duplicates are accepted privately and flagged only to moderators', async t => {
  const x = await setup(t);
  await x.call('/submissions', 'POST', suggestion());
  const second = await x.call('/submissions', 'POST', suggestion({title: 'Same Hack Again'}));
  assert.equal(second.status, 201);
  assert.equal(JSON.stringify(await second.json()).includes('duplicate'), false);
  const queue = await (await x.asAdmin('/admin/queue')).json();
  assert.deepEqual(queue.items.map(i => i.possible_duplicates), [[2], [1]]);
});

test('bot protection: failed check, missing secret and honeypot create nothing', async t => {
  const x = await setup(t);
  x.state.human = false;
  assert.equal((await x.call('/submissions', 'POST', suggestion())).status, 400);
  x.state.human = true;
  assert.equal((await x.call('/submissions', 'POST', suggestion({token: ''}))).status, 400);
  const honey = await x.call('/submissions', 'POST', suggestion({company: 'Acme'}));
  assert.equal(honey.status, 201);
  const noSecret = await setup(t, {TURNSTILE_SECRET: undefined});
  assert.equal((await noSecret.call('/submissions', 'POST', suggestion())).status, 503);
  assert.equal(x.db.prepare('SELECT count(*) n FROM submissions').get().n, 0);
});

test('rate limits and queue capacity are enforced', async t => {
  const x = await setup(t);
  for (let i = 0; i < 6; i++) assert.equal((await x.call('/submissions', 'POST', suggestion({url: `https://forum.example.org/threads/hack.${100 + i}/`}))).status, 201);
  assert.equal((await x.call('/submissions', 'POST', suggestion({url: 'https://forum.example.org/threads/hack.999/'}))).status, 429);
  const small = await setup(t, {MAX_PENDING: '1'});
  assert.equal((await small.call('/submissions', 'POST', suggestion())).status, 201);
  assert.equal((await small.call('/submissions', 'POST', suggestion({url: 'https://forum.example.org/threads/other.5/'}))).status, 503);
  const racing = await setup(t, {MAX_PENDING: '1'});
  const both = await Promise.all([racing.call('/submissions', 'POST', suggestion({url: 'https://forum.example.org/threads/race.1/'}), {headers: {'CF-Connecting-IP': '203.0.113.7'}}), racing.call('/submissions', 'POST', suggestion({url: 'https://forum.example.org/threads/race.2/'}), {headers: {'CF-Connecting-IP': '203.0.113.8'}})]);
  assert.deepEqual(both.map(r => r.status).sort(), [201, 503]);
  const statusLimit = await setup(t);
  let last;
  for (let i = 0; i < 41; i++) last = await statusLimit.call('/status', 'POST', {receipt: random()});
  assert.equal(last.status, 429);
});

test('oversized bodies, wrong origin, wrong content type and disabled mode fail closed', async t => {
  const x = await setup(t);
  assert.equal((await x.call('/submissions', 'POST', suggestion({description: 'x'.repeat(20000)}))).status, 413);
  assert.equal((await handle(new Request(api + '/submissions', {method: 'POST', headers: {Origin: 'https://evil.example', 'Content-Type': 'application/json'}, body: '{}'}), x.env)).status, 403);
  assert.equal((await handle(new Request(api + '/submissions', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'text/plain'}, body: '{}'}), x.env)).status, 415);
  assert.equal((await handle(new Request(api + '/submissions', {method: 'GET', headers: {Origin: origin}}), x.env)).status, 405);
  const off = await setup(t, {INTAKE_ENABLED: 'false'});
  assert.equal((await off.call('/submissions', 'POST', suggestion())).status, 503);
  const preflight = await handle(new Request(api + '/submissions', {method: 'OPTIONS', headers: {Origin: origin}}), x.env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
});

test('a URL added during revision replaces a no-page submission', async t => {
  const x = await setup(t);
  const {receipt} = await (await x.call('/submissions', 'POST', suggestion({url: undefined, no_page: true}))).json();
  await x.asAdmin('/admin/decision', 'POST', {id: 1, state: 'needs-changes', public_note: 'Is there a page?'});
  assert.equal((await x.call('/revise', 'POST', {receipt, changes: {url: 'https://project.example.org/'}})).status, 200);
  const stored = JSON.parse(x.db.prepare('SELECT payload FROM submissions').get().payload);
  assert.equal(stored.url, 'https://project.example.org/'); assert.equal(stored.no_page, undefined);
});

test('moderator requests changes, submitter revises, moderator publishes; private notes never leak', async t => {
  const x = await setup(t);
  const {receipt} = await (await x.call('/submissions', 'POST', suggestion())).json();
  assert.equal((await x.call('/admin/queue', 'GET', undefined, {headers: {Origin: ''}})).status, 401);
  assert.equal((await x.call('/admin/queue', 'GET', undefined, {headers: {Authorization: 'Bearer ' + random()}})).status, 401);
  assert.equal((await x.asAdmin('/admin/decision', 'POST', {id: 1, state: 'needs-changes', public_note: 'Please add the creator name.', private_note: 'looks like spam from same IP'})).status, 200);
  const waiting = await (await x.call('/status', 'POST', {receipt})).json();
  assert.equal(waiting.status, 'needs-changes'); assert.equal(waiting.note, 'Please add the creator name.');
  assert.equal(JSON.stringify(waiting).includes('spam'), false);
  assert.equal((await x.call('/revise', 'POST', {receipt, changes: {creator: ''.padEnd(101, 'x')}})).status, 422);
  assert.equal((await x.call('/revise', 'POST', {receipt, changes: {creator: 'Sir Hacker'}})).status, 200);
  assert.equal(JSON.parse(x.db.prepare('SELECT payload FROM submissions').get().payload).creator, 'Sir Hacker');
  assert.equal((await x.call('/revise', 'POST', {receipt, changes: {creator: 'Again'}})).status, 409);
  assert.equal((await x.asAdmin('/admin/decision', 'POST', {id: 1, state: 'published', project_id: 'ext-qqqqqqqqqqqq'})).status, 409);
  await x.asAdmin('/admin/decision', 'POST', {id: 1, state: 'approved', project_id: 'ext-qqqqqqqqqqqq'});
  const done = await (await x.call('/status', 'POST', {receipt})).json();
  assert.equal(done.status, 'approved'); assert.equal(done.project_id, undefined);
  assert.equal((await x.asAdmin('/admin/decision', 'POST', {id: 1, state: 'published', project_id: '../x'})).status, 400);
  assert.equal((await x.asAdmin('/admin/decision', 'POST', {id: 99, state: 'rejected'})).status, 404);
});

test('rejection is final to the submitter and receipts are unguessable', async t => {
  const x = await setup(t);
  const {receipt} = await (await x.call('/submissions', 'POST', suggestion())).json();
  await x.asAdmin('/admin/decision', 'POST', {id: 1, state: 'rejected', public_note: 'Not a Legacy of Goku project.'});
  assert.equal((await (await x.call('/status', 'POST', {receipt})).json()).status, 'rejected');
  assert.equal((await x.call('/revise', 'POST', {receipt, changes: {}})).status, 409);
  assert.equal((await x.call('/status', 'POST', {receipt: 'A'.repeat(43)})).status, 404);
  assert.equal((await x.call('/status', 'POST', {receipt: '1'})).status, 404);
});

test('corrections and claims need an existing listing; claims return a proof challenge', async t => {
  const x = await setup(t);
  assert.equal((await x.call('/submissions', 'POST', {kind: 'correct', listing_id: 'ext-zzzzzzzzzzzz', note: 'Wrong creator', token: 'human-token-123'})).status, 404);
  assert.equal((await x.call('/submissions', 'POST', {kind: 'correct', listing_id: 'ext-abcdefghijkl', token: 'human-token-123'})).status, 422);
  const correction = await x.call('/submissions', 'POST', {kind: 'correct', listing_id: 'ext-abcdefghijkl', creator: 'Real Author', token: 'human-token-123'});
  assert.equal(correction.status, 201);
  assert.equal((await x.call('/submissions', 'POST', {kind: 'claim', listing_id: 'ext-abcdefghijkl', token: 'human-token-123'})).status, 422);
  const claim = await x.call('/submissions', 'POST', {kind: 'claim', listing_id: 'ext-abcdefghijkl', note: 'I made this hack', token: 'human-token-123'});
  const {receipt, challenge} = await claim.json();
  assert.match(challenge, /^loghub-claim-[A-Za-z0-9_-]{24}$/);
  assert.equal((await (await x.call('/status', 'POST', {receipt})).json()).challenge, challenge);
  const impostor = await (await x.call('/submissions', 'POST', {kind: 'claim', listing_id: 'ext-abcdefghijkl', note: 'Actually me', token: 'human-token-123'})).json();
  assert.notEqual(impostor.challenge, challenge);
});

test('catalog outage does not block suggestions but blocks listing-specific requests', async t => {
  const x = await setup(t);
  x.state.siteDown = true;
  assert.equal((await x.call('/submissions', 'POST', suggestion())).status, 201);
  assert.equal((await x.call('/submissions', 'POST', {kind: 'correct', listing_id: 'ext-abcdefghijkl', note: 'Fix', token: 'human-token-123'})).status, 404);
});

test('cleanup removes expired submissions and limit rows only', async t => {
  const x = await setup(t);
  await x.call('/submissions', 'POST', suggestion());
  await x.call('/submissions', 'POST', suggestion({url: 'https://forum.example.org/threads/two.2/'}));
  x.db.prepare('UPDATE submissions SET expires=1 WHERE id=1').run();
  await cleanup(x.env);
  assert.deepEqual(x.db.prepare('SELECT id FROM submissions').all().map(r => r.id), [2]);
  assert.equal(x.db.prepare('SELECT count(*) n FROM limits WHERE expires<=?').get(Math.floor(Date.now() / 1000)).n, 0);
});

test('database rejects invalid states and oversize payloads without the handler', async t => {
  const x = await setup(t);
  const insert = (state, payload) => x.db.prepare('INSERT INTO submissions(receipt_hash,kind,state,payload,created,updated,expires) VALUES(?,?,?,?,1,1,1)').run(random(), 'add', state, payload);
  assert.throws(() => insert('bogus', '{}'));
  assert.throws(() => insert('received', 'x'.repeat(9000)));
  assert.throws(() => x.db.prepare('INSERT INTO submissions(receipt_hash,kind,payload,created,updated,expires) VALUES(?,?,?,1,1,1)').run('short', 'add', '{}'));
});
