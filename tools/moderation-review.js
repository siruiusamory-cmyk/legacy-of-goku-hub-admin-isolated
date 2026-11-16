import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GitHub, repositoryInfo, releaseInfo} from '../src/github.js';
import {loadManifest, manifestRecord, parseSubmission} from '../src/intake.js';
import {inspectImages, writeImages} from '../src/images.js';
import {contentDigest} from '../src/moderation.js';
import {saveJSON} from '../src/records.js';
import {checkDownload} from '../src/pipeline.js';

export function reviewDestination(destination, env = process.env) {
  if (env.GITHUB_ACTIONS || env.CI) throw Error('artwork review is local-only, not a CI/public preview operation');
  if (!destination) throw Error('supply a new private local directory outside this repository');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const target = path.resolve(destination); const relative = path.relative(root, target);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('review directory must be outside the public source repository');
  return target;
}
async function main() {
  const [method, input, destination] = process.argv.slice(2);
  const target = reviewDestination(destination);
  const api = new GitHub(); let candidate;
  if (method === '--issue') {
    if (!/^[1-9][0-9]{0,8}$/.test(input || '') || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.GITHUB_REPOSITORY || '')) throw Error('set GITHUB_REPOSITORY and supply an issue number');
    candidate = parseSubmission(await api.request(`/repos/${process.env.GITHUB_REPOSITORY}/issues/${input}`));
  } else if (method !== '--repository') throw Error('usage: node tools/moderation-review.js --repository URL|--issue NUMBER PRIVATE-DIRECTORY');
  const repo = await repositoryInfo(api, {repository: candidate?.repository || input});
  let metadata, commit;
  if (!candidate || candidate.method === 'Repository manifest') ({metadata, commit} = await loadManifest(api, repo));
  else {metadata = candidate.metadata; commit = (await api.request(`/repos/${repo.url.slice(19)}/commits/HEAD`)).sha;}
  const record = manifestRecord(metadata, repo, commit);
  const release = await releaseInfo(api, record, repo);
  if (release) await checkDownload(release.download_url);
  const inspected = await inspectImages(record);
  await fs.mkdir(target, {recursive: false});
  await writeImages(record, target, inspected.outputs);
  await saveJSON(path.join(target, 'review.json'), {record, repository: repo, release, ownership_warning: 'Repository control does not establish team representation or artwork rights.',
    proposed_policy: {repository_id: repo.id, owner_id: repo.owner_id, project_id: record.id, decision: 'approved', content_digests: [contentDigest(record, repo, release)], artwork_sets: [inspected.artwork],
      ...(candidate ? {approved_issue: candidate.number, approved_digest: candidate.digest} : {})}});
  console.log('Review saved locally. Inspect every image and metadata field; proposed policy is NOT approval. Never upload this directory.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {console.error(error.message); process.exitCode = 1;});
