import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash, createPublicKey, sign, verify} from 'node:crypto';
import Ajv from 'ajv';
import {readJSON, json, repoSlug, validateRecord} from './records.js';
import {readSnapshot} from './publishing.js';
import {buildCatalog, validateState} from './catalog.js';
import {policyCheck} from './moderation.js';

const checkConfig = new Ajv({allErrors: true}).compile(await readJSON(new URL('../schema/recovery.schema.json', import.meta.url)));
const checkCatalog = new Ajv().compile(await readJSON(new URL('../schema/catalog.schema.json', import.meta.url)));
const HEX = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const gitHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function keys(object, allowed, label) {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(k => !allowed.includes(k))) throw Error(`unexpected ${label} fields`);
}
export function recoveryConfig(config) {
  if (!checkConfig(config)) throw Error('invalid recovery policy: ' + JSON.stringify(checkConfig.errors));
  if (!config.enabled) throw Error('durable recovery is not configured; production publication is disabled');
  repoSlug('https://github.com/' + config.source_repository); repoSlug('https://github.com/' + config.backup_repository);
  if (config.source_repository_id === config.backup_repository_id || config.source_repository.toLowerCase() === config.backup_repository.toLowerCase()) throw Error('backup must be a separate private repository');
  for (const key of Object.values(config.public_keys)) if (key.includes('PRIVATE KEY') || createPublicKey(key).asymmetricKeyType !== 'ed25519') throw Error('recovery verification keys must be Ed25519 public keys');
  if (!config.public_keys[config.signing_key_id]) throw Error('active signing key is not trusted');
  return config;
}
function credentialCheck(bytes, name) {
  if (!name.endsWith('.json')) return;
  const text = bytes.toString('utf8');
  if (/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_[a-f0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|"(?:authorization|access_token|private_key|password)"\s*:)/i.test(text)) throw Error(`credential-like data refused in ${name}`);
}
async function regularFile(file, limit = MAX_FILE) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw Error('invalid/oversized recovery file');
  return fs.readFile(file);
}
export async function payloadFiles(snapshot, catalogFile) {
  const registryBytes = await regularFile(path.join(snapshot, 'registry.json'));
  const registry = JSON.parse(registryBytes);
  keys(registry, ['version', 'entries'], 'registry');
  for (const entry of registry.entries || []) {
    keys(entry, ['id', 'repository_id', 'owner_id', 'source', 'moderation'], 'registration');
    keys(entry.source, ['method', 'issue', 'user_id', 'digest', 'type', 'manifest', 'claim_digest'], 'source');
    for (const name of ['issue', 'user_id']) if (entry.source[name] != null && (!Number.isSafeInteger(entry.source[name]) || entry.source[name] <= 0)) throw Error('invalid recovery source identity');
    for (const name of ['digest', 'claim_digest']) if (entry.source[name] != null && !HEX.test(entry.source[name])) throw Error('invalid source digest');
  }
  const entries = await readSnapshot(snapshot);
  const files = new Map([['registry.json', registryBytes], ['catalog.json', await regularFile(catalogFile)]]);
  const catalog = JSON.parse(files.get('catalog.json'));
  if (!checkCatalog(catalog)) throw Error('invalid recovery catalog schema');
  for (const entry of entries) {
    const {record, state} = entry;
    keys(state, ['kind', 'host', 'repository', 'release', 'availability', 'warning', 'ownership', 'last_updated'], 'state');
    if (state.host) keys(state.host, ['id', 'owner_id'], 'host');
    if (state.repository) keys(state.repository, ['id', 'url', 'owner', 'owner_type', 'owner_id', 'archived', 'updated_at'], 'repository');
    if (state.release) keys(state.release, ['version', 'download_url', 'file_name', 'file_size', 'release_date', 'updated_at', 'sha256'], 'release');
    if (state.ownership) keys(state.ownership, ['claim', 'representation_verified'], 'ownership');
    for (const name of [`records/${entry.id}.json`, `state/${entry.id}.json`, `assets/${entry.id}/cover.webp`, ...(record.screenshots || []).map((_, i) => `assets/${entry.id}/screenshot-${i + 1}.webp`)]) files.set(name, await regularFile(path.join(snapshot, name)));
  }
  const catalogIds = new Set();
  for (const project of catalog.projects) {
    const entry = entries.find(e => e.id === project.id);
    if (!entry || project.repository_id !== entry.repository_id || catalogIds.has(project.id)) throw Error('catalog/registry identity mismatch');
    catalogIds.add(project.id);
  }
  let size = 0;
  for (const [name, bytes] of files) { credentialCheck(bytes, name); size += bytes.length; }
  if (size > MAX_TOTAL) throw Error('recovery point exceeds 128 MiB limit');
  return files;
}
function core(config, files) {
  return {schema_version: 1, source_repository_id: config.source_repository_id, backup_repository_id: config.backup_repository_id,
    ...(config.purpose === 'integration' ? {purpose: 'integration'} : {}),
    files: [...files].map(([name, bytes]) => ({path: name, size: bytes.length, sha256: hash(bytes)})).sort((a, b) => a.path < b.path ? -1 : 1)};
}
export function seal(config, files, provenance, privateKey) {
  const body = core(config, files);
  const envelope = {...body, snapshot_id: hash(canonical(body)), signing_key_id: config.signing_key_id, provenance};
  const signature = sign(null, Buffer.from(canonical(envelope)), privateKey).toString('base64');
  const result = {...envelope, signature};
  verifyEnvelope(config, result);
  return result;
}
function safeName(name) {
  return name === 'registry.json' || name === 'catalog.json' || /^(?:records|state)\/[a-z][a-z0-9-]{0,63}\.json$/.test(name) || /^assets\/[a-z][a-z0-9-]{0,63}\/(?:cover|screenshot-[1-6])\.webp$/.test(name);
}
export function verifyEnvelope(config, envelope, point) {
  keys(envelope, ['schema_version', 'source_repository_id', 'backup_repository_id', 'files', 'snapshot_id', 'signing_key_id', 'provenance', 'signature', 'purpose'], 'envelope');
  if ((envelope.purpose || 'production') !== (config.purpose || 'production')) throw Error('integration recovery point cannot become production authority');
  if (envelope.schema_version !== 1 || envelope.source_repository_id !== config.source_repository_id || envelope.backup_repository_id !== config.backup_repository_id || !HEX.test(envelope.snapshot_id) || !Array.isArray(envelope.files) || envelope.files.length > 16002) throw Error('recovery schema or repository identity mismatch');
  const p = envelope.provenance;
  keys(p, ['source_commit', 'run_id', 'workflow', 'ref', 'kind'], 'provenance');
  const allowedWorkflows = config.purpose === 'integration' ? ['.github/workflows/hosted-integration.yml'] : p.kind === 'initialization' ? ['.github/workflows/initialize-backup.yml', '.github/workflows/catalog.yml'] : ['.github/workflows/catalog.yml'];
  if (!GIT_SHA.test(p.source_commit) || !Number.isSafeInteger(p.run_id) || p.run_id <= 0 || !allowedWorkflows.includes(p.workflow) || p.ref !== `refs/heads/${config.default_branch}` || !['publication', 'initialization'].includes(p.kind)) throw Error('untrusted recovery provenance');
  if (point && point !== `${p.run_id}-${envelope.snapshot_id}`) throw Error('recovery point/provenance mismatch');
  const names = new Set(); let total = 0;
  for (const file of envelope.files) {
    keys(file, ['path', 'size', 'sha256'], 'file descriptor');
    if (!safeName(file.path) || names.has(file.path) || !HEX.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE) throw Error('unsafe recovery file descriptor');
    names.add(file.path); total += file.size;
  }
  if (total > MAX_TOTAL || !names.has('registry.json') || !names.has('catalog.json')) throw Error('incomplete/oversized recovery point');
  const body = {schema_version: envelope.schema_version, source_repository_id: envelope.source_repository_id, backup_repository_id: envelope.backup_repository_id, files: envelope.files, ...(envelope.purpose ? {purpose: envelope.purpose} : {})};
  if (hash(canonical(body)) !== envelope.snapshot_id) throw Error('recovery manifest checksum mismatch');
  const {signature, ...signed} = envelope;
  const publicKey = config.public_keys[envelope.signing_key_id];
  if (!publicKey || typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature) || !verify(null, Buffer.from(canonical(signed)), publicKey, Buffer.from(signature, 'base64'))) throw Error('untrusted recovery signature');
  return envelope;
}
async function blob(api, slug, sha) {
  if (!GIT_SHA.test(sha)) throw Error('invalid Git blob ID');
  const data = await api.request(`/repos/${slug}/git/blobs/${sha}`);
  if (data.encoding !== 'base64' || !Number.isSafeInteger(data.size) || data.size > MAX_FILE || typeof data.content !== 'string' || data.content.length > MAX_FILE * 1.5) throw Error('invalid/oversized Git blob');
  const bytes = Buffer.from(data.content, 'base64');
  if (bytes.length !== data.size || gitHash(bytes) !== sha) throw Error('Git blob integrity mismatch');
  return bytes;
}
export class RecoveryStore {
  constructor(config, api, sourceApi = api) { this.config = recoveryConfig(config); this.api = api; this.sourceApi = sourceApi; this.namespace = config.purpose === 'integration' ? 'loghub-integration-v1' : 'loghub-v1'; this.anchorNamespace = config.purpose === 'integration' ? 'loghub-integration-anchor-v1' : 'loghub-anchor-v1'; }
  async identity() {
    const c = this.config; const repo = await this.api.request(`/repositories/${c.backup_repository_id}`);
    if (repo.id !== c.backup_repository_id || repo.full_name !== c.backup_repository || repo.private !== true || repo.archived !== false) throw Error('expected private backup repository identity unavailable');
    return c.backup_repository;
  }
  async privatePoints() {
    const slug = await this.identity();
    const prefix = `refs/tags/${this.namespace}/`;
    const refs = await this.api.request(`/repos/${slug}/git/matching-refs/tags/${this.namespace}/`);
    if (!Array.isArray(refs) || refs.length > 4096) throw Error('invalid/oversized backup ref history');
    const points = refs.map(r => {
      const point = r.ref?.slice(prefix.length);
      const match = /^([1-9][0-9]*)-([a-f0-9]{64})$/.exec(point || '');
      if (!r.ref?.startsWith(prefix) || !match || !Number.isSafeInteger(Number(match[1])) || r.object?.type !== 'commit' || !GIT_SHA.test(r.object.sha)) throw Error('unauthorized/malformed backup reference');
      return {point, run_id: Number(match[1]), commit: r.object.sha};
    }).sort((a, b) => b.run_id - a.run_id);
    if (new Set(points.map(p => p.run_id)).size !== points.length) throw Error('conflicting recovery points for one run');
    return points;
  }
  async points() {
    await this.identity();
    const prefix = `refs/tags/${this.anchorNamespace}/`;
    const refs = await this.sourceApi.request(`/repos/${this.config.source_repository}/git/matching-refs/tags/${this.anchorNamespace}/`);
    if (!Array.isArray(refs) || refs.length > 4096) throw Error('invalid/oversized public recovery anchors');
    const points = refs.map(r => {
      const value = r.ref?.slice(prefix.length);
      const match = /^([1-9][0-9]*)-([a-f0-9]{64})-([a-f0-9]{40})$/.exec(value || '');
      if (!r.ref?.startsWith(prefix) || !match || !Number.isSafeInteger(Number(match[1])) || r.object?.type !== 'commit' || !GIT_SHA.test(r.object.sha)) throw Error('malformed public recovery anchor');
      return {point: `${match[1]}-${match[2]}`, commit: match[3], run_id: Number(match[1]), anchor_source_commit: r.object.sha};
    }).sort((a, b) => b.run_id - a.run_id);
    if (new Set(points.map(p => p.run_id)).size !== points.length) throw Error('conflicting public recovery anchors');
    return points;
  }
  async immutable(point, create = false) {
    const slug = this.config.backup_repository; const tag = this.namespace + '/' + point.point;
    let release;
    try { release = await this.api.request(`/repos/${slug}/releases/tags/${encodeURIComponent(tag)}`); }
    catch (error) {
      if (error.status !== 404 || !create) throw error;
      await this.api.request(`/repos/${slug}/releases`, {method: 'POST', body: {tag_name: tag, name: `Recovery ${point.run_id}`, body: 'Signed LoG Hub recovery point; not a game/software release.', draft: false, prerelease: true, make_latest: 'false'}});
      release = await this.api.request(`/repos/${slug}/releases/tags/${encodeURIComponent(tag)}`);
    }
    if (release.tag_name !== tag || release.immutable !== true || release.draft !== false) throw Error('private recovery release is not immutable; publication refused');
    const locked = await this.api.request(`/repos/${slug}/git/ref/tags/${tag}`);
    if (locked.ref !== `refs/tags/${tag}` || locked.object?.type !== 'commit' || locked.object.sha !== point.commit) throw Error('immutable release tag does not retain the signed recovery commit');
  }
  async read(point) {
    const c = this.config; const slug = c.backup_repository;
    const commit = await this.api.request(`/repos/${slug}/git/commits/${point.commit}`);
    if (commit.sha !== point.commit || !GIT_SHA.test(commit.tree?.sha)) throw Error('invalid recovery commit');
    const tree = await this.api.request(`/repos/${slug}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > 20010) throw Error('incomplete/oversized recovery tree');
    const leaves = tree.tree.filter(e => e.type !== 'tree');
    if (leaves.some(e => e.type !== 'blob' || e.mode !== '100644' || !GIT_SHA.test(e.sha))) throw Error('recovery tree contains a link, executable or submodule');
    const manifest = leaves.find(e => e.path === 'manifest.json');
    if (!manifest) throw Error('missing recovery manifest');
    const envelope = verifyEnvelope(c, JSON.parse(await blob(this.api, slug, manifest.sha)), point.point);
    if (point.anchor_source_commit && envelope.provenance.source_commit !== point.anchor_source_commit) throw Error('public anchor/source provenance mismatch');
    await this.immutable(point);
    if (leaves.length !== envelope.files.length + 1) throw Error('unexpected/missing recovery files');
    const files = new Map(); const blobIds = new Set(leaves.map(e => e.sha));
    for (const file of envelope.files) {
      const item = leaves.find(e => e.path === `payload/${file.path}`);
      if (!item) throw Error('incomplete recovery payload');
      const bytes = await blob(this.api, slug, item.sha);
      if (bytes.length !== file.size || hash(bytes) !== file.sha256) throw Error('recovery payload checksum mismatch');
      credentialCheck(bytes, file.path); files.set(file.path, bytes);
    }
    const result = {...point, envelope, files, blobIds};
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-recovery-check-'));
    try { await materialize(result, path.join(scratch, 'verified')); }
    finally { await fs.rm(scratch, {recursive: true, force: true}); }
    return result;
  }
  async latest({inspect = false} = {}) {
    const points = await this.points();
    if (!points.length) throw Error('backup repository has no initialized recovery point; explicit administrator initialization required');
    const failures = [];
    for (const point of points.slice(0, 20)) {
      try {
        const result = await this.read(point);
        if (failures.length && !inspect && !(this.config.rollback?.point === point.point && this.config.rollback.observed_newest === points[0].point)) throw Error(`rollback authorization required for ${point.point}; newest is ${points[0].point}`);
        return {...result, failures};
      } catch (error) {
        if (error.message.startsWith('rollback authorization required')) throw error;
        if (error.status && error.status !== 404) throw error;
        failures.push({point: point.point, reason: error.message});
      }
    }
    throw Error('no valid recovery point; ' + failures.map(f => f.reason).join('; '));
  }
  async backup(files, provenance, privateKey, {initialize = false, policy} = {}) {
    const c = this.config; const slug = c.backup_repository;
    const points = await this.points();
    if (!points.length && !initialize) throw Error('backup is not initialized; refusing automatic empty bootstrap');
    const previous = points.length ? await this.latest() : undefined;
    const envelope = seal(c, files, provenance, privateKey);
    if (previous?.envelope.snapshot_id === envelope.snapshot_id) return {...previous, reused: true};
    if (initialize && points.length) throw Error('initialization cannot overwrite existing recovery history');
    if (previous && provenance.run_id <= points[0].run_id) throw Error('backup run would roll state backward or reuse a run ID');
    const oldCount = previous ? JSON.parse(previous.files.get('registry.json')).entries.length : 0;
    if (oldCount && JSON.parse(files.get('registry.json')).entries.length === 0) {
      if (policy) policyCheck(policy);
      const authorized = policy && JSON.parse(previous.files.get('registry.json')).entries.every(entry => policy.projects.some(rule => rule.repository_id === entry.repository_id && rule.owner_id === entry.owner_id && rule.project_id === entry.id && ['suspended', 'delisted'].includes(rule.decision)));
      if (!authorized) throw Error('refusing to replace existing recovery state with an empty catalog registry without explicit identity-bound suspension/delisting policy');
    }
    const point = `${provenance.run_id}-${envelope.snapshot_id}`;
    const existing = (await this.privatePoints()).find(p => p.point === point);
    if (existing) {
      await this.immutable(existing, true);
      const recovered = await this.read(existing);
      if (canonical(recovered.envelope) !== canonical(envelope)) throw Error('conflicting interrupted recovery point');
      return {...recovered, reused: false};
    }
    const tree = [];
    for (const [name, bytes] of [...files, ['manifest.json', Buffer.from(json(envelope))]]) {
      const expected = gitHash(bytes);
      if (!previous?.blobIds.has(expected)) {
        const created = await this.api.request(`/repos/${slug}/git/blobs`, {method: 'POST', body: {encoding: 'base64', content: bytes.toString('base64')}});
        if (created.sha !== expected) throw Error('created backup blob checksum mismatch');
      }
      tree.push({path: name === 'manifest.json' ? name : `payload/${name}`, mode: '100644', type: 'blob', sha: expected});
    }
    const createdTree = await this.api.request(`/repos/${slug}/git/trees`, {method: 'POST', body: {tree}});
    if (!GIT_SHA.test(createdTree.sha)) throw Error('invalid created backup tree');
    const commit = await this.api.request(`/repos/${slug}/git/commits`, {method: 'POST', body: {message: `LoG Hub recovery ${envelope.snapshot_id}`, tree: createdTree.sha, parents: previous ? [previous.commit] : []}});
    if (!GIT_SHA.test(commit.sha)) throw Error('invalid created backup commit');
    await this.api.request(`/repos/${slug}/git/refs`, {method: 'POST', body: {ref: `refs/tags/${this.namespace}/` + point, sha: commit.sha}});
    await this.immutable({point, commit: commit.sha, run_id: provenance.run_id}, true);
    const recovered = await this.read({point, commit: commit.sha, run_id: provenance.run_id});
    return {...recovered, reused: false};
  }
  async anchor(recovered) {
    const verified = await this.read(recovered);
    const points = await this.points();
    const existing = points.find(p => p.point === verified.point);
    if (existing) {
      if (existing.commit !== verified.commit || existing.anchor_source_commit !== verified.envelope.provenance.source_commit) throw Error('conflicting public recovery receipt');
      return verified;
    }
    if (points[0] && points[0].run_id >= verified.run_id) throw Error('newer public recovery anchor exists; stale publication refused');
    await this.sourceApi.request(`/repos/${this.config.source_repository}/git/refs`, {method: 'POST', body: {ref: `refs/tags/${this.anchorNamespace}/` + verified.point + '-' + verified.commit, sha: verified.envelope.provenance.source_commit}});
    const latest = (await this.points())[0];
    if (latest?.point !== verified.point || latest.commit !== verified.commit) throw Error('concurrent anchor changed; stale publication refused');
    return verified;
  }
}
export async function verifyPublicationFiles(recovered, directory) {
  const catalog = JSON.parse(recovered.files.get('catalog.json'));
  const expected = new Map([['catalog.json', recovered.files.get('catalog.json')]]);
  for (const project of catalog.projects) for (const name of [project.cover, ...project.screenshots]) {
    if (!safeName(name) || !recovered.files.has(name)) throw Error('invalid protected publication image');
    expected.set(name, recovered.files.get(name));
  }
  const seen = new Set();
  async function walk(relative = '') {
    const root = path.join(directory, relative);
    const stat = await fs.lstat(root).catch(() => {throw Error('missing publication directory/file');});
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('invalid publication directory');
    for (const entry of await fs.readdir(root, {withFileTypes: true})) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw Error('publication cannot contain links');
      if (entry.isDirectory()) {await walk(name); continue;}
      if (!entry.isFile() || !expected.has(name) || !(await regularFile(path.join(directory, name))).equals(expected.get(name))) throw Error('publication files differ from protected backup');
      seen.add(name);
    }
  }
  await walk();
  if (seen.size !== expected.size) throw Error('publication files missing from upload directory');
}
export async function verifyExport(config, directory) {
  recoveryConfig(config);
  const envelope = JSON.parse(await regularFile(path.join(directory, 'recovery-envelope.json')));
  const point = `${envelope.provenance?.run_id}-${envelope.snapshot_id}`;
  verifyEnvelope(config, envelope, point);
  const files = new Map();
  for (const file of envelope.files) {
    const bytes = await regularFile(path.join(directory, file.path));
    if (bytes.length !== file.size || hash(bytes) !== file.sha256) throw Error('offline recovery checksum mismatch');
    credentialCheck(bytes, file.path); files.set(file.path, bytes);
  }
  const recovered = {point, envelope, files};
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-offline-check-'));
  try {await materialize(recovered, path.join(scratch, 'verified'));}
  finally {await fs.rm(scratch, {recursive: true, force: true});}
  return recovered;
}
export async function materialize(recovered, destination) {
  const staging = destination + '.partial';
  if (await fs.lstat(destination).then(() => true, e => {if (e.code === 'ENOENT') return false; throw e;})) throw Error('restore destination already exists; refusing destructive overwrite');
  await fs.mkdir(staging, {recursive: false});
  try {
    for (const [name, bytes] of recovered.files) {
      if (!safeName(name)) throw Error('unsafe restore path');
      const target = path.join(staging, name); await fs.mkdir(path.dirname(target), {recursive: true}); await fs.writeFile(target, bytes, {flag: 'wx'});
    }
    const expected = await payloadFiles(staging, path.join(staging, 'catalog.json'));
    if (expected.size !== recovered.files.size) throw Error('restored registry and file set disagree');
    const entries = await readSnapshot(staging);
    const verifyRoot = path.join(staging, '.verify');
    await fs.mkdir(verifyRoot);
    for (const directory of ['records', 'state', 'assets']) {
      await fs.cp(path.join(staging, directory), path.join(verifyRoot, directory), {recursive: true}).catch(error => {if (error.code !== 'ENOENT' || entries.length) throw error;});
    }
    await fs.mkdir(path.join(verifyRoot, 'records'), {recursive: true});
    const allProjects = await buildCatalog(verifyRoot);
    const savedCatalog = JSON.parse(recovered.files.get('catalog.json'));
    for (const project of savedCatalog.projects) if (canonical(project) !== canonical(allProjects.projects.find(p => p.id === project.id))) throw Error('saved public catalog does not match recovery records');
    await fs.rm(verifyRoot, {recursive: true, force: true});
    await fs.writeFile(path.join(staging, 'recovery-envelope.json'), json(recovered.envelope));
    await fs.rename(staging, destination);
  } catch (error) { await fs.rm(staging, {recursive: true, force: true}); throw error; }
}
