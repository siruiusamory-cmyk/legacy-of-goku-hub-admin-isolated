const $ = id => document.getElementById(id);
let csrf = '', page = 1, total = 0, selected = null, listing = null, selectedReview;
const labels = {received: 'New submission', 'in-review': 'Under review', 'needs-changes': 'Awaiting corrections', approved: 'Approved', published: 'Published', rejected: 'Rejected'};
const notice = (text, error = false) => { $('notice').textContent = text; $('notice').classList.toggle('error', error); };
const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
const show = id => { for (const name of ['queue', 'detail', 'publication', 'session-panel']) $(name).hidden = name !== id; };
async function api(path, data) {
  const response = await fetch('/api/' + path, {method: data ? 'POST' : 'GET', headers: data ? {'Content-Type': 'application/json', 'X-CSRF-Token': csrf} : {}, body: data ? JSON.stringify(data) : undefined, redirect: 'error'});
  const result = await response.json(); if (!response.ok) { if (response.status === 401) $('login').hidden = false; throw Error(result.error || 'Request failed'); } return result;
}
const run = fn => async event => { event?.preventDefault(); try { await fn(); } catch (e) { notice(e.message, true); } };
function button(text, fn) { const n = el('button', text); n.type = 'button'; n.addEventListener('click', run(fn)); return n; }
function link(address, label = address) { try { const u = new URL(address); if (u.protocol !== 'https:' || u.username || u.password) return el('span', address); const a = el('a', label); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; } catch { return el('span', address); } }
function confirmAction(text) { $('confirmation-text').textContent = text; $('confirmation').showModal(); return new Promise(resolve => $('confirmation').addEventListener('close', () => resolve($('confirmation').returnValue === 'confirm'), {once: true})); }
function signedIn(s) { csrf = s.csrf; $('identity').textContent = s.email + ' · session expires ' + new Date(s.expires * 1000).toLocaleTimeString(); $('workspace').hidden = false; $('logout').hidden = false; $('login').hidden = true; }
async function queue() {
  show('queue'); const result = await api(`queue?page=${page}&q=${encodeURIComponent($('search').value)}&state=${encodeURIComponent($('state').value)}&sort=${$('sort').value}`); total = result.total; $('items').replaceChildren();
  for (const item of result.items) {
    const article = el('article'); article.append(el('h3', item.payload.title || item.listing_id || 'Untitled submission'), el('p', `${labels[item.state]} · ${item.kind} · ${new Date(item.created * 1000).toLocaleString()}`));
    article.append(item.payload.url ? link(item.payload.url) : el('p', 'No source page provided'));
    if (item.possible_duplicates.length || item.existing.length) article.append(el('p', `Duplicate warning: submissions ${item.possible_duplicates.join(', ') || 'none'}; existing listings ${item.existing.map(p => p.title).join(', ') || 'none'}`));
    article.append(button('Review submission ' + item.id, () => detail(item.id))); $('items').append(article);
  }
  if (!result.items.length) $('items').append(el('p', 'No matching submissions.'));
  $('pagination').textContent = `Page ${page} · ${total} submissions`; $('previous').disabled = page === 1; $('next').disabled = page * 25 >= total;
}
function fill(value) {
  $('metadata').reset(); const form = $('metadata').elements;
  for (const name of ['title', 'description', 'url', 'game', 'category', 'status', 'patch_url']) form[name].value = value[name] || '';
  form.creator.value = value.creator || value.developer || ''; form.no_page.checked = value.no_page === true;
  form.artwork.value = (value.artwork || []).join('\n'); form.links.value = (value.links || []).map(l => l.label + ' | ' + l.url).join('\n');
  $('public-note').value = selected?.public_note || ''; $('private-note').value = selected?.private_note || ''; $('reason').value = ''; $('transfer').checked = false;
}
function values() {
  const form = $('metadata').elements, value = {...(selected?.payload || {})};
  for (const name of ['title', 'description', 'url', 'game', 'category', 'status', 'patch_url', 'creator']) value[name] = form[name].value;
  value.no_page = form.no_page.checked;
  value.artwork = form.artwork.value.split('\n').map(s => s.trim()).filter(Boolean);
  value.links = form.links.value.split('\n').filter(s => s.trim()).map(s => { const at = s.indexOf('|'); if (at < 1) throw Error('Use label | HTTPS address for each community link'); return {label: s.slice(0, at).trim(), url: s.slice(at + 1).trim()}; });
  return value;
}
async function detail(id) {
  const data = await api('detail?id=' + id); selected = data.submission; listing = null; show('detail'); $('detail-title').textContent = 'Review: ' + (selected.payload.title || selected.listing_id); $('detail-title').focus();
  $('details').replaceChildren(el('p', `Submission ${id} · ${selected.kind} · ${labels[selected.state]} · revision ${selected.revision}`), el('pre', JSON.stringify(selected.payload, null, 2)));
  if (selected.challenge) $('details').append(el('p', 'Ownership challenge: ' + selected.challenge));
  for (const address of [selected.payload.url, selected.payload.patch_url, ...(selected.payload.links || []).map(l => l.url)].filter(Boolean)) $('details').appendChild(el('p')).append(link(address));
  $('details').append(el('p', 'Submitted artwork references are untrusted. Prepare the private review to inspect normalized previews.'));
  fill(selected.payload); $('submission-actions').hidden = false; $('listing-actions').hidden = true; $('prepare').textContent = selected.kind === 'claim' ? 'Prepare ownership verification' : 'Prepare private review';
  $('metadata').hidden = false; $('prepare').disabled = false;
  $('history').replaceChildren(el('h3', 'Moderation history'));
  for (const h of data.history) $('history').append(el('p', `${new Date(h.created * 1000).toLocaleString()} · ${h.actor} · ${h.action}`), el('p', 'Public: ' + h.public_note), el('p', 'Private: ' + h.private_note));
  for (const r of data.reviews) $('history').append(button('Open review ' + r.id + ' · ' + r.state, () => showReview(r)));
}
async function decide(state) {
  if (!selected) return;
  if (!await confirmAction(`Set this submission to “${labels[state]}”? The public note will appear on its receipt.`)) return;
  await api('decision', {id: selected.id, revision: selected.revision, state, public_note: $('public-note').value, private_note: $('private-note').value}); notice('Moderation decision recorded.'); await detail(selected.id);
}
async function prepare(operation) {
  if (!await confirmAction(`Prepare ${operation} for private review? This does not approve or publish anything.`)) return;
  let payload = values();
  if (!selected) { const {creator, ...rest} = payload; payload = {...rest, developer: creator}; }
  const result = await api('prepare', {operation, payload, ...(selected ? {submission_id: selected.id, revision: selected.revision} : {project_id: listing.id}), reason: $('reason').value, transfer: $('transfer').checked});
  notice('Private preparation queued. Refresh Publication reviews to inspect results.'); await reviews(result.id);
}
async function catalog() {
  const data = await api('catalog'); show('queue'); $('items').replaceChildren(); $('filters').hidden = true; $('pagination').textContent = 'Approved catalog identities, including withdrawn listings'; $('previous').hidden = true; $('next').hidden = true;
  for (const p of data.projects) { const article = el('article'); article.append(el('h3', p.title), el('p', p.id + ' · ' + (p.moderation || 'approved')), button('Manage ' + p.id, async () => {
    const detail = await api('listing?id=' + encodeURIComponent(p.id)), record = detail.record;
    selected = null; listing = p; show('detail'); $('detail-title').textContent = 'Manage: ' + (record.title || p.title); $('detail-title').focus(); $('details').replaceChildren(el('pre', JSON.stringify(record, null, 2))); if (detail.message) $('details').append(el('p', detail.message)); fill({...record, url: record.source?.url || record.repository || '', patch_url: record.distribution?.url || ''});
    $('metadata').hidden = !detail.editable; $('prepare').disabled = !detail.editable;
    $('submission-actions').hidden = true; $('listing-actions').hidden = false; $('prepare').textContent = 'Prepare metadata / artwork changes'; $('history').replaceChildren();
  })); $('items').append(article); }
}
async function reviews(id) {
  show('publication'); const data = await api('reviews'); $('review-list').replaceChildren(button('Refresh reviews', () => reviews(selectedReview?.id)));
  for (const r of data.items) $('review-list').appendChild(el('p')).append(button(`${r.project_id || 'New listing'} · ${r.operation} · ${r.state}`, () => showReview(r)));
  if (id) { const found = data.items.find(r => r.id === id); if (found) await showReview(found); }
}
async function showReview(r) {
  selectedReview = r; show('publication'); $('publication-title').focus(); const box = $('review-detail'); box.replaceChildren(el('h3', (r.project_id || 'New listing') + ' · ' + r.state));
  if (r.error) box.append(el('p', 'Validation issue: ' + r.error));
  if (!r.package) { box.append(el('p', 'Preparation has not completed. Refresh to see progress.')); return; }
  const pkg = r.package;
  box.append(el('p', 'Approval readiness: ' + (r.state === 'ready' ? 'Prepared. Review all fields, links, artwork and policy below.' : r.state)), el('p', 'Exact package digest: ' + r.digest));
  for (const warning of pkg.warnings) box.append(el('p', warning));
  if (pkg.listing) { box.append(el('h3', 'Proposed listing'), el('pre', JSON.stringify(pkg.listing, null, 2))); for (const url of [pkg.listing.source.url, pkg.listing.distribution?.url, ...(pkg.listing.links || []).map(l => l.url)].filter(Boolean)) box.appendChild(el('p')).append(link(url)); }
  const art = el('div'); art.className = 'artwork';
  for (const f of pkg.files.filter(f => f.name.startsWith('preview-'))) { const figure = el('figure'), img = el('img'); img.src = `/api/preview?id=${r.id}&name=${f.name}`; img.alt = f.name === 'preview-0.webp' ? 'Prepared cover artwork' : 'Prepared project screenshot'; figure.append(img, el('figcaption', f.name + ' · SHA-256 ' + f.sha256)); art.append(figure); }
  box.append(art, el('h3', 'Exact proposed publishing policy'), el('pre', JSON.stringify(pkg.policy, null, 2)), el('h3', 'Approved file inventory'), el('pre', JSON.stringify(pkg.files, null, 2)));
  if (r.state === 'ready') {
    for (const [id, text] of [['content-reviewed', 'I reviewed the exact content, source, download links and proposed policy.'], ['artwork-reviewed', 'I inspected all normalized artwork and verified its suitability and rights. For policy-only changes, I reviewed the existing approval requirements.']]) { const label = el('label'), input = el('input'); input.type = 'checkbox'; input.id = id; label.append(input, document.createTextNode(' ' + text)); box.append(label); }
    const pub = el('textarea'); pub.id = 'approval-public'; pub.maxLength = 500; const pl = el('label', 'Public receipt decision note'); pl.append(pub); box.append(pl);
    const priv = el('textarea'); priv.id = 'approval-private'; priv.maxLength = 1000; const prl = el('label', 'Private decision note'); prl.append(priv); box.append(prl);
    box.append(button('Approve exact content and artwork', async () => { if (!await confirmAction('Approve this exact package? It remains unpublished until its protected PR is merged and deployment succeeds.')) return; await api('approve', {id: r.id, version: r.version, digest: r.digest, content_reviewed: $('content-reviewed').checked, artwork_reviewed: $('artwork-reviewed').checked, public_note: pub.value, private_note: priv.value}); notice('Exact approval recorded.'); await reviews(r.id); }));
  }
  if (r.state === 'approved') box.append(button('Prepare protected publication PR', async () => { if (!await confirmAction('Create a public protected PR containing only the approved listing, artwork and policy changes?')) return; await api('publish', {id: r.id, digest: r.digest}); notice('PR preparation queued; refresh for its status.'); }));
  if (r.pr) box.append(button('Verify PR checks and deployment', async () => { const status = await api('publication?id=' + r.id); box.append(el('pre', JSON.stringify(status, null, 2))); if (status.url) box.append(link(status.url, 'Open protected PR')); if (status.live_url) box.append(link(status.live_url, 'Open live listing')); }));
}
async function sessions() { show('session-panel'); const data = await api('sessions'); $('session-list').replaceChildren(); for (const s of data) $('session-list').appendChild(el('article')).append(el('p', s.email), button('Revoke sessions for ' + s.email, async () => { if (!await confirmAction('Revoke all active sessions for this administrator?')) return; await api('revoke', {subject: s.subject}); notice('Sessions revoked.'); await sessions(); })); }
$('login').onclick = run(async () => { signedIn(await api('login', {})); await queue(); });
$('logout').onclick = run(async () => { try { await api('logout', {}); } finally { location.assign('/cdn-cgi/access/logout'); } });
$('inbox').onclick = run(async () => { $('filters').hidden = false; $('previous').hidden = false; $('next').hidden = false; await queue(); });
$('catalog').onclick = run(catalog); $('reviews').onclick = run(() => reviews()); $('sessions').onclick = run(sessions);
$('filters').onsubmit = run(async () => { page = 1; await queue(); }); $('previous').onclick = run(async () => { page--; await queue(); }); $('next').onclick = run(async () => { page++; await queue(); });
$('start').onclick = run(() => decide('in-review')); $('corrections').onclick = run(() => decide('needs-changes')); $('reject').onclick = run(() => decide('rejected'));
$('prepare').onclick = run(() => prepare(selected?.kind === 'claim' ? 'claim' : selected ? 'submission' : 'edit'));
for (const op of ['suspend', 'delist', 'restore']) $(op).onclick = run(() => prepare(op));
try { signedIn(await api('session')); await queue(); } catch { notice('Sign in through your authorized administrator identity.'); }
