// World canvas: field heatmap + cells. All coordinates in grid squares.
// Fixed scales: rescaling to each frame's max makes the whole field flicker.
export const OVERLAYS = {
  light: { tint: [90, 170, 230], max: 2, gamma: 0.5 }, // gamma keeps dim light under canopies visible
  vital: { tint: [120, 220, 200], max: 3, gamma: 1 },
  spent: { tint: [210, 150, 90], max: 4, gamma: 1 },
  detritus: { tint: [190, 160, 110], max: 0.3, gamma: 0.5 }, // gamma keeps thin marine snow visible
};
export const WATER = [12, 22, 32];
const SKY = '#25313c';
const ROCK = '#4a4a44';
const BOND = '#d8f0b8';
const SEDIMENT = '#7d6a4a';
const SEDIMENT_SCALE = 0.5; // squares of drawn thickness per unit
const SEDIMENT_MAX = 2;

// Position along an overlay's colour scale, 0..1.
const scaleAt = (style, value) => Math.min(1, value / style.max) ** style.gamma;

function skyColor({ skyLevels }, overlay) {
  const style = OVERLAYS[overlay];
  if (!style) return SKY;
  const t = scaleAt(style, skyLevels[overlay]);
  return `rgb(${WATER.map((c, ch) => c + (style.tint[ch] - c) * t).join(',')})`;
}

const cellRadius = (fat) => 0.12 + 0.12 * Math.sqrt(Math.max(fat, 0));
const cellColor = (photo) => `hsl(115 ${25 + 70 * Math.sqrt(photo)}% ${40 + 30 * Math.sqrt(photo)}%)`;

const MAX_ZOOM = 30;
const WHEEL_SPEED = 0.0015;
const FOCUS_MARGIN = 6; // squares of space around a focused organism
const DRAG_PX = 4; // CSS px of movement before a press counts as a drag

// onTap(cssX, cssY) fires for a press without a drag.
export function createView(canvas, onTap) {
  const ctx = canvas.getContext('2d');
  const field = document.createElement('canvas');
  const fieldCtx = field.getContext('2d');
  let image = null;
  let grid = null;
  let zoom = 1;
  let panX = 0; // canvas px from centred
  let panY = 0;
  let press = null;

  new ResizeObserver(() => {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  }).observe(canvas);

  const baseScale = (g) => Math.min(canvas.width / g.gridW, canvas.height / (g.gridH + g.skyRows));

  // Canvas y of the water surface before panning. Sky sits above it.
  const surfaceY = (g, scale) =>
    (canvas.height - (g.gridH + g.skyRows) * scale) / 2 + g.skyRows * scale;

  // Sizes in canvas pixels. Pan limit: any world point can reach the view centre.
  function layout(g) {
    const scale = baseScale(g) * zoom;
    const limitX = (g.gridW * scale) / 2;
    const limitY = ((g.gridH + g.skyRows) * scale) / 2;
    panX = Math.min(limitX, Math.max(-limitX, panX));
    panY = Math.min(limitY, Math.max(-limitY, panY));
    return {
      scale,
      ox: (canvas.width - g.gridW * scale) / 2 + panX,
      oy: surfaceY(g, scale) + panY,
    };
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!grid) return;
    const px = e.offsetX * devicePixelRatio;
    const py = e.offsetY * devicePixelRatio;
    const before = layout(grid);
    const gx = (px - before.ox) / before.scale;
    const gy = (py - before.oy) / before.scale;
    zoom = Math.min(MAX_ZOOM, Math.max(1, zoom * Math.exp(-e.deltaY * WHEEL_SPEED)));
    const scale = baseScale(grid) * zoom;
    panX = px - gx * scale - (canvas.width - grid.gridW * scale) / 2;
    panY = py - gy * scale - surfaceY(grid, scale);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    press = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, dragged: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!press) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX) press.dragged = true;
    if (press.dragged) {
      panX += (e.clientX - press.lastX) * devicePixelRatio;
      panY += (e.clientY - press.lastY) * devicePixelRatio;
      canvas.classList.add('dragging');
    }
    press.lastX = e.clientX;
    press.lastY = e.clientY;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (press && !press.dragged) onTap(e.offsetX, e.offsetY);
    press = null;
    canvas.classList.remove('dragging');
  });
  canvas.addEventListener('pointercancel', () => {
    press = null;
    canvas.classList.remove('dragging');
  });
  canvas.addEventListener('dblclick', () => {
    zoom = 1;
    panX = 0;
    panY = 0;
  });

  function drawField({ gridW, gridH, fields }, overlay) {
    if (!image) {
      field.width = gridW;
      field.height = gridH;
      image = fieldCtx.createImageData(gridW, gridH);
    }
    const values = fields[overlay];
    const style = OVERLAYS[overlay];
    for (let i = 0; i < gridW * gridH; i++) {
      const t = values ? scaleAt(style, values[i]) : 0;
      for (let ch = 0; ch < 3; ch++) {
        image.data[i * 4 + ch] = WATER[ch] + (values ? (style.tint[ch] - WATER[ch]) * t : 0);
      }
      image.data[i * 4 + 3] = 255;
    }
    fieldCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(field, 0, 0, gridW, gridH);
  }

  function drawTerrain({ gridW, gridH, heights }) {
    ctx.fillStyle = ROCK;
    ctx.beginPath();
    ctx.moveTo(0, gridH);
    heights.forEach((h, x) => ctx.lineTo(x, h));
    ctx.lineTo(gridW, gridH);
    ctx.fill();
  }

  // A band drawn down into the rock: sediment has no physical height, so cells rest on top of it.
  // Each corner averages its two columns, which softens spikes.
  function drawSediment({ gridW, heights, sediment }) {
    const lower = (x) => {
      const units = (sediment[Math.max(0, x - 1)] + sediment[Math.min(gridW - 1, x)]) / 2;
      return heights[x] + Math.min(SEDIMENT_MAX, units * SEDIMENT_SCALE);
    };
    ctx.fillStyle = SEDIMENT;
    ctx.beginPath();
    ctx.moveTo(0, heights[0]);
    heights.forEach((h, x) => ctx.lineTo(x, h));
    for (let x = gridW; x >= 0; x--) ctx.lineTo(x, lower(x));
    ctx.fill();
  }

  function draw(snap, overlay, selectedId) {
    grid = snap;
    const { scale, ox, oy } = layout(snap);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.fillStyle = skyColor(snap, overlay);
    ctx.fillRect(0, -snap.skyRows, snap.gridW, snap.skyRows);
    drawField(snap, overlay);
    drawTerrain(snap);
    drawSediment(snap);

    const { x, y, fat, photo, id } = snap.cells;

    ctx.strokeStyle = BOND;
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    for (let k = 0; k < snap.bondA.length; k++) {
      ctx.moveTo(x[snap.bondA[k]], y[snap.bondA[k]]);
      ctx.lineTo(x[snap.bondB[k]], y[snap.bondB[k]]);
    }
    ctx.stroke();

    for (let i = 0; i < snap.n; i++) {
      ctx.fillStyle = cellColor(photo[i]);
      ctx.beginPath();
      ctx.arc(x[i], y[i], cellRadius(fat[i]), 0, Math.PI * 2);
      ctx.fill();
    }
    drawSelection(snap, selectedId);
  }

  // Outlines the selected organism on top of the crowd, with the selected cell thickest.
  function drawSelection(snap, selectedId) {
    const { x, y, fat, id } = snap.cells;
    const selected = id.indexOf(selectedId);
    if (selected < 0) return;
    const { roots } = snap.organisms;
    const root = roots[selected];
    const outline = (i) => {
      const r = cellRadius(fat[i]);
      ctx.moveTo(x[i] + r, y[i]);
      ctx.arc(x[i], y[i], r, 0, Math.PI * 2);
    };

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    for (let k = 0; k < snap.bondA.length; k++) {
      if (roots[snap.bondA[k]] !== root) continue;
      ctx.moveTo(x[snap.bondA[k]], y[snap.bondA[k]]);
      ctx.lineTo(x[snap.bondB[k]], y[snap.bondB[k]]);
    }
    for (let i = 0; i < snap.n; i++) if (roots[i] === root) outline(i);
    ctx.stroke();

    ctx.lineWidth = 0.1;
    ctx.beginPath();
    outline(selected);
    ctx.stroke();
  }

  // Returns id of nearest cell near a CSS-pixel point, or null.
  function pick(snap, cssX, cssY) {
    const { scale, ox, oy } = layout(snap);
    const gx = (cssX * devicePixelRatio - ox) / scale;
    const gy = (cssY * devicePixelRatio - oy) / scale;
    let best = null;
    let bestDist = 1; // squared grid squares
    for (let i = 0; i < snap.n; i++) {
      const d = (snap.cells.x[i] - gx) ** 2 + (snap.cells.y[i] - gy) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = snap.cells.id[i];
      }
    }
    return best;
  }

  // Zoom and pan to fit the given cells in view, with some margin. Returns the cell
  // index nearest their centre.
  function focus(snap, indices) {
    const { x, y } = snap.cells;
    const xs = indices.map((i) => x[i]);
    const ys = indices.map((i) => y[i]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const fit = Math.min(
      canvas.width / (maxX - minX + FOCUS_MARGIN),
      canvas.height / (maxY - minY + FOCUS_MARGIN),
    );
    zoom = Math.min(MAX_ZOOM, Math.max(1, fit / baseScale(snap)));
    const scale = baseScale(snap) * zoom;
    panX = scale * (snap.gridW / 2 - cx);
    panY = canvas.height / 2 - cy * scale - surfaceY(snap, scale);

    const dist = (i) => (x[i] - cx) ** 2 + (y[i] - cy) ** 2;
    return indices.reduce((best, i) => (dist(i) < dist(best) ? i : best));
  }

  return { draw, pick, focus };
}
