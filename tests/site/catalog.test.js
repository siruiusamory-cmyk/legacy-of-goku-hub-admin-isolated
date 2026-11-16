import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fixtureInput} from '../../tools/site/fixtures.js';
import {validateSiteCatalog} from '../../tools/site/catalog.js';
import {assertDeployable} from '../../tools/site/check-deployment.js';
import YAML from 'yaml';

test('site validates both full fixture and empty catalog with stable identities', async t => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loghub-site-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const {catalog,provenance}=await fixtureInput(dir);
  assert.equal((await validateSiteCatalog(catalog)).projects.length,7);
  assert.equal((await validateSiteCatalog((await fixtureInput(dir,true)).catalog)).projects.length,0);
  assert.throws(()=>assertDeployable(provenance),/fixtures/);
  const duplicate=structuredClone(catalog);duplicate.projects.push(duplicate.projects[0]);
  await assert.rejects(validateSiteCatalog(duplicate),/duplicate/);
  for (const mutation of [p=>p.cover='../../key.pem',p=>p.screenshots=['assets/other/screenshot-1.webp'],p=>p.repository='javascript:alert(1)',p=>p.release.download_url='https://example.org/game.zip',p=>p.links=[{label:'unsafe',url:'javascript:alert(1)'}],p=>p.links=[{label:'unsafe',url:'https://github.com@evil.example/'}]]) {
    const altered=structuredClone(catalog);mutation(altered.projects[0]);await assert.rejects(validateSiteCatalog(altered));
  }
  const sorts=structuredClone(catalog);sorts.sort.name=['absent'];await assert.rejects(validateSiteCatalog(sorts),/sort/);
});
test('frontend deployment is default-branch gated, production-only and separated from write credentials', async () => {
  const workflow=YAML.parse(await fs.readFile('.github/workflows/catalog.yml','utf8'));
  assert.equal(workflow.jobs.website.needs,'publish');
  assert.deepEqual(workflow.jobs.website.permissions,{contents:'read',actions:'read'});
  assert.match(workflow.jobs['deploy-website'].if,/SITE_DEPLOYMENT_ENABLED/);
  assert.match(workflow.jobs['deploy-website'].if,/default_branch/);
  assert.match(workflow.jobs['deploy-website'].if,/ref_protected/);
  assert.deepEqual(workflow.jobs['deploy-website'].needs,['publish','website']);
  assert.equal(workflow.jobs['deploy-website'].environment.name,'cloudflare-pages');
  assert.equal(workflow.jobs['deploy-website'].environment.url,'https://loghub.pages.dev/');
  assert.deepEqual(workflow.jobs['deploy-website'].permissions,{contents:'read',actions:'read'});
  assert.ok(workflow.jobs['deploy-website'].steps.some(s=>s.name==='Reject a stale source revision before deployment'));
  assert.ok(workflow.jobs.website.steps.some(s=>s.id==='seal'));
  assert.equal(workflow.jobs.website.steps.find(s=>s.run==='npm run site:build -- --snapshot .previous').env.SITE_BASE,'/');
  assert.ok(workflow.jobs.website.steps.some(s=>s.run==='npm run site:build -- --snapshot .previous'));
  assert.ok(!JSON.stringify(workflow.jobs['deploy-website']).includes('BACKUP_'));
  const upload=workflow.jobs['deploy-website'].steps.find(s=>s.uses?.startsWith('cloudflare/wrangler-action@'));
  assert.match(upload.with.command,/^pages deploy website --project-name=loghub --branch=main --commit-hash=/);
  assert.match(upload.with.preCommands,/check-deployment.js/);
  const download=workflow.jobs['deploy-website'].steps.find(s=>s.uses?.startsWith('actions/download-artifact@'));
  assert.equal(download.with['artifact-ids'],'${{ needs.website.outputs.artifact_id }}');
  assert.ok(!JSON.stringify(workflow).includes('deploy-pages@')&&!JSON.stringify(workflow).includes('upload-pages-artifact@'));
  for(const [name,job] of Object.entries(workflow.jobs))if(name!=='deploy-website')assert.ok(!JSON.stringify(job).includes('secrets.CLOUDFLARE_'));
});
