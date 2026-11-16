import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import Ajv from 'ajv';
import {parseHttps, sourceKind, urlKey} from './urlkey.js';

const schema = JSON.parse(fs.readFileSync(new URL('../schema/listing.schema.json', import.meta.url), 'utf8'));
const check = new Ajv({allErrors: true}).compile(schema);
const GAME_FILE = /\.(gba|gbc?|nds|3ds|rom|iso|bin|smc|sfc|nes|n64|z64|v64|cue|img)$/i;
const PATCH_FILE = /\.(ips|bps|ups|xdelta|zip|7z)$/i;
const LOCAL_IMAGE = /^(?:cover|screenshot-[1-6])\.(?:png|jpe?g|webp)$/;
const HOSTED_IMAGE = /^https:\/\/(?:gitlab\.com\/[A-Za-z0-9_.\/-]+\/-\/raw|codeberg\.org\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/raw\/commit)\/[a-f0-9]{40}\/[A-Za-z0-9_.\/-]+\.(?:png|jpe?g|webp)$/i;
export const EXTERNAL_ID = /^ext-[a-z0-9]{12}$/;
export const SOURCE_TYPES = ['github', 'git', 'website', 'forum', 'platform', 'none'];

export function newExternalId(bytes = randomBytes(12)) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  return 'ext-' + Array.from(bytes.subarray(0, 12), b => alphabet[b % 32]).join('');
}
export function plain(value, label) {
  if (typeof value !== 'string' || value !== value.trim() || /[\x00-\x1f\x7f<>]/.test(value)) throw Error(`${label}: trimmed, single-line plain text; no HTML or control characters`);
}
export function publicURL(value, label, {download = false} = {}) {
  const url = parseHttps(value);
  if (!url || url.hash) throw Error(`${label}: use a public HTTPS address without credentials, port or fragment`);
  if (GAME_FILE.test(url.pathname) || (!download && PATCH_FILE.test(url.pathname))) throw Error(`${label}: game files and downloads are not allowed here`);
  return url;
}
export function imageRef(value) {
  if (!LOCAL_IMAGE.test(value) && !HOSTED_IMAGE.test(value)) throw Error('images: use the approved local file name or a pinned hosted raw URL');
  return value;
}
export function validateListing(listing) {
  if (!check(listing)) throw Error('listing: ' + check.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; '));
  for (const key of ['title', 'developer', 'description']) plain(listing[key], key);
  const {source, distribution} = listing;
  const gh = listing.id.startsWith('gh-');
  if (gh !== (source.type === 'github')) throw Error('source: GitHub identity is used only by GitHub projects');
  if (source.type === 'none' ? source.url !== undefined : !source.url) throw Error(source.type === 'none' ? 'source: no address for a project without a public source' : 'source: an address is required');
  if (source.url) {
    publicURL(source.url, 'source');
    const kind = sourceKind(source.url);
    if (source.type === 'github' && (kind !== 'github' || !/^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(source.url))) throw Error('source: use https://github.com/OWNER/REPO');
    if (source.type === 'git' && kind === 'github') throw Error('source: GitHub projects use the GitHub type');
  }
  for (const url of source.also_known_at || []) publicURL(url, 'source');
  if (distribution) {
    plain(distribution.label, 'distribution label');
    const url = publicURL(distribution.url, 'distribution', {download: true});
    if (distribution.kind === 'page' && PATCH_FILE.test(url.pathname)) throw Error('distribution: a page link must not point at a file');
  }
  for (const link of listing.links || []) { plain(link.label, 'link label'); publicURL(link.url, 'links'); }
  for (const ref of [listing.cover, ...(listing.screenshots || [])]) imageRef(ref);
  const keys = [source.url, ...(source.also_known_at || [])].filter(Boolean).map(urlKey);
  if (new Set(keys).size !== keys.length) throw Error('source: duplicate alternate addresses');
  return listing;
}
export const isListing = record => record && typeof record === 'object' && record.source !== undefined && record.repository === undefined;
