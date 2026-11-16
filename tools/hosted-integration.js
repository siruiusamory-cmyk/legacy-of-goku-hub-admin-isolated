import {receiptRulesCoverNamespaces} from './receipt-rules.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {GitHub} from '../src/github.js';
import {readJSON, saveJSON} from '../src/records.js';
import {publish} from '../src/publishing.js';
import {RecoveryStore, payloadFiles, materialize, verifyPublicationFiles} from '../src/recovery.js';
import {assertSourceRevision} from '../src/backup-cli.js';
import {notifyOperations} from './notify-operations.js';

const source = process.env.GITHUB_REPOSITORY;
const phase = process.env.INTEGRATION_PHASE;
const config = await readJSON('policy/integration-recovery.json');
assert.equal(config.purpose, 'integration'); assert.equal(source, config.source_repository);
const api = new GitHub();
const store = new RecoveryStore(config, new GitHub({token: process.env.BACKUP_TOKEN}), api);
const work = path.resolve('.integration/hosted');
const command = process.argv[2];
if (command === 'after-artifact-loss') {
  const artifacts = await api.request(`/repos/${source}/actions/runs/${process.env.GITHUB_RUN_ID}/artifacts?per_page=100`);
  const artifact = artifacts.artifacts.find(a => a.name === 'integration-ephemeral-state');
  assert.ok(artifact && artifact.workflow_run.id === Number(process.env.GITHUB_RUN_ID));
  await api.request(`/repos/${source}/actions/artifacts/${artifact.id}`, {method: 'DELETE'});
  await assert.rejects(api.request(`/repos/${source}/actions/artifacts/${artifact.id}`), /HTTP 404/);
  const point = await store.latest();
  await materialize(point, path.join(work, 'restored-without-artifact'));
  const report = await readJSON(path.join(work, 'report.json'));
  report.actions_artifact_deleted = artifact.id;
  report.restored_without_artifact = point.point;
  const entries = await readJSON(path.join(work, 'restored-without-artifact/registry.json'));
  assert.equal(entries.entries.length, 1);
  await saveJSON(path.join(work, 'report.json'), report);
  console.log('Durable recovery passed after actual Actions artifact deletion.');
} else {
  assert.ok(['manifest-first', 'manifest-update', 'guided-first', 'guided-update'].includes(phase));
  const fixture = 'siruiusamory-cmyk/legacy-of-goku-hub-integration-fixture';
  const fixtureId = 1458327252;
  const production = await readJSON('policy/publishing.json');
  assert.ok(production.projects.some(p => p.repository_id === fixtureId && p.decision === 'delisted'));
  const issueNumber = process.env.INTEGRATION_ISSUE_NUMBER;
  assert.match(issueNumber || '', /^[1-9][0-9]*$/);
  const issue = await api.request(`/repos/${source}/issues/${issueNumber}`);
  const repo = await api.request(`/repos/${fixture}`);
  assert.equal(repo.id, fixtureId); assert.equal(repo.private, false); assert.equal(issue.user.id, repo.owner.id);
  assert.ok(issue.title.includes('Integration') || issue.title.includes('integration'));
  assert.equal(issue.body.includes('Repository manifest'), phase.startsWith('manifest'));
  await fs.mkdir(path.join(work, 'root/records'), {recursive: true});
  const root = path.join(work, 'root'); const output = path.join(work, 'output');
  const untrustedPolicy = {version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: []};
  await saveJSON(path.join(root, 'policy/publishing.json'), untrustedPolicy);
  let previous;
  if (phase.endsWith('update')) {
    previous = path.join(work, 'previous'); await materialize(await store.latest(), previous);
  } else {
    const held = await publish({root, output: path.join(work, 'untrusted'), api, issues: [issue]});
    assert.equal(held.catalog.projects.length, 0);
    assert.ok(held.report.some(r => r.outcome === 'review'));
  }
  const approvedFixturePolicy = await readJSON('policy/integration-content.json');
  assert.ok(approvedFixturePolicy.projects.every(p => p.repository_id === fixtureId), 'integration policy must not authorize community projects');
  assert.ok(approvedFixturePolicy.projects.some(p => p.repository_id === fixtureId && p.decision === 'approved'), 'review fixture artwork locally and merge exact approvals into policy/integration-content.json before hosted integration');
  await saveJSON(path.join(root, 'policy/publishing.json'), approvedFixturePolicy);
  const attackerBody = [
    ['Repository URL', 'https://github.com/' + fixture], ['Submission method', 'Guided form'], ['Request', 'Claim ownership'],
    ['Project title', 'UNAUTHORIZED BOT CHANGE'], ['Developer or team', 'LoG Hub operational tests'],
    ['Description', 'Unauthorized integration claim, intentionally rejected by real GitHub numeric identity.'],
    ['Base game', 'multiple'], ['Category', 'tool'], ['Development status', 'released'], ['Cover image', 'images/cover.png'], ['Screenshots', 'images/screen.png']
  ].map(([label, value]) => `### ${label}\n\n${value}`).join('\n\n');
  const attacker = await api.request(`/repos/${source}/issues`, {method: 'POST', body: {title: '[Claim] Integration-only unauthorized bot claim', body: attackerBody}});
  assert.notEqual(attacker.user.id, repo.owner.id);
  try {
    const result = await publish({root, previous, output, api, issues: [issue, attacker]});
    assert.equal(result.catalog.projects.length, 1);
    const registration = (await readJSON(path.join(output, 'snapshot/registry.json'))).entries[0];
    assert.equal(registration.source.method, phase.startsWith('manifest') ? 'manifest' : 'guided');
    const project = result.catalog.projects[0];
    assert.equal(project.repository_id, fixtureId); assert.notEqual(project.title, 'UNAUTHORIZED BOT CHANGE');
    assert.equal(project.ownership.claim, 'repository-controlled'); assert.equal(project.ownership.representation_verified, false);
    assert.equal(project.release.version, process.env.EXPECTED_VERSION); assert.ok(project.release.file_size > 0);
    assert.ok(result.report.some(r => r.issue === attacker.number && r.outcome === 'review'));
    const cover = await sharp(path.join(output, 'work/dist', project.cover)).metadata(); assert.equal(cover.width, 640); assert.equal(cover.height, 360);
    const screen = await sharp(path.join(output, 'work/dist', project.screenshots[0])).metadata(); assert.equal(screen.width, 480); assert.equal(screen.height, 320);
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
    await assertSourceRevision(api, config, revision);
    const points = await store.points();
    const provenance = {source_commit: revision, run_id: Number(process.env.GITHUB_RUN_ID), workflow: '.github/workflows/hosted-integration.yml', ref: 'refs/heads/main', kind: points.length ? 'publication' : 'initialization'};
    const point = await store.backup(await payloadFiles(path.join(output, 'snapshot'), path.join(output, 'work/dist/catalog.json')), provenance, process.env.INTEGRATION_SIGNING_KEY, {initialize: !points.length});
    await store.anchor(point);
    const protectedPoint = await store.latest();
    await verifyPublicationFiles(protectedPoint, path.join(output, 'work/dist'));
    const privateTag = `tags/loghub-integration-v1/${point.point}`;
    const otherPrivateCommit = await store.api.request(`/repos/${config.backup_repository}/git/ref/heads/main`);
    await assert.rejects(store.api.request(`/repos/${config.backup_repository}/git/refs/${privateTag}`, {method: 'PATCH', body: {sha: otherPrivateCommit.object.sha, force: true}}), error => [403, 422].includes(error.status));
    const stillLocked = await store.api.request(`/repos/${config.backup_repository}/git/ref/${privateTag}`);
    assert.equal(stillLocked.object.sha, point.commit);
    const probe = `tags/loghub-integration-anchor-v1/${point.point}-${point.commit}`;
    const commits = await api.request(`/repos/${source}/commits?per_page=2`);
    const otherSourceCommit = commits.find(c => c.sha !== point.envelope.provenance.source_commit);
    assert.ok(otherSourceCommit);
    await assert.rejects(api.request(`/repos/${source}/git/refs/${probe}`, {method: 'PATCH', body: {sha: otherSourceCommit.sha, force: true}}), error => [403, 422].includes(error.status));
    await assert.rejects(api.request(`/repos/${source}/git/refs/${probe}`, {method: 'DELETE'}), error => [403, 422].includes(error.status));
    const receipt = await api.request(`/repos/${source}/git/ref/${probe}`);
    assert.equal(receipt.object.sha, point.envelope.provenance.source_commit);
    const rulesets = await api.request(`/repos/${source}/rulesets`);
    let productionRulesVerified = false;
    for (const summary of rulesets.filter(r => r.target === 'tag' && r.enforcement === 'active')) {
      const rules = await api.request(`/repos/${source}/rulesets/${summary.id}`);
      if (receiptRulesCoverNamespaces(rules)) productionRulesVerified = true;
    }
    assert.equal(productionRulesVerified, true);
    await materialize(protectedPoint, path.join(work, 'restored'));
    const policyRoot = path.join(work, 'delisting'); await fs.mkdir(path.join(policyRoot, 'records'), {recursive: true});
    await saveJSON(path.join(policyRoot, 'policy/publishing.json'), {...untrustedPolicy, projects: [{repository_id: fixtureId, owner_id: repo.owner.id, decision: 'delisted'}]});
    const delisted = await publish({root: policyRoot, previous: path.join(work, 'restored'), output: path.join(work, 'delisted-output'), api, issues: []});
    assert.equal(delisted.catalog.projects.length, 0);
    await saveJSON(path.join(work, 'report.json'), {integration_only: true, phase, fixture_repository: fixture, fixture_repository_id: fixtureId,
      actual_owner_id: repo.owner.id, owner_issue: issue.number, rejected_bot_issue: attacker.number, rejected_bot_user_id: attacker.user.id,
      submission_method: registration.source.method, version: project.release.version, file_size: project.release.file_size, sha256: project.release.sha256,
      cover: [cover.width, cover.height], screenshot: [screen.width, screen.height], point: point.point, backup_commit: point.commit,
      recovered: true, current_delisting_reapplied: true, no_routine_update_approval: phase.endsWith('update'), production_catalog_contains_fixture: false,
      private_tag_force_update_blocked: true, public_receipt_update_blocked: true, public_receipt_delete_blocked: true, production_receipt_rules_verified: productionRulesVerified});
    if (phase === 'guided-update') {
      const alert = await notifyOperations(api, source, {failed: true, runId: process.env.GITHUB_RUN_ID, selfTest: true});
      assert.equal((await api.request(`/repos/${source}/issues/${alert}`)).state, 'open');
      await notifyOperations(api, source, {failed: false, runId: process.env.GITHUB_RUN_ID, selfTest: true});
      assert.equal((await api.request(`/repos/${source}/issues/${alert}`)).state, 'closed');
      const report = await readJSON(path.join(work, 'report.json')); report.operational_alert_test = alert;
      await saveJSON(path.join(work, 'report.json'), report);
    }
    console.log('Live GitHub integration passed:', phase, project.release.version, point.point);
  } finally {
    await api.request(`/repos/${source}/issues/${attacker.number}`, {method: 'PATCH', body: {state: 'closed'}});
  }
}

