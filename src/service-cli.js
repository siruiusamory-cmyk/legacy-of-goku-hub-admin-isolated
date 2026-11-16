import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GitHub} from './github.js';
import {readJSON, saveJSON} from './records.js';
import {listSubmissions, publish, readSnapshot} from './publishing.js';

const root = process.cwd(); const command = process.argv[2];
const api = new GitHub(); const hub = process.env.GITHUB_REPOSITORY;
function requireHub() { if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(hub || '')) throw Error('set GITHUB_REPOSITORY=OWNER/REPO'); }
export async function selectSnapshot(api, hub, currentRun) {
  const repo = await api.request(`/repos/${hub}`);
  if (!Number.isSafeInteger(repo.id) || typeof repo.default_branch !== 'string') throw Error('invalid hub identity');
  const data = await api.request(`/repos/${hub}/actions/workflows/catalog.yml/runs?branch=${encodeURIComponent(repo.default_branch)}&status=completed&per_page=100`);
  if (!Array.isArray(data.workflow_runs)) throw Error('invalid workflow run response');
  for (const run of data.workflow_runs) {
    if (String(run.id) === String(currentRun) || run.head_branch !== repo.default_branch || run.repository?.id !== repo.id || run.head_repository?.id !== repo.id || run.path?.split('@')[0] !== '.github/workflows/catalog.yml' || !['issues', 'schedule', 'push', 'workflow_dispatch'].includes(run.event)) continue;
    if (!Number.isSafeInteger(run.id) || run.id <= 0) throw Error('invalid snapshot run ID');
    const jobs = await api.request(`/repos/${hub}/actions/runs/${run.id}/jobs?per_page=100`);
    if (!Array.isArray(jobs.jobs)) throw Error('invalid publisher job response');
    if (!jobs.jobs.some(j => j.name === 'publish' && j.status === 'completed' && j.conclusion === 'success')) continue;
    const artifacts = await api.request(`/repos/${hub}/actions/runs/${run.id}/artifacts?per_page=100`);
    if (!Array.isArray(artifacts.artifacts)) throw Error('invalid artifact response');
    if (!['catalog-state', 'catalog'].every(name => artifacts.artifacts.some(a => a.name === name && a.expired === false))) throw Error('previous successful publication lacks available catalog/catalog-state artifacts; restore a backup before publishing');
    return String(run.id);
  }
  if (data.total_count > 100) throw Error('no recoverable publisher snapshot in the bounded run history; restore a backup');
  return '';
}
async function main() {
  if (command === 'select-snapshot') {
    requireHub();
    const run = await selectSnapshot(api, hub, process.env.GITHUB_RUN_ID);
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `run_id=${run}\n`);
    else console.log(run || 'no prior successful publication');
  } else if (command === 'publish') {
    requireHub();
    const previous = process.env.SNAPSHOT_DIR || undefined;
    if (previous) {
      try { api.cache = await readJSON(path.join(previous, 'github-cache.json')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const output = path.join(root, '.generated');
    await fs.rm(output, {recursive: true, force: true});
    const issues = await listSubmissions(api, hub);
    for (const entry of await readSnapshot(previous)) {
      if (entry.source.issue && !issues.some(i => i.number === entry.source.issue)) {
        try { issues.push(await api.request(`/repos/${hub}/issues/${entry.source.issue}`)); }
        catch (error) { if (error.status !== 404 && error.status !== 410) throw error; }
      }
    }
    const result = await publish({root, previous, output, api, issues});
    await saveJSON(path.join(output, 'snapshot/github-cache.json'), Object.fromEntries(Object.entries(api.cache).filter(([key]) => api.used.has(key))));
    console.log(`Validated candidate: ${result.catalog.projects.length} projects; ${result.report.filter(r => r.outcome !== 'published').length} review/retention notices. Durable backup and protected receipt are required before publication.`);
  } else if (command === 'feedback') {
    requireHub(); const number = process.env.ISSUE_NUMBER;
    if (!/^[1-9][0-9]{0,8}$/.test(number || '')) throw Error('invalid issue number');
    const report = await readJSON(path.join(root, '.feedback/report.json'));
    const rows = report.filter(r => r.issue === Number(number) || r.issues?.includes(Number(number)));
    const clean = value => String(value).replaceAll('`', '').replaceAll('@', '[at]').slice(0, 3000);
    const message = rows.length ? rows.map(r => `${r.outcome}: ${r.reason || 'validated and included in the catalog artifact'}${r.repository_id ? ` (repository ID ${r.repository_id})` : ''}${r.submission_digest ? `\nSubmission digest: ${r.submission_digest}` : ''}${r.metadata_digest ? `\nMetadata digest: ${r.metadata_digest}` : ''}`).join('\n\n') : 'No eligible submission was found. Use one of the supported forms and preserve the field headings.';
    await api.request(`/repos/${hub}/issues/${number}/comments`, {method: 'POST', body: {body: `LoG Hub validation result\n\n\`\`\`text\n${clean(message)}\n\`\`\`\n\nEdit this issue to retry field errors. Review/retained entries need administrator attention; an unauthorized claim does not change an existing listing. Publication is the catalog artifact, not a deployed website. Automated validation does not establish malware safety.`}});
  } else throw Error('usage: node src/service-cli.js select-snapshot|publish|feedback');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
