import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import {parseHttps} from '../website/src/lib/urlkey.js';

function expand(text) {
  let value = text.split('%')[0];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (dotted) {
    const parts = dotted[1].split('.').map(Number);
    if (parts.some(n => n > 255)) return null;
    value = value.slice(0, dotted.index) + ((parts[0] << 8) | parts[1]).toString(16) + ':' + ((parts[2] << 8) | parts[3]).toString(16);
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...tail].map(part => parseInt(part, 16));
  return all.length === 8 && all.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? all : null;
}
function embeddedV4(g) {
  const v4 = (hi, lo) => [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
  if (g.slice(0, 5).every(n => n === 0) && (g[5] === 0xffff || g[5] === 0) && !(g[6] === 0 && g[7] <= 1)) return v4(g[6], g[7]);
  if (g[0] === 0x2002) return v4(g[1], g[2]);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(n => n === 0)) return v4(g[6], g[7]);
  return null;
}
export function publicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family === 6) {
    const text = address.toLowerCase();
    const groups = expand(text);
    if (!groups) return false;
    const embedded = embeddedV4(groups);
    if (embedded) return publicAddress(embedded);
    if (text === '::' || text === '::1' || /^f[cd]/.test(text) || /^fe[89ab]/.test(text) || text.startsWith('ff') || text.startsWith('2001:db8') || text.startsWith('64:ff9b')) return false;
    return true;
  }
  return false;
}
export function safeFetcher({lookup = dns.lookup, request = https.request, limit = 5 * 1024 * 1024, timeout = 20000} = {}) {
  const guarded = (host, options, callback) => lookup(host, {...options, all: true}, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) return callback(Object.assign(Error('address resolves to a non-public network'), {code: 'EBLOCKED'}));
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
  return value => new Promise((resolve, reject) => {
    const url = parseHttps(typeof value === 'string' ? value : '');
    if (!url) return reject(Error('address is not a public HTTPS URL'));
    const req = request(url, {method: 'GET', lookup: guarded, timeout, headers: {'User-Agent': 'loghub-moderator', Accept: '*/*', 'Accept-Encoding': 'identity'}}, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); return reject(Error('redirects are not followed; use the final address')); }
      const chunks = []; let length = 0;
      res.on('data', chunk => {
        length += chunk.length;
        if (length > limit) { req.destroy(Error('response too large')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), {status: res.statusCode, headers: {'content-type': String(res.headers['content-type'] || '')}})));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Error('request timed out')));
    req.on('error', reject);
    req.end();
  });
}
