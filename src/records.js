import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import {isListing, validateListing} from './listing-schema.js';

const schema = JSON.parse(await fs.readFile(new URL('../schema/project.schema.json', import.meta.url)));
const check = new Ajv({allErrors: true}).compile(schema);
export const json = value => JSON.stringify(value, null, 2) + '\n';
export async function readJSON(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function saveJSON(file, data) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file + '.tmp', json(data));
  await fs.rename(file + '.tmp', file);
}
export function repoSlug(url) {
  if (typeof url !== 'string' || !/^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(url)) throw Error('repository: use https://github.com/OWNER/REPO without query, .git or trailing slash');
  const slug = url.slice(19);
  if (slug.endsWith('.git') || ['.', '..'].includes(slug.split('/')[1])) throw Error('repository: invalid repository name');
  return slug;
}
export function imageURL(value, repository) {
  const prefix = `https://raw.githubusercontent.com/${repoSlug(repository)}/`;
  if (!value.startsWith(prefix)) throw Error('images: use raw.githubusercontent.com URLs from the submitted repository');
  const tail = value.slice(prefix.length);
  if (!/^[a-f0-9]{40}\/[A-Za-z0-9_./-]+\.(png|jpg|jpeg|webp)$/i.test(tail) || tail.split('/').some(p => !p || p === '.' || p === '..')) throw Error('images: pin a 40-character commit SHA; use PNG, JPEG or WebP and safe path segments');
  return value;
}
export function validateRecord(record, existing = []) {
  if (!check(record)) throw Error('record: ' + check.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; '));
  for (const key of ['title', 'developer', 'description']) {
    if (record[key] !== record[key].trim() || /[\x00-\x1f\x7f<>]/.test(record[key])) throw Error(`${key}: trimmed, single-line plain text; no HTML or control characters`);
  }
  repoSlug(record.repository);
  for (const link of record.links || []) {
    if (link.label !== link.label.trim() || /[<>\x00-\x1f\x7f]/.test(link.label)) throw Error('links: invalid label');
    const url = new URL(link.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !/^(github\.com|[a-z0-9-]+\.github\.io|discord\.gg|discord\.com|(?:www\.)?youtube\.com)$/.test(url.hostname) || /\.(gba|gbc?|nds|rom|iso|bin|zip|7z|exe|msi|bps|ips|ups|xdelta)(?:$|[/?])/i.test(url.pathname)) throw Error('links: use an HTTPS project/community page on an allowed host, never a download or game file');
  }
  for (const url of [record.cover, ...(record.screenshots || [])]) imageURL(url, record.repository);
  if (record.asset_name && /\.(gba|gb|gbc|nds|rom|bin)$/i.test(record.asset_name)) throw Error('asset_name: ROM files are forbidden');
  if (existing.some(p => p.id === record.id || p.repository.toLowerCase() === record.repository.toLowerCase())) throw Error('duplicate project ID or GitHub repository');
  return record;
}
export function parseIssue(body) {
  if (typeof body !== 'string' || body.length > 16000) throw Error('submission body must be at most 16000 characters');
  const match = /^### Project record\s+```json\s*\n([\s\S]*?)\n```\s*$/m.exec(body);
  if (!match || (body.match(/```json/g) || []).length !== 1) throw Error('Project record: supply exactly one fenced JSON object');
  return JSON.parse(match[1]);
}
export function validateAnyRecord(record, existing = []) {
  if (!isListing(record)) return validateRecord(record, existing.filter(p => !isListing(p)));
  if (existing.some(p => p.id === record.id)) throw Error('duplicate project ID');
  return validateListing(record);
}
export async function loadRecords(root) {
  const names = (await fs.readdir(path.join(root, 'records'))).filter(n => n.endsWith('.json')).sort();
  const records = [];
  for (const name of names) {
    const record = validateAnyRecord(await readJSON(path.join(root, 'records', name)), records);
    if (name !== `${record.id}.json`) throw Error(`record filename must be ${record.id}.json`);
    records.push(record);
  }
  return records;
}
