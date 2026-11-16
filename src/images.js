import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {imageURL} from './records.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function boundedBody(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) throw Error(`response exceeds ${limit} bytes`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw Error(`response exceeds ${limit} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function normalizeImage(bytes, kind) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw Error('image must be 1 byte to 5 MiB');
  const signature = bytes.subarray(0, 12);
  if (!(signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || signature.subarray(0, 3).equals(Buffer.from([255, 216, 255])) || (signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP'))) throw Error('image: unsupported file signature');
  if (signature[0] === 137) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') throw Error('image: animated PNG is not supported');
      offset += 12 + length;
    }
  }
  const options = {limitInputPixels: 20000000, failOn: 'warning'};
  const meta = await sharp(bytes, options).metadata();
  if (!['png', 'jpeg', 'webp'].includes(meta.format) || (meta.pages || 1) !== 1 || meta.width > 8192 || meta.height > 8192) throw Error('image: only static PNG/JPEG/WebP up to 8192px per side and 20 megapixels');
  const [width, height] = kind === 'cover' ? [640, 360] : [480, 320];
  return sharp(bytes, options).rotate().resize(width, height, {fit: 'contain', background: '#161616'}).flatten({background: '#161616'}).webp({quality: 82, effort: 6}).toBuffer();
}
export const imageHash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function inspectImages(record, fetcher = fetch) {
  const outputs = [];
  const artwork = [];
  for (const [i, url] of [record.cover, ...(record.screenshots || [])].entries()) {
    const response = await fetcher(imageURL(url, record.repository), {redirect: 'error', signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw Error(`image ${i + 1}: HTTP ${response.status}; check public pinned URL`);
    const bytes = await boundedBody(response, MAX_IMAGE_BYTES);
    const normalized = await normalizeImage(bytes, i === 0 ? 'cover' : 'screenshot');
    outputs.push(normalized);
    artwork.push({source_sha256: imageHash(bytes), sha256: imageHash(normalized)});
  }
  return {outputs, artwork};
}
export async function writeImages(record, root, outputs) {
  const directory = path.join(root, 'assets', record.id);
  await fs.mkdir(directory, {recursive: true});
  for (let i = 0; i < outputs.length; i++) await fs.writeFile(path.join(directory, i === 0 ? 'cover.webp' : `screenshot-${i}.webp`), outputs[i]);
}
export async function processImages(record, root, fetcher = fetch) {
  const result = await inspectImages(record, fetcher);
  await writeImages(record, root, result.outputs);
  return result.artwork;
}
