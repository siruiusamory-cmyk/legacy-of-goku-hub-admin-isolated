import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {fixture, origin} from '../tools/admin/test-fixture.js';
import {handle} from '../admin/worker.js';
import {preparePackage} from '../tools/admin/process.js';

for (const width of [390, 1280]) test(`owner browser workflow, safe content, accessibility and layout at ${width}px`, async ({page, context}) => {
  const x = await fixture(), original = globalThis.fetch; globalThis.fetch = x.fetcher;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-admin-browser-'));
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await x.login();
    await page.setViewportSize({width, height: 900});
    const sub = await x.seed({title: 'Fictional Training <img src=x onerror=alert(1)>'});
    await context.route(origin + '/**', async route => {
      const req = route.request(), data = req.postData();
      const headers = {...req.headers(), 'Cf-Access-Jwt-Assertion': x.token};
      const response = await handle(new Request(req.url(), {method: req.method(), headers, ...(data ? {body: data} : {})}), x.env);
      await route.fulfill({status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer())});
    });
    await page.goto(origin);
    await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Review submission 1'})).toBeVisible();
    await expect(page.locator('#items img')).toHaveCount(0);
    await page.getByRole('button', {name: 'Review submission 1'}).click();
    await page.getByRole('button', {name: 'Start review', exact: true}).click(); await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#details')).toContainText('revision 2');
    await page.getByLabel('Public receipt note', {exact: true}).fill('Please correct the description.');
    await page.getByLabel('Private moderation note').fill('Private browser training evidence');
    await page.getByRole('button', {name: 'Request corrections', exact: true}).click(); await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#details')).toContainText('Awaiting corrections');
    x.db.prepare("UPDATE submissions SET state='received',revision=revision+1 WHERE id=1").run();
    await page.getByRole('button', {name: 'Submission inbox', exact: true}).click(); await page.getByRole('button', {name: 'Review submission 1'}).click();
    await page.getByLabel('Project name', {exact: true}).fill('Fictional Training');
    await page.getByRole('button', {name: 'Prepare private review', exact: true}).click(); await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('Private preparation queued');
    const row = (await (await x.call('/api/reviews')).json()).items[0];
    await x.processCall(row.id, '/claim', {action: 'prepare'});
    await fs.mkdir(path.join(root, 'policy'));
    await fs.writeFile(path.join(root, 'policy/publishing.json'), JSON.stringify({version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: [], external_projects: []}, null, 2) + '\n');
    const png = await sharp({create: {width: 70, height: 40, channels: 3, background: '#a87329'}}).png().toBuffer();
    const prepared = await preparePackage({row, root, fetcher: async () => new Response(png), base: 'a'.repeat(40)});
    for (const file of prepared.buffers) { const bytes = file.bytes.toString('base64'); for (let part = 0; part * 262144 < bytes.length; part++) await x.processCall(row.id, '/file', {name: file.name, part, data: bytes.slice(part * 262144, (part + 1) * 262144)}); }
    expect((await x.processCall(row.id, '/ready', {package: prepared.package})).status).toBe(200);
    await page.getByRole('button', {name: 'Refresh reviews', exact: true}).click();
    await expect(page.getByRole('img', {name: 'Prepared cover artwork'})).toBeVisible();
    await expect.poll(() => page.getByRole('img', {name: 'Prepared cover artwork'}).evaluate(img => img.complete && img.naturalWidth === 640)).toBe(true);
    await page.getByLabel('I reviewed the exact content', {exact: false}).check();
    await page.getByLabel('I inspected all normalized artwork', {exact: false}).check();
    await page.getByLabel('Public receipt decision note').fill('Approved fictional training content.');
    const a11y = await new AxeBuilder({page}).analyze(); expect(a11y.violations).toEqual([]);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', {name: 'Approve exact content and artwork'}).click(); await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('Exact approval recorded');
    await page.getByRole('button', {name: 'Prepare protected publication PR'}).click(); await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('PR preparation queued');
    expect(x.state.dispatched.at(-1).inputs.action).toBe('publish');
    await page.screenshot({path: `.review/013/admin-${width}.png`, fullPage: true});
    await page.getByRole('button', {name: 'Sessions', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Revoke sessions for owner@example.org'})).toBeVisible();
    await page.getByRole('button', {name: 'Revoke sessions for owner@example.org'}).click(); await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('Session revoked');
    expect(errors).toEqual([]);
  } finally { globalThis.fetch = original; x.db.close(); await fs.rm(root, {recursive: true, force: true}); }
});
