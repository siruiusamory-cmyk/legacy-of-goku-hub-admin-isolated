import fs from 'node:fs/promises';
import path from 'node:path';
import {projectKeys} from './urlkey.js';
const input = process.env.SITE_INPUT;
export const catalog = JSON.parse(await fs.readFile(path.join(input, 'catalog.json'), 'utf8'));
export const artwork = JSON.parse(await fs.readFile(path.join(input, 'artwork.json'), 'utf8'));
export const provenance = JSON.parse(await fs.readFile(path.join(input, 'provenance.json'), 'utf8'));
export const base = import.meta.env.BASE_URL;
export const href = relative => base + relative;
export const names = {'legacy-of-goku': 'LoG 1', 'legacy-of-goku-2': 'LoG II', 'buus-fury': "Buu’s Fury", multiple: 'LoG series', 'rom-hack': 'ROM Hack', 'fan-project': 'Fan Project', tool: 'Tools', resource: 'Resource', released: 'Released', 'in-development': 'In Development', 'on-hold': 'On Hold', discontinued: 'Discontinued'};
export const fullGame = {'legacy-of-goku': 'Legacy of Goku', 'legacy-of-goku-2': 'Legacy of Goku II', 'buus-fury': "Buu’s Fury", multiple: 'Multiple games'};
export const projectURL = project => href('projects/' + project.id + '/');
export const submitURL = import.meta.env.PUBLIC_INTAKE_ENABLED === 'true' ? href('submit/') : 'https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/issues/new/choose';
export const statusURL = href('submit/status/');
export const advancedSubmitURL = 'https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/issues/new/choose';
export const sourceURL = 'https://github.com/siruiusamory-cmyk/legacy-of-goku-hub';
export const rating = project => provenance.purpose === 'fixture' && project.id !== 'fixture-1' ? {average: [6, 5.6, 6.2, 5.8, 6.1, 5.3, 6.4][catalog.projects.indexOf(project)] ?? 6, count: 412} : {};
export const formatDate = value => new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'}).format(new Date(value));
export const formatSize = size => size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;

export const featuredLabel = project => project.category === 'tool' ? 'Featured Tool' : project.category === 'resource' ? 'Featured Resource' : 'Featured Game';
export const ratingsAPI = import.meta.env.PUBLIC_RATINGS_ENABLED === 'true' ? import.meta.env.PUBLIC_RATINGS_API : '';
if (import.meta.env.PUBLIC_RATINGS_ENABLED === 'true' && !ratingsAPI) throw Error('Enabled ratings requires an API origin');
if (ratingsAPI && (!/^https:\/\/[a-z0-9.-]+$/.test(ratingsAPI) && !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(ratingsAPI))) throw Error('Ratings requires an explicit API origin');


export const discordURL = 'https://discord.gg/P8qC69G3sU';

export const intakeAPI = import.meta.env.PUBLIC_INTAKE_ENABLED === 'true' ? import.meta.env.PUBLIC_INTAKE_API : '';
export const turnstileKey = intakeAPI ? import.meta.env.PUBLIC_TURNSTILE_SITE_KEY : '';
if (import.meta.env.PUBLIC_INTAKE_ENABLED === 'true' && (!intakeAPI || !turnstileKey)) throw Error('Enabled submissions require an API origin and a human-check site key');
if (intakeAPI && !/^https:\/\/[a-z0-9.-]+$/.test(intakeAPI) && !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(intakeAPI)) throw Error('Submissions require an explicit API origin');
export const listingIndex = catalog.projects.map(p => ({id: p.id, title: p.title, keys: projectKeys(p), url: projectURL(p)})).sort((a, b) => a.title.localeCompare(b.title));
export const projectActions = project => {
  const list = [];
  const available = project.availability === 'available';
  if (project.repository) {
    if (project.release && available) list.push({id: 'download', label: 'Download on GitHub', icon: 'github', url: project.release.download_url, aria: 'Download ' + project.title + ' from GitHub'});
    list.push({id: 'repository', label: 'View Repository', icon: 'code', url: project.repository, aria: 'View ' + project.title + ' repository', cardIcon: 'github'});
    return list;
  }
  if (project.distribution && available) list.push({id: 'distribution', label: project.distribution.label, icon: 'download', url: project.distribution.url, aria: project.distribution.label + ' for ' + project.title});
  if (project.source?.url) {
    const repo = ['git', 'github'].includes(project.source.type);
    list.push({id: repo ? 'repository' : 'project', label: repo ? 'View Repository' : 'Visit Project', icon: repo ? 'code' : 'external', url: project.source.url, aria: (repo ? 'View ' + project.title + ' repository' : 'Visit ' + project.title + ' project page'), cardIcon: repo ? 'github' : 'external'});
  }
  return list;
};
export const hostingLabels = {github: 'GitHub', git: 'Git repository', website: 'Project website', forum: 'Community forum', platform: 'Hacking site', none: 'No public page'};
export const claimLabel = project => project.repository && !project.source ? 'Repository listing; team representation not verified' : {'repository-controlled': 'Maintained through its repository; team representation not verified', 'verified-claim': 'Creator claim verified by a moderator', unclaimed: 'Community listing; not yet claimed by its creator'}[project.ownership?.claim] || 'Community listing';
const advancedGuidedURL = 'https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/issues/new?template=submit.yml&title=';
export const correctionURL = project => intakeAPI ? submitURL + '?action=correct&listing=' + encodeURIComponent(project.id) : advancedGuidedURL + encodeURIComponent('[Submission] Correction: ' + project.title);
export const claimURL = project => intakeAPI ? submitURL + '?action=claim&listing=' + encodeURIComponent(project.id) : advancedGuidedURL + encodeURIComponent('[Claim] ' + project.title);
