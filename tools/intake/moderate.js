import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GitHub} from '../../src/github.js';
import {safeFetcher} from '../../src/safe-fetch.js';
import {reviewDestination} from '../moderation-review.js';
import {readJSON} from '../../src/records.js';
import {validateListing} from '../../src/listing-schema.js';
import {IntakeAPI, adoptListing, applyClaim, manualClaim, prepareListing, setDecision, verifyPageClaim} from '../../src/intake-admin.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const USAGE = `usage:
  queue [state]
  show ID
  prepare ID PRIVATE-DIRECTORY [--game G] [--status S] [--developer NAME] [--cover FILE]
  adopt PRIVATE-DIRECTORY [--approve]
  claim-check ID LISTING-ID [--apply] [--transfer]
  claim-manual ID LISTING-ID --reason TEXT [--apply] [--transfer]
  status LISTING-ID suspended|delisted|approved|review [--reason TEXT]
  decide ID in-review|needs-changes|approved|published|rejected [--public TEXT] [--private TEXT] [--project ID]
environment: INTAKE_API, INTAKE_ADMIN_TOKEN`;
function parse(args) {
  const flags = {}; const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { rest.push(args[i]); continue; }
    const name = args[i].slice(2);
    flags[name] = ['approve', 'apply', 'transfer'].includes(name) ? true : args[++i];
  }
  return {flags, rest};
}
function api() {
  if (!process.env.INTAKE_API || !process.env.INTAKE_ADMIN_TOKEN) throw Error('set INTAKE_API and INTAKE_ADMIN_TOKEN');
  return new IntakeAPI({base: process.env.INTAKE_API, token: process.env.INTAKE_ADMIN_TOKEN});
}
async function find(id) {
  const {items} = await api().queue();
  const found = items.find(item => item.id === Number(id));
  if (!found) throw Error('submission not found in the open queue');
  return found;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const {flags, rest} = parse(args);
  if (command === 'queue') {
    const {items} = await api().queue(rest[0]);
    for (const item of items) console.log(`${item.id}\t${item.kind}\t${item.state}\t${item.payload.title || item.listing_id}\t${item.payload.url || ''}${item.possible_duplicates.length ? '\tDUPLICATE-OF ' + item.possible_duplicates.join(',') : ''}`);
  } else if (command === 'show') console.log(JSON.stringify(await find(rest[0]), null, 2));
  else if (command === 'prepare') {
    const directory = reviewDestination(rest[1]);
    const cover = flags.cover ? await fs.readFile(path.resolve(flags.cover)) : undefined;
    const result = await prepareListing({submission: await find(rest[0]), directory, api: new GitHub(), fetcher: safeFetcher(), overrides: {game: flags.game, status: flags.status, developer: flags.developer, cover}});
    console.log(`Prepared ${result.id} in ${directory}. Warnings: ${result.warnings.join('; ') || 'none'}.\nInspect every image and field. Nothing is approved until adopt --approve is reviewed and merged.`);
  } else if (command === 'adopt') {
    const result = await adoptListing({directory: path.resolve(rest[0]), root, approve: flags.approve === true});
    console.log(`Staged listings/${result.id}${result.approved ? ' with an approval rule in policy/publishing.json' : ' without approval'}. Commit both through the protected review.`);
  } else if (command === 'claim-check' || command === 'claim-manual') {
    const submission = await find(rest[0]);
    if (submission.kind !== 'claim' || submission.listing_id !== rest[1]) throw Error('submission is not a claim for that listing');
    const listing = validateListing(await readJSON(path.join(root, 'listings', rest[1], 'listing.json')));
    let claim;
    if (command === 'claim-check') {
      const result = await verifyPageClaim({listing, challenge: submission.challenge, fetcher: safeFetcher()});
      if (!result.verified) { console.log('NOT VERIFIED: the challenge text was not found on the project page. Do not approve this claim.'); process.exitCode = 2; return; }
      claim = result.claim;
    } else claim = manualClaim({listing, challenge: submission.challenge, reason: flags.reason});
    console.log(JSON.stringify(claim, null, 2));
    if (flags.apply) { await applyClaim({root, listingId: rest[1], claim, transfer: flags.transfer === true}); console.log('Claim recorded in policy/publishing.json. Commit through the protected review.'); }
  } else if (command === 'status') {
    await setDecision(root, rest[0], rest[1], flags.reason);
    console.log(`Policy updated: ${rest[0]} ${rest[1]}. Commit through the protected review; publication follows the signed pipeline.`);
  } else if (command === 'decide') console.log(JSON.stringify(await api().decide(Number(rest[0]), rest[1], {publicNote: flags.public, privateNote: flags.private, projectId: flags.project})));
  else throw Error(USAGE);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
