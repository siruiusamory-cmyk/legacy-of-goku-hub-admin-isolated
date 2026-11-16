import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notifyOperations} from '../tools/notify-operations.js';
import fs from 'node:fs/promises';
import YAML from 'yaml';

test('operational failures create one owner notification, repeat by comment, and close on recovery', async () => {
  let issue; let creates = 0; let comments = 0;
  const api = {request: async (endpoint, options = {}) => {
    if (endpoint.includes('/issues?')) return issue ? [{...issue}] : [];
    if (endpoint.includes('/labels/')) return {name: 'loghub-operations'};
    if (endpoint.endsWith('/issues') && options.method === 'POST') {creates++; issue = {...options.body, number: 1, state: 'open'}; return {...issue};}
    if (endpoint.endsWith('/comments')) {comments++; return {};}
    if (options.method === 'PATCH') {issue.state = options.body.state; return {...issue};}
    throw Error('unexpected notification operation');
  }};
  const context = {failed: true, runId: 123};
  await notifyOperations(api, 'owner/hub', context); await notifyOperations(api, 'owner/hub', context);
  assert.equal(creates, 1); assert.equal(comments, 1); assert.match(issue.body, /@owner/);
  assert.ok(!issue.body.includes('BACKUP_TOKEN'));
  await notifyOperations(api, 'owner/hub', {...context, failed: false}); assert.equal(issue.state, 'closed');
  await assert.rejects(notifyOperations(api, '../unsafe', context), /repository/);
});
test('alert self-tests cannot close an existing real incident', async () => {
  const real = {number: 1, title: '[Operations] Backup or publication needs attention', state: 'open', labels: ['loghub-operations']};
  const issues = [real];
  const api = {request: async (endpoint, options = {}) => {
    if (endpoint.includes('/issues?')) {const label = new URL('https://example.invalid' + endpoint).searchParams.get('labels'); return issues.filter(i => i.labels.includes(label)).map(i => ({...i}));}
    if (endpoint.includes('/labels/')) return {};
    if (endpoint.endsWith('/issues') && options.method === 'POST') {const issue = {...options.body, number: issues.length + 1, state: 'open'}; issues.push(issue); return {...issue};}
    if (endpoint.endsWith('/comments')) return {};
    if (options.method === 'PATCH') {const issue = issues.find(i => endpoint.endsWith('/' + i.number)); issue.state = options.body.state; return {...issue};}
    throw Error('unexpected test notification operation');
  }};
  const context = {failed: true, runId: 123, selfTest: true};
  const testIssue = await notifyOperations(api, 'owner/hub', context);
  await notifyOperations(api, 'owner/hub', {...context, failed: false});
  assert.equal(real.state, 'open'); assert.notEqual(testIssue, real.number);
  assert.equal(issues.find(i => i.number === testIssue).state, 'closed');
});
test('all production alert writers share one non-cancelling GitHub job lock', async () => {
  const locks = [];
  for (const name of ['catalog.yml', 'backup-health.yml']) {
    const workflow = YAML.parse(await fs.readFile(new URL('../.github/workflows/' + name, import.meta.url), 'utf8'));
    locks.push(workflow.jobs.notify.concurrency);
  }
  assert.deepEqual(locks, [{group: 'loghub-operations-alert', 'cancel-in-progress': false}, {group: 'loghub-operations-alert', 'cancel-in-progress': false}]);
});

test('receipt coverage handles GitHub limited-token visibility without accepting explicit bypasses', async () => {
  const {receiptRulesCoverNamespaces} = await import('../tools/receipt-rules.js');
  const rules = {target: 'tag', enforcement: 'active', conditions: {ref_name: {include: ['refs/tags/loghub-anchor-v1/**', 'refs/tags/loghub-integration-anchor-v1/**'], exclude: []}}, rules: [{type: 'update'}, {type: 'deletion'}]};
  assert.equal(receiptRulesCoverNamespaces(rules), true);
  assert.equal(receiptRulesCoverNamespaces({...rules, bypass_actors: []}), true);
  assert.equal(receiptRulesCoverNamespaces({...rules, bypass_actors: [{actor_id: 1}]}), false);
  assert.equal(receiptRulesCoverNamespaces({...rules, enforcement: 'disabled'}), false);
});

test('successful GitHub writes invalidate cached reads before notification cleanup', async () => {
  const {GitHub} = await import('../src/github.js');
  let exists = false; let state = 'open';
  const endpoint = '/repos/owner/hub/issues?state=all&labels=loghub-operations-test&per_page=100';
  const api = new GitHub({token: null, fetcher: async (url, options) => {
    const route = new URL(url).pathname + new URL(url).search;
    if (options.method === 'GET' && route === endpoint) {
      if (options.headers['If-None-Match']) return new Response(null, {status: 304});
      return Response.json(exists ? [{number: 1, title: '[Operations test] Controlled notification self-test', state}] : [], {headers: {etag: 'fixture'}});
    }
    if (route.includes('/labels/')) return Response.json({});
    if (options.method === 'POST' && route.endsWith('/issues')) {exists = true; return Response.json({number: 1});}
    if (options.method === 'PATCH') {state = JSON.parse(options.body).state; return Response.json({number: 1, state});}
    throw Error('unexpected API route');
  }});
  await notifyOperations(api, 'owner/hub', {failed: true, runId: 123, selfTest: true});
  await notifyOperations(api, 'owner/hub', {failed: false, runId: 123, selfTest: true});
  assert.equal(state, 'closed');
});
