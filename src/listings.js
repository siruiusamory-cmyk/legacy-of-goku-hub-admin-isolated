import fs from 'node:fs/promises';
import path from 'node:path';
import {readJSON} from './records.js';
import {MAX_IMAGE_BYTES, boundedBody, imageHash, normalizeImage} from './images.js';
import {repositoryInfo, releaseInfo} from './github.js';
import {hostedManifest, hostedRawURL, hostedRepository, hostedSupported} from './hosted.js';
import {checkManifest, digest} from './intake.js';
import {listingDigest} from './moderation.js';
import {publicURL, validateListing} from './listing-schema.js';

const LOCAL = /^(?:cover|screenshot-[1-6])\.(?:png|jpe?g|webp)$/;
const SENSITIVE = ['developer', 'game', 'category'];
const MANIFEST_FIELDS = ['title', 'developer', 'description', 'game', 'category', 'status', 'cover', 'screenshots', 'links'];
export async function loadListings(root) {
  let names;
  try { names = (await fs.readdir(path.join(root, 'listings'), {withFileTypes: true})).filter(e => e.isDirectory()).map(e => e.name).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = []; const ids = new Set();
  for (const name of names) {
    const dir = path.join(root, 'listings', name);
    const listing = validateListing(await readJSON(path.join(dir, 'listing.json')));
    if (listing.id !== name || ids.has(listing.id)) throw Error(`listing directory must be named ${listing.id}`);
    ids.add(listing.id); result.push({listing, dir});
  }
  return result;
}
async function sourceBytes(ref, dir, fetcher) {
  if (LOCAL.test(ref)) {
    const file = path.join(dir, ref); const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_IMAGE_BYTES) throw Error(`image ${ref}: expected a regular file up to 5 MiB`);
    return fs.readFile(file);
  }
  const response = await fetcher(ref, {redirect: 'error', signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw Error(`image: HTTP ${response.status}; check public pinned URL`);
  return boundedBody(response, MAX_IMAGE_BYTES);
}
export async function inspectListingImages(record, dir, fetcher = fetch, capture = false) {
  const outputs = []; const artwork = []; const inputs = [];
  for (const [i, ref] of [record.cover, ...(record.screenshots || [])].entries()) {
    const bytes = await sourceBytes(ref, dir, fetcher);
    if (capture) inputs.push(bytes);
    const normalized = await normalizeImage(bytes, i === 0 ? 'cover' : 'screenshot');
    outputs.push(normalized); artwork.push({source_sha256: imageHash(bytes), sha256: imageHash(normalized)});
  }
  return {outputs, artwork, ...(capture ? {inputs} : {})};
}
function fromManifest(listing, manifest) {
  const metadata = checkManifest(manifest.metadata);
  const record = {...listing, title: metadata.title, developer: metadata.developer, description: metadata.description, game: metadata.game, category: metadata.category, status: metadata.status,
    cover: hostedRawURL(manifest, metadata.cover), screenshots: (metadata.screenshots || []).map(s => hostedRawURL(manifest, s))};
  if (metadata.links?.length) record.links = metadata.links; else delete record.links;
  for (const link of record.links || []) publicURL(link.url, 'links');
  return validateListing(record);
}
export async function evaluateListing({listing, dir, rule, prior, api, fetcher = fetch, captureImages = false}) {
  let record = listing; let host; let repository; let release = null; let manifested = false; let metadataDigest; let transferred = false;
  if (listing.source.type === 'github') {
    repository = await repositoryInfo(api, {repository: listing.source.url});
    if (`gh-${repository.id}` !== listing.id) throw Error('GitHub identity does not match the listing ID');
    if (!Number.isSafeInteger(repository.owner_id) || repository.owner_id !== rule?.owner_id) throw Error('repository owner no longer matches the approved owner identity');
    try { release = await releaseInfo(api, {}, repository); } catch (error) { if (prior?.state.release) release = prior.state.release; else if (!/expected one distribution asset|stable release/.test(error.message)) throw error; }
  } else if (listing.source.type === 'git' && hostedSupported(listing.source.url)) {
    const info = await hostedRepository(fetcher, listing.source.url);
    if (prior?.state.host && prior.state.host.id !== info.id) throw Error('repository identity changed; possible name reuse, moderator review required');
    transferred = Boolean(prior?.state.host && prior.state.host.owner_id !== info.owner_id);
    host = {id: info.id, owner_id: info.owner_id};
    try {
      const manifest = await hostedManifest(fetcher, listing.source.url, info);
      record = fromManifest(listing, manifest); manifested = true; metadataDigest = digest(manifest.metadata);
    } catch (error) {
      if (error.status !== 404 && error.message !== 'no manifest') throw error;
      if (prior?.source.manifest) throw Error('manifest missing: restore .loghub.json; existing claim is retained');
    }
  }
  if (manifested && prior && SENSITIVE.some(key => prior.record[key] !== record[key]) && rule?.approved_metadata_digest !== metadataDigest) throw Error(`sensitive attribution/game/category change requires review; metadata digest ${metadataDigest}`);
  const inspected = await inspectListingImages(record, dir, fetcher, captureImages);
  const initialDigest = listingDigest(record, host && {id: host.id, owner_id: host.owner_id});
  const localFields = value => { const copy = {...value}; for (const key of MANIFEST_FIELDS) delete copy[key]; return digest(copy); };
  const contentApproved = manifested && prior && !transferred && localFields(record) === localFields(prior.record) ? prior.moderation.initial_content_digest : initialDigest;
  const claim = rule?.claim;
  const priorClaim = prior?.source.claim_digest;
  if (priorClaim && claim && claim.proof_digest !== priorClaim && claim.transfer_from !== priorClaim) throw Error('ownership transfer requires administrator approval; existing claim retained');
  const ownership = {claim: manifested ? 'repository-controlled' : claim ? 'verified-claim' : 'unclaimed', representation_verified: false};
  const updated = [record.approved_at, repository?.updated_at, release?.updated_at, release?.release_date].filter(Boolean).sort().at(-1);
  const state = repository
    ? {repository, release, availability: repository.archived ? 'archived' : 'available', warning: null, ownership, last_updated: updated}
    : {kind: 'external', availability: 'available', warning: null, ownership, last_updated: updated, ...(host ? {host: {id: host.id, owner_id: host.owner_id}} : {})};
  return {record, state, host, inspected, initialDigest, contentApproved, manifested, ownership, claimDigest: claim?.proof_digest, owner_id: repository?.owner_id, repository_id: repository?.id};
}
