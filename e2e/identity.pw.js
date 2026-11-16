import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const phase=['before','refinement-before','refinement-after'].includes(process.env.IDENTITY_PHASE)?process.env.IDENTITY_PHASE:'after';
test('visual identity matching released-ROM-hack evidence',async({page},info)=>{
  const directory=`docs/frontend/visual-identity/evidence/${phase}`;await fs.mkdir(directory,{recursive:true});
  for(const [name,route,kind,width,height] of [['released','/projects/fixture-0/','desktop',1448,1086],['released','/projects/fixture-0/','mobile',390,844],...(phase.startsWith('refinement-')?[['empty','http://127.0.0.1:4322/','desktop',1448,1086],['empty','http://127.0.0.1:4322/','mobile',390,844],['empty','http://127.0.0.1:4322/','mobile-320',320,844]]:[])]){
    await page.setViewportSize({width,height});await page.goto(route,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    await page.locator('img').evaluateAll(async es=>{es.forEach(e=>e.loading='eager');await Promise.all(es.map(e=>e.decode()));});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const file=`${directory}/${name}-${kind}.png`;await page.screenshot({path:file,fullPage:kind!=='desktop'});await info.attach(kind,{path:file,contentType:'image/png'});
  }
});
