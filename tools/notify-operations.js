import {GitHub} from '../src/github.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {repoSlug} from '../src/records.js';

export async function notifyOperations(api, repository, {failed, runId, selfTest = false}) {
  repoSlug('https://github.com/' + repository);
  if (!/^[1-9][0-9]*$/.test(String(runId))) throw Error('invalid operations notification context');
  const label = selfTest ? 'loghub-operations-test' : 'loghub-operations';
  const title = selfTest ? '[Operations test] Controlled notification self-test' : '[Operations] Backup or publication needs attention';
  const issues = await api.request(`/repos/${repository}/issues?state=all&labels=${label}&per_page=100`);
  if (!Array.isArray(issues)) throw Error('invalid operations issue list');
  let issue = issues.find(i => i.title === title && !i.pull_request);
  if (!failed) {
    if (issue?.state === 'open') await api.request(`/repos/${repository}/issues/${issue.number}`, {method: 'PATCH', body: {state: 'closed'}});
    return issue?.number;
  }
  try { await api.request(`/repos/${repository}/labels/${label}`); }
  catch (error) { if (error.status !== 404) throw error; await api.request(`/repos/${repository}/labels`, {method: 'POST', body: {name: label, color: 'b60205', description: 'Automated durable recovery and publication health alerts'}}); }
  const body = `@${repository.split('/')[0]} ${selfTest ? 'Controlled alert self-test; no live backup failure.' : 'A durable recovery or publication check failed.'}\n\nInspect https://github.com/${repository}/actions/runs/${runId}. The previous protected recovery point is retained. Do not treat an unbacked candidate as published.\n\nSee docs/OPERATIONS.md for recovery and credential revocation. No private snapshot data or credentials are included in this alert.`;
  if (!issue) issue = await api.request(`/repos/${repository}/issues`, {method: 'POST', body: {title, body, labels: [label]}});
  else {
    if (issue.state !== 'open') await api.request(`/repos/${repository}/issues/${issue.number}`, {method: 'PATCH', body: {state: 'open'}});
    await api.request(`/repos/${repository}/issues/${issue.number}/comments`, {method: 'POST', body: {body}});
  }
  return issue.number;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!['true', 'false'].includes(process.env.OPERATION_FAILED)) throw Error('OPERATION_FAILED must be true or false');
  notifyOperations(new GitHub(), process.env.GITHUB_REPOSITORY, {failed: process.env.OPERATION_FAILED === 'true', runId: process.env.GITHUB_RUN_ID}).then(n => console.log(`Operations alert synchronized${n ? ': #' + n : ''}`)).catch(error => {console.error(error.message); process.exitCode = 1;});
}
