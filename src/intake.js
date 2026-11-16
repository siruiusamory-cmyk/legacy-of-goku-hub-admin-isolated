import Ajv from 'ajv';
import {createHash} from 'node:crypto';
import {readJSON, repoSlug, validateRecord} from './records.js';

const schema = await readJSON(new URL('../schema/manifest.schema.json', import.meta.url));
const validate = new Ajv({allErrors: true}).compile(schema);
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function checkManifest(metadata) {
  if (!validate(metadata)) throw Error('manifest: ' + validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; '));
  return metadata;
}
export function fields(body) {
  if (typeof body !== 'string' || body.length > 16000) throw Error('form: maximum 16000 characters');
  const result = Object.create(null);
  for (const section of body.replaceAll('\r\n', '\n').split(/^### /m).slice(1)) {
    const index = section.indexOf('\n');
    const label = section.slice(0, index).trim();
    if (Object.hasOwn(result, label)) throw Error(`form: duplicate ${label}`);
    const value = section.slice(index + 1).trim();
    result[label] = value === '_No response_' ? '' : value;
  }
  return result;
}
export function parseSubmission(issue) {
  if (!Number.isSafeInteger(issue.number) || !Number.isSafeInteger(issue.user?.id) || issue.user.id <= 0 || issue.pull_request) throw Error('invalid submission issue identity');
  const f = fields(issue.body);
  const repository = f['Repository URL']; repoSlug(repository);
  const action = f['Request'] || 'Submit or update';
  if (!['Submit or update', 'Claim ownership', 'Report ownership dispute'].includes(action)) throw Error('Request: unsupported action');
  const method = f['Submission method'];
  if (!['Repository manifest', 'Guided form'].includes(method)) throw Error('Submission method: select a supported method');
  const metadata = method === 'Guided form' ? {
    schema_version: 1, title: f['Project title'], developer: f['Developer or team'],
    description: f.Description?.replace(/\n+/g, ' '), game: f['Base game'], category: f.Category,
    status: f['Development status'], cover: f['Cover image'],
    screenshots: (f.Screenshots || '').split('\n').map(s => s.trim()).filter(Boolean),
    links: (f['Project links'] || '').split('\n').filter(Boolean).map(line => {
      const match = /^(.{1,32})\s+(https:\/\/\S+)$/.exec(line.trim());
      if (!match) throw Error('Project links: one Label https://URL per line');
      return {label: match[1].trim(), url: match[2]};
    }), ...(f['Release asset filename'] ? {asset_name: f['Release asset filename']} : {})
  } : null;
  return {number: issue.number, user_id: issue.user.id, repository, method, action, metadata, digest: digest({repository, method, action, metadata})};
}
export function manifestRecord(metadata, repository, commit, id = `gh-${repository.id}`) {
  if (!validate(metadata)) throw Error('manifest: ' + validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; '));
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('invalid default-branch commit SHA');
  const image = value => {
    if (value.startsWith('https://')) return value;
    if (!/^[A-Za-z0-9_./-]+\.(png|jpe?g|webp)$/i.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) throw Error('images: use safe repository-relative paths or pinned raw URLs');
    return `https://raw.githubusercontent.com/${repoSlug(repository.url)}/${commit}/${value}`;
  };
  const {schema_version, ...editorial} = metadata;
  return validateRecord({...editorial, id, repository: repository.url, cover: image(metadata.cover), screenshots: (metadata.screenshots || []).map(image)});
}
export async function loadManifest(api, repository) {
  const slug = repoSlug(repository.url);
  const commit = await api.request(`/repos/${slug}/commits/HEAD`);
  if (!/^[a-f0-9]{40}$/.test(commit?.sha || '')) throw Error('GitHub: invalid default-branch commit');
  const file = await api.request(`/repos/${slug}/contents/.loghub.json?ref=${commit.sha}`);
  if (file?.type !== 'file' || file.path !== '.loghub.json' || file.encoding !== 'base64' || !Number.isSafeInteger(file.size) || file.size < 2 || file.size > 16384 || typeof file.content !== 'string' || file.content.length > 23000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(file.content)) throw Error('manifest: expected a UTF-8 JSON file at root, at most 16 KiB');
  const bytes = Buffer.from(file.content, 'base64');
  if (bytes.length !== file.size) throw Error('manifest: content size mismatch');
  const metadata = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  return {metadata, commit: commit.sha};
}
