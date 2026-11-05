const row = (label, value) => `<dt>${label}</dt><dd>${value}</dd>`;

let last = null; // selected cell's most recent stats, kept for after it dies

export function renderInspector(el, snap, selectedId) {
  if (selectedId === null) {
    last = null;
    el.innerHTML = '<dt>Click a cell</dt>';
    return;
  }
  const c = snap.cells;
  const i = c.id.indexOf(selectedId);
  if (i >= 0) {
    last = {
      id: selectedId,
      stats: [
        row('Cell', c.id[i]),
        row('Age', snap.tick - c.born[i]),
        row('Fat', c.fat[i].toFixed(3)),
        row('Wear', c.wear[i]),
        row('Photosynthesis', c.photo[i].toFixed(3)),
        row('Fat threshold', c.thresh[i].toFixed(3)),
      ].join(''),
    };
  }
  if (last?.id !== selectedId) return;
  const status = i >= 0 ? row('Status', 'Alive') : '<dt>Status</dt><dd class="dead">Dead</dd>';
  el.innerHTML = status + last.stats;
}
