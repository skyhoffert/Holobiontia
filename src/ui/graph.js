// Live graph of population and trait means, each scaled to its own max.
const MAX_POINTS = 600;
const SAMPLE_TICKS = 20;
const SERIES = [
  { key: 'pop', label: 'cells', color: '#6fd08c', digits: 0 },
  { key: 'photo', label: 'photo', color: '#e0c060', digits: 3 },
  { key: 'thresh', label: 'thresh', color: '#e08a6f', digits: 2 },
  { key: 'age', label: 'age', color: '#8fb4e8', digits: 0 },
  { key: 'body', label: 'body', color: '#d59be0', digits: 2 },
  { key: 'split', label: 'split', color: '#e8e8e8', digits: 3 },
  { key: 'share', label: 'share', color: '#5fc8c8', digits: 3 },
  { key: 'cap', label: 'cap', color: '#b0d050', digits: 2 },
  { key: 'mut', label: 'mut', color: '#f08cb0', digits: 4 },
];
const LABEL_WIDTH = 92; // CSS px per label

const mean = (values, n) => (n ? values.reduce((a, b) => a + b, 0) / n : 0);

export function createGraph(canvas) {
  const ctx = canvas.getContext('2d');
  let points = [];
  let lastTick = -Infinity;

  function push(snap) {
    if (snap.tick < lastTick) clear(); // a late snapshot from the old world, before a reset or load
    if (snap.tick < lastTick + SAMPLE_TICKS) return;
    lastTick = snap.tick;
    const { photo, thresh, born, split, share, cap, mut } = snap.cells;
    points.push({
      tick: snap.tick,
      pop: snap.n,
      photo: mean(photo, snap.n),
      thresh: mean(thresh, snap.n),
      age: snap.tick - mean(born, snap.n),
      body: snap.organisms.count ? snap.n / snap.organisms.count : 0,
      split: mean(split, snap.n),
      share: mean(share, snap.n),
      cap: mean(cap, snap.n),
      mut: mean(mut, snap.n),
    });
    if (points.length > MAX_POINTS) points.shift();
    draw();
  }

  function clear() {
    points = [];
    lastTick = -Infinity;
    draw();
  }

  function draw() {
    const dpr = devicePixelRatio;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const { width: w, height: h } = canvas;
    const perRow = Math.max(1, Math.floor(canvas.clientWidth / LABEL_WIDTH));
    const pad = (Math.ceil(SERIES.length / perRow) * 14 + 8) * dpr; // room for the labels
    ctx.font = `${11 * dpr}px system-ui`;

    SERIES.forEach(({ key, label, color, digits }, s) => {
      const max = Math.max(...points.map((p) => p[key]), 1e-9);
      ctx.strokeStyle = color;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = points.length > 1 ? (i / (points.length - 1)) * w : 0;
        const y = h - 4 * dpr - (p[key] / max) * (h - pad);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = color;
      const column = s % perRow;
      const labelRow = Math.floor(s / perRow);
      ctx.fillText(`${label} ${max.toFixed(digits)}`, (8 + column * LABEL_WIDTH) * dpr, (14 + labelRow * 14) * dpr);
    });
  }

  new ResizeObserver(draw).observe(canvas); // also redraws while paused

  return { push, clear };
}
