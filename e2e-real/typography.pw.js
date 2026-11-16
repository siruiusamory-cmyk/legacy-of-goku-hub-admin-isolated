import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const phase=['before','polish-before','polish-after'].includes(process.env.TYPOGRAPHY_PHASE)?process.env.TYPOGRAPHY_PHASE:'after';
test('typography comparison captures matching real-data views',async({page},info)=>{
  await page.context().route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4325/')?r.continue():r.abort());
  const directory=`docs/frontend/typography/evidence/${phase}`;await fs.mkdir(directory,{recursive:true});
  for(const [name,route] of [['homepage','/'],['legacyofgoku2-disasm','/projects/gh-1429374563/']])for(const [kind,width,height] of [['desktop',1448,1086],['mobile',390,844],...(phase.startsWith('polish-')?[['mobile-320',320,844]]:[])]){
    await page.setViewportSize({width,height});await page.goto(route,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    await page.locator('img').evaluateAll(async es=>{es.forEach(e=>e.loading='eager');await Promise.all(es.map(e=>e.decode()));});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const file=`${directory}/${name}-${kind}.png`;await page.screenshot({path:file,fullPage:kind.startsWith('mobile')});await info.attach(`${phase}-${name}-${kind}`,{path:file,contentType:'image/png'});
  }
});

test('approved fonts are loaded locally with upright headings and readable body',async({page})=>{
  const fonts=[];page.on('response',r=>{if(r.url().includes('.woff2'))fonts.push({url:r.url(),status:r.status()});});
  await page.goto('/');await page.evaluate(()=>document.fonts.ready);
  const style=selector=>page.locator(selector).first().evaluate(e=>{const s=getComputedStyle(e);return {family:s.fontFamily,weight:s.fontWeight,style:s.fontStyle};});
  expect(await style('body')).toEqual({family:'Inter, Arial, sans-serif',weight:'400',style:'normal'});
  expect(await style('.spotlight h1')).toMatchObject({family:'"Barlow Condensed", "Arial Narrow", Arial, sans-serif',weight:'700',style:'italic'});
  expect(await style('.directory-heading h2')).toMatchObject({family:'"Barlow Condensed", "Arial Narrow", Arial, sans-serif',weight:'700',style:'normal'});
  expect(await style('.project-card h3')).toMatchObject({family:'"Barlow Condensed", "Arial Narrow", Arial, sans-serif',weight:'700',style:'normal'});
  expect(await style('.button')).toMatchObject({weight:'600',style:'normal'});
  const loaded=await page.evaluate(()=>[...document.fonts].map(f=>({family:f.family,status:f.status})));
  expect(loaded).toHaveLength(4);expect(loaded.every(f=>f.status==='loaded')).toBe(true);
  expect(fonts).toHaveLength(4);expect(fonts.every(f=>f.status===200&&f.url.startsWith('http://127.0.0.1:4325/'))).toBe(true);
  for(const width of [320,390,760,1448]){
    await page.setViewportSize({width,height:1086});await page.goto('/projects/gh-1429374563/');await page.evaluate(()=>document.fonts.ready);
    await page.locator('h1').evaluate(e=>e.textContent='Legacy of Goku II Disassembly: ARM/Thumb Reconstruction and Development Resources');
    expect(await page.locator('h1').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('polished branding and headings fit narrow viewports without overlap',async({page})=>{
  for(const width of [320,390])for(const route of ['/','/projects/gh-1429374563/']){
    await page.setViewportSize({width,height:844});await page.goto(route);await page.evaluate(()=>document.fonts.ready);
    const geometry=await page.evaluate(()=>{
      const brand=document.querySelector('.brand'),word=brand.querySelector('span:last-child'),menu=document.querySelector('.mobile-nav summary');
      return {brandRight:brand.getBoundingClientRect().right,menuLeft:menu.getBoundingClientRect().left,wordWidth:word.clientWidth,wordScroll:word.scrollWidth,size:parseFloat(getComputedStyle(brand).fontSize),nowrap:getComputedStyle(word).whiteSpace};
    });
    expect(geometry.brandRight).toBeLessThan(geometry.menuLeft);expect(geometry.wordScroll).toBeLessThanOrEqual(geometry.wordWidth);expect(geometry.nowrap).toBe('nowrap');expect(geometry.size).toBe(width===320?22:25);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(route!=='/'){
      const style=await page.locator('h1').evaluate(e=>({size:parseFloat(getComputedStyle(e).fontSize),tracking:parseFloat(getComputedStyle(e).letterSpacing),fits:e.scrollWidth<=e.clientWidth}));
      expect(style.size).toBe(34);expect(style.tracking).toBeGreaterThan(.5);expect(style.fits).toBe(true);
    }
  }
});
