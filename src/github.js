import {boundedBody} from './images.js';
import {repoSlug} from './records.js';

export class APIError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}
export class GitHub {
  constructor({token = process.env.GH_TOKEN, cache = {}, fetcher = fetch} = {}) {
    this.token = token; this.cache = cache; this.fetcher = fetcher; this.used = new Set();
  }
  async request(endpoint, {method = 'GET', body, redirects = 0} = {}) {
    if (!/^\/[A-Za-z0-9_./?=&%+-]+$/.test(endpoint) || endpoint.includes('..')) throw Error('unsafe API endpoint');
    if (method === 'GET') this.used.add(endpoint);
    const headers = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'log-hub-pipeline'};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const cached = method === 'GET' ? this.cache[endpoint] : undefined;
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    if (body) headers['Content-Type'] = 'application/json';
    let response;
    try { response = await this.fetcher(`https://api.github.com${endpoint}`, {method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(20000)}); }
    catch { throw new APIError('GitHub network failure or timeout; retry later'); }
    if (response.status === 304 && cached) return structuredClone(cached.data);
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (method !== 'GET' || redirects >= 2 || !location?.startsWith('https://api.github.com/')) throw new APIError('unsafe or repeated GitHub redirect');
      return this.request(location.slice(22), {redirects: redirects + 1});
    }
    if (!response.ok) {
      const retry = response.headers.get('retry-after') || response.headers.get('x-ratelimit-reset');
      throw new APIError(`GitHub HTTP ${response.status}${retry ? `; rate limit/retry time ${retry}` : ''}; check public visibility or retry later`, response.status);
    }
    if (method !== 'GET') this.cache = {};
    if (response.status === 204) return null;
    let data;
    try { data = JSON.parse((await boundedBody(response, 4 * 1024 * 1024)).toString('utf8')); }
    catch { throw new APIError('GitHub returned invalid or oversized JSON'); }
    if (method === 'GET') this.cache[endpoint] = {etag: response.headers.get('etag'), data};
    return structuredClone(data);
  }
}
function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw Error(`GitHub: invalid ${label}`);
  return value;
}
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value.replace('Z', '.000Z')) throw Error('GitHub: invalid UTC date');
  return value;
}
export async function repositoryInfo(api, record, repositoryId) {
  const data = await api.request(repositoryId ? `/repositories/${repositoryId}` : `/repos/${repoSlug(record.repository)}`);
  if (!data || !Number.isSafeInteger(data.id) || data.id <= 0 || data.private !== false || typeof data.archived !== 'boolean' || !data.owner) throw Error('GitHub: invalid or private repository');
  const slug = repoSlug(data.html_url);
  if (data.full_name !== slug || data.owner.login !== slug.split('/')[0] || !['User', 'Organization'].includes(data.owner.type)) throw Error('GitHub: repository ownership metadata mismatch');
  return {id: data.id, url: data.html_url, owner: data.owner.login, owner_type: data.owner.type, ...(data.owner.id ? {owner_id: data.owner.id} : {}), archived: data.archived, updated_at: date(data.updated_at)};
}
export async function verifySubmitter(api, repository, login) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login || '')) throw Error('invalid submitter login');
  if (repository.owner.toLowerCase() === login.toLowerCase()) return;
  if (repository.owner_type === 'Organization') {
    try {
      if (await api.request(`/orgs/${repository.owner}/public_members/${login}`) !== null) throw Error('GitHub: invalid membership response');
      return;
    }
    catch (error) { if (error.status !== 404) throw error; }
  }
  throw Error('submitter must own the repository or be a public member of its organization; contact a moderator for a verified team submission');
}
export async function releaseInfo(api, record, repository) {
  const slug = repoSlug(repository.url);
  let release;
  try { release = await api.request(`/repos/${slug}/releases/latest`); }
  catch (error) { if (error.status === 404) return null; throw error; }
  if (!release || !Number.isSafeInteger(release.id) || release.id <= 0 || release.draft !== false || release.prerelease !== false) throw Error('GitHub: invalid stable release');
  const version = text(release.tag_name, 'release tag');
  const releaseDate = date(release.published_at);
  const assets = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await api.request(`/repos/${slug}/releases/${release.id}/assets?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length > 100) throw Error('GitHub: invalid assets array');
    assets.push(...batch);
    if (batch.length < 100) break;
    if (page === 10) throw Error('GitHub: too many assets; moderator review required');
  }
  const eligible = assets.filter(a => typeof a?.name === 'string' && /\.(zip|7z|tar\.gz|ips|bps|ups|xdelta|exe|msi|dmg|AppImage)$/i.test(a.name));
  const selected = record.asset_name ? eligible.filter(a => a.name === record.asset_name) : eligible;
  if (selected.length !== 1) throw Error('release assets: expected one distribution asset; set asset_name to an exact supported filename if multiple exist');
  const asset = selected[0];
  text(asset.name, 'asset filename');
  if (asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0) throw Error('GitHub: invalid release asset size/state');
  const prefix = `https://github.com/${slug}/releases/download/${encodeURIComponent(version)}/`;
  if (asset.browser_download_url !== prefix + encodeURIComponent(asset.name)) throw Error('GitHub: download URL does not match repository, tag and asset');
  let sha256 = null;
  if (asset.digest != null) {
    if (!/^sha256:[a-f0-9]{64}$/i.test(asset.digest)) throw Error('GitHub: malformed SHA-256 digest');
    sha256 = asset.digest.slice(7).toLowerCase();
  }
  return {version, download_url: asset.browser_download_url, file_name: asset.name, file_size: asset.size, release_date: releaseDate, updated_at: date(asset.updated_at), sha256};
}
export async function synchronize(api, record, previous) {
  try {
    const repository = await repositoryInfo(api, record);
    if (previous && previous.repository.id !== repository.id) throw Error('repository identity changed; possible name reuse, moderator review required');
    const release = await releaseInfo(api, record, repository);
    if (!release && previous?.release) throw Error('previously published release unavailable; retaining last known release');
    if (!release && record.status === 'released') throw Error('released status requires a stable release and a distribution asset');
    return {repository, release, availability: repository.archived ? 'archived' : 'available', warning: null,
      last_updated: [repository.updated_at, release?.updated_at, release?.release_date].filter(Boolean).sort().at(-1)};
  } catch (error) {
    if (!previous) throw error;
    return {...previous, availability: 'unavailable', warning: error.message};
  }
}

