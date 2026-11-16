import {boundedBody} from './images.js';
import {parseHttps} from './urlkey.js';
import {date} from './github.js';

const HOSTS = {
  'gitlab.com': {
    info: (owner, name) => `https://gitlab.com/api/v4/projects/${encodeURIComponent(owner + '/' + name)}`,
    file: (id, file, sha) => `https://gitlab.com/api/v4/projects/${id}/repository/files/${encodeURIComponent(file)}/raw?ref=${sha}`,
    head: id => `https://gitlab.com/api/v4/projects/${id}/repository/commits?per_page=1`,
    raw: (path, sha, file) => `https://gitlab.com/${path}/-/raw/${sha}/${file}`
  },
  'codeberg.org': {
    info: (owner, name) => `https://codeberg.org/api/v1/repos/${owner}/${name}`,
    file: (id, file, sha, path) => `https://codeberg.org/api/v1/repos/${path}/raw/${file}?ref=${sha}`,
    head: (id, path) => `https://codeberg.org/api/v1/repos/${path}/commits?limit=1&stat=false&verification=false&files=false`,
    raw: (path, sha, file) => `https://codeberg.org/${path}/raw/commit/${sha}/${file}`
  }
};
const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;
export const hostedSupported = url => Boolean(parseHttps(url) && HOSTS[new URL(url).hostname]);
export function hostedPath(url) {
  const parsed = parseHttps(url);
  if (!parsed || !HOSTS[parsed.hostname]) throw Error('repository host is not supported for automatic synchronization');
  const parts = parsed.pathname.replace(/\/+$/, '').split('/').slice(1);
  if (parsed.search || parts.length !== 2 || !parts.every(p => SEGMENT.test(p) && p !== '.' && p !== '..') || parts[1].endsWith('.git')) throw Error('repository: use https://HOST/OWNER/PROJECT without query, .git or trailing path');
  return {host: parsed.hostname, owner: parts[0], name: parts[1], path: parts.join('/')};
}
async function getJSON(fetcher, url, limit = 1024 * 1024) {
  let response;
  try { response = await fetcher(url, {redirect: 'error', headers: {'Accept': 'application/json', 'User-Agent': 'log-hub-pipeline'}, signal: AbortSignal.timeout(20000)}); }
  catch { throw Object.assign(Error('repository host network failure or timeout; retry later'), {status: 0}); }
  if (!response.ok) throw Object.assign(Error(`repository host HTTP ${response.status}`), {status: response.status});
  try { return JSON.parse((await boundedBody(response, limit)).toString('utf8')); }
  catch { throw Error('repository host returned invalid or oversized JSON'); }
}
export async function hostedRepository(fetcher, url) {
  const where = hostedPath(url); const host = HOSTS[where.host];
  const data = await getJSON(fetcher, host.info(where.owner, where.name));
  const owner = where.host === 'gitlab.com' ? data.namespace : data.owner;
  const visible = where.host === 'gitlab.com' ? data.visibility === 'public' : data.private === false;
  const stamp = where.host === 'gitlab.com' ? data.last_activity_at : data.updated_at;
  if (!Number.isSafeInteger(data?.id) || data.id <= 0 || !visible || !Number.isSafeInteger(owner?.id) || owner.id <= 0 || typeof data.archived !== 'boolean') throw Error('repository host: invalid or private repository');
  const path = where.host === 'gitlab.com' ? data.path_with_namespace : data.full_name;
  if (String(path).toLowerCase() !== where.path.toLowerCase()) throw Error('repository host: location does not match the submitted address');
  return {host: where.host, path, id: data.id, owner_id: owner.id, archived: data.archived, updated_at: date(new Date(stamp).toISOString().replace('.000Z', 'Z'))};
}
export async function hostedManifest(fetcher, url, repository) {
  const where = hostedPath(url); const host = HOSTS[where.host];
  const commits = await getJSON(fetcher, host.head(repository.id, where.path));
  const sha = Array.isArray(commits) ? (commits[0]?.id || commits[0]?.sha) : '';
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw Error('repository host: invalid default-branch commit');
  let response;
  try { response = await fetcher(host.file(repository.id, '.loghub.json', sha, where.path), {redirect: 'error', headers: {'User-Agent': 'log-hub-pipeline'}, signal: AbortSignal.timeout(20000)}); }
  catch { throw Object.assign(Error('repository host network failure or timeout; retry later'), {status: 0}); }
  if (response.status === 404) throw Object.assign(Error('no manifest'), {status: 404});
  if (!response.ok) throw Object.assign(Error(`repository host HTTP ${response.status}`), {status: response.status});
  const bytes = await boundedBody(response, 16384);
  if (bytes.length < 2) throw Error('manifest: expected a UTF-8 JSON file at root, at most 16 KiB');
  return {metadata: JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)), commit: sha, path: where.path, host: where.host};
}
export function hostedRawURL(manifest, value) {
  if (value.startsWith('https://')) return value;
  if (!/^[A-Za-z0-9_./-]+\.(png|jpe?g|webp)$/i.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) throw Error('images: use safe repository-relative paths or pinned raw URLs');
  return HOSTS[manifest.host].raw(manifest.path, manifest.commit, value);
}
