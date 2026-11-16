import {digest, random} from '../intake/worker.js';
import {validateSubmission, LISTING_ID} from '../website/src/lib/submission.js';
import {projectKeys} from '../website/src/lib/urlkey.js';
import {identity, session, startSession, cookie, seconds, requireThat as check, sql, readBody, rate} from './auth.js';

const security = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'};
const json = (data, status = 200, headers = {}) => Response.json(data, {status, headers: {...security, ...headers}});
const note = (value = '', max = 1000) => { check(typeof value === 'string' && value.length <= max && !/[\x00-\x08\x0b-\x1f<>]/.test(value), 400, 'Invalid note'); return value; };
const item = row => { const {receipt_hash, ...rest} = row; return {...rest, payload: JSON.parse(row.payload)}; };
const review = row => row && ({...row, payload: JSON.parse(row.payload), package: row.package ? JSON.parse(row.package) : null});
const history = (env, user, action, submission = null, id = null, pub = '', priv = '') => sql(env, 'INSERT INTO admin_history(submission_id,review_id,actor,action,public_note,private_note,created) VALUES(?,?,?,?,?,?,?)', submission, id, user, action, pub, priv, seconds());
async function github(env, path, method = 'GET', data, missing = false) {
  check(env.GH_DISPATCH_TOKEN && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.SOURCE_REPO), 503, 'GitHub connection is not configured');
  const response = await fetch(`https://api.github.com/repos/${env.SOURCE_REPO}${path}`, {method, headers: {Authorization: 'Bearer ' + env.GH_DISPATCH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'loghub-admin', 'X-GitHub-Api-Version': '2022-11-28', ...(data ? {'Content-Type': 'application/json'} : {})}, body: data ? JSON.stringify(data) : undefined, redirect: 'error', signal: AbortSignal.timeout(10000)});
  if (missing && response.status === 404) return null;
  check(response.ok, 503, 'GitHub request failed; retry later');
  return response.status === 204 ? null : response.json();
}
async function dispatch(env, id, action) {
  await github(env, '/actions/workflows/admin-review.yml/dispatches', 'POST', {ref: 'main', inputs: {review: id, action}});
}
async function catalog(env) {
  const response = await fetch(env.SITE_ORIGIN + '/catalog.json', {redirect: 'error', signal: AbortSignal.timeout(6000), cache: 'no-store'});
  check(response.ok, 503, 'Catalog unavailable');
  const data = await response.json(); check(Array.isArray(data.projects), 503); return data.projects;
}
async function currentReview(env, id) {
  check(/^[A-Za-z0-9_-]{24}$/.test(id || ''));
  const row = await sql(env, 'SELECT * FROM admin_reviews WHERE id=?', id).first(); check(row, 404, 'Review not found'); return row;
}
async function fresh(env, row) {
  if (!row.submission_id) return;
  const sub = await sql(env, 'SELECT revision FROM submissions WHERE id=?', row.submission_id).first();
  check(sub && sub.revision === row.revision, 409, 'Submission changed; prepare a fresh review');
}
async function publication(env, row) {
  if (!row.pr) return {status: row.state};
  const pr = await github(env, '/pulls/' + row.pr);
  const [checks, combined, required] = await Promise.all([github(env, `/commits/${pr.head.sha}/check-runs`), github(env, `/commits/${pr.head.sha}/status`), github(env, '/branches/main/protection/required_status_checks')]);
  const result = {status: pr.merged ? 'awaiting-deployment' : pr.state, url: pr.html_url, required_checks: [...new Set([...(required.contexts || []), ...(required.checks || []).map(c => c.context)])], strict: required.strict, checks: checks.check_runs.map(c => ({name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url})), combined: combined.state};
  if (!pr.merged) return result;
  const runs = await github(env, '/actions/workflows/catalog.yml/runs?branch=main&status=success&per_page=20');
  const manifestResponse = await fetch(env.SITE_ORIGIN + '/deployment-manifest.json', {cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(6000)});
  if (!manifestResponse.ok) return result;
  const manifest = await manifestResponse.json();
  const run = runs.workflow_runs.find(r => r.head_sha === manifest.build_commit && r.event !== 'pull_request');
  if (!run) return result;
  const comparison = await github(env, `/compare/${pr.merge_commit_sha}...${run.head_sha}`);
  if (!['identical', 'ahead'].includes(comparison.status)) return result;
  const jobs = await github(env, `/actions/runs/${run.id}/jobs?per_page=100`);
  if (!['synchronize', 'backup', 'anchor', 'publish', 'website', 'deploy-website'].every(name => jobs.jobs.some(j => j.name === name && j.conclusion === 'success'))) return result;
  const projects = await catalog(env), live = projects.find(p => p.id === row.project_id);
  const absent = ['suspend', 'delist'].includes(row.operation);
  if (absent ? Boolean(live) : !live) return result;
  result.status = absent ? 'withdrawn' : 'published'; result.run = run.html_url;
  if (live) result.live_url = env.SITE_ORIGIN + '/projects/' + row.project_id + '/';
  if (row.submission_id && !absent) await sql(env, "UPDATE submissions SET state='published',updated=? WHERE id=? AND revision=? AND state='approved'", seconds(), row.submission_id, row.revision).run();
  return result;
}

async function processor(request, env, path) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  check(token && env.PROCESSOR_HASH && await digest(token) === env.PROCESSOR_HASH, 401, 'Processor credential required');
  const id = path.split('/')[2], row = await currentReview(env, id);
  await fresh(env, row);
  if (request.method === 'GET') {
    if (path.endsWith('/file')) {
      const u = new URL(request.url), name = u.searchParams.get('name'), part = Number(u.searchParams.get('part'));
      const file = await sql(env, 'SELECT data FROM admin_files WHERE review_id=? AND name=? AND part=?', id, name, part).first(); check(file, 404); return json(file);
    }
    const result = review(row);
    if (row.submission_id) result.challenge = (await sql(env, 'SELECT challenge FROM submissions WHERE id=?', row.submission_id).first())?.challenge;
    return json(result);
  }
  const data = await readBody(request, 400000);
  if (path.endsWith('/claim')) {
    const from = data.action === 'publish' ? 'approved' : 'queued', to = data.action === 'publish' ? 'publishing' : 'processing';
    const r = await sql(env, 'UPDATE admin_reviews SET state=?,version=version+1,updated=? WHERE id=? AND state=?', to, seconds(), id, from).run(); check(r.meta.changes, 409, 'Job already claimed');
    return json({state: to});
  }
  if (path.endsWith('/file')) {
    check(row.state === 'processing', 409);
    check(/^(?:(?:cover|screenshot-[1-6])\.(?:png|jpg|jpeg|webp)|preview-[0-6]\.webp)$/.test(data.name) && Number.isInteger(data.part) && data.part >= 0 && data.part < 28 && typeof data.data === 'string' && data.data.length <= 262144 && /^[A-Za-z0-9+/]*={0,2}$/.test(data.data));
    await sql(env, 'INSERT INTO admin_files(review_id,name,part,data) VALUES(?,?,?,?) ON CONFLICT(review_id,name,part) DO UPDATE SET data=excluded.data', id, data.name, data.part, data.data).run(); return json({ok: true});
  }
  if (path.endsWith('/ready')) {
    check(row.state === 'processing' && data.package && JSON.stringify(data.package).length < 64000, 409);
    const pkg = data.package; check(pkg.project_id && LISTING_ID.test(pkg.project_id) && Array.isArray(pkg.files) && pkg.files.length <= 14);
    for (const f of pkg.files) {
      check(/^(?:(?:cover|screenshot-[1-6])\.(?:png|jpg|jpeg|webp)|preview-[0-6]\.webp)$/.test(f.name) && /^[a-f0-9]{64}$/.test(f.sha256) && Number.isInteger(f.parts) && f.parts > 0 && f.parts <= 28);
      const count = await sql(env, 'SELECT count(*) n FROM admin_files WHERE review_id=? AND name=?', id, f.name).first(); check(count.n === f.parts);
    }
    const encoded = JSON.stringify(pkg), hash = await digest(encoded);
    await env.DB.batch([sql(env, "UPDATE admin_reviews SET package=?,digest=?,project_id=?,state='ready',version=version+1,updated=? WHERE id=? AND state='processing'", encoded, hash, pkg.project_id, seconds(), id), history(env, 'processor', 'prepared', row.submission_id, id)]);
    return json({digest: hash});
  }
  if (path.endsWith('/published-pr')) {
    check(row.state === 'publishing' && row.approved_digest === row.digest && Number.isInteger(data.pr) && data.pr > 0, 409);
    await env.DB.batch([sql(env, "UPDATE admin_reviews SET pr=?,state='pr-open',version=version+1,updated=? WHERE id=? AND state='publishing'", data.pr, seconds(), id), sql(env, "DELETE FROM admin_files WHERE review_id=? AND name NOT LIKE 'preview-%'", id), sql(env, "DELETE FROM admin_files WHERE review_id IN (SELECT id FROM admin_reviews WHERE state='pr-open' ORDER BY created DESC LIMIT -1 OFFSET 20)"), history(env, 'processor', 'publication-pr', row.submission_id, id)]); return json({ok: true});
  }
  if (path.endsWith('/failed')) {
    check(['processing', 'publishing'].includes(row.state), 409);
    await sql(env, "UPDATE admin_reviews SET state='failed',error=?,version=version+1,updated=? WHERE id=?", note(data.error), seconds(), id).run(); return json({ok: true});
  }
  check(false, 404);
}

export async function handle(request, env) {
  try {
    check(env.ADMIN_ENABLED === 'true', 404, 'Not found');
    const url = new URL(request.url), path = url.pathname;
    check(url.origin === env.ADMIN_ORIGIN, 400, 'Wrong origin');
    if (path.startsWith('/processor/')) return await processor(request, env, path);
    await rate(env, await digest(request.headers.get('CF-Connecting-IP') || 'local'), 240);
    const user = await identity(request, env);
    if (!path.startsWith('/api/')) {
      check(request.method === 'GET', 405);
      const response = await env.ASSETS.fetch(request);
      return new Response(response.body, {status: response.status, headers: {...Object.fromEntries(response.headers), ...security}});
    }
    await rate(env, user.sub);
    if (request.method !== 'GET') check(request.method === 'POST' && request.headers.get('Origin') === env.ADMIN_ORIGIN && request.headers.get('Sec-Fetch-Site') !== 'cross-site', 403, 'Origin rejected');
    if (path === '/api/login' && request.method === 'POST') {
      const s = await startSession(env, user); return json({email: user.email, csrf: s.csrf, expires: s.expires}, 200, {'Set-Cookie': cookie(s.token, s.expires - seconds())});
    }
    const s = await session(request, env, user);
    if (request.method !== 'GET') check(request.headers.get('X-CSRF-Token') === s.csrf, 403, 'CSRF check failed');
    if (path === '/api/session') return json({email: user.email, csrf: s.csrf, expires: s.expires});
    if (path === '/api/logout' && request.method === 'POST') {
      await env.DB.batch([sql(env, 'DELETE FROM admin_sessions WHERE subject=?', user.sub), sql(env, 'INSERT INTO admin_revocations(subject,before) VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET before=excluded.before', user.sub, seconds())]);
      return json({ok: true}, 200, {'Set-Cookie': cookie('', 0)});
    }
    if (path === '/api/revoke' && request.method === 'POST') {
      const data = await readBody(request); check(typeof data.subject === 'string' && data.subject.length <= 200);
      await env.DB.batch([sql(env, 'DELETE FROM admin_sessions WHERE subject=?', data.subject), sql(env, 'INSERT INTO admin_revocations(subject,before) VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET before=excluded.before', data.subject, seconds()), history(env, user.email, 'revoke-sessions')]); return json({ok: true});
    }
    if (path === '/api/sessions' && request.method === 'GET') return json((await sql(env, 'SELECT subject,email,max(expires) expires FROM admin_sessions WHERE expires>? GROUP BY subject,email', seconds()).all()).results);
    if (path === '/api/catalog' && request.method === 'GET') {
      const projects = await catalog(env);
      const file = await github(env, '/contents/policy/publishing.json?ref=main');
      const policy = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0))));
      for (const rule of [...policy.projects, ...(policy.external_projects || [])]) {
        if (!rule.project_id) continue;
        const live = projects.find(p => p.id === rule.project_id);
        if (live) live.moderation = rule.decision;
        else projects.push({id: rule.project_id, title: rule.project_id, moderation: rule.decision});
      }
      return json({projects});
    }
    if (path === '/api/listing' && request.method === 'GET') {
      const id = url.searchParams.get('id'); check(LISTING_ID.test(id || ''));
      const file = await github(env, `/contents/listings/${id}/listing.json?ref=main`, 'GET', undefined, true);
      if (file) return json({editable: true, record: JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0))))});
      const live = (await catalog(env)).find(p => p.id === id);
      return json({editable: Boolean(live), record: live || {id}, ...(!live ? {message: 'Restore this legacy listing through protected review before editing its catalog metadata.'} : {})});
    }
    if (path === '/api/queue' && request.method === 'GET') {
      const state = url.searchParams.get('state') || '', q = (url.searchParams.get('q') || '').slice(0, 100), page = Number(url.searchParams.get('page') || 1), order = url.searchParams.get('sort') === 'oldest' ? 'ASC' : 'DESC';
      check(Number.isInteger(page) && page > 0 && page < 10000);
      const where = 'WHERE (?=\'\' OR state=?) AND (?=\'\' OR instr(lower(payload),lower(?))>0 OR instr(COALESCE(listing_id,\'\'),?)>0)';
      const rows = (await sql(env, `SELECT * FROM submissions ${where} ORDER BY created ${order},id ${order} LIMIT 25 OFFSET ?`, state, state, q, q, q, (page - 1) * 25).all()).results;
      const count = await sql(env, `SELECT count(*) n FROM submissions ${where}`, state, state, q, q, q).first();
      const projects = await catalog(env);
      const items = [];
      for (const row of rows) {
        const duplicates = (await sql(env, 'SELECT id FROM submissions WHERE id<>? AND url_key=? ORDER BY id LIMIT 20', row.id, row.url_key).all()).results.map(x => x.id);
        items.push({...item(row), possible_duplicates: duplicates, existing: projects.filter(p => row.url_key && projectKeys(p).includes(row.url_key)).map(p => ({id: p.id, title: p.title}))});
      }
      return json({items, total: count.n, page});
    }
    if (path === '/api/detail' && request.method === 'GET') {
      const id = Number(url.searchParams.get('id')); check(Number.isInteger(id));
      const row = await sql(env, 'SELECT * FROM submissions WHERE id=?', id).first(); check(row, 404);
      return json({submission: item(row), history: (await sql(env, 'SELECT * FROM admin_history WHERE submission_id=? ORDER BY id', id).all()).results, reviews: (await sql(env, 'SELECT * FROM admin_reviews WHERE submission_id=? ORDER BY created DESC', id).all()).results.map(review)});
    }
    if (path === '/api/reviews' && request.method === 'GET') return json({items: (await sql(env, 'SELECT * FROM admin_reviews ORDER BY created DESC LIMIT 100').all()).results.map(review)});
    if (path === '/api/preview' && request.method === 'GET') {
      const row = await currentReview(env, url.searchParams.get('id')), name = url.searchParams.get('name');
      check(/^preview-[0-6]\.webp$/.test(name || ''));
      const f = JSON.parse(row.package || '{}').files?.find(f => f.name === name); check(f, 404);
      const parts = (await sql(env, 'SELECT data FROM admin_files WHERE review_id=? AND name=? ORDER BY part', row.id, name).all()).results;
      const bytes = Uint8Array.from(atob(parts.map(p => p.data).join('')), c => c.charCodeAt(0));
      return new Response(bytes, {headers: {...security, 'Content-Type': 'image/webp'}});
    }
    if (path === '/api/publication' && request.method === 'GET') return json(await publication(env, await currentReview(env, url.searchParams.get('id'))));
    if (request.method !== 'POST') check(false, 404);
    const data = await readBody(request);
    if (path === '/api/decision') {
      check(Number.isInteger(data.id) && Number.isInteger(data.revision) && ['in-review', 'needs-changes', 'rejected'].includes(data.state));
      const pub = note(data.public_note, 500), priv = note(data.private_note);
      check(data.state === 'in-review' || pub.length >= 5, 400, 'A public reason is required');
      const changed = await sql(env, "UPDATE submissions SET state=?,public_note=?,private_note=?,revision=revision+1,updated=?,expires=? WHERE id=? AND revision=? AND state IN ('received','in-review','needs-changes')", data.state, pub, priv, seconds(), seconds() + (data.state === 'rejected' ? 30 : 90) * 86400, data.id, data.revision).run();
      check(changed.meta.changes, 409, 'Submission changed; reload it');
      await env.DB.batch([sql(env, "UPDATE admin_reviews SET state='stale',version=version+1 WHERE submission_id=? AND state IN ('queued','processing','ready','approved')", data.id), history(env, user.email, data.state, data.id, null, pub, priv)]);
      return json({ok: true});
    }
    if (path === '/api/prepare') {
      await env.DB.batch([sql(env, 'DELETE FROM admin_files WHERE review_id IN (SELECT id FROM admin_reviews WHERE updated<?)', seconds() - 7 * 86400), sql(env, "UPDATE admin_reviews SET state='expired',package=NULL WHERE updated<? AND state NOT IN ('pr-open','expired')", seconds() - 7 * 86400)]);
      await sql(env, "DELETE FROM admin_files WHERE review_id IN (SELECT id FROM admin_reviews WHERE state IN ('stale','failed','expired'))").run();
      const stored = await sql(env, "SELECT count(DISTINCT review_id) n FROM admin_files WHERE name NOT LIKE 'preview-%'").first();
      check(stored.n < 6, 503, 'Private artwork storage is full; wait for its seven-day retention cleanup');
      check(['submission', 'edit', 'suspend', 'delist', 'restore', 'claim'].includes(data.operation));
      let sub = null, payload;
      if (data.operation === 'submission' || data.operation === 'claim') {
        check(Number.isInteger(data.submission_id)); sub = await sql(env, 'SELECT * FROM submissions WHERE id=?', data.submission_id).first();
        check(sub && sub.revision === data.revision && ['received', 'in-review', 'needs-changes', 'approved'].includes(sub.state), 409, 'Submission changed or closed');
        const checked = validateSubmission(data.payload); check(checked.ok, 422, JSON.stringify(checked.errors));
        check(checked.value.kind === sub.kind && (checked.value.listing_id || null) === sub.listing_id, 400, 'Submission identity cannot change');
        payload = checked.value;
        check((data.operation === 'claim') === (sub.kind === 'claim'));
      } else { check(LISTING_ID.test(data.project_id || '')); payload = data.payload || {}; }
      const priv = note(data.reason); if (data.operation === 'claim' || ['suspend', 'delist', 'restore'].includes(data.operation)) check(priv.length >= 10, 400, 'Record a reason of at least 10 characters');
      const id = random().slice(0, 24);
      const active = await sql(env, "SELECT count(*) n FROM admin_reviews WHERE state IN ('queued','processing','ready','approved','publishing')").first(); check(active.n < 6, 503, 'Finish existing private reviews before preparing more');
      const added = await env.DB.batch([sql(env, "UPDATE admin_reviews SET state='stale',version=version+1 WHERE submission_id=? AND state IN ('queued','processing','ready','approved','failed')", sub?.id || null), sql(env, "INSERT INTO admin_reviews(id,submission_id,revision,project_id,operation,payload,created,updated) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM admin_reviews WHERE state IN ('queued','processing','ready','approved','publishing'))<6", id, sub?.id || null, sub?.revision || null, sub?.listing_id || sub?.project_id || data.project_id || null, data.operation, JSON.stringify({value: payload, reason: priv, transfer: data.transfer === true}), seconds(), seconds()), history(env, user.email, 'prepare-' + data.operation, sub?.id || null, id, '', priv)]);
      check(added[1].meta.changes, 503, 'Private review capacity reached; finish existing reviews');
      try { await dispatch(env, id, 'prepare'); } catch { await sql(env, "UPDATE admin_reviews SET state='dispatch-failed',error='Preparation could not start; retry.' WHERE id=?", id).run(); throw Object.assign(Error('Preparation could not start; retry.'), {status: 503}); }
      return json({id}, 201);
    }
    if (path === '/api/approve') {
      const row = await currentReview(env, data.id); await fresh(env, row);
      check(row.state === 'ready' && row.version === data.version && row.digest === data.digest && data.artwork_reviewed === true && data.content_reviewed === true, 409, 'Review the current exact content and artwork first');
      const pub = note(data.public_note, 500), priv = note(data.private_note);
      const changes = [sql(env, "UPDATE admin_reviews SET state='approved',approved_digest=digest,version=version+1,updated=? WHERE id=? AND version=? AND state='ready' AND (submission_id IS NULL OR EXISTS (SELECT 1 FROM submissions s WHERE s.id=admin_reviews.submission_id AND s.revision=admin_reviews.revision AND s.state IN ('received','in-review','needs-changes','approved')))", seconds(), row.id, row.version)];
      if (row.submission_id) changes.push(sql(env, "UPDATE submissions SET state='approved',project_id=?,public_note=?,private_note=?,updated=? WHERE id=? AND revision=? AND changes()=1", row.project_id, pub, priv, seconds(), row.submission_id, row.revision));
      changes.push(sql(env, "INSERT INTO admin_history(submission_id,review_id,actor,action,public_note,private_note,created) SELECT ?,?,?,?,?,?,? WHERE changes()=1", row.submission_id, row.id, user.email, 'exact-approval', pub, priv, seconds()));
      const results = await env.DB.batch(changes); check(results[0].meta.changes, 409, 'Submission or review changed; reload before approving'); return json({ok: true});
    }
    if (path === '/api/publish') {
      const row = await currentReview(env, data.id); await fresh(env, row);
      check(row.state === 'approved' && row.digest === data.digest && row.approved_digest === row.digest, 409, 'Exact approval is required');
      await rate(env, 'publish:' + user.sub, 5);
      await dispatch(env, row.id, 'publish'); return json({ok: true});
    }
    check(false, 404);
  } catch (error) { return json({error: error.status ? error.message : 'Administration unavailable; retry later'}, error.status || 503); }
}
export default {fetch: handle};
