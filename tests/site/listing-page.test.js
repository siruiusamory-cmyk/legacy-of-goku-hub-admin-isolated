import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {readJSON, saveJSON} from '../../src/records.js';
import {GitHub} from '../../src/github.js';
import {publish} from '../../src/publishing.js';
import {adoptListing, prepareListing, applyClaim} from '../../src/intake-admin.js';
import {validateSiteCatalog} from '../../tools/site/catalog.js';
import {detailImage} from '../../tools/site/artwork.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const png = await sharp({create: {width: 320, height: 200, channels: 3, background: '#c03050'}}).png().toBuffer();
const offline = new GitHub({token: '', fetcher: async () => { throw Error('offline'); }});
const fetcher = async url => /\.png$/.test(url) ? new Response(png) : new Response('missing', {status: 404});

test('an approved external submission becomes a generated project page with accurate links', {timeout: 120000}, async t => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-page-'));
  t.after(() => fs.rm(work, {recursive: true, force: true}));
  const repo = path.join(work, 'repo');
  await fs.mkdir(path.join(repo, 'records'), {recursive: true});
  await saveJSON(path.join(repo, 'policy/publishing.json'), {version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: [], external_projects: []});
  const submission = {id: 1, payload: {kind: 'suggest', relation: 'third-party', url: 'https://forum.example.org/threads/page-test.7/', title: 'Page Test Hack', category: 'rom-hack', description: 'A forum hosted ROM hack used to verify the generated project page.', patch_url: 'https://files.example.org/page-test.bps', artwork: ['https://img.example.org/cover.png']}};
  const prepared = await prepareListing({submission, directory: path.join(work, 'private'), api: offline, fetcher, overrides: {game: 'legacy-of-goku'}});
  await adoptListing({directory: path.join(work, 'private'), root: repo, approve: true});
  const result = await publish({root: repo, output: path.join(work, 'out'), api: offline, issues: [], fetcher});
  const catalog = result.catalog;
  await validateSiteCatalog(catalog);
  const input = path.join(work, 'input');
  const artwork = {};
  for (const project of catalog.projects) {
    for (const image of [project.cover, ...project.screenshots]) {
      await fs.mkdir(path.dirname(path.join(input, 'public', image)), {recursive: true});
      await fs.copyFile(path.join(work, 'out/work/dist', image), path.join(input, 'public', image));
    }
    const detail = await detailImage(await fs.readFile(path.join(input, 'public', project.cover)));
    const src = `assets/${project.id}/detail.webp`;
    await fs.writeFile(path.join(input, 'public', src), detail.data);
    artwork[project.id] = {src, width: detail.width, height: detail.height};
  }
  await fs.writeFile(path.join(input, 'artwork.json'), JSON.stringify(artwork));
  await fs.writeFile(path.join(input, 'catalog.json'), JSON.stringify(catalog));
  await fs.writeFile(path.join(input, 'provenance.json'), JSON.stringify({purpose: 'fixture', base: '/'}));
  await fs.writeFile(path.join(input, 'public/catalog.json'), JSON.stringify(catalog));
  const built = spawnSync(process.execPath, [path.join(root, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', path.join(root, 'website')], {encoding: 'utf8', env: {...process.env, SITE_BASE: '/', SITE_INPUT: input, SITE_PUBLIC: path.join(input, 'public'), SITE_OUT: path.join(work, 'site')}, windowsHide: true});
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const page = await fs.readFile(path.join(work, 'site/projects', prepared.id, 'index.html'), 'utf8');
  assert.match(page, /Page Test Hack/);
  assert.match(page, />Download Patch</);
  assert.match(page, /href="https:\/\/files\.example\.org\/page-test\.bps"/);
  assert.match(page, />Visit Project</);
  assert.doesNotMatch(page, /View Repository|Download on GitHub/);
  assert.match(page, /Community forum/);
  assert.match(page, /not yet claimed/);
  assert.match(page, /issues\/new\?template=submit\.yml&amp;title=/);
  assert.match(page, /%5BClaim%5D/);
  const home = await fs.readFile(path.join(work, 'site/index.html'), 'utf8');
  assert.match(home, new RegExp(`data-id="${prepared.id}"`));
  assert.match(home, /aria-label="Download Patch for Page Test Hack"/);
  assert.match(home, /href="https:\/\/github\.com\/siruiusamory-cmyk\/legacy-of-goku-hub\/issues\/new\/choose"/);
  const form = await fs.readFile(path.join(work, 'site/submit/index.html'), 'utf8');
  assert.match(form, /Submissions are not open yet/);
  assert.match(form, new RegExp(`value="${prepared.id}">Page Test Hack`));
  await applyClaim({root: repo, listingId: prepared.id, claim: {method: 'manual', proof_digest: 'd'.repeat(64), verified_at: '2026-11-01T00:00:00Z'}});
  const claimed = await publish({root: repo, output: path.join(work, 'out2'), api: offline, issues: [], previous: path.join(work, 'out/snapshot'), fetcher});
  assert.equal(claimed.catalog.projects[0].ownership.claim, 'verified-claim');
});
