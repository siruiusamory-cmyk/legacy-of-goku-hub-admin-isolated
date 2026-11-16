const STORE = 'loghub-submissions';
const root = document.querySelector('[data-status]');
if (root) start(root);

const GLYPHS = {received: '○', 'in-review': '◐', 'needs-changes': '!', approved: '✓', published: '✓✓', rejected: '×'};
const NAMES = {received: 'Received', 'in-review': 'In review', 'needs-changes': 'Needs changes', approved: 'Approved', published: 'Published', rejected: 'Not accepted'};

function saved() {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]').filter(item => /^[A-Za-z0-9_-]{43}$/.test(item.receipt)); } catch { return []; }
}

function start(root) {
  const api = root.dataset.api;
  const form = root.querySelector('#status-form');
  const input = form.elements.receipt;
  const result = root.querySelector('#result');
  const revise = root.querySelector('#revise-form');
  const failure = root.querySelector('#status-error');
  let current = '';

  function setError(message) {
    const error = form.querySelector('#e-receipt');
    error.textContent = message ? 'Problem: ' + message : '';
    error.hidden = !message;
    form.querySelector('.field').classList.toggle('invalid', !!message);
    input.toggleAttribute('aria-invalid', !!message);
    if (message) input.setAttribute('aria-invalid', 'true');
  }
  async function post(path, body) {
    const response = await fetch(api + path, {method: 'POST', credentials: 'omit', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const data = await response.json().catch(() => ({}));
    return {response, data};
  }
  function show(data) {
    root.querySelector('#status-glyph').textContent = GLYPHS[data.status] || '';
    root.querySelector('#status-name').textContent = NAMES[data.status] || data.status;
    root.querySelector('#status-message').textContent = data.message;
    const note = root.querySelector('#status-note');
    note.hidden = !data.note;
    note.textContent = data.note ? 'Message from the moderators: ' + data.note : '';
    root.querySelector('#status-updated').textContent = 'Last updated ' + new Date(data.updated_at).toLocaleString();
    const link = root.querySelector('#status-link');
    link.hidden = data.status !== 'published' || !data.project_id;
    if (!link.hidden) root.querySelector('#status-project').href = new URL(`projects/${encodeURIComponent(data.project_id)}/`, document.baseURI.replace(/submit\/status\/.*$/, '')).href;
    const claim = root.querySelector('#claim-box');
    claim.hidden = !data.challenge;
    if (data.challenge) root.querySelector('#claim-challenge').textContent = data.challenge;
    revise.hidden = data.status !== 'needs-changes';
    result.hidden = false;
    result.querySelector('h2').focus();
  }
  async function check(receipt) {
    failure.textContent = '';
    setError('');
    if (!/^[A-Za-z0-9_-]{43}$/.test(receipt)) { setError('That does not look like a receipt. It has 43 letters, numbers, dashes and underscores.'); return; }
    if (!api) { failure.textContent = 'Submissions are not open yet.'; return; }
    try {
      const {response, data} = await post('/status', {receipt});
      if (response.status === 404) { setError('We could not find that receipt. Check for typos or missing characters.'); result.hidden = true; return; }
      if (response.status === 429) { failure.textContent = 'Too many checks. Please wait a minute and try again.'; return; }
      if (!response.ok) { failure.textContent = 'Status is unavailable right now. Please try again later.'; return; }
      current = receipt;
      show(data);
    } catch {
      failure.textContent = 'Status is unavailable right now. Please try again later.';
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); check(input.value.trim()); });
  revise.addEventListener('submit', async event => {
    event.preventDefault();
    failure.textContent = '';
    revise.querySelectorAll('.error').forEach(el => { el.hidden = true; el.textContent = ''; });
    const changes = {};
    for (const name of ['note', 'url', 'title', 'creator', 'description']) { const value = revise.elements[name].value.trim(); if (value) changes[name] = value; }
    if (!Object.keys(changes).length) { failure.textContent = 'Add a reply or change at least one detail.'; return; }
    try {
      const {response, data} = await post('/revise', {receipt: current, changes});
      if (response.status === 422 && data.errors) {
        for (const [key, message] of Object.entries(data.errors)) { const el = revise.querySelector(`#e-${key.replace(/\..*$/, '')}`); if (el) { el.textContent = 'Problem: ' + message; el.hidden = false; } }
        failure.textContent = 'Please fix the highlighted fields.';
        return;
      }
      if (!response.ok) { failure.textContent = data.error || 'We could not send that. Please try again.'; return; }
      revise.reset();
      check(current);
    } catch {
      failure.textContent = 'We could not send that. Please try again.';
    }
  });
  const list = saved();
  if (list.length) {
    const ul = root.querySelector('#saved-list');
    for (const item of list) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary';
      button.textContent = `${item.title} (${new Date(item.at).toLocaleDateString()})`;
      button.addEventListener('click', () => { input.value = item.receipt; check(item.receipt); });
      li.append(button);
      ul.append(li);
    }
    root.querySelector('#saved').hidden = false;
  }
}
