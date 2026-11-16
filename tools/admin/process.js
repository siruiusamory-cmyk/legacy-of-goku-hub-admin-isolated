import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {GitHub} from '../../src/github.js';
import {readJSON} from '../../src/records.js';
import {prepareListing, manualClaim, verifyPageClaim, freezeReviewedListing} from '../../src/intake-admin.js';
import {safeFetcher} from '../../src/safe-fetch.js';
import {evaluateListing} from '../../src/listings.js';
import {normalizeImage, imageHash} from '../../src/images.js';
import {validateListing} from '../../src/listing-schema.js';
import {policyCheck, artworkApproved} from '../../src/moderation.js';
import {sourceKind} from '../../website/src/lib/urlkey.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const hash = value => createHash('sha256').update(value).digest('base64url');
const text = value => JSON.stringify(value, null, 2) + '\n';
const assert = (value, message) => { if (!value) throw Error(message); };
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ALLOWED = /^(?:cover|screenshot-[1-6])\.(?:png|jpg|jpeg|webp)$/;
const EDITABLE = ['title', 'developer', 'description', 'game', 'category', 'status', 'distribution', 'links'];

export async function preparePackage({row, root = ROOT, api = new GitHub(), fetcher = safeFetcher(), site = 'https://loghub.pages.dev', base}) {
  const policy = await readJSON(path.join(root, 'policy/publishing.json'));
  const originalPolicy = structuredClone(policy);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-admin-'));
  try {
    let listing, rule, warnings = [], previews = [], files = [], projectId = row.project_id;
    const value = row.payload.value;
    const existingRule = (policy.external_projects || []).find(r => r.project_id === projectId);
    const legacyRule = policy.projects.find(r => r.project_id === projectId);
    let oldListing;
    if (projectId) {
      try { oldListing = await readJSON(path.join(root, 'listings', projectId, 'listing.json')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (['suspend', 'delist', 'restore', 'claim'].includes(row.operation)) {
      const old = existingRule || legacyRule; assert(old, 'No approved policy identity exists');
      rule = structuredClone(old);
      if (row.operation === 'claim') {
        assert(oldListing, 'Claims require a managed listing; prepare a listing edit first');
        const challenge = row.challenge;
        if (row.payload.reason.startsWith('page-token:')) {
          const proof = await verifyPageClaim({listing: oldListing, challenge, fetcher}); assert(proof.verified, 'Ownership challenge was not found'); rule.claim = proof.claim;
        } else rule.claim = manualClaim({listing: oldListing, challenge, reason: row.payload.reason});
        const previous = old.claim?.proof_digest;
        assert(!previous || previous === rule.claim.proof_digest || row.payload.transfer, 'Explicit ownership transfer review required');
        if (previous && previous !== rule.claim.proof_digest) rule.claim.transfer_from = previous;
        warnings.push('Proof of page control does not establish team representation or artwork rights.');
      } else {
        rule.decision = {suspend: 'suspended', delist: 'delisted', restore: 'approved'}[row.operation];
        rule.reason = row.payload.reason;
      }
      const target = existingRule ? policy.external_projects : policy.projects;
      target[target.indexOf(existingRule || legacyRule)] = rule;
    } else {
      const isNew = !projectId || (row.operation === 'submission' && ['add', 'suggest'].includes(value.kind) && !existingRule && !legacyRule);
      let preparedDirectory = path.join(directory, 'listing');
      if (isNew) {
        const result = await prepareListing({submission: {id: row.submission_id, payload: value}, directory: preparedDirectory, api, fetcher, overrides: {id: projectId || undefined}});
        ({listing, proposed: rule, warnings} = result); projectId = listing.id;
        assert(!policy.projects.some(r => r.project_id === projectId) && !(policy.external_projects || []).some(r => r.project_id === projectId), 'Existing identity: use the catalog editor');
      } else {
        await fs.mkdir(preparedDirectory);
        if (oldListing) listing = structuredClone(oldListing);
        else {
          const response = await fetcher(site + '/catalog.json'); assert(response.ok, 'Catalog unavailable');
          const live = (await response.json()).projects.find(p => p.id === projectId); assert(live && legacyRule, 'Listing not found');
          listing = {schema_version: 1, id: projectId, ...Object.fromEntries(['title', 'developer', 'description', 'game', 'category', 'status'].map(k => [k, live[k]])), source: live.source || {type: 'github', url: live.repository}, cover: site + '/' + live.cover, screenshots: live.screenshots.map(s => site + '/' + s), approved_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), ...(live.links ? {links: live.links} : {}), ...(live.distribution ? {distribution: live.distribution} : {})};
        }
        const edits = row.operation === 'submission' ? {...value, developer: value.creator} : value;
        for (const field of EDITABLE) if (edits[field] !== undefined) listing[field] = edits[field];
        if (value.url && listing.source.type !== 'github') listing.source = {...listing.source, url: value.url, type: ({github: 'github', gitlab: 'git', codeberg: 'git', platform: 'platform', forum: 'forum', website: 'website'})[sourceKind(value.url)]};
        if (value.patch_url) listing.distribution = {label: 'Patch Page', url: value.patch_url, kind: /\.(?:ips|bps|ups|xdelta|zip|7z)$/i.test(new URL(value.patch_url).pathname) ? 'patch' : 'page'};
        else if (row.operation === 'edit' && Object.hasOwn(value, 'patch_url')) delete listing.distribution;
        if (Array.isArray(value.artwork) && value.artwork.length) { listing.cover = value.artwork[0]; listing.screenshots = value.artwork.slice(1); }
        const refs = [listing.cover, ...(listing.screenshots || [])], names = [];
        for (const [i, ref] of refs.entries()) {
          let bytes;
          if (ALLOWED.test(ref)) bytes = await fs.readFile(path.join(root, 'listings', projectId, ref));
          else { const response = await fetcher(ref); assert(response.ok, 'Artwork unavailable'); bytes = Buffer.from(await response.arrayBuffer()); }
          await normalizeImage(bytes, i ? 'screenshot' : 'cover');
          const extension = bytes[0] === 137 ? 'png' : bytes[0] === 255 ? 'jpg' : 'webp';
          const name = (i ? `screenshot-${i}` : 'cover') + '.' + extension; names.push(name); await fs.writeFile(path.join(preparedDirectory, name), bytes);
        }
        listing.cover = names[0]; listing.screenshots = names.slice(1); validateListing(listing);
        const result = await evaluateListing({listing, dir: preparedDirectory, rule: existingRule || legacyRule, api, fetcher, captureImages: true});
        listing = await freezeReviewedListing(result, preparedDirectory);
        rule = {...(existingRule || {}), project_id: projectId, ...(result.owner_id ? {owner_id: result.owner_id} : {}), decision: 'approved', content_digests: [...new Set([...(existingRule?.content_digests || []), result.initialDigest])], artwork_sets: artworkApproved(existingRule, projectId, result.inspected.artwork) ? existingRule.artwork_sets : [...(existingRule?.artwork_sets || []), result.inspected.artwork]};
      }
      for (const [i, name] of [listing.cover, ...(listing.screenshots || [])].entries()) {
        assert(ALLOWED.test(name), 'Artwork must be local');
        const bytes = await fs.readFile(path.join(preparedDirectory, name));
        const preview = await normalizeImage(bytes, i ? 'screenshot' : 'cover');
        files.push({name, bytes}); previews.push({name: `preview-${i}.webp`, bytes: preview});
      }
      if (!policy.external_projects) policy.external_projects = [];
      const index = policy.external_projects.findIndex(r => r.project_id === projectId);
      if (index === -1) policy.external_projects.push(rule); else policy.external_projects[index] = rule;
      policy.external_projects.sort((a, b) => a.project_id.localeCompare(b.project_id));
      if (legacyRule) { legacyRule.decision = 'delisted'; legacyRule.reason = 'Replaced by exact-approved managed listing with the same stable identity'; warnings.push('Converts the prior GitHub intake record to a managed listing; stable ID and ratings are retained.'); }
    }
    policyCheck(policy);
    const buffers = [...files, ...previews];
    const pkg = {version: 1, project_id: projectId, operation: row.operation, base_commit: base, base_policy_sha256: sha(text(originalPolicy)), listing: listing || null, policy, rule, warnings, files: buffers.map(f => ({name: f.name, sha256: imageHash(f.bytes), parts: Math.ceil(f.bytes.toString('base64').length / 262144)}))};
    return {package: pkg, buffers};
  } finally { await fs.rm(directory, {recursive: true, force: true}); }
}

export async function createPublicationPR({row, api, repo, loadFile}) {
  assert(row.state === 'publishing' && row.digest === row.approved_digest && hash(JSON.stringify(row.package)) === row.digest, 'Approval digest mismatch');
  const pkg = row.package;
  const main = await api.request(`/repos/${repo}/git/ref/heads/main`);
  assert(main.object.sha === pkg.base_commit, 'Main changed: prepare and approve a fresh package');
  const commit = await api.request(`/repos/${repo}/git/commits/${pkg.base_commit}`);
  const tree = [];
  if (pkg.listing) {
    validateListing(pkg.listing); assert(pkg.listing.id === pkg.project_id, 'Identity mismatch');
    tree.push({path: `listings/${pkg.project_id}/listing.json`, mode: '100644', type: 'blob', content: text(pkg.listing)});
    for (const f of pkg.files.filter(f => !f.name.startsWith('preview-'))) {
      assert(ALLOWED.test(f.name), 'Unsafe filename');
      const bytes = await loadFile(f); assert(imageHash(bytes) === f.sha256, 'Artwork changed');
      const blob = await api.request(`/repos/${repo}/git/blobs`, {method: 'POST', body: {content: bytes.toString('base64'), encoding: 'base64'}});
      tree.push({path: `listings/${pkg.project_id}/${f.name}`, mode: '100644', type: 'blob', sha: blob.sha});
    }
  }
  policyCheck(pkg.policy);
  tree.push({path: 'policy/publishing.json', mode: '100644', type: 'blob', content: text(pkg.policy)});
  const newTree = await api.request(`/repos/${repo}/git/trees`, {method: 'POST', body: {base_tree: commit.tree.sha, tree}});
  const next = await api.request(`/repos/${repo}/git/commits`, {method: 'POST', body: {message: `Moderate ${pkg.project_id}`, tree: newTree.sha, parents: [pkg.base_commit]}});
  const branch = 'admin/' + row.id;
  await api.request(`/repos/${repo}/git/refs`, {method: 'POST', body: {ref: 'refs/heads/' + branch, sha: next.sha}});
  const pr = await api.request(`/repos/${repo}/pulls`, {method: 'POST', body: {title: `Moderate ${pkg.project_id}`, head: branch, base: 'main', body: `Exact browser approval: ${row.approved_digest}\n\nOperation: ${pkg.operation}. Only approved listing/artwork and publishing policy are included. Merge and deployment remain subject to normal protection, signed backup and publication checks. Private submission materials and notes are excluded.`}});
  return pr.number;
}

async function main() {
  const id = process.env.REVIEW_ID, action = process.env.REVIEW_ACTION;
  assert(/^[A-Za-z0-9_-]{24}$/.test(id || '') && ['prepare', 'publish'].includes(action), 'Invalid job');
  const base = process.env.ADMIN_API;
  assert(/^https:\/\/[a-z0-9.-]+$/.test(base || ''), 'Invalid processor origin');
  const call = async (suffix = '', data) => {
    const response = await fetch(`${base}/processor/${id}${suffix}`, {method: data ? 'POST' : 'GET', headers: {Authorization: 'Bearer ' + process.env.ADMIN_PROCESSOR_TOKEN, 'CF-Access-Client-Id': process.env.ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': process.env.ACCESS_CLIENT_SECRET, ...(data ? {'Content-Type': 'application/json'} : {})}, body: data ? JSON.stringify(data) : undefined, redirect: 'error', signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw Error('Private processor API rejected operation'); return response.json();
  };
  let claimed = false;
  try {
    await call('/claim', {action}); claimed = true;
    const row = await call();
    if (action === 'prepare') {
      const result = await preparePackage({row, base: process.env.GITHUB_SHA});
      for (const f of result.buffers) {
        const encoded = f.bytes.toString('base64');
        for (let part = 0; part * 262144 < encoded.length; part++) await call('/file', {name: f.name, part, data: encoded.slice(part * 262144, (part + 1) * 262144)});
      }
      await call('/ready', {package: result.package});
    } else {
      const api = new GitHub();
      const loadFile = async f => {
        let data = ''; for (let part = 0; part < f.parts; part++) data += (await call(`/file?name=${encodeURIComponent(f.name)}&part=${part}`)).data;
        return Buffer.from(data, 'base64');
      };
      const pr = await createPublicationPR({row, api, repo: process.env.GITHUB_REPOSITORY, loadFile});
      await call('/published-pr', {pr});
    }
  } catch (error) {
    if (claimed) await call('/failed', {error: String(error.message).replace(/[<>\x00-\x1f]/g, ' ').slice(0, 1000)}).catch(() => {});
    console.error('Private moderation job failed. See the authenticated dashboard.'); process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
