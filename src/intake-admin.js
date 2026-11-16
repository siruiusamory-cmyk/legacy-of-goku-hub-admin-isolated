import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {readJSON, saveJSON} from './records.js';
import {repositoryInfo} from './github.js';
import {evaluateListing} from './listings.js';
import {newExternalId, validateListing} from './listing-schema.js';
import {validateSubmission} from '../website/src/lib/submission.js';
import {parseHttps, sourceKind, urlKey} from '../website/src/lib/urlkey.js';
import {MAX_IMAGE_BYTES, boundedBody} from './images.js';

const EXTENSIONS = {png: 'png', jpeg: 'jpg', webp: 'webp'};
const PATCH_FILE = /\.(ips|bps|ups|xdelta|zip|7z)$/i;
const SOURCE_TYPES = {gitlab: 'git', codeberg: 'git', github: 'github', platform: 'platform', forum: 'forum', website: 'website'};
const sha = value => createHash('sha256').update(value).digest('hex');

async function imageBytes(ref, fetcher) {
  if (typeof ref === 'object') return ref.bytes;
  const response = await fetcher(ref, {redirect: 'error'});
  if (!response.ok) throw Error(`artwork ${ref}: HTTP ${response.status}`);
  return boundedBody(response, MAX_IMAGE_BYTES);
}
async function saveImages(dir, covers, fetcher) {
  const names = [];
  for (const [i, ref] of covers.entries()) {
    const bytes = await imageBytes(ref, fetcher);
    const format = (await sharp(bytes).metadata()).format;
    if (!EXTENSIONS[format]) throw Error('artwork must be PNG, JPEG or WebP');
    const name = (i === 0 ? 'cover.' : `screenshot-${i}.`) + EXTENSIONS[format];
    await fs.writeFile(path.join(dir, name), bytes);
    names.push(name);
  }
  return names;
}

export async function freezeReviewedListing(evaluated, directory) {
  const names = await saveImages(directory, evaluated.inspected.inputs.map(bytes => ({bytes})));
  return {...evaluated.record, cover: names[0], screenshots: names.slice(1)};
}

export function listingFields(value, {game, status, developer} = {}) {
  const warnings = [];
  const pick = (given, fallback, name) => { if (!given) warnings.push(`${name} was not provided; defaulted to "${fallback}"`); return given || fallback; };
  const fields = {
    title: value.title,
    developer: developer || value.creator || pick('', 'Unknown creator', 'developer'),
    description: value.description,
    game: game || pick(value.game, 'multiple', 'game'),
    category: value.category,
    status: status || pick(value.status, value.patch_url ? 'released' : 'in-development', 'status')
  };
  if (value.relation === 'third-party') warnings.push('submitted by a third party; grants no ownership');
  return {fields, warnings};
}

export async function prepareListing({submission, directory, api, fetcher, overrides = {}, now = new Date()}) {
  const checked = validateSubmission(submission.payload);
  if (!checked.ok) throw Error('submission is invalid: ' + JSON.stringify(checked.errors));
  const value = checked.value;
  if (value.kind !== 'add' && value.kind !== 'suggest') throw Error('only add and suggest submissions create listings');
  const kind = value.url ? sourceKind(value.url) : null;
  const source = {type: value.url ? SOURCE_TYPES[kind] : 'none', ...(value.url ? {url: value.url} : {})};
  let id = overrides.id || newExternalId(); let ownerId;
  if (source.type === 'github') {
    const repository = await repositoryInfo(api, {repository: value.url});
    id = `gh-${repository.id}`; ownerId = repository.owner_id;
  }
  const {fields, warnings} = listingFields(value, overrides);
  const art = [...(overrides.cover ? [{bytes: overrides.cover}] : []), ...(value.artwork || [])];
  if (!art.length) throw Error('cover artwork is required: ask the submitter or supply a local cover file');
  await fs.mkdir(directory, {recursive: false});
  const names = await saveImages(directory, art.slice(0, 7), fetcher);
  let listing = {schema_version: 1, id, ...fields, source,
    ...(value.patch_url ? {distribution: {label: PATCH_FILE.test(new URL(value.patch_url).pathname) ? 'Download Patch' : 'Patch Page', url: value.patch_url, kind: PATCH_FILE.test(new URL(value.patch_url).pathname) ? 'patch' : 'page'}} : {}),
    ...(value.links ? {links: value.links} : {}), cover: names[0], ...(names.length > 1 ? {screenshots: names.slice(1)} : {}),
    approved_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z')};
  validateListing(listing);
  const evaluated = await evaluateListing({listing, dir: directory, rule: {owner_id: ownerId}, api, fetcher, captureImages: true});
  if (evaluated.manifested) listing = await freezeReviewedListing(evaluated, directory);
  const proposed = {project_id: id, ...(ownerId !== undefined ? {owner_id: ownerId} : {}), decision: 'approved', content_digests: [evaluated.initialDigest], artwork_sets: [evaluated.inspected.artwork]};
  await saveJSON(path.join(directory, 'listing.json'), listing);
  await saveJSON(path.join(directory, 'review.json'), {submission_id: submission.id, kind: value.kind, warnings, relation_note: 'Repository or page control does not establish team representation or artwork rights.', proposed_policy: proposed, key: value.url ? urlKey(value.url) : null});
  return {id, listing, proposed, warnings};
}

export async function adoptListing({directory, root, approve = false}) {
  const listing = validateListing(await readJSON(path.join(directory, 'listing.json')));
  const review = await readJSON(path.join(directory, 'review.json'));
  const target = path.join(root, 'listings', listing.id);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.mkdir(target, {recursive: false});
  for (const name of [listing.cover, ...(listing.screenshots || [])]) await fs.copyFile(path.join(directory, name), path.join(target, name));
  await saveJSON(path.join(target, 'listing.json'), listing);
  if (approve) await setRule(root, listing.id, () => review.proposed_policy);
  return {id: listing.id, approved: approve};
}

export async function setRule(root, projectId, make) {
  const file = path.join(root, 'policy/publishing.json');
  const policy = await readJSON(file);
  const rules = policy.external_projects || [];
  const index = rules.findIndex(rule => rule.project_id === projectId);
  const next = make(index === -1 ? undefined : rules[index]);
  if (index === -1) rules.push(next); else rules[index] = next;
  rules.sort((a, b) => a.project_id < b.project_id ? -1 : 1);
  policy.external_projects = rules;
  await saveJSON(file, policy);
  return next;
}

export function claimDigest({challenge, listingId, key}) { return sha(`${challenge}:${listingId}:${key}`); }

export async function verifyPageClaim({listing, challenge, fetcher, now = new Date()}) {
  if (!/^loghub-claim-[A-Za-z0-9_-]{24}$/.test(challenge)) throw Error('challenge has an unexpected format');
  if (listing.source.type !== 'website') throw Error('only a project-owned website can prove control automatically; shared forum, platform or Git pages must be verified manually');
  const addresses = [listing.source.url, ...(listing.source.also_known_at || [])].filter(Boolean);
  if (!addresses.length) throw Error('this listing has no project page; verify manually');
  for (const address of addresses) {
    if (!parseHttps(address)) continue;
    let response;
    try { response = await fetcher(address, {redirect: 'error'}); } catch { continue; }
    if (!response.ok) continue;
    const text = (await boundedBody(response, 2 * 1024 * 1024)).toString('utf8');
    if (text.includes(challenge)) return {verified: true, address, claim: {method: 'page-token', proof_digest: claimDigest({challenge, listingId: listing.id, key: urlKey(address)}), verified_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z')}};
  }
  return {verified: false};
}
export function manualClaim({listing, challenge, reason, now = new Date()}) {
  if (typeof reason !== 'string' || reason.length < 10) throw Error('manual verification needs a recorded reason of at least 10 characters');
  return {method: 'manual', proof_digest: claimDigest({challenge, listingId: listing.id, key: 'manual:' + sha(reason)}), verified_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z')};
}
export async function applyClaim({root, listingId, claim, transfer = false}) {
  return setRule(root, listingId, rule => {
    if (!rule) throw Error('approve the listing before recording a claim');
    const existing = rule.claim?.proof_digest;
    if (existing && existing !== claim.proof_digest && !transfer) throw Error('listing already has a verified claim; pass the transfer flag only after separate verification');
    return {...rule, claim: {...claim, ...(existing && existing !== claim.proof_digest ? {transfer_from: existing} : {})}};
  });
}
export function setDecision(root, listingId, decision, reason) {
  if (!['suspended', 'delisted', 'approved', 'review'].includes(decision)) throw Error('decision must be suspended, delisted, approved or review');
  return setRule(root, listingId, rule => {
    if (!rule) throw Error('no policy rule exists for this listing');
    const {reason: _old, ...rest} = rule;
    return {...rest, decision, ...(reason ? {reason} : {})};
  });
}

export class IntakeAPI {
  constructor({base, token, fetcher = fetch}) { Object.assign(this, {base, token, fetcher}); }
  async call(pathname, method = 'GET', data) {
    const response = await this.fetcher(this.base + pathname, {method, headers: {Authorization: 'Bearer ' + this.token, ...(data ? {'Content-Type': 'application/json'} : {})}, body: data ? JSON.stringify(data) : undefined, redirect: 'error'});
    const body = await response.json();
    if (!response.ok) throw Error(`intake API ${response.status}: ${body.error}`);
    return body;
  }
  queue(state) { return this.call('/admin/queue' + (state ? '?state=' + encodeURIComponent(state) : '')); }
  decide(id, state, {publicNote, privateNote, projectId} = {}) { return this.call('/admin/decision', 'POST', {id, state, ...(publicNote ? {public_note: publicNote} : {}), ...(privateNote ? {private_note: privateNote} : {}), ...(projectId ? {project_id: projectId} : {})}); }
}
