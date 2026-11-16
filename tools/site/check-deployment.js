import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestName = 'deployment-manifest.json';
const policyFile = new URL('../../policy/publishing.json', import.meta.url);
export function assertDeployable(provenance) {
  if (provenance.purpose !== 'production' || !/^[0-9]+-[a-f0-9]{64}$/.test(provenance.point || '') || !/^[a-f0-9]{64}$/.test(provenance.snapshot_id || '') || !/^[a-f0-9]{40}$/.test(provenance.source_commit || '')) throw Error('Only a verified production snapshot can be deployed; fixtures are prohibited');
  if (provenance.base !== '/' || !provenance.point.endsWith('-' + provenance.snapshot_id)) throw Error('Deployment requires root-path production provenance with matching snapshot');
}
async function inventory(directory) {
  const files = [];
  async function walk(relative) {
    for (const item of await fs.readdir(path.join(directory, relative), {withFileTypes: true})) {
      const name = relative ? relative + '/' + item.name : item.name;
      if (item.isSymbolicLink() || /^(?:functions|_worker\.js)(?:\/|$)|(?:^|\/)(?:wrangler\.(?:toml|jsonc?)|\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/i.test(name)) throw Error('Deployment accepts static files only; no Functions, Workers, configuration or secrets');
      if (item.isDirectory()) await walk(name);
      else {
        if (!item.isFile()) throw Error('Deployment requires regular files');
        if (name === manifestName) continue;
        const file = path.join(directory, name); const size = (await fs.stat(file)).size;
        if (size > 25 * 1024 * 1024 || files.length >= 19999) throw Error('Artifact exceeds Cloudflare Pages Free limits');
        files.push({path: name, size, sha256: hash(await fs.readFile(file))});
      }
    }
  }
  if (!(await fs.lstat(directory)).isDirectory() || (await fs.lstat(directory)).isSymbolicLink()) throw Error('Deployment requires a real artifact directory');
  await walk('');
  return files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export async function sealArtifact(directory, buildCommit) {
  if (!/^[a-f0-9]{40}$/.test(buildCommit || '')) throw Error('Deployment requires the exact build commit');
  const provenance = JSON.parse(await fs.readFile(path.join(directory, 'site-provenance.json'))); assertDeployable(provenance);
  const files = await inventory(directory);
  if (!files.some(f=>f.path==='index.html') || !files.some(f=>f.path==='404.html') || !files.some(f=>f.path==='catalog.json')) throw Error('Incomplete static artifact');
  const manifest = {version: 1, build_commit: buildCommit, policy_sha256: hash(await fs.readFile(policyFile)), target: 'https://loghub.pages.dev/', files};
  const bytes = JSON.stringify(manifest) + '\n';
  if (Buffer.byteLength(bytes) > 25 * 1024 * 1024) throw Error('Deployment manifest exceeds Free asset limit');
  await fs.writeFile(path.join(directory, manifestName), bytes, {flag: 'wx'});
  return hash(bytes);
}
export async function verifyArtifact(directory, buildCommit, expectedDigest) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest || '')) throw Error('Trusted website-job manifest digest required');
  const bytes = await fs.readFile(path.join(directory, manifestName));
  if (hash(bytes) !== expectedDigest) throw Error('Deployment artifact manifest changed');
  const manifest = JSON.parse(bytes);
  if (manifest.version !== 1 || manifest.target !== 'https://loghub.pages.dev/' || !/^[a-f0-9]{40}$/.test(buildCommit || '') || manifest.build_commit !== buildCommit || manifest.policy_sha256 !== hash(await fs.readFile(policyFile))) throw Error('Stale artifact or policy; rebuild from current protected main instead of replaying a rollback');
  assertDeployable(JSON.parse(await fs.readFile(path.join(directory, 'site-provenance.json'))));
  if (JSON.stringify(await inventory(directory)) !== JSON.stringify(manifest.files)) throw Error('Deployment artifact file inventory changed');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, directory = '.site/production', commit, digest] = process.argv.slice(2);
  if (command === 'seal') {
    const sha256 = await sealArtifact(directory, commit);
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `manifest_sha256=${sha256}\n`);
    console.log(`Root-path production artifact sealed: ${sha256}`);
  } else if (command === 'verify') {await verifyArtifact(directory, commit, digest); console.log('Exact production artifact and current policy verified');}
  else throw Error('usage: check-deployment.js seal DIRECTORY BUILD_SHA | verify DIRECTORY BUILD_SHA TRUSTED_MANIFEST_SHA256');
}
