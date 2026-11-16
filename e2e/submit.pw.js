import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SITE = /^http:\/\/127\.0\.0\.1:4324\//;
const API = 'http://127.0.0.1:4399';
const RECEIPT = 'Q'.repeat(43);
const CORS = {'Access-Control-Allow-Origin': 'http://127.0.0.1:4324', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST', Vary: 'Origin'};
test.use({baseURL: 'http://127.0.0.1:4324'});

async function mock(context, handler = {}) {
  const seen = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    if (SITE.test(url)) return route.continue();
    if (url.startsWith('https://challenges.cloudflare.com/turnstile/')) return route.fulfill({contentType: 'text/javascript', body: 'window.turnstile={render:(el,opts)=>{const b=document.createElement("button");b.type="button";b.textContent="Verify human";b.onclick=()=>opts.callback("fixture-token-123456");el.append(b);return 1;},reset:()=>{}};'});
    if (url.startsWith(API)) {
      if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
      const path = new URL(url).pathname;
      const body = request.postDataJSON?.() ?? null;
      seen.push({path, body});
      const reply = handler[path]?.(body);
      if (reply) return route.fulfill({status: reply.status ?? 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(reply.body)});
      return route.fulfill({status: 404, headers: CORS, contentType: 'application/json', body: '{"error":"Not found"}'});
    }
    return route.abort();
  });
  return seen;
}
async function fillSuggestion(page, over = {}) {
  await page.getByLabel('Project address', {exact: false}).fill(over.url ?? 'https://forum.example.org/threads/new-hack.99/');
  await page.getByLabel('Project name', {exact: false}).fill(over.title ?? 'New Hack');
  await page.getByLabel('What is it?', {exact: false}).selectOption(over.category ?? 'rom-hack');
  await page.getByLabel('Short description', {exact: false}).fill(over.description ?? 'A new ROM hack discovered on a public forum thread.');
}
const axe = page => new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test('suggesting a forum hack with no account reaches a receipt and the status page', async ({page, context}) => {
  const seen = await mock(context, {
    '/submissions': body => ({status: 201, body: {receipt: RECEIPT, status: 'received', message: 'We have your submission. A person will review it before anything is published.'}}),
    '/status': () => ({body: {status: 'in-review', kind: 'suggest', message: 'A person is reviewing your submission now.', note: null, updated_at: '2026-11-01T00:00:00.000Z'}})
  });
  await page.goto('/submit/');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Submit a project');
  await expect(page.getByLabel('Suggest a project')).toBeChecked();
  await fillSuggestion(page);
  await page.getByRole('button', {name: /Review your submission/}).click();
  await expect(page.getByRole('heading', {name: 'Check your submission'})).toBeFocused();
  await expect(page.locator('#review-list')).toContainText('https://forum.example.org/threads/new-hack.99/');
  await expect(page.locator('#review-list')).toContainText('Suggest a project');
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#send-status')).toContainText('human check');
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.getByRole('heading', {name: 'Submission received'})).toBeFocused();
  await expect(page.locator('#receipt-code')).toHaveText(RECEIPT);
  const sent = seen.find(item => item.path === '/submissions').body;
  expect(sent).toMatchObject({kind: 'suggest', url: 'https://forum.example.org/threads/new-hack.99/', title: 'New Hack', category: 'rom-hack', token: 'fixture-token-123456'});
  expect(JSON.stringify(sent)).not.toMatch(/github|email|password/i);
  await page.getByRole('link', {name: /Check status/}).click();
  await expect(page.getByRole('button', {name: /New Hack/})).toBeVisible();
  await page.getByRole('button', {name: /New Hack/}).click();
  await expect(page.locator('#status-name')).toHaveText('In review');
  await expect(page.getByRole('heading', {name: 'Status', exact: true})).toBeFocused();
});

test('errors are announced, tied to fields and fixable; layout passes accessibility checks', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  expect((await axe(page)).violations).toEqual([]);
  await page.getByRole('button', {name: /Review your submission/}).click();
  const summary = page.locator('#error-summary');
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAttribute('role', 'alert');
  await expect(summary.locator('li')).toHaveCount(4);
  await expect(page.locator('#f-url')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#e-url')).toContainText('Problem:');
  expect((await axe(page)).violations).toEqual([]);
  await summary.getByRole('link', {name: /Project name/}).click();
  await expect(page.locator('#f-title')).toBeFocused();
  await page.getByLabel('Project address', {exact: false}).fill('http://insecure.example/x');
  await page.getByLabel('Project name', {exact: false}).fill('X');
  await page.getByLabel('What is it?', {exact: false}).selectOption('tool');
  await page.getByLabel('Short description', {exact: false}).fill('short');
  await page.getByRole('button', {name: /Review your submission/}).click();
  await expect(page.locator('#e-url')).toContainText('https://');
  await expect(page.locator('#e-description')).toContainText('at least 20');
  await fillSuggestion(page);
  await page.getByRole('button', {name: /Review your submission/}).click();
  await expect(page.locator('#review')).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await page.getByRole('button', {name: 'Edit'}).click();
  await expect(page.locator('#submit-form')).toBeVisible();
  await expect(page.getByLabel('Project name', {exact: false})).toHaveValue('New Hack');
});

test('already listed projects are detected from any address variant and steer to correction or claim', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  await page.getByLabel('Project address', {exact: false}).fill('https://WWW.forum.example.org/threads/super-saiyan-frontier.4812?utm_source=x');
  const note = page.locator('#duplicate');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Super Saiyan Frontier');
  await page.getByLabel('Project name', {exact: false}).fill('Anything');
  await page.getByLabel('What is it?', {exact: false}).selectOption('rom-hack');
  await page.getByLabel('Short description', {exact: false}).fill('A description that is long enough to pass.');
  await page.getByRole('button', {name: /Review your submission/}).click();
  await expect(page.locator('#e-url')).toContainText('already listed');
  await expect(page.locator('#review')).toBeHidden();
  await note.getByRole('link', {name: 'This is my project'}).click();
  await expect(page.getByLabel('Claim a listing')).toBeChecked();
  await expect(page.getByLabel('Which listing?', {exact: false})).toHaveValue('ext-forumhack001');
});

test('correct and claim actions from a listing page are prefilled; claim shows a proof challenge', async ({page, context}) => {
  const seen = await mock(context, {'/submissions': body => ({status: 201, body: {receipt: RECEIPT, status: 'received', message: 'We have your submission.', ...(body.kind === 'claim' ? {challenge: 'loghub-claim-' + 'a'.repeat(24)} : {})}})});
  await page.goto('/projects/ext-forumhack001/');
  await page.getByRole('link', {name: 'This is my project'}).click();
  await expect(page.getByLabel('Which listing?', {exact: false})).toHaveValue('ext-forumhack001');
  await expect(page.locator('#note-req')).toBeVisible();
  await page.getByRole('button', {name: /Review your submission/}).click();
  await expect(page.locator('#e-note')).toContainText('connected');
  await page.getByLabel('How are you connected', {exact: false}).fill('I created this hack and run its forum thread.');
  await page.getByRole('button', {name: /Review your submission/}).click();
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#claim-challenge')).toHaveText('loghub-claim-' + 'a'.repeat(24));
  expect(seen.find(item => item.path === '/submissions').body).toMatchObject({kind: 'claim', listing_id: 'ext-forumhack001'});
  await page.goto('/projects/ext-forumhack001/');
  await page.getByRole('link', {name: 'Suggest a correction'}).click();
  await expect(page.getByLabel('Correct a listing')).toBeChecked();
  await expect(page.locator('#more-label')).toHaveText('Corrected details (optional)');
});

test('server-side failures keep the visitor answers and explain what to do', async ({page, context}) => {
  let mode = 429;
  await mock(context, {'/submissions': () => mode === 'dup' ? {status: 409, body: {error: 'This project is already listed.', duplicate: {id: 'ext-forumhack001', title: 'Super Saiyan Frontier'}}} : mode === 422 ? {status: 422, body: {error: 'Please fix', errors: {title: 'Add a project name.'}}} : {status: mode, body: {error: 'x'}}});
  await page.goto('/submit/');
  await fillSuggestion(page);
  await page.getByRole('button', {name: /Review your submission/}).click();
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#send-status')).toContainText('wait a while');
  await expect(page.getByRole('button', {name: 'Send submission'})).toBeEnabled();
  mode = 503;
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#send-status')).toContainText('complete the human check');
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#send-status')).toContainText('not open right now');
  mode = 'dup';
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#send-status')).toContainText('already listed as Super Saiyan Frontier');
  mode = 422;
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#error-summary')).toBeFocused();
  await expect(page.getByLabel('Project name', {exact: false})).toHaveValue('New Hack');
});

test('status page handles bad receipts, unknown receipts and requested changes', async ({page, context}) => {
  let state = 'needs-changes';
  const seen = await mock(context, {
    '/status': body => body.receipt === 'U'.repeat(43) ? {status: 404, body: {error: 'We could not find that receipt.'}} : {body: {status: state, kind: 'suggest', message: 'We need a little more information before we can continue.', note: 'Please add the creator name.', updated_at: '2026-11-01T00:00:00.000Z'}},
    '/revise': body => { state = 'received'; return {body: {status: 'received', message: 'ok'}}; }
  });
  await page.goto('/submit/status/');
  expect((await axe(page)).violations).toEqual([]);
  await page.getByLabel('Receipt', {exact: false}).fill('nope');
  await page.getByRole('button', {name: 'Check status'}).click();
  await expect(page.locator('#e-receipt')).toContainText('does not look like a receipt');
  await page.getByLabel('Receipt', {exact: false}).fill('U'.repeat(43));
  await page.getByRole('button', {name: 'Check status'}).click();
  await expect(page.locator('#e-receipt')).toContainText('could not find');
  await page.getByLabel('Receipt', {exact: false}).fill(RECEIPT);
  await page.getByRole('button', {name: 'Check status'}).click();
  await expect(page.locator('#status-name')).toHaveText('Needs changes');
  await expect(page.locator('#status-note')).toContainText('Please add the creator name.');
  await expect(page.locator('#status-glyph')).toHaveText('!');
  await page.getByLabel('Your reply').fill('The creator is Sir Hacker.');
  await page.getByRole('button', {name: 'Send changes'}).click();
  await expect(page.locator('#status-name')).toHaveText('Received');
  expect(seen.filter(item => item.path === '/revise')[0].body).toEqual({receipt: RECEIPT, changes: {note: 'The creator is Sir Hacker.'}});
});

test('mobile layout has no horizontal scroll and stays accessible', async ({page, context}) => {
  await mock(context);
  await page.setViewportSize({width: 390, height: 800});
  for (const path of ['/submit/', '/submit/status/', '/projects/ext-forumhack001/']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await axe(page)).violations).toEqual([]);
  }
  await page.goto('/submit/');
  await page.getByText('More details (optional)').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('keyboard users can choose an action, fill the form and reach review', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  await page.getByLabel('Suggest a project').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByLabel('Add my project')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.locator('#f-url')).toBeFocused();
  await page.keyboard.type('https://toolkit2.example.net/');
  await page.keyboard.press('Tab');
  await expect(page.locator('#f-no_page')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#f-url')).toBeDisabled();
  await expect(page.locator('[data-req-url]')).toBeHidden();
});

test('external listings use accurate labels and never claim to be repositories', async ({page, context}) => {
  await mock(context);
  await page.goto('/');
  const forum = page.locator('[data-id="ext-forumhack001"]');
  await expect(forum.getByRole('link', {name: 'Download Patch for Super Saiyan Frontier'})).toHaveAttribute('href', 'https://files.example.org/frontier.bps');
  await expect(forum.getByRole('link', {name: 'Visit Super Saiyan Frontier project page'})).toHaveAttribute('href', 'https://forum.example.org/threads/super-saiyan-frontier.4812/');
  await expect(forum.getByRole('link', {name: /repository/i})).toHaveCount(0);
  await expect(page.locator('[data-id="fixture-0"]').getByRole('link', {name: 'View Saiyan Legacy Reborn repository'})).toHaveCount(1);
  await page.goto('/projects/ext-forumhack001/');
  await expect(page.getByRole('link', {name: 'Download Patch', exact: true})).toHaveAttribute('href', 'https://files.example.org/frontier.bps');
  await expect(page.getByRole('link', {name: 'Visit Project', exact: true})).toBeVisible();
  await expect(page.getByRole('link', {name: 'View Repository'})).toHaveCount(0);
  await expect(page.locator('.project-information')).toContainText('Community forum');
  await expect(page.locator('.project-information')).toContainText('not yet claimed');
  await expect(page.locator('.external-note')).toContainText('No game ROMs');
  await page.goto('/projects/ext-sitehack0002/');
  await expect(page.locator('.project-information')).toContainText('Creator claim verified');
  await expect(page.getByRole('link', {name: 'This is my project'})).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Download Patch'})).toHaveCount(0);
  await page.goto('/projects/fixture-0/');
  await expect(page.getByRole('link', {name: 'View Repository', exact: true})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Download on GitHub', exact: true})).toBeVisible();
});

test('primary navigation points at the native submit page', async ({page, context}) => {
  await mock(context);
  await page.goto('/');
  await expect(page.getByRole('navigation', {name: 'Main navigation'}).getByRole('link', {name: 'Submit'})).toHaveAttribute('href', '/submit/');
  await expect(page.locator('footer').getByRole('link', {name: 'Submit a project'})).toHaveAttribute('href', '/submit/');
});
