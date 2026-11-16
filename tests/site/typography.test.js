import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('self-hosted fonts have verified WOFF2 hashes, limited styles and accompanying OFL licenses',async()=>{
  const root='website/src/fonts/';const manifest=JSON.parse(await fs.readFile(root+'sources.json','utf8'));
  assert.deepEqual(manifest.fonts.map(f=>f.file),['barlow-condensed-bold-latin.woff2','barlow-condensed-bold-italic-latin.woff2','inter-regular-latin.woff2','inter-semibold-latin.woff2']);
  let total=0;for(const font of manifest.fonts){const bytes=await fs.readFile(root+font.file);assert.equal(bytes.subarray(0,4).toString(),'wOF2');assert.equal(bytes.length,font.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),font.sha256);total+=bytes.length;}
  assert.ok(total<100*1024);
  for(const name of ['BARLOW-OFL.txt','INTER-OFL.txt'])assert.match(await fs.readFile(root+name,'utf8'),/SIL OPEN FONT LICENSE Version 1.1/);
});
