import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
const plan=JSON.parse(await fs.readFile('proposals/log-hub-004a/repositories.json','utf8'));
test.beforeEach(async({context})=>{await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4325/')?r.continue():r.abort());});
test('real directory searches projects and games, filters tools/resources and sorts',async({page})=>{
  await page.goto('/');await expect(page.locator('.preview-notice')).toContainText('Not approved');
  await expect(page.locator('.project-card')).toHaveCount(4);
  for (const selector of ['.brand>span:last-child','.spotlight h1']) expect(await page.locator(selector).evaluate(e=>getComputedStyle(e,'::after').content)).toBe('none');
  await expect(page.locator('.featured-label')).toHaveText(/Featured Tool/);
  await expect(page.getByText('Not rated yet',{exact:true})).toHaveCount(5);
  await page.getByRole('searchbox').fill('DragonByte');await expect(page.locator('.project-card:visible')).toHaveCount(1);
  await page.getByRole('button',{name:'Show all projects and reset filters'}).click();
  await page.getByRole('searchbox').fill('Legacy of Goku II');await expect(page.locator('.project-card:visible')).toHaveCount(2);
  await page.getByRole('button',{name:'Show all projects and reset filters'}).click();
  await page.getByLabel('Project category',{exact:true}).selectOption('tool');await expect(page.locator('.project-card:visible')).toHaveCount(1);
  await page.getByLabel('Project category',{exact:true}).selectOption('resource');await expect(page.locator('.project-card:visible')).toHaveCount(3);
  await page.getByLabel('Base game',{exact:true}).selectOption('buus-fury');await expect(page.locator('.project-card:visible')).toHaveCount(1);
  await expect(page.locator('.project-card:visible')).toContainText("Buu's Fury Disassembly");
  await page.getByRole('button',{name:'Show all projects and reset filters'}).click();
  for(const order of ['release','updated','name']){await page.getByLabel('Sort projects',{exact:true}).selectOption(order);await expect(page.locator('.project-card:visible')).toHaveCount(4);}
  await expect(page.locator('.project-card').first()).toContainText("Buu's Fury");
});
for(const p of plan.projects)test(`real detail ${p.repository.split('/').at(-1)} has actual links, no fabricated release or ratings`,async({page})=>{
  await page.goto('/');await page.locator(`.project-card[data-id="gh-${p.repository_id}"] h3 a`).click();
  await expect(page).toHaveURL(new RegExp(`/projects/gh-${p.repository_id}/$`));
  await expect(page.getByRole('heading',{level:1})).toHaveText(p.metadata.title);
  await expect(page.locator('.description-box')).toHaveText(p.metadata.description);
  await expect(page.getByRole('link',{name:'View Repository',exact:true})).toHaveAttribute('href',p.repository);
  await expect(page.locator('.release-panel')).toHaveCount(0);await expect(page.getByRole('link',{name:/download/i})).toHaveCount(0);
  await expect(page.locator('.detail-description')).toHaveCount(0);
  await expect(page.locator(`a[href="${p.repository}"]`)).toHaveCount(1);
  expect((await page.locator('.project-information dt').allTextContents()).some(label=>['Game','Category','Status','Repository'].includes(label))).toBe(false);
  await expect(page.locator('.community-rating')).toContainText('Not rated yet');
  await expect(page.getByRole('heading',{name:'Preview only · not saved'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Screenshots',exact:true})).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/412 ratings|fixture-v1|ROM Hack/);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
});
for(const width of [320,390,760,1448])test(`real pages and long technical descriptions fit ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1086});
  for(const route of ['/',...plan.projects.map(p=>`/projects/gh-${p.repository_id}/`)]){await page.goto(route);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
test('real preview keyboard controls and rating remain unsaved',async({page})=>{
  await page.goto('/');await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  await page.goto('/projects/gh-1429329775/');const first=page.getByRole('radio',{name:'1 Dragon Ball',exact:true});await first.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await expect(page.getByRole('radio',{name:'2 Dragon Balls',exact:true})).toBeChecked();
  expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);await page.reload();await expect(page.getByRole('radio',{checked:true})).toHaveCount(0);
});
test('capture authentic desktop/mobile home and all four details without obsolete images',async({page},info)=>{
  const directory='docs/frontend/real-repositories/evidence';await fs.mkdir(directory,{recursive:true});
  const paths=[['homepage','/'],...plan.projects.map(p=>[p.repository.split('/').at(-1),`/projects/gh-${p.repository_id}/`])];
  const errors=[];page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
  for(const [name,route] of paths)for(const [kind,width,height] of [['desktop',1448,1086],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.goto(route,{waitUntil:'networkidle'});
    await page.locator('img').evaluateAll(async es=>{es.forEach(e=>{e.loading='eager';});await Promise.all(es.map(e=>e.decode()));});
    expect(await page.locator('body').innerHTML()).not.toMatch(/dbz-layout-editor|dbz-map-browser/);
    const file=`${directory}/${name}-${kind}.png`;await page.screenshot({path:file,fullPage:kind==='mobile'});await info.attach(name+'-'+kind,{path:file,contentType:'image/png'});
  }
  expect(errors).toEqual([]);
});
