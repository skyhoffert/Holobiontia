// Live graph of population and trait means, each scaled to its own max.
const MAX_POINTS = 600;
const SAMPLE_TICKS = 20;
const SERIES = [
  { key: 'pop', label: 'population', color: '#6fd08c', digits: 0 },
  { key: 'photo', label: 'mean photosynthesis', color: '#e0c060', digits: 3 },
  { key: 'thresh', label: 'mean fat threshold', color: '#e08a6f', digits: 2 },
  { key: 'age', label: 'mean age', color: '#8fb4e8', digits: 0 },
  { key: 'body', label: 'mean organism size', color: '#d59be0', digits: 2 },
  { key: 'split', label: 'mean split chance', color: '#e8e8e8', digits: 3 },
  { key: 'share', label: 'mean daughter share', color: '#5fc8c8', digits: 3 },
  { key: 'cap', label: 'mean fat capacity', color: '#b0d050', digits: 2 },
  { key: 'mut', label: 'mean mutation factor', color: '#f08cb0', digits: 4 },
];
const LABELS_PER_ROW = 5;

const mean = (values, n) => (n ? values.reduce((a, b) => a + b, 0) / n : 0);

export function createGraph(canvas) {
  const ctx = canvas.getContext('2d');
  let points = [];
  let lastTick = -Infinity;

  function push(snap) {
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
    const pad = 36 * dpr; // room for two rows of labels
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
      const column = s % LABELS_PER_ROW;
      const labelRow = Math.floor(s / LABELS_PER_ROW);
      ctx.fillText(`${label} (max ${max.toFixed(digits)})`, (8 + column * 200) * dpr, (14 + labelRow * 14) * dpr);
    });
  }

  return { push, clear };
}
