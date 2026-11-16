import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function checkCloudflareProject(account, token, fetcher = fetch) {
  if (!/^[a-f0-9]{32}$/.test(account || '') || !token) throw Error('Cloudflare deployment environment credentials are missing or invalid');
  const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/loghub`, {headers: {Authorization: `Bearer ${token}`}, redirect: 'error', signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw Error(`Cloudflare loghub project lookup failed (HTTP ${response.status}); owner must configure the existing Direct Upload project`);
  const data = await response.json(); const project = data.result;
  if (data.success !== true || project?.name !== 'loghub' || project.subdomain !== 'loghub.pages.dev' || project.production_branch !== 'main' || project.source) throw Error('Required Direct Upload project loghub / loghub.pages.dev / main is unavailable or mismatched; no alternate URL or Git integration is permitted');
  return {name: project.name, url: 'https://loghub.pages.dev/', production_branch: project.production_branch};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkCloudflareProject(process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_API_TOKEN);
  console.log('Existing loghub.pages.dev Direct Upload project verified; no project created or deployed');
}
