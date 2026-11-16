import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import {handle} from '../../admin/worker.js';
import {digest, random} from '../../intake/worker.js';
export const origin = 'https://admin.example';
export function binding(db) {
  return {prepare(query) { return {bind(...args) { const stmt = db.prepare(query); return {first: async () => stmt.get(...args) || null, all: async () => ({results: stmt.all(...args)}), run: async () => ({meta: {changes: Number(stmt.run(...args).changes)}})}; }}; }, batch: async statements => { db.exec('BEGIN'); try { const results = []; for (const stmt of statements) results.push(await stmt.run()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } }};
}
export async function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0001_submissions.sql', '0002_admin.sql']) db.exec(await fs.readFile(new URL('../../intake/migrations/' + name, import.meta.url), 'utf8'));
  const keys = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const jwk = {...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'fixture'};
  const time = Math.floor(Date.now() / 1000), issuer = 'https://fixture.cloudflareaccess.com';
  const jwt = async changes => { const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url'); const data = enc({alg: 'RS256', kid: 'fixture'}) + '.' + enc({iss: issuer, aud: ['fixture'], type: 'app', sub: 'owner', email: 'owner@example.org', iat: time - 1, exp: time + 3600, ...changes}); return data + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, Buffer.from(data))).toString('base64url'); };
  const token = await jwt(), processor = random();
  const env = {DB: binding(db), ADMIN_ENABLED: 'true', ADMIN_ORIGIN: origin, ACCESS_ISSUER: issuer, ACCESS_AUD: 'fixture', ADMIN_EMAILS: 'owner@example.org', PROCESSOR_HASH: await digest(processor), SITE_ORIGIN: 'https://site.example', SOURCE_REPO: 'fictional/hub', GH_DISPATCH_TOKEN: 'test-only'};
  const state = {projects: [], pr: null, runs: [], jobs: [], manifest: {}, dispatched: [], assets: []};
  env.ASSETS = {fetch: async req => { const name = new URL(req.url).pathname === '/' ? 'index.html' : new URL(req.url).pathname.slice(1); if (!['index.html', 'admin.js', 'admin.css'].includes(name)) return new Response('Not found', {status: 404}); const bytes = await fs.readFile(new URL('../../admin/public/' + name, import.meta.url)); return new Response(bytes, {headers: {'Content-Type': name.endsWith('html') ? 'text/html' : name.endsWith('js') ? 'application/javascript' : 'text/css'}}); }};
  const fetcher = async (url, opts = {}) => {
    const address = String(url);
    if (address === issuer + '/cdn-cgi/access/certs') return Response.json({keys: [jwk]});
    if (address.endsWith('/catalog.json')) return Response.json({projects: state.projects});
    if (address.endsWith('/deployment-manifest.json')) return Response.json(state.manifest);
    if (address.endsWith('/dispatches')) { state.dispatched.push(JSON.parse(opts.body)); return new Response(null, {status: 204}); }
    if (address.includes('/pulls/')) return Response.json(state.pr);
    if (address.endsWith('/check-runs')) return Response.json({check_runs: [{name: 'test', status: 'completed', conclusion: 'success'}]});
    if (address.endsWith('/status')) return Response.json({state: 'success'});
    if (address.endsWith('/required_status_checks')) return Response.json({contexts: ['test'], strict: true});
    if (address.includes('/compare/')) return Response.json({status: 'identical'});
    if (address.includes('/jobs?')) return Response.json({jobs: state.jobs});
    if (address.includes('/actions/workflows/catalog.yml/runs')) return Response.json({workflow_runs: state.runs});
    if (address.includes('/contents/policy')) return Response.json({content: Buffer.from(JSON.stringify({projects: [], external_projects: []})).toString('base64')});
    if (address.includes('/contents/listings/')) return new Response('{}', {status: 404});
    throw Error('Unexpected fixture request: ' + address);
  };
  let cookie = '', csrf = '';
  const request = (path, data, extra = {}) => new Request(origin + path, {method: data === undefined ? 'GET' : 'POST', headers: {'Cf-Access-Jwt-Assertion': token, Cookie: cookie, Origin: origin, ...(data === undefined ? {} : {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}), ...extra}, body: data === undefined ? undefined : JSON.stringify(data)});
  const call = (path, data, extra) => handle(request(path, data, extra), env);
  const login = async () => { const res = await call('/api/login', {}); cookie = res.headers.get('Set-Cookie')?.split(';')[0] || ''; const data = await res.json(); csrf = data.csrf; return {res, data, cookie, csrf}; };
  const seed = async (payload, overrides = {}) => { const t = Math.floor(Date.now() / 1000); const receipt = random(); const p = {kind: 'suggest', title: 'Fictional training project', description: 'A fictional project used only in isolated tests.', category: 'resource', game: 'multiple', status: 'in-development', url: 'https://fiction.example.org/project', artwork: ['https://fiction.example.org/cover.png'], ...payload}; db.prepare('INSERT INTO submissions(receipt_hash,kind,url_key,listing_id,payload,challenge,created,updated,expires) VALUES(?,?,?,?,?,?,?,?,?)').run(await digest(receipt), p.kind, p.url, p.listing_id || null, JSON.stringify(p), overrides.challenge || null, t, t, t + 86400); return {id: Number(db.prepare('SELECT last_insert_rowid() id').get().id), receipt, payload: p}; };
  const processCall = (id, suffix = '', data) => call('/processor/' + id + suffix, data, {Authorization: 'Bearer ' + processor, 'Cf-Access-Jwt-Assertion': ''});
  return {db, env, state, jwt, token, fetcher, call, login, seed, processCall, request};
}
