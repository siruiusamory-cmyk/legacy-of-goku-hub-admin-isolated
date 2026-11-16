import fs from 'node:fs/promises';
import path from 'node:path';
import {loadRecords, parseIssue, readJSON, saveJSON, validateRecord} from './records.js';
import {processImages} from './images.js';
import {verifySubmitter, synchronize} from './github.js';

export async function checkPendingDuplicates(api, hub, number, record) {
  for (let page = 1; page <= 10; page++) {
    const issues = await api.request(`/repos/${hub}/issues?state=open&sort=created&direction=asc&per_page=100&page=${page}`);
    if (!Array.isArray(issues) || issues.length > 100) throw Error('GitHub: invalid submission issue list');
    for (const issue of issues) {
      if (!Number.isSafeInteger(issue.number) || issue.number >= Number(number) || issue.pull_request || !issue.title?.startsWith('[Submission]')) continue;
      let other;
      try { other = validateRecord(parseIssue(issue.body)); } catch { continue; }
      if (other.id === record.id || other.repository.toLowerCase() === record.repository.toLowerCase()) throw Error(`duplicate pending submission: resolve issue #${issue.number} first`);
    }
    if (issues.length < 100) return;
  }
  throw Error('too many open issues to safely check duplicates; ask a moderator to resolve old submissions');
}

export async function validateSubmission({root, body, login, api, fetcher = fetch, output}) {
  const records = await loadRecords(root);
  const record = validateRecord(parseIssue(body), records);
  if (record.featured) throw Error('featured is moderator-only; omit it from submissions');
  const state = await synchronize(api, record);
  const repository = state.repository;
  await verifySubmitter(api, repository, login);
  for (const existing of records) {
    const state = await readJSON(path.join(root, 'state', existing.id + '.json'));
    if (state.repository.id === repository.id) throw Error('duplicate GitHub repository identity (possibly renamed)');
  }
  await processImages(record, output, fetcher);
  await saveJSON(path.join(output, 'records', record.id + '.json'), record);
  await saveJSON(path.join(output, 'state', record.id + '.json'), state);
  return record;
}
export async function refresh(root, api, fetcher = fetch) {
  const report = [];
  for (const record of await loadRecords(root)) {
    let previous;
    try { previous = await readJSON(path.join(root, 'state', record.id + '.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const state = await synchronize(api, record, previous);
    const images = [];
    for (const url of [record.cover, ...(record.screenshots || [])]) {
      try {
        const response = await fetcher(url, {method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000)});
        if (!response.ok) images.push(`image link HTTP ${response.status}: ${url}`);
      } catch { images.push(`image link unavailable: ${url}`); }
    }
    let downloadWarning = null;
    if (state.release) {
      try { await checkDownload(state.release.download_url, fetcher); }
      catch (error) { downloadWarning = error.message; }
    }
    await saveJSON(path.join(root, 'state', record.id + '.json'), state);
    report.push({id: record.id, availability: state.availability, warning: state.warning, image_warnings: images, download_warning: downloadWarning});
  }
  await saveJSON(path.join(root, 'report.json'), report);
  return report;
}
export async function checkDownload(url, fetcher = fetch) {
  for (let hop = 0; hop < 4; hop++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'].includes(parsed.hostname)) throw Error('download link: unsafe redirect host');
    const response = await fetcher(url, {method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000)});
    if (response.ok) return;
    if ([301, 302, 307, 308].includes(response.status) && response.headers.get('location')) { url = new URL(response.headers.get('location'), url).href; continue; }
    throw Error(`download link HTTP ${response.status}; previous metadata retained`);
  }
  throw Error('download link: too many redirects');
}
export async function copyStaged(root, staged) {
  for (const directory of ['records', 'state', 'assets']) {
    await fs.mkdir(path.join(root, directory), {recursive: true});
    for (const name of await fs.readdir(path.join(staged, directory))) {
      await fs.cp(path.join(staged, directory, name), path.join(root, directory, name), {recursive: true, force: false, errorOnExist: true});
    }
  }
}
