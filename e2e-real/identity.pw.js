import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
const phase=['before','refinement-before','refinement-after'].includes(process.env.IDENTITY_PHASE)?process.env.IDENTITY_PHASE:'after';
test('visual identity matching real-page evidence',async({page,baseURL},info)=>{
  await page.context().route('**/*',r=>r.request().url().startsWith(baseURL+'/')?r.continue():r.abort());
  const directory=`docs/frontend/visual-identity/evidence/${phase}`;await fs.mkdir(directory,{recursive:true});
  const metrics=[];
  for(const [name,route] of [['homepage','/'],['detail','/projects/gh-1429374563/']])for(const [kind,width,height] of [['desktop',1448,1086],['mobile',390,844],['mobile-320',320,844],...(phase.startsWith('refinement-')?[['tablet',760,1086]]:[])]){
    await page.setViewportSize({width,height});await page.goto(route,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    await page.locator('img').evaluateAll(async es=>{es.forEach(e=>e.loading='eager');await Promise.all(es.map(e=>e.decode()));});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const file=`${directory}/${name}-${kind}.png`;await page.screenshot({path:file,fullPage:kind!=='desktop'});await info.attach(`${name}-${kind}`,{path:file,contentType:'image/png'});
    const performance=await page.evaluate(()=>{const resources=globalThis.performance.getEntriesByType('resource');return {transferred:globalThis.performance.getEntriesByType('navigation')[0].transferSize+resources.reduce((n,r)=>n+r.transferSize,0),scriptBytes:resources.filter(r=>r.initiatorType==='script').reduce((n,r)=>n+r.transferSize,0),external:resources.filter(r=>new URL(r.name).origin!==location.origin).map(r=>r.name)};});
    expect(performance.external).toEqual([]);expect(performance.scriptBytes).toBeLessThan(30000);expect(performance.transferred).toBeLessThan(600000);metrics.push({name,kind,width,height,...performance});
  }
  await fs.writeFile(`${directory}/performance.json`,JSON.stringify(metrics,null,2));
});

test('missing artwork has a neutral fallback and preserves navigation and metadata',async({page})=>{
  await page.route('**/assets/gh-1429374563/{cover,detail}.webp',r=>r.fulfill({status:404,body:'unavailable'}));
  for(const route of ['/','/projects/gh-1429374563/']){
    await page.goto(route);
    const fallback=page.locator(route==='/'?'.project-card[data-id="gh-1429374563"] .artwork-unavailable':'.detail-art .artwork-unavailable');
    await expect(fallback).toBeVisible();await expect(fallback).toContainText('Project artwork unavailable');
    if(route!=='/'){
      await expect(page.getByRole('link',{name:'View Repository',exact:true})).toHaveAttribute('href','https://github.com/siruiusamory-cmyk/legacyofgoku2-disasm');
      await expect(page.locator('.description-box')).toHaveCount(1);
      expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    }
  }
});

test('artwork fits its card and menu focus remains visible at narrow widths',async({page})=>{
  for(const width of [320,390,760,1448]){
    await page.setViewportSize({width,height:844});await page.goto('/');await page.evaluate(()=>document.fonts.ready);
    for(const art of await page.locator('.card-art').all())expect(await art.evaluate(e=>e.getBoundingClientRect().width<=e.closest('.project-card').getBoundingClientRect().width)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('searchbox').focus();expect(await page.getByRole('searchbox').evaluate(e=>getComputedStyle(e).outlineStyle)).not.toBe('none');
    await page.goto('/projects/gh-1429374563/');
    const scenery=await page.locator('.game-terrain').first().evaluate(e=>({size:getComputedStyle(e).backgroundSize,rendering:getComputedStyle(e).imageRendering}));
    expect(scenery.size).toBe(width<=580?'480px 400px':'960px 800px');expect(scenery.rendering).toBe('pixelated');
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  expect(await page.locator('.world-scenery').getAttribute('aria-hidden')).toBe('true');
  expect(await page.locator('.world-scenery').evaluate(e=>getComputedStyle(e).pointerEvents)).toBe('none');
});

test('scenery follows each project game while multi-game content stays neutral',async({page})=>{
  const directory='docs/frontend/visual-identity/evidence/refinement-after';
  for(const [id,game,file] of [['gh-1432341427','legacy-of-goku','log1-kame-house'],['gh-1429374563','legacy-of-goku-2','log2-gokus-house'],['gh-1398951057','buus-fury','buus-fury-snake-way']])for(const width of [320,390,760,1448]){
    await page.setViewportSize({width,height:width===1448?1086:844});await page.goto(`/projects/${id}/`,{waitUntil:'networkidle'});
    await expect(page.locator('.world-scenery')).toHaveAttribute('data-game',game);
    await expect(page.locator('.game-terrain')).toHaveCount(1);
    expect(await page.locator('.game-terrain').evaluate(e=>getComputedStyle(e).backgroundRepeat)).toBe('no-repeat');
    expect(await page.locator('.game-terrain').first().evaluate(e=>getComputedStyle(e).backgroundImage)).toContain(file);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({path:`${directory}/${game}-${width}.png`,fullPage:width!==1448});
  }
  for(const route of ['/','/projects/gh-1429329775/']){
    await page.goto(route);await expect(page.locator('.world-scenery')).toHaveAttribute('data-game','neutral');await expect(page.locator('.game-terrain')).toHaveCount(0);
  }
});


test('complete featured summary and readable filters retain their text at every width',async({page})=>{
  for(const width of [320,390,760,1448]){
    await page.setViewportSize({width,height:844});await page.goto('/');await page.evaluate(()=>document.fonts.ready);
    await expect(page.locator('.spotlight-description')).toHaveText('DragonByte Z and the Webfoot SDK: ROM editing tools and documented formats for the Legacy of Goku GBA games.');
    const summary=await page.locator('.spotlight-description').evaluate(e=>({clamp:getComputedStyle(e).webkitLineClamp,fits:e.scrollHeight<=e.clientHeight}));expect(summary.clamp).toBe('none');expect(summary.fits).toBe(true);
    for(const label of ['Base game','Project category','Development status']){
      const select=page.getByLabel(label,{exact:true});
      const fits=await select.evaluate(e=>{const s=getComputedStyle(e),ctx=document.createElement('canvas').getContext('2d');ctx.font=s.font;return {needed:ctx.measureText(e.selectedOptions[0].textContent).width+parseFloat(s.paddingLeft)+parseFloat(s.paddingRight)+24,available:e.clientWidth};});
      expect(fits.available).toBeGreaterThanOrEqual(fits.needed);
      if(width<=580)expect((await select.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('portrait frames have transparent corner surfaces and one complete centered ornament per side',async({page})=>{
  for(const width of [320,390,760,1448])for(const route of ['/','/projects/gh-1429374563/']){
    await page.setViewportSize({width,height:844});await page.goto(route);
    const frame=page.locator(route==='/'?'.spotlight-inner':'.detail-art');
    if(route!=='/'){
      expect(await frame.locator('img').evaluate(e=>getComputedStyle(e).objectPosition)).toBe('50% 50%');
      const fit=await frame.evaluate(e=>{const f=e.getBoundingClientRect(),image=e.querySelector('img'),i=image.getBoundingClientRect(),s=getComputedStyle(e);return {width:f.width-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth)-i.width,height:f.height-parseFloat(s.borderTopWidth)-parseFloat(s.borderBottomWidth)-i.height,natural:image.naturalWidth/image.naturalHeight,frameHeight:f.height,frameWidth:f.width,slotWidth:parseFloat(getComputedStyle(e.closest('.detail-hero')).gridTemplateColumns),fit:getComputedStyle(image).objectFit};});
      expect(Math.abs(fit.width)).toBeLessThan(.02);expect(Math.abs(fit.height)).toBeLessThan(.02);expect(fit.natural).toBeCloseTo(314/159,3);if(width>900)expect(fit.frameWidth).toBeCloseTo(fit.slotWidth,1);expect(fit.fit).toBe('cover');if(width>580)expect(fit.frameHeight).toBe(276);else expect(fit.frameWidth/fit.frameHeight).toBeCloseTo(16/9,2);
    }
    if(route!=='/')for(const choice of await page.locator('.rating-choice').all()){
      const offset=await choice.evaluate(e=>{const r=e.getBoundingClientRect(),b=e.querySelector('.dragon-ball').getBoundingClientRect();return b.y+b.height/2-r.y-r.height/2;});
      expect(Math.abs(offset)).toBeLessThan(1);
    }
    if(route!=='/'&&width>900){
      await expect(page.locator('.rating-selector')).toHaveText('Preview only · not saved');
      const headingOffset=await page.locator('.rating-selector h2').evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('.detail-rating').getBoundingClientRect();return r.y+r.height/2-p.y-p.height/2;});
      expect(Math.abs(headingOffset)).toBeLessThan(.02);
      for(const ball of await page.locator('.rating-options .dragon-ball').all()){
        const offset=await ball.evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('.detail-rating').getBoundingClientRect();return r.y+r.height/2-p.y-p.height/2;});
        expect(Math.abs(offset)).toBeLessThan(.02);
      }
    }
    expect(await frame.evaluate(e=>getComputedStyle(e).backgroundClip)).toBe('padding-box');
    const ornaments=frame.locator('.portrait-ornaments>span');await expect(ornaments).toHaveCount(4);
    for(const ornament of await ornaments.all()){
      const geometry=await ornament.evaluate(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {repeat:getComputedStyle(e).backgroundRepeat,horizontal:e.classList.contains('portrait-top')||e.classList.contains('portrait-bottom'),x:r.x+r.width/2-p.x-p.width/2,y:r.y+r.height/2-p.y-p.height/2};});
      expect(geometry.repeat).toBe('no-repeat');expect(Math.abs(geometry.horizontal?geometry.x:geometry.y)).toBeLessThan(1);
    }
  }
});
