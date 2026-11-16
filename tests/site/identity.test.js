import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

test('decorative LoG II scenery matches its credited source and remains a bounded static image',async()=>{
  const manifest=JSON.parse(await fs.readFile('website/src/assets/sources.json','utf8'));
  assert.equal(manifest.assets.length,6);
  const asset=manifest.assets[0];assert.equal(asset.game,'Dragon Ball Z: The Legacy of Goku II');assert.equal(asset.contributor,'Son Gohan');
  const bytes=await fs.readFile('website/src/assets/'+asset.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.equal(bytes.length,asset.bytes);assert.ok(bytes.length<30000);
  const {info}=await sharp(bytes,{limitInputPixels:65536,failOn:'warning'}).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,256);assert.equal(info.height,256);
});


test('Buu portrait frame contains only source border pixels and a transparent interior',async()=>{
  const manifest=JSON.parse(await fs.readFile('website/src/assets/sources.json','utf8'));for(const asset of manifest.assets.slice(1,3)){
  assert.equal(asset.game,"Dragon Ball Z: Buu's Fury");assert.equal(asset.contributor,'Omega');
  const bytes=await fs.readFile('website/src/assets/'+asset.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.equal(bytes.length,asset.bytes);assert.ok(bytes.length<1024);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,64);assert.equal(info.height,64);
  const colors=new Set(['168,72,0','248,208,0','208,96,0','248,168,0','248,248,144','248,248,72','248,248,216','248,248,248']);
  for(const [x,y] of [[0,0],[63,0],[0,63],[63,63]])assert.equal(data[(y*64+x)*4+3],0);
  let visible=0;for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4;if(x>=8&&x<56&&y>=8&&y<56)assert.equal(data[i+3],0);if(data[i+3]){visible++;assert.ok(colors.has([...data.subarray(i,i+3)].join(',')));}}
  assert.ok(visible>800);assert.match(asset.redistribution_permission,/Unverified/);
  }
});

test('game-specific scenery crops are bounded, credited and verified by content hash',async()=>{
  const manifest=JSON.parse(await fs.readFile('website/src/assets/sources.json','utf8'));
  assert.deepEqual(manifest.assets.slice(3).map(a=>a.title),['Kame House',"Goku's House, East District 439 (Autumn)",'Snake Way']);
  for(const asset of manifest.assets.slice(3)){
    assert.ok(asset.page.startsWith('https://www.spriters-resource.com/'));assert.match(asset.source_sha256,/^[a-f0-9]{64}$/);
    const bytes=await fs.readFile('website/src/assets/'+asset.file),meta=await sharp(bytes,{limitInputPixels:200000}).metadata();
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.equal(bytes.length,asset.bytes);assert.ok(bytes.length<150000);
    assert.equal(meta.width,asset.width);assert.equal(meta.height,asset.height);assert.equal(meta.width,asset.crop.width);assert.equal(meta.height,asset.crop.height);
  }
});
