import {validateSubmission} from './submission.js';
import {urlKey, parseHttps, sourceKind} from './urlkey.js';

const STORE = 'loghub-submissions';
const root = document.querySelector('[data-submit]');
if (root) start(root);

function remember(entry) {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) || '[]').filter(item => item.receipt !== entry.receipt);
    localStorage.setItem(STORE, JSON.stringify([entry, ...list].slice(0, 10)));
  } catch {}
}

function start(root) {
  const api = root.dataset.api;
  const siteKey = root.dataset.siteKey;
  const form = root.querySelector('#submit-form');
  const review = root.querySelector('#review');
  const receipt = root.querySelector('#receipt');
  const summary = root.querySelector('#error-summary');
  const index = JSON.parse(document.querySelector('#listing-index').textContent);
  const labels = {url: 'Project address', title: 'Project name', category: 'What is it', description: 'Short description', listing_id: 'Listing', note: 'Note', creator: 'Creator', game: 'Base game', status: 'Status', patch_url: 'Patch or download page', links: 'Community links', artwork: 'Artwork', kind: 'Action'};
  const noteCopy = {
    add: ['Anything else we should know?', 'Only moderators can read this.', false],
    suggest: ['Anything else we should know?', 'Only moderators can read this. Suggesting a project does not make you its owner.', false],
    correct: ['What should change?', 'Describe the fix. You can also fill in the corrected details under More details.', false],
    claim: ['How are you connected to this project?', 'For example: I made it, I lead the team. Only moderators can read this.', true]
  };
  let kind = 'suggest';
  let duplicate = null;
  let pending = null;
  let token = '';
  let widget = null;

  const field = name => form.querySelector(`[data-field="${name}"]`);
  const control = name => form.elements[name];
  const query = new URLSearchParams(location.search);

  function showKind(next) {
    kind = next;
    form.querySelectorAll('[data-show]').forEach(el => { el.hidden = !el.dataset.show.split(' ').includes(kind); });
    const [label, hint, required] = noteCopy[kind];
    root.querySelector('#note-label').textContent = label;
    root.querySelector('#h-note').textContent = hint;
    root.querySelector('#note-req').hidden = !required;
    root.querySelector('#more-label').textContent = kind === 'correct' ? 'Corrected details (optional)' : 'More details (optional)';
    form.querySelector('[data-req-url]').hidden = control('no_page').checked;
    if (kind === 'correct' || kind === 'claim') form.querySelector('#more').open = kind === 'correct' ? form.querySelector('#more').open : false;
    form.querySelector('#more').hidden = kind === 'claim';
    clearErrors();
  }
  function clearErrors() {
    summary.hidden = true;
    summary.querySelector('ul').replaceChildren();
    form.querySelectorAll('.error').forEach(el => { el.hidden = true; el.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    form.querySelectorAll('.field.invalid').forEach(el => el.classList.remove('invalid'));
  }
  function showErrors(errors) {
    clearErrors();
    const list = summary.querySelector('ul');
    const seen = new Set();
    for (const [key, message] of Object.entries(errors)) {
      const name = key.replace(/\..*$/, '');
      if (seen.has(name)) continue;
      seen.add(name);
      const container = field(name);
      const error = form.querySelector(`#e-${name}`);
      const input = container?.querySelector('input:not([type=checkbox]), select, textarea') || control(name);
      if (error) { error.textContent = 'Problem: ' + message; error.hidden = false; }
      container?.classList.add('invalid');
      input?.setAttribute('aria-invalid', 'true');
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#' + (input?.id || 'submit-form');
      link.textContent = `${labels[name] || name}: ${message}`;
      link.addEventListener('click', event => { event.preventDefault(); if (name === 'links' || ['creator', 'game', 'status', 'patch_url', 'artwork'].includes(name)) form.querySelector('#more').open = true; input?.focus(); });
      item.append(link);
      list.append(item);
      if (['creator', 'game', 'status', 'patch_url', 'links', 'artwork'].includes(name)) form.querySelector('#more').open = true;
    }
    summary.hidden = false;
    summary.focus();
  }
  function read() {
    const text = name => (control(name)?.value || '');
    const links = [0, 1].map(i => ({label: text(`link_label_${i}`), url: text(`link_url_${i}`)})).filter(link => link.url.trim());
    const artwork = text('artwork').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return {kind, listing_id: text('listing_id'), url: text('url'), no_page: control('no_page').checked, title: text('title'), category: text('category'), description: text('description'), creator: text('creator'), game: text('game'), status: text('status'), patch_url: text('patch_url'), links, artwork, note: text('note')};
  }
  function lookup(url) {
    const key = url && parseHttps(url.trim().replace(/#.*$/, '')) ? urlKey(url.trim().replace(/#.*$/, '')) : null;
    return key ? index.find(item => item.keys.includes(key)) || null : null;
  }
  function checkDuplicate() {
    const box = form.querySelector('#duplicate');
    duplicate = kind === 'add' || kind === 'suggest' ? lookup(control('url').value) : null;
    box.replaceChildren();
    box.hidden = !duplicate;
    if (!duplicate) return;
    const text = document.createElement('p');
    text.append('This project is already listed as ');
    const link = document.createElement('a');
    link.href = duplicate.url;
    link.textContent = duplicate.title;
    text.append(link, '. Is something wrong with it?');
    const actions = document.createElement('p');
    for (const [action, label] of [['correct', 'Suggest a correction'], ['claim', 'This is my project']]) {
      const a = document.createElement('a');
      a.href = `?action=${action}&listing=${encodeURIComponent(duplicate.id)}`;
      a.textContent = label;
      a.className = 'button secondary';
      actions.append(a, ' ');
    }
    box.append(text, actions);
  }
  function prefillOffer() {
    const box = form.querySelector('#prefill');
    const url = control('url').value.trim();
    const kindName = parseHttps(url) ? sourceKind(url) : null;
    box.hidden = !['github', 'gitlab', 'codeberg'].includes(kindName) || !!duplicate;
    form.querySelector('#prefill-note').textContent = box.hidden ? '' : 'Your browser asks the site directly. Check what it fills in.';
  }
  async function prefill() {
    const note = form.querySelector('#prefill-note');
    const url = parseHttps(control('url').value.trim());
    if (!url) return;
    const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    const kindName = sourceKind(url.href);
    note.textContent = 'Looking it up...';
    try {
      let endpoint;
      if (kindName === 'github' && parts.length >= 2) endpoint = `https://api.github.com/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
      else if (kindName === 'codeberg' && parts.length >= 2) endpoint = `https://codeberg.org/api/v1/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
      else if (kindName === 'gitlab' && parts.length >= 2) endpoint = `https://gitlab.com/api/v4/projects/${encodeURIComponent(parts.slice(0, parts.indexOf('-') === -1 ? parts.length : parts.indexOf('-')).join('/'))}`;
      if (!endpoint) throw Error('unsupported');
      const response = await fetch(endpoint, {headers: {Accept: 'application/json'}, credentials: 'omit', referrerPolicy: 'no-referrer'});
      if (!response.ok) throw Error('lookup failed');
      const data = await response.json();
      const fill = (name, value) => { const el = control(name); if (el && !el.value.trim() && typeof value === 'string' && value.trim()) el.value = value.trim().slice(0, name === 'description' ? 2000 : 100); };
      fill('title', data.name || data.path);
      fill('description', data.description);
      fill('creator', data.owner?.login || data.owner?.username || data.namespace?.name);
      updateCount();
      note.textContent = 'Filled from the public page. Please check it and fix anything that is wrong.';
    } catch {
      note.textContent = 'We could not look that up. You can type the details instead.';
    }
  }
  function updateCount() { form.querySelector('#description-count').textContent = `${control('description').value.length} / 2000`; }

  function summarize(value) {
    const list = root.querySelector('#review-list');
    list.replaceChildren();
    const names = {add: 'Add my project', suggest: 'Suggest a project', correct: 'Correct a listing', claim: 'Claim a listing'};
    const rows = [['Action', names[value.kind]]];
    if (value.listing_id) rows.push(['Listing', index.find(item => item.id === value.listing_id)?.title || value.listing_id]);
    if (value.url) rows.push(['Project address', value.url]); else if (value.no_page) rows.push(['Project address', 'No web page']);
    for (const [key, label] of [['title', 'Name'], ['category', 'Type'], ['description', 'Description'], ['creator', 'Creator'], ['game', 'Base game'], ['status', 'Status'], ['patch_url', 'Patch or download page'], ['note', 'Note for moderators']]) {
      if (value[key]) rows.push([label, value[key]]);
    }
    if (value.links) rows.push(['Community links', value.links.map(link => `${link.label}: ${link.url}`).join(', ')]);
    if (value.artwork) rows.push(['Artwork', value.artwork.join(', ')]);
    for (const [label, content] of rows) {
      const wrapper = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = content;
      wrapper.append(dt, dd);
      list.append(wrapper);
    }
  }
  function loadHumanCheck() {
    const box = root.querySelector('#human-check');
    if (!api || !siteKey || widget !== null) return;
    widget = false;
    const mount = () => { widget = window.turnstile.render(box, {sitekey: siteKey, callback: value => { token = value; }, 'expired-callback': () => { token = ''; }, 'error-callback': () => { token = ''; }}); };
    if (window.turnstile) { mount(); return; }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = mount;
    script.onerror = () => { widget = null; root.querySelector('#send-status').textContent = 'The human check could not load. Check your connection and try again.'; };
    document.head.append(script);
  }
  function resetHuman() {
    token = '';
    if (window.turnstile && widget) window.turnstile.reset(widget);
  }
  function go(section) {
    form.hidden = section !== 'form';
    review.hidden = section !== 'review';
    receipt.hidden = section !== 'receipt';
    const target = section === 'form' ? form.querySelector('legend') : root.querySelector(`#${section} h2`);
    target?.scrollIntoView?.({block: 'start'});
    if (section !== 'form') target?.focus();
  }
  function apiMessage(error) {
    if (error === 429) return 'You have sent a lot of requests. Please wait a while and try again.';
    if (error === 503) return 'Submissions are not open right now. Your answers are kept; please try again later.';
    return 'We could not send that. Your answers are kept; please try again.';
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const checked = validateSubmission(read());
    const errors = {...checked.errors};
    if (duplicate) errors.url = 'This project is already listed. Suggest a correction instead.';
    if (Object.keys(errors).length) { showErrors(errors); return; }
    clearErrors();
    pending = checked.value;
    summarize(pending);
    root.querySelector('#send-status').textContent = api ? '' : 'Submissions are not open yet, so this cannot be sent. Your answers stay on this page.';
    root.querySelector('#send-button').disabled = !api;
    go('review');
    loadHumanCheck();
  });
  root.querySelector('#edit-button').addEventListener('click', () => go('form'));
  root.querySelector('#send-button').addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = root.querySelector('#send-status');
    if (!api) return;
    if (!token) { status.textContent = 'Please complete the human check first.'; return; }
    button.disabled = true;
    status.textContent = 'Sending...';
    try {
      const response = await fetch(api + '/submissions', {method: 'POST', credentials: 'omit', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...pending, token, company: control('company').value})});
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.duplicate) {
        const found = index.find(item => item.id === data.duplicate.id);
        status.textContent = `This project is already listed as ${data.duplicate.title}. Go back and suggest a correction instead.`;
        if (found) duplicate = found;
        resetHuman();
        button.disabled = false;
        return;
      }
      if (response.status === 422 && data.errors) { resetHuman(); go('form'); showErrors(data.errors); button.disabled = false; return; }
      if (!response.ok) { status.textContent = data.error && response.status < 500 && response.status !== 429 ? data.error : apiMessage(response.status); button.disabled = false; resetHuman(); return; }
      remember({receipt: data.receipt, title: pending.title || (index.find(item => item.id === pending.listing_id)?.title ?? 'Submission'), kind: pending.kind, at: Date.now()});
      root.querySelector('#receipt-message').textContent = data.message;
      root.querySelector('#receipt-code').textContent = data.receipt;
      const steps = root.querySelector('#claim-steps');
      steps.hidden = !data.challenge;
      if (data.challenge) root.querySelector('#claim-challenge').textContent = data.challenge;
      go('receipt');
    } catch {
      status.textContent = apiMessage(0);
      button.disabled = false;
      resetHuman();
    }
  });
  root.querySelector('#copy-receipt').addEventListener('click', async event => {
    const button = event.currentTarget;
    try { await navigator.clipboard.writeText(root.querySelector('#receipt-code').textContent); button.textContent = 'Copied'; } catch { button.textContent = 'Select and copy the code'; }
  });
  form.addEventListener('change', event => {
    if (event.target.name === 'kind') showKind(event.target.value);
    if (event.target.name === 'no_page') { form.querySelector('[data-req-url]').hidden = event.target.checked; control('url').disabled = event.target.checked; if (event.target.checked) { control('url').value = ''; checkDuplicate(); prefillOffer(); } }
  });
  control('url').addEventListener('input', () => { checkDuplicate(); prefillOffer(); });
  control('description').addEventListener('input', updateCount);
  root.querySelector('#prefill-button').addEventListener('click', prefill);

  const action = query.get('action');
  if (['add', 'suggest', 'correct', 'claim'].includes(action)) {
    form.querySelector(`input[name=kind][value=${action}]`).checked = true;
    kind = action;
  }
  const listing = query.get('listing');
  if (listing && index.some(item => item.id === listing)) control('listing_id').value = listing;
  showKind(kind);
  updateCount();
}
