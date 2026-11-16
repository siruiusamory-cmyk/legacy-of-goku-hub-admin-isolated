import fs from 'node:fs/promises';
import path from 'node:path';
import {GitHub} from './github.js';
import {loadRecords, readJSON, saveJSON} from './records.js';
import {buildCatalog} from './catalog.js';
import {refresh} from './pipeline.js';
import {processImages} from './images.js';

const root = process.cwd();
const command = process.argv[2];
const cacheFile = path.join(root, '.cache', 'github.json');
let cache = {};
try { cache = await readJSON(cacheFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const api = new GitHub({cache});
try {
  if (command === 'validate') { await loadRecords(root); await buildCatalog(root); }
  else if (command === 'build') await buildCatalog(root);
  else if (command === 'refresh') await refresh(root, api);
  else if (command === 'images') {
    const record = (await loadRecords(root)).find(r => r.id === process.argv[3]);
    if (!record) throw Error('images: provide an existing approved project ID');
    await processImages(record, root);
  }
  else if (command === 'submission' || command === 'stage') {
    throw Error('Legacy public artwork staging is retired. Use the guided/manifest Issue Forms and protected content moderation policy; see docs/moderation.md.');
  } else throw Error('usage: node src/cli.js validate|build|refresh|images ID|submission|stage');
  await saveJSON(cacheFile, api.cache);
  console.log(`${command}: OK`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
