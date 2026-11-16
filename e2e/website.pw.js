import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
test.beforeEach(async ({context}) => {
  await context.route('**/*',route => /^http:\/\/127\.0\.0\.1:(4321|4322|4323)\//.test(route.request().url()) ? route.continue() : route.abort());
});
test('search, combined filters, reset and deterministic sorting work', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.project-card')).toHaveCount(7);
  await page.getByRole('searchbox').fill('CapsuleWorks');
  await expect(page.locator('.project-card:visible')).toHaveCount(1);
  await page.getByRole('button',{name:'Show all projects and reset filters'}).click();
  await page.getByLabel('Base game',{exact:true}).selectOption('legacy-of-goku-2');
  await page.getByLabel('Project category',{exact:true}).selectOption('tool');
  await expect(page.locator('.project-card:visible')).toHaveCount(1);
  await page.getByLabel('Development status',{exact:true}).selectOption('in-development');
  await expect(page.getByText('No matching projects',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear filters'}).click();
  await page.getByLabel('Sort projects',{exact:true}).selectOption('updated');
  await expect(page.locator('.project-card').first()).toHaveAttribute('data-id','fixture-6');
  await page.getByLabel('Sort projects',{exact:true}).selectOption('release');
  await expect(page.locator('.project-card').first()).toHaveAttribute('data-id','fixture-6');
  await page.getByLabel('Sort projects',{exact:true}).selectOption('name');
  await expect(page.locator('.project-card').first()).toHaveAttribute('data-id','fixture-4');
});
test('stable detail navigation, actual metadata and safe external actions', async ({page}) => {
  await page.goto('/');await page.getByRole('link',{name:'View Project',exact:true}).click();
  await expect(page).toHaveURL(/\/projects\/fixture-0\/$/);
  await expect(page.getByRole('heading',{level:1})).toHaveText('Saiyan Legacy Reborn');
  await expect(page.locator('.project-information')).toContainText('fixture-v1');
  await expect(page.locator('.screenshot-gallery img')).toHaveCount(3);
  await expect(page.getByRole('link',{name:'View Repository',exact:true})).toHaveAttribute('href','https://github.com/fixture-owner/fixture-0');
  await expect(page.getByRole('link',{name:'Download on GitHub',exact:true})).toHaveAttribute('href',/github\.com\/fixture-owner\/fixture-0\/releases\/download\/fixture-v1\/fixture.zip$/);
  await page.getByRole('link',{name:'All Projects',exact:true}).click();await expect(page).toHaveURL(/\/#directory$/);
});
test('seven-ball selection supports keyboard and pointer without persistence or voting', async ({page}) => {
  await page.goto('/projects/fixture-0/');
  await expect(page.locator('.rating-choice strong')).toHaveCount(0);
  for (let number=1;number<=7;number++) await expect(page.locator(`.rating-options [data-ball="${number}"] polygon`)).toHaveCount(number);
  const requests=[];page.on('request',r=>{if(r.method()!=='GET')requests.push(r.url());});
  const first=page.getByRole('radio',{name:'1 Dragon Ball',exact:true});await first.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio',{name:'2 Dragon Balls',exact:true})).toBeChecked();
  await page.getByRole('radio',{name:'7 Dragon Balls',exact:true}).check();
  await expect(page.locator('.rating-selector')).toHaveText('Preview only · not saved');
  expect(requests).toEqual([]);expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
  await page.reload();await expect(page.getByRole('radio',{checked:true})).toHaveCount(0);
});
test('in-development detail omits unavailable release metadata and safely renders untrusted text', async ({page}) => {
  await page.goto('/projects/fixture-1/');
  await expect(page.locator('.release-panel')).toHaveCount(0);await expect(page.getByRole('link',{name:'Download on GitHub',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Screenshots',exact:true})).toHaveCount(0);
  await expect(page.locator('.community-rating')).toContainText('Not rated yet');
  await page.goto('/projects/fixture-6/');await expect(page.locator('.description-box')).toContainText('<img src=x onerror="window.fixtureInjected=true">');
  expect(await page.evaluate(()=>window.fixtureInjected)).toBeUndefined();await expect(page.locator('img[src="x"]')).toHaveCount(0);
});
test('empty catalog is polished, honest, unrated and contains no synthetic projects', async ({page}) => {
  await page.goto('http://127.0.0.1:4322/');
  expect(await (await page.request.get('http://127.0.0.1:4322/site-provenance.json')).json()).toMatchObject({purpose:'fixture'});
  await expect(page.getByRole('heading',{name:'The adventure starts here.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Submit your project'})).toHaveAttribute('href','https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/issues/new/choose');
  await expect(page.locator('.project-card')).toHaveCount(0);
  await expect(page.getByRole('heading',{level:1})).toContainText('A new home');
});
for (const width of [320,390,430,760,941,1024,1448]) test(`responsive home and detail have no overflow at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:1086});
  for (const route of ['/','/projects/fixture-0/','/projects/fixture-1/','/projects/fixture-6/']) {
    await page.goto(route);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.goto('http://127.0.0.1:4323/projects/fixture-6/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('W'.repeat(100));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width<=900){await page.goto('/');await page.getByLabel('Open navigation').click();await expect(page.getByRole('link',{name:'Submit a project',exact:true}).first()).toBeVisible();}
});
for (const [route,width] of [['/',1448],['/projects/fixture-0/',1448],['/',390],['/projects/fixture-0/',390],['http://127.0.0.1:4322/',390]]) test(`WCAG automated checks ${route} ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:1086});await page.goto(route);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
});
test('keyboard skip link and mobile touch rating have usable targets', async ({page, browser}) => {
  await page.goto('/');await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page).toHaveURL(/#main$/);
  await page.setViewportSize({width:390,height:844});await page.goto('/projects/fixture-0/');
  for(const option of await page.locator('.rating-option').all()){const box=await option.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4321/')?route.continue():route.abort());
  const touchPage = await context.newPage(); await touchPage.goto('http://127.0.0.1:4321/projects/fixture-0/');
  await touchPage.getByRole('radio',{name:'3 Dragon Balls',exact:true}).tap();
  await expect(touchPage.getByRole('radio',{name:'3 Dragon Balls',exact:true})).toBeChecked();
  await context.close();
});
test('rendered screenshots and static performance evidence', async ({page, browser},testInfo) => {
  await fs.mkdir('test-results/evidence',{recursive:true});
  const metrics=[];
  for(const [name,route,width,height] of [['homepage-desktop','/',1448,1086],['detail-desktop','/projects/fixture-0/',1448,1086],['homepage-mobile','/',390,844],['detail-mobile','/projects/fixture-0/',390,844],['empty-desktop','http://127.0.0.1:4322/',1448,1086]]){
    await page.setViewportSize({width,height});await page.goto(route,{waitUntil:'networkidle'});await page.locator('img').evaluateAll(async es=>{es.forEach(e=>{e.loading='eager';});await Promise.all(es.map(e=>e.decode()));});
    const filename=`test-results/evidence/${name}.png`;await page.screenshot({path:filename,fullPage:name.includes('mobile')});await testInfo.attach(name,{path:filename,contentType:'image/png'});
    const data=await page.evaluate(()=>{const resources=performance.getEntriesByType('resource');return {domContentLoaded:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,resources:resources.length,transferred:performance.getEntriesByType('navigation')[0].transferSize+resources.reduce((n,r)=>n+r.transferSize,0),scriptBytes:resources.filter(r=>r.initiatorType==='script').reduce((n,r)=>n+r.transferSize,0),external:resources.filter(r=>new URL(r.name).origin!==location.origin).map(r=>r.name)};});
    expect(data.external).toEqual([]);expect(data.scriptBytes).toBeLessThan(30000);expect(data.transferred).toBeLessThan(400000);metrics.push({name,...data});
  }
  const mobile=await browser.newContext({viewport:{width:430,height:764},deviceScaleFactor:941/430,isMobile:true,hasTouch:true});
  await mobile.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4321/')?route.continue():route.abort());const mp=await mobile.newPage();await mp.goto('http://127.0.0.1:4321/');await mp.locator('img').evaluateAll(async es=>{es.forEach(e=>{e.loading='eager';});await Promise.all(es.map(e=>e.decode()));});await mp.screenshot({path:'test-results/evidence/homepage-mobile-reference-resolution.png'});await mobile.close();
  await fs.writeFile('test-results/evidence/performance.json',JSON.stringify(metrics,null,2));
});

test('populated catalog without a featured listing never claims to be empty', async ({page}) => {
  await page.goto('http://127.0.0.1:4323/');
  await expect(page.locator('.project-card')).toHaveCount(7);
  await expect(page.locator('.spotlight-description')).toContainText('Browse community');
  await expect(page.locator('.spotlight-description')).not.toContainText('first community projects');
});

for (let i=0;i<7;i++) test(`detail information has one primary location for fixture ${i}`,async({page})=>{
  await page.goto(`/projects/fixture-${i}/`);
  await expect(page.locator('.detail-intro .detail-description')).toHaveCount(0);
  await expect(page.locator('.description-box')).toHaveCount(1);
  const labels=await page.locator('.project-information dt').allTextContents();
  expect(labels.some(label=>['Game','Category','Status','Repository'].includes(label))).toBe(false);
  const links=await page.locator('main a[href^="https://"]').evaluateAll(es=>es.map(e=>e.href.replace(/\/$/,'')));
  expect(new Set(links).size).toBe(links.length);
  if(i===0) await expect(page.getByRole('heading',{name:'Additional Links',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Screenshots',exact:true})).toHaveCount(i===0?1:0);
});
