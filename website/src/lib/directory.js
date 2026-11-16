const form = document.querySelector('.directory-controls');
const grid = document.querySelector('.project-grid');
const cards = [...grid.querySelectorAll('.project-card')];
const controls = Object.fromEntries(['search','game','category','status','sort'].map(id => [id, document.getElementById(id)]));
function update() {
  const query = controls.search.value.normalize('NFKC').toLowerCase().trim();
  let visible = 0;
  for (const card of cards) {
    card.hidden = !(card.dataset.search.includes(query) && ['game','category','status'].every(key => !controls[key].value || card.dataset[key] === controls[key].value));
    if (!card.hidden) visible++;
  }
  const key = controls.sort.value;
  cards.sort((a,b) => {const x = a.dataset[key], y = b.dataset[key]; return (x < y ? -1 : x > y ? 1 : 0) * (key === 'name' ? 1 : -1) || (a.dataset.id < b.dataset.id ? -1 : 1);}).forEach(card => grid.append(card));
  document.getElementById('no-results').hidden = visible > 0;
  document.getElementById('result-count').textContent = `${visible} ${visible === 1 ? 'project' : 'projects'}`;
  document.getElementById('reset-filters').classList.toggle('selected', !query && ['game','category','status'].every(k => !controls[k].value));
}
function reset() {form.reset(); update();}
form.addEventListener('input', update);
form.addEventListener('change', update);
form.addEventListener('submit', event => {event.preventDefault(); update();});
document.getElementById('reset-filters').addEventListener('click', reset);
document.querySelector('[data-clear-filters]')?.addEventListener('click', reset);
