const GIT_HOSTS = {'github.com': 'github', 'gitlab.com': 'gitlab', 'codeberg.org': 'codeberg'};
const PLATFORM_HOSTS = /(^|\.)(romhacking\.net|gamebanana\.com|nexusmods\.com|moddb\.com|itch\.io|modrinth\.com)$/;
const FORUM_HOSTS = /(^|\.)(gbatemp\.net|reddit\.com|forums?\.[a-z0-9.-]+|[a-z0-9-]+\.proboards\.com|[a-z0-9-]+\.forumotion\.[a-z]+)$/;
const KEEP_QUERY = new Set(['t', 'tid', 'threadid', 'topic', 'showtopic', 'id']);
const strip = path => path.replace(/\/{2,}/g, '/').replace(/\/+$/, '').replace(/\.git$/i, '');

export function parseHttps(value) {
  if (typeof value !== 'string' || value.length > 500 || value !== value.trim() || /[\x00-\x20\x7f<>"']/.test(value)) return null;
  let url; try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') || /^[0-9.]+$/.test(url.hostname) || url.hostname.includes(':') || url.hostname.endsWith('.local') || url.hostname.endsWith('.internal')) return null;
  return url;
}
export function urlKey(value) {
  const url = parseHttps(value); if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let path; try { path = strip(decodeURIComponent(url.pathname).toLowerCase()); } catch { return null; }
  const kind = GIT_HOSTS[host];
  if (kind === 'gitlab') path = path.split('/-/')[0];
  else if (kind) path = path.split('/').slice(0, 3).join('/');
  const query = [...url.searchParams].filter(([k]) => KEEP_QUERY.has(k.toLowerCase())).map(([k, v]) => `${k.toLowerCase()}=${v.toLowerCase()}`).sort().join('&');
  return host + path + (query ? '?' + query : '');
}
export function sourceKind(value) {
  const url = parseHttps(value); if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (GIT_HOSTS[host]) return GIT_HOSTS[host];
  if (PLATFORM_HOSTS.test(host)) return 'platform';
  if (FORUM_HOSTS.test(host) || /\/(threads?|viewtopic\.php|topic)\b/i.test(url.pathname)) return 'forum';
  return 'website';
}
export function projectKeys(project) {
  const urls = [project.repository, project.source?.url, ...(project.source?.also_known_at || [])];
  return [...new Set(urls.map(u => u && urlKey(u)).filter(Boolean))];
}
