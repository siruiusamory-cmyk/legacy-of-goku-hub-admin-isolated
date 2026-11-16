import {digest, random} from '../intake/worker.js';
const decode = s => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const parse = s => JSON.parse(new TextDecoder().decode(decode(s)));
export const seconds = () => Math.floor(Date.now() / 1000);
export function requireThat(value, status = 400, message = 'Invalid request') { if (!value) throw Object.assign(Error(message), {status}); }
export const sql = (env, query, ...args) => env.DB.prepare(query).bind(...args);
export async function identity(request, env) {
  requireThat(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER || '') && env.ACCESS_AUD, 503, 'Access is not configured');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  requireThat(token && token.length < 12000, 401, 'Sign in through Cloudflare Access');
  let head, claims, parts;
  try { parts = token.split('.'); requireThat(parts.length === 3); head = parse(parts[0]); claims = parse(parts[1]); } catch { requireThat(false, 401, 'Invalid identity'); }
  requireThat(head.alg === 'RS256' && typeof head.kid === 'string', 401, 'Invalid identity');
  const response = await fetch(env.ACCESS_ISSUER + '/cdn-cgi/access/certs', {redirect: 'error', signal: AbortSignal.timeout(5000)});
  requireThat(response.ok, 503, 'Identity service unavailable');
  const jwk = (await response.json()).keys?.find(key => key.kid === head.kid && key.kty === 'RSA');
  requireThat(jwk, 401, 'Invalid identity');
  const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  requireThat(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])), 401, 'Invalid identity');
  const time = seconds();
  requireThat(claims.iss === env.ACCESS_ISSUER && claims.type === 'app' && Array.isArray(claims.aud) && claims.aud.includes(env.ACCESS_AUD) && Number.isInteger(claims.exp) && claims.exp > time && Number.isInteger(claims.iat) && claims.iat <= time + 30 && (!claims.nbf || claims.nbf <= time) && typeof claims.sub === 'string' && typeof claims.email === 'string', 401, 'Expired or invalid identity');
  requireThat((env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).includes(claims.email.toLowerCase()), 403, 'Administrator access required');
  const revoked = await sql(env, 'SELECT before FROM admin_revocations WHERE subject=?', claims.sub).first();
  requireThat(!revoked || claims.iat > revoked.before, 401, 'Session revoked; authenticate again');
  return claims;
}
export async function session(request, env, user) {
  const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-loghub_admin=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
  const row = cookie && await sql(env, 'SELECT * FROM admin_sessions WHERE hash=? AND expires>?', await digest(cookie), seconds()).first();
  requireThat(row && row.subject === user.sub && row.email === user.email, 401, 'Dashboard session expired; sign in again');
  return row;
}
export async function startSession(env, user) {
  const token = random(), csrf = random(), expires = Math.min(user.exp, seconds() + 1800);
  await sql(env, 'DELETE FROM admin_sessions WHERE expires<=?', seconds()).run();
  await sql(env, 'INSERT INTO admin_sessions(hash,subject,email,csrf,expires) VALUES(?,?,?,?,?)', await digest(token), user.sub, user.email, csrf, expires).run();
  return {token, csrf, expires};
}
export const cookie = (token, age = 1800) => `__Host-loghub_admin=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
export async function readBody(request, maximum = 20000) {
  requireThat(request.headers.get('Content-Type') === 'application/json', 415, 'JSON required');
  const reader = request.body?.getReader(); requireThat(reader);
  let length = 0; const chunks = [];
  while (true) { const {done, value} = await reader.read(); if (done) break; length += value.length; if (length > maximum) { await reader.cancel(); requireThat(false, 413, 'Request too large'); } chunks.push(value); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { requireThat(false); }
}
export async function rate(env, key, maximum = 120) {
  const time = seconds(), bucket = Math.floor(time / 60);
  const row = await sql(env, 'INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', 'dashboard:' + key + ':' + bucket, time + 120).first();
  requireThat(row.count <= maximum, 429, 'Too many requests; wait a minute');
}
