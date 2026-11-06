import { traitLoad } from '../sim/config.js';
import { membersOf } from './organisms.js';

const row = (label, value) => `<dt>${label}</dt><dd>${value}</dd>`;
const section = (title) => `<dt class="section">${title}</dt>`;

let last = null; // selected cell's most recent stats, kept for after it dies

function organismStats(snap, i) {
  const c = snap.cells;
  const members = membersOf(snap.organisms, snap.organisms.roots[i]);
  const sum = (f) => members.reduce((total, m) => total + f(m), 0);
  const bonds = snap.bondA.reduce((total, a) => total + (snap.organisms.roots[a] === snap.organisms.roots[i] ? 1 : 0), 0);
  return [
    section('Organism'),
    row('Cells', members.length),
    row('Bonds', bonds),
    row('Total fat', sum((m) => c.fat[m]).toFixed(2)),
    row('Mean age', (sum((m) => snap.tick - c.born[m]) / members.length).toFixed(0)),
    row('Mean wear', (sum((m) => c.wear[m]) / members.length).toFixed(0)),
  ].join('');
}

function cellStats(snap, i) {
  const c = snap.cells;
  const load = traitLoad(snap.cfg, {
    photo: c.photo[i],
    cap: c.cap[i],
    stiff: c.stiff[i],
    strength: c.strength[i],
    perm: c.perm[i],
    digest: c.digest[i],
  });
  return [
    section('Cell'),
    row('Id', c.id[i]),
    row('Species', `#${c.species[i]}`),
    row('Age', snap.tick - c.born[i]),
    row('Fat', c.fat[i].toFixed(3)),
    row('Biomass', c.biomass[i].toFixed(3)),
    row('Wear', c.wear[i]),
    row('Photosynthesis', c.photo[i].toFixed(3)),
    row('Digestion', c.digest[i].toFixed(3)),
    row('Fat threshold', c.thresh[i].toFixed(3)),
    row('Detach chance', c.detach[i].toFixed(3)),
    row('Split chance', c.split[i].toFixed(3)),
    row('Daughter share', c.share[i].toFixed(3)),
    row('Fat capacity', c.cap[i].toFixed(3)),
    row('Stiffness', c.stiff[i].toFixed(3)),
    row('Bond strength', c.strength[i].toFixed(3)),
    row('Permeability', c.perm[i].toFixed(3)),
    row('Capacity used', `${((load / snap.cfg.traitCapacity) * 100).toFixed(0)}%`),
    row('Mutation factor', c.mut[i].toFixed(4)),
  ].join('');
}

export function renderInspector(el, snap, selectedId) {
  if (selectedId === null) {
    last = null;
    el.innerHTML = '<dt>Click a cell</dt>';
    return;
  }
  const i = snap.cells.id.indexOf(selectedId);
  if (i >= 0) last = { id: selectedId, stats: cellStats(snap, i), organism: organismStats(snap, i) };
  if (last?.id !== selectedId) return;
  const status = i >= 0 ? row('Status', 'Alive') : '<dt>Status</dt><dd class="dead">Dead</dd>';
  el.innerHTML = status + last.stats + last.organism;
}
