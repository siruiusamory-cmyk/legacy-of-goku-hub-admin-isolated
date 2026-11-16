import {validateSubmission, submissionKey, RECEIPT} from '../website/src/lib/submission.js';
import {projectKeys} from '../website/src/lib/urlkey.js';

const enc = new TextEncoder();
const base64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
export const random = () => base64(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async value => base64(await crypto.subtle.digest('SHA-256', enc.encode(value)));
const now = () => Math.floor(Date.now() / 1000);
const fail = (status, message, extra) => { throw Object.assign(new Error(message), {status, extra}); };
const sql = (env, query, ...args) => env.DB.prepare(query).bind(...args);
const DAY = 86400;
const STATES = ['received', 'in-review', 'needs-changes', 'approved', 'published', 'rejected'];
const OPEN = ['received', 'in-review', 'needs-changes'];
const MESSAGES = {
  received: 'We have your submission. A person will review it before anything is published.',
  'in-review': 'A person is reviewing your submission now.',
  'needs-changes': 'We need a little more information before we can continue.',
  approved: 'Approved. Publication is pending the protected review and deployment checks.',
  published: 'Published. Your listing is live in the directory.',
  rejected: 'We could not accept this submission.'
};

function headers(env, admin) {
  return {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...(admin ? {} : {'Access-Control-Allow-Origin': env.SITE_ORIGIN, Vary: 'Origin'})};
}
const json = (env, data, status = 200, admin = false) => Response.json(data, {status, headers: headers(env, admin)});

async function body(request, maximum) {
  if (request.headers.get('Content-Type') !== 'application/json') fail(415, 'JSON required');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Body required');
  const chunks = []; let length = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maximum) { await reader.cancel(); fail(413, 'That is too much text; shorten it and try again.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'Invalid JSON'); }
}
async function limit(env, key, maximum, window) {
  const bucket = Math.floor(now() / window);
  const row = await sql(env, 'INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', `${key}:${bucket}`, now() + window * 2).first();
  if (row.count > maximum) fail(429, 'Too many requests. Please wait a while and try again.');
}
async function human(env, token, ip) {
  if (!env.TURNSTILE_SECRET) fail(503, 'Submissions are unavailable');
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) fail(400, 'Please complete the human check.');
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET); form.set('response', token); form.set('remoteip', ip);
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method: 'POST', body: form, signal: AbortSignal.timeout(8000)});
    result = await response.json();
  } catch { fail(503, 'The human check is unavailable. Please try again soon.'); }
  if (result?.success !== true) fail(400, 'The human check did not pass. Please try again.');
}
async function published(env) {
  try {
    const response = await fetch(env.SITE_ORIGIN + '/catalog.json', {redirect: 'manual', signal: AbortSignal.timeout(6000), headers: {'Cache-Control': 'no-cache'}});
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.projects) ? data.projects : [];
  } catch { return []; }
}
async function adminCheck(request, env) {
  const raw = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!raw || !env.ADMIN_HASH || (await digest(raw)) !== env.ADMIN_HASH) fail(401, 'Administrator credential required');
}
const view = row => ({status: row.state, kind: row.kind, message: MESSAGES[row.state], note: row.public_note || null, updated_at: new Date(row.updated * 1000).toISOString(), ...(row.challenge && OPEN.includes(row.state) ? {challenge: row.challenge} : {}), ...(row.project_id && row.state === 'published' ? {project_id: row.project_id} : {})});

async function create(request, env, ip) {
  const data = await body(request, 12288);
  if (data?.company) return json(env, {receipt: random(), status: 'received', message: MESSAGES.received}, 201);
  await limit(env, 'attempt:' + ip, 60, 3600);
  const checked = validateSubmission(data);
  if (!checked.ok) fail(422, 'Please fix the highlighted fields.', {errors: checked.errors});
  await limit(env, 'submit:' + ip, 6, 3600);
  await human(env, data.token, ip);
  const value = checked.value; const key = submissionKey(value);
  const catalog = await published(env);
  if (value.kind === 'add' || value.kind === 'suggest') {
    const hit = key && catalog.find(project => projectKeys(project).includes(key));
    if (hit) fail(409, 'This project is already listed.', {duplicate: {id: hit.id, title: hit.title}});
  } else if (!catalog.some(project => project.id === value.listing_id)) fail(404, 'That listing was not found.');
  const payload = JSON.stringify(value);
  if (payload.length > 8192) fail(413, 'That is too much text; shorten it and try again.');
  const receipt = random(); const time = now();
  const challenge = value.kind === 'claim' ? 'loghub-claim-' + random().slice(0, 24) : null;
  const added = await sql(env, `INSERT INTO submissions(receipt_hash,kind,url_key,listing_id,payload,challenge,created,updated,expires) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM submissions WHERE state IN ('received','in-review','needs-changes')) < ?`, await digest(receipt), value.kind, key, value.listing_id ?? null, payload, challenge, time, time, time + 90 * DAY, Number(env.MAX_PENDING || 300)).run();
  if (!added.meta.changes) fail(503, 'We are at capacity right now. Please try again in a few days.');
  return json(env, {receipt, status: 'received', message: MESSAGES.received, ...(challenge ? {challenge} : {})}, 201);
}
async function lookup(env, receipt) {
  if (typeof receipt !== 'string' || !RECEIPT.test(receipt)) fail(404, 'We could not find that receipt.');
  const row = await sql(env, 'SELECT * FROM submissions WHERE receipt_hash=?', await digest(receipt)).first();
  if (!row) fail(404, 'We could not find that receipt.');
  return row;
}
async function status(request, env, ip) {
  await limit(env, 'status:' + ip, 40, 60);
  const data = await body(request, 256);
  return json(env, view(await lookup(env, data?.receipt)));
}
async function revise(request, env, ip) {
  await limit(env, 'revise:' + ip, 10, 3600);
  const data = await body(request, 12288);
  const row = await lookup(env, data?.receipt);
  if (row.state !== 'needs-changes') fail(409, 'This submission is not waiting for changes.');
  const merged = {...JSON.parse(row.payload), ...data.changes, kind: row.kind, listing_id: row.listing_id ?? undefined};
  if (typeof data.changes?.url === 'string' && data.changes.url.trim()) delete merged.no_page;
  const checked = validateSubmission(merged);
  if (!checked.ok) fail(422, 'Please fix the highlighted fields.', {errors: checked.errors});
  const time = now();
  const revision = row.revision === undefined ? '' : ',revision=revision+1';
  const changed = await sql(env, `UPDATE submissions SET payload=?,url_key=?,state='received',updated=?,expires=?${revision} WHERE id=? AND state='needs-changes' AND payload=?`, JSON.stringify(checked.value), submissionKey(checked.value), time, time + 90 * DAY, row.id, row.payload).run();
  if (!changed.meta.changes) fail(409, 'This submission changed. Check its status again.');
  return json(env, {status: 'received', message: MESSAGES.received});
}
async function admin(request, env, url, ip) {
  await limit(env, 'admin:' + ip, 120, 60);
  await adminCheck(request, env);
  if (url.pathname === '/admin/queue' && request.method === 'GET') {
    const state = url.searchParams.get('state');
    if (state && !STATES.includes(state)) fail(400, 'Unknown state');
    const rows = state ? (await sql(env, 'SELECT * FROM submissions WHERE state=? ORDER BY created LIMIT 100', state).all()).results : (await sql(env, `SELECT * FROM submissions WHERE state IN ('received','in-review','needs-changes') ORDER BY created LIMIT 100`).all()).results;
    const items = rows.map(row => ({id: row.id, kind: row.kind, state: row.state, created: new Date(row.created * 1000).toISOString(), listing_id: row.listing_id, challenge: row.challenge, payload: JSON.parse(row.payload), public_note: row.public_note, private_note: row.private_note, project_id: row.project_id, possible_duplicates: rows.filter(other => other.id !== row.id && row.url_key && other.url_key === row.url_key).map(other => other.id)}));
    return json(env, {items}, 200, true);
  }
  if (url.pathname === '/admin/decision' && request.method === 'POST') {
    const data = await body(request, 4096);
    if (!Number.isInteger(data?.id) || !STATES.includes(data.state)) fail(400, 'id and state required');
    const note = (value, max) => { if (value === undefined) return ''; if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b-\x1f<>]/.test(value)) fail(400, 'Invalid note'); return value; };
    const project = data.project_id === undefined ? null : data.project_id;
    if (project !== null && !/^(?:ext-[a-z0-9]{12}|gh-[0-9]{1,15})$/.test(project)) fail(400, 'Invalid project id');
    if (data.state === 'published') fail(409, 'Publication status requires verified protected deployment in the administrator dashboard');
    const time = now();
    const expires = OPEN.includes(data.state) ? time + 90 * DAY : time + 30 * DAY;
    const columns = await sql(env, 'PRAGMA table_info(submissions)').all();
    const revision = columns.results.some(c => c.name === 'revision') ? ',revision=revision+1' : '';
    const result = await sql(env, `UPDATE submissions SET state=?,public_note=?,private_note=?,project_id=COALESCE(?,project_id),updated=?,expires=?${revision} WHERE id=?`, data.state, note(data.public_note, 500), note(data.private_note, 1000), project, time, expires, data.id).run();
    if (!result.meta.changes) fail(404, 'Unknown submission');
    return json(env, {id: data.id, state: data.state}, 200, true);
  }
  fail(404, 'Not found');
}

export async function handle(request, env) {
  try {
    if (env.INTAKE_ENABLED !== 'true' || !env.RATE_SALT) return json(env, {error: 'Submissions are unavailable'}, 503);
    const url = new URL(request.url);
    if (url.origin !== env.API_ORIGIN) fail(400, 'Wrong API origin');
    const ip = await digest(env.RATE_SALT + ':' + (request.headers.get('CF-Connecting-IP') || 'local'));
    if (url.pathname.startsWith('/admin/')) return await admin(request, env, url, ip);
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') {
      if (origin !== env.SITE_ORIGIN) fail(403, 'Origin rejected');
      return new Response(null, {status: 204, headers: {...headers(env), 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600'}});
    }
    if (request.method !== 'POST') fail(405, 'Method not allowed');
    if (origin !== env.SITE_ORIGIN) fail(403, 'Origin rejected');
    if (url.pathname === '/submissions') return await create(request, env, ip);
    if (url.pathname === '/status') return await status(request, env, ip);
    if (url.pathname === '/revise') return await revise(request, env, ip);
    fail(404, 'Not found');
  } catch (error) {
    return json(env, {error: error.status ? error.message : 'Submissions are unavailable', ...(error.extra || {})}, error.status || 503, new URL(request.url).pathname.startsWith('/admin/'));
  }
}
export async function cleanup(env) {
  if (env.INTAKE_ENABLED !== 'true') return;
  await env.DB.batch([sql(env, 'DELETE FROM limits WHERE expires<=?', now()), sql(env, 'DELETE FROM submissions WHERE expires<=?', now())]);
}
export default {fetch: handle, scheduled: (_event, env, ctx) => ctx.waitUntil(cleanup(env))};
