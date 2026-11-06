import { GENE_SCALE, geneDistance } from '../sim/config.js';

const GENES = Object.keys(GENE_SCALE);
const MAX_ROWS = 30;
const MAJOR_SHARE = 0.05; // share of all cells that makes a species count as major

// Per-species counts, location and mean genes, largest first.
function summarize(snap) {
  const c = snap.cells;
  const groups = new Map(snap.speciesInfo.map((info) => [info.id, {
    ...info,
    cells: 0,
    organisms: 0,
    depth: 0,
    minX: Infinity,
    maxX: -Infinity,
    genes: Object.fromEntries(GENES.map((k) => [k, 0])),
  }]));
  for (let i = 0; i < snap.n; i++) {
    const g = groups.get(c.species[i]);
    g.cells++;
    if (snap.organisms.roots[i] === i) g.organisms++;
    g.depth += c.y[i];
    g.minX = Math.min(g.minX, c.x[i]);
    g.maxX = Math.max(g.maxX, c.x[i]);
    for (const k of GENES) g.genes[k] += c[k][i];
  }
  const list = [...groups.values()];
  for (const g of list) {
    g.depth /= g.cells;
    for (const k of GENES) g.genes[k] /= g.cells;
  }
  return list.sort((a, b) => b.cells - a.cells || a.id - b.id);
}

function speciesRow(g, snap, largest) {
  const parent = g.parent < 0 ? 'LUCA' : `#${g.parent}`;
  const diff = g === largest ? '-' : geneDistance(g.genes, largest.genes).toFixed(2);
  const cols = [
    `#${g.id}`,
    g.cells,
    `${((g.cells / snap.n) * 100).toFixed(1)}%`,
    g.organisms,
    snap.tick - g.born,
    parent,
    g.depth.toFixed(1),
    `${g.minX.toFixed(0)}-${g.maxX.toFixed(0)}`,
    diff,
    g.genes.photo.toFixed(3),
  ];
  return `<tr>${cols.map((v) => `<td>${v}</td>`).join('')}</tr>`;
}

export function renderSpecies(el, snap) {
  if (!snap.n) {
    el.innerHTML = '<h2>Species</h2>None alive';
    return;
  }
  const list = summarize(snap);
  const major = list.filter((g) => g.cells / snap.n >= MAJOR_SHARE).length;
  const more = list.length > MAX_ROWS ? `<p class="species-more">+${list.length - MAX_ROWS} smaller</p>` : '';
  el.innerHTML = `
    <h2>Species: ${list.length} alive, ${major} with ${MAJOR_SHARE * 100}%+ of cells</h2>
    <table>
      <thead><tr>
        <th>Id</th><th>Cells</th><th>Share</th><th>Orgs</th><th>Age</th><th>From</th>
        <th title="Mean depth below the surface">Depth</th>
        <th title="Leftmost to rightmost cell">X range</th>
        <th title="Genetic distance of mean genes from the largest species">Diff</th>
        <th title="Mean photosynthesis">Photo</th>
      </tr></thead>
      <tbody>${list.slice(0, MAX_ROWS).map((g) => speciesRow(g, snap, list[0])).join('')}</tbody>
    </table>${more}`;
}
