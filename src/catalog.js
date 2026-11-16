import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import Ajv from 'ajv';
import {loadRecords, readJSON, saveJSON, repoSlug} from './records.js';
import {isListing} from './listing-schema.js';
import {projectKeys} from './urlkey.js';
import {date} from './github.js';
const checkCatalog = new Ajv({allErrors: true}).compile(await readJSON(new URL('../schema/catalog.schema.json', import.meta.url)));

export async function validateState(state) {
  if (state?.kind === 'external') {
    if (!['available', 'unavailable'].includes(state.availability) || state.repository || state.release) throw Error('missing or invalid synchronized state');
    date(state.last_updated);
    if (state.host && (!Number.isSafeInteger(state.host.id) || state.host.id <= 0 || !Number.isSafeInteger(state.host.owner_id) || state.host.owner_id <= 0)) throw Error('invalid hosted repository identity');
    return;
  }
  if (!state || !state.repository || !Number.isSafeInteger(state.repository.id) || state.repository.id <= 0 || typeof state.repository.archived !== 'boolean' || !['available', 'archived', 'unavailable'].includes(state.availability)) throw Error('missing or invalid synchronized state');
  repoSlug(state.repository.url);
  date(state.last_updated);
  if (state.release) {
    const r = state.release;
    if (typeof r.version !== 'string' || !r.version || typeof r.file_name !== 'string' || !Number.isSafeInteger(r.file_size) || r.file_size <= 0) throw Error('invalid release state');
    if (r.download_url !== `${state.repository.url}/releases/download/${encodeURIComponent(r.version)}/${encodeURIComponent(r.file_name)}` || (r.sha256 !== null && !/^[a-f0-9]{64}$/.test(r.sha256))) throw Error('unsafe release state');
    date(r.release_date); date(r.updated_at);
  }
}
export async function buildCatalog(root) {
  const records = await loadRecords(root);
  const projects = []; const identities = new Set(); const addresses = new Map();
  for (const record of records) {
    const state = await readJSON(path.join(root, 'state', record.id + '.json'));
    await validateState(state);
    if (state.repository) {
      if (identities.has(state.repository.id)) throw Error('duplicate GitHub repository identity (including renamed repositories)');
      identities.add(state.repository.id);
    }
    const images = ['cover.webp', ...(record.screenshots || []).map((_, i) => `screenshot-${i + 1}.webp`)];
    for (const [i, name] of images.entries()) {
      const meta = await sharp(await fs.readFile(path.join(root, 'assets', record.id, name))).metadata();
      if (meta.format !== 'webp' || meta.width !== (i ? 480 : 640) || meta.height !== (i ? 320 : 360)) throw Error(`${record.id}: missing or unstandardized ${name}`);
    }
    const listing = isListing(record);
    const project = {id: record.id, title: record.title, developer: record.developer, description: record.description,
      game: record.game, category: record.category, status: record.status, featured: record.featured || false,
      ...(state.repository ? {repository: state.repository.url, repository_id: state.repository.id, archived: state.repository.archived} : {}),
      availability: state.availability, warning: state.warning,
      cover: `assets/${record.id}/cover.webp`, screenshots: images.slice(1).map(n => `assets/${record.id}/${n}`),
      release: state.release || null, last_updated: state.last_updated,
      ...(record.links?.length ? {links: record.links} : {}),
      ...(state.ownership ? {ownership: state.ownership} : {}),
      ...(listing ? {source: {type: record.source.type, ...(record.source.url ? {url: record.source.url} : {}), ...(record.source.also_known_at?.length ? {also_known_at: record.source.also_known_at} : {})}} : {}),
      ...(listing && record.distribution ? {distribution: record.distribution} : {}),
      search_text: [record.title, record.developer, record.description, record.game, record.category].join(' ').normalize('NFKC').toLowerCase()};
    for (const key of projectKeys(project)) {
      if (addresses.has(key) && !(addresses.get(key) && state.repository)) throw Error('duplicate project address; one listing per project');
      addresses.set(key, Boolean(state.repository));
    }
    projects.push(project);
  }
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  projects.sort((a, b) => compare(a.id, b.id));
  const order = key => [...projects].sort((a, b) => compare(b[key] || '', a[key] || '') || compare(a.id, b.id)).map(p => p.id);
  const catalog = {schema_version: 1, projects,
    filters: {games: [...new Set(projects.map(p => p.game))].sort(), categories: [...new Set(projects.map(p => p.category))].sort(), statuses: [...new Set(projects.map(p => p.status))].sort()},
    sort: {name: [...projects].sort((a, b) => compare(a.title.toLowerCase(), b.title.toLowerCase()) || compare(a.id, b.id)).map(p => p.id),
      release_date: [...projects].sort((a, b) => compare(b.release?.release_date || '', a.release?.release_date || '') || compare(a.id, b.id)).map(p => p.id), update_date: order('last_updated')}};
  if (!checkCatalog(catalog)) throw Error('catalog schema: ' + JSON.stringify(checkCatalog.errors));
  const output = path.join(root, 'dist');
  await fs.rm(output, {recursive: true, force: true});
  for (const p of projects) {
    for (const relative of [p.cover, ...p.screenshots]) {
      await fs.mkdir(path.dirname(path.join(output, relative)), {recursive: true});
      await fs.copyFile(path.join(root, relative), path.join(output, relative));
    }
  }
  await saveJSON(path.join(output, 'catalog.json'), catalog);
  return catalog;
}
