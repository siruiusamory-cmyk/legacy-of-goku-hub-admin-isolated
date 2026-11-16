import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {validateSiteCatalog} from './catalog.js';
import {realRepositoryIds} from './real-repositories.js';
export async function copyRealPreview(directory,destination) {
  const provenance=JSON.parse(await fs.readFile(path.join(directory,'preview-provenance.json'),'utf8'));
  if (provenance.purpose!=='real-preview' || provenance.production_approved!==false) throw Error('real preview provenance required; this is not production authority');
  const catalog=await validateSiteCatalog(JSON.parse(await fs.readFile(path.join(directory,'work/dist/catalog.json'),'utf8')));
  if (JSON.stringify(catalog.projects.map(p=>p.repository_id).sort((a,b)=>a-b))!==JSON.stringify(realRepositoryIds)) throw Error('real preview must contain exactly the four inspected repositories');
  const plan=JSON.parse(await fs.readFile(new URL('../../proposals/log-hub-004a/repositories.json',import.meta.url),'utf8'));
  for (const p of catalog.projects) {
    const expected=plan.projects.find(r=>r.repository_id===p.repository_id);
    if(p.repository!==expected.repository || p.id!==`gh-${p.repository_id}` || p.game!==expected.metadata.game || p.category!==expected.metadata.category || p.release!==null || p.screenshots.length)throw Error('real preview identity/classification or release/artwork differs from inspected evidence');
  }
  for (const p of catalog.projects) for (const image of [p.cover,...p.screenshots]) {
    const root=path.resolve(directory,'work/dist');let current=root;
    for (const part of image.split('/')) {current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())throw Error('preview image cannot contain symlinks');}
    const stat=await fs.stat(current);if(!stat.isFile()||stat.size>2*1024*1024)throw Error('invalid preview image size/type');
    const bytes=await fs.readFile(current);const meta=await sharp(bytes,{limitInputPixels:20000000,failOn:'warning'}).metadata();
    const cover=image===p.cover;
    if(meta.format!=='webp'||meta.width!==(cover?640:480)||meta.height!==(cover?360:320))throw Error('preview image must be normalized');
    const target=path.join(destination,'public',image);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
  }
  return {catalog,provenance};
}
