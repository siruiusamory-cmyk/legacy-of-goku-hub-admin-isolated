import {parseHttps, urlKey, sourceKind} from './urlkey.js';

export const KINDS = ['add', 'suggest', 'correct', 'claim'];
export const GAMES = ['legacy-of-goku', 'legacy-of-goku-2', 'buus-fury', 'multiple'];
export const CATEGORIES = ['rom-hack', 'fan-project', 'tool', 'resource'];
export const STATUSES = ['in-development', 'released', 'on-hold', 'discontinued'];
export const LISTING_ID = /^(?:ext-[a-z0-9]{12}|gh-[0-9]{1,15})$/;
export const RECEIPT = /^[A-Za-z0-9_-]{43}$/;
const GAME_FILE = /\.(gba|gbc?|nds|3ds|rom|iso|bin|smc|sfc|nes|n64|z64|v64|cue|img)$/i;
const IMAGE_FILE = /\.(png|jpe?g|webp)$/i;

const clean = value => typeof value === 'string' ? value.normalize('NFKC').replace(/[\x00-\x1f\x7f<>]/g, ' ').replace(/ {2,}/g, ' ').trim() : '';
function address(value, errors, field, {required = false, image = false} = {}) {
  const text = clean(value).replace(/#.*$/, '');
  if (!text) { if (required) errors[field] = 'Add a web address that starts with https://'; return ''; }
  const url = parseHttps(text);
  if (!url) { errors[field] = 'Use a public web address that starts with https:// and has no password or port.'; return ''; }
  if (GAME_FILE.test(url.pathname)) { errors[field] = 'Link to a page about the project, not to a game file.'; return ''; }
  if (image && !IMAGE_FILE.test(url.pathname)) { errors[field] = 'Use a direct link to a PNG, JPG or WebP image.'; return ''; }
  return text;
}
function choice(value, allowed, errors, field, message) {
  if (value === undefined || value === '' || value === null) return '';
  if (!allowed.includes(value)) { errors[field] = message; return ''; }
  return value;
}
function length(value, errors, field, min, max, label) {
  if (value.length < min) errors[field] = min === 1 ? `Add ${label}.` : `${label} needs at least ${min} characters.`;
  else if (value.length > max) errors[field] = `${label} can be at most ${max} characters.`;
}

export function validateSubmission(input) {
  const errors = {};
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const kind = KINDS.includes(data.kind) ? data.kind : (errors.kind = 'Choose what you want to do.', '');
  const value = {kind};
  const listing = kind === 'correct' || kind === 'claim';
  if (listing) {
    value.listing_id = clean(data.listing_id);
    if (!LISTING_ID.test(value.listing_id)) errors.listing_id = 'Choose the listing this is about.';
  }
  const required = kind === 'add' || kind === 'suggest';
  const noPage = required && data.no_page === true;
  value.url = noPage ? '' : address(data.url, errors, 'url', {required: required});
  if (noPage) value.no_page = true;
  if (required || data.title) {
    value.title = clean(data.title); length(value.title, errors, 'title', 1, 100, 'a project name');
  }
  if (required || data.description) {
    value.description = clean(data.description);
    if (!errors.description) length(value.description, errors, 'description', 20, 2000, 'The description');
  }
  const category = choice(data.category, CATEGORIES, errors, 'category', 'Choose one of the listed types.');
  if (required && !category && !errors.category) errors.category = 'Choose what kind of project this is.';
  if (category) value.category = category;
  for (const [field, allowed, message] of [['game', GAMES, 'Choose one of the listed games.'], ['status', STATUSES, 'Choose one of the listed statuses.']]) {
    const picked = choice(data[field], allowed, errors, field, message);
    if (picked) value[field] = picked;
  }
  const creator = clean(data.creator);
  if (creator) { value.creator = creator; length(creator, errors, 'creator', 1, 100, 'The creator name'); }
  const patch = address(data.patch_url, errors, 'patch_url');
  if (patch) value.patch_url = patch;
  const links = (Array.isArray(data.links) ? data.links : []).slice(0, 3);
  const cleaned = [];
  links.forEach((link, i) => {
    const url = address(link?.url, errors, `links.${i}`);
    if (url) cleaned.push({label: clean(link?.label).slice(0, 32) || 'Community', url});
  });
  if (cleaned.length) value.links = cleaned;
  const artwork = (Array.isArray(data.artwork) ? data.artwork : []).slice(0, 4);
  const art = [];
  artwork.forEach((item, i) => { const url = address(item, errors, `artwork.${i}`, {image: true}); if (url) art.push(url); });
  if (art.length) value.artwork = art;
  const note = clean(data.note);
  if (note) { value.note = note; length(note, errors, 'note', 1, 500, 'The note'); }
  if (kind === 'correct' && !errors.note && !note && !value.title && !value.description && !value.url && !value.creator && !value.patch_url && !value.links && !value.artwork && !value.category && !value.game && !value.status) errors.note = 'Tell us what should change.';
  if (kind === 'claim' && !note) errors.note = 'Tell us how you are connected to this project.';
  if (kind === 'suggest') value.relation = 'third-party';
  return {ok: !Object.keys(errors).length, errors, value};
}

export function submissionKey(value) { return value.url ? urlKey(value.url) : null; }
export function submissionSource(value) { return value.url ? sourceKind(value.url) : 'none'; }
