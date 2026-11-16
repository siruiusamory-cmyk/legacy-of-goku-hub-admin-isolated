import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {APIError} from '../../src/github.js';
export async function gitVault(directory, config) {
  await fs.mkdir(directory, {recursive: true});
  const env = {...process.env, GIT_AUTHOR_NAME: 'Test fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Test fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid'};
  function git(args, input, extra = {}) {
    const result = spawnSync('git', ['-C', directory, ...args], {input, env: {...env, ...extra}, windowsHide: true});
    if (result.status !== 0) throw new APIError('test Git object/ref operation failed', 404);
    return result.stdout;
  }
  git(['init', '--bare']);
  const emptyTree = git(['mktree'], '').toString().trim();
  const initial = git(['commit-tree', emptyTree], 'test fixture repository\n').toString().trim();
  git(['update-ref', 'refs/heads/main', initial]);
  const releases = new Map(); const calls = [];
  const client = {calls, git, directory, initial, releases, async request(endpoint, {method = 'GET', body} = {}) {
    calls.push({endpoint, method});
    if (endpoint === `/repositories/${config.backup_repository_id}`) return {id: config.backup_repository_id, full_name: config.backup_repository, private: true, archived: false};
    const prefix = `/repos/${config.backup_repository}/`;
    if (!endpoint.startsWith(prefix)) throw new APIError('unexpected test endpoint', 404);
    const route = endpoint.slice(prefix.length);
    if (route === 'git/matching-refs/tags/loghub-v1/') return git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/tags/loghub-v1/']).toString().trim().split('\n').filter(Boolean).map(line => {const [ref, sha] = line.split(' '); return {ref, object: {type: 'commit', sha}};});
    if (route.startsWith('releases/tags/')) {
      const tag = decodeURIComponent(route.slice(14));
      if (!releases.has(tag)) throw new APIError('test release not found', 404);
      return structuredClone(releases.get(tag));
    }
    if (route === 'releases' && method === 'POST') {releases.set(body.tag_name, {...body, immutable: true}); return structuredClone(releases.get(body.tag_name));}
    if (route === 'git/blobs' && method === 'POST') return {sha: git(['hash-object', '-w', '--stdin'], Buffer.from(body.content, 'base64')).toString().trim()};
    if (route.startsWith('git/blobs/')) {const bytes = git(['cat-file', 'blob', route.slice(10)]); return {encoding: 'base64', content: bytes.toString('base64'), size: bytes.length};}
    if (route === 'git/trees' && method === 'POST') {
      const index = path.join(directory, 'test-index'); const indexEnv = {GIT_INDEX_FILE: index};
      git(['read-tree', '--empty'], undefined, indexEnv);
      for (const entry of body.tree) git(['update-index', '--add', '--cacheinfo', `${entry.mode},${entry.sha},${entry.path}`], undefined, indexEnv);
      return {sha: git(['write-tree'], undefined, indexEnv).toString().trim()};
    }
    if (route.startsWith('git/trees/')) {
      const sha = route.slice(10).split('?')[0];
      return {truncated: false, tree: git(['ls-tree', '-r', '-t', '-z', sha]).toString().split('\0').filter(Boolean).map(line => {const [header, name] = line.split('\t'); const [mode, type, object] = header.split(' '); return {path: name, mode, type, sha: object};})};
    }
    if (route === 'git/commits' && method === 'POST') return {sha: git(['commit-tree', body.tree, ...body.parents.flatMap(p => ['-p', p])], body.message + '\n').toString().trim()};
    if (route.startsWith('git/commits/')) {const sha = route.slice(12); const data = git(['cat-file', '-p', sha]).toString(); return {sha, tree: {sha: /^tree ([a-f0-9]{40})/m.exec(data)[1]}};}
    if (route.startsWith('git/ref/')) {const ref = 'refs/' + route.slice(8); return {ref, object: {type: 'commit', sha: git(['rev-parse', ref]).toString().trim()}};}
    if (route === 'git/refs' && method === 'POST') {git(['update-ref', body.ref, body.sha, '0'.repeat(40)]); return {ref: body.ref, object: {sha: body.sha, type: 'commit'}};}
    throw new APIError('unsupported test GitHub operation', 404);
  }};
  return client;
}
export function publicAnchors(config, sourceCommit) {
  const anchors = new Map();
  return {anchors, async request(endpoint, {method = 'GET', body} = {}) {
    if (endpoint === `/repos/${config.source_repository}/git/matching-refs/tags/loghub-anchor-v1/`) return [...anchors].map(([ref, sha]) => ({ref, object: {type: 'commit', sha}}));
    if (method === 'POST' && endpoint.endsWith('/git/refs')) {
      if (anchors.has(body.ref) || body.sha !== sourceCommit) throw new APIError('immutable anchor conflict', 422);
      anchors.set(body.ref, body.sha); return {ref: body.ref};
    }
    throw new APIError('unsupported anchor endpoint', 404);
  }};
}
