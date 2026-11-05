import { createRng } from './rng.js';
import { createTerrain, isOpen } from './terrain.js';

const CELL_KEYS = ['x', 'y', 'vx', 'vy', 'fat', 'photo', 'thresh', 'wear', 'id', 'born'];
const NEIGHBORS = [[1, 0], [-1, 1], [0, 1], [1, 1]];

export function createWorld(cfg) {
  const size = cfg.gridW * cfg.gridH;
  const terrain = createTerrain(cfg);
  const w = {
    cfg,
    terrain,
    tick: 0,
    n: 0,
    nextId: 0,
    rand: createRng(cfg.seed),
    cells: Object.fromEntries(CELL_KEYS.map((k) => [k, new Float64Array(cfg.cap)])),
    light: new Float64Array(size),
    vital: Float64Array.from(terrain.water, (wet) => wet * cfg.vital0),
    spent: Float64Array.from(terrain.water, (wet) => wet * cfg.spent0),
    shade: new Float64Array(size),
    tmp: new Float64Array(size),
    // Atmosphere reservoirs, starting in balance with the water.
    air: {
      vital: cfg.vital0 * terrain.surface.length * cfg.airRows,
      spent: cfg.spent0 * terrain.surface.length * cfg.airRows,
    },
    // Spatial grid for neighbor lookups: linked list of cells per square, sky rows included.
    bucketHead: new Int32Array(cfg.gridW * (cfg.gridH + cfg.skyRows)),
    bucketNext: new Int32Array(cfg.cap),
  };
  spawn(w, cfg.gridW / 2, 1, cfg.lucaFat, cfg.lucaPhoto, cfg.lucaThresh);
  w.matter0 = totalMatter(w);
  computeLight(w);
  return w;
}

export function stepWorld(w) {
  computeLight(w);
  stepCells(w);
  repelCells(w);
  exchangeAir(w, 'vital');
  exchangeAir(w, 'spent');
  diffuse(w, w.vital);
  diffuse(w, w.spent);
  w.tick++;
}

// Conservation invariant: must stay equal to w.matter0.
export function totalMatter(w) {
  let sum = w.air.vital + w.air.spent;
  for (let i = 0; i < w.vital.length; i++) sum += w.vital[i] + w.spent[i];
  for (let i = 0; i < w.n; i++) sum += w.cells.fat[i];
  return sum;
}

function spawn(w, x, y, fat, photo, thresh) {
  const c = w.cells;
  const i = w.n++;
  c.x[i] = x;
  c.y[i] = y;
  c.vx[i] = 0;
  c.vy[i] = 0;
  c.fat[i] = fat;
  c.photo[i] = photo;
  c.thresh[i] = thresh;
  c.wear[i] = 0;
  c.id[i] = w.nextId++;
  c.born[i] = w.tick;
}

const square = (w, i) =>
  Math.floor(w.cells.y[i]) * w.cfg.gridW + Math.floor(w.cells.x[i]);

// All open positions below the surface are water, so y < 0 means out of water.
const isDry = (w, i) => w.cells.y[i] < 0;

const touchesEdge = (w, i) =>
  w.cells.x[i] <= w.cfg.edgeMargin || w.cells.x[i] >= w.cfg.gridW - w.cfg.edgeMargin;

function computeLight(w) {
  const { gridW: W, gridH: H, light, lightDepth, lightCutoff, shade, baseAbsorb } = w.cfg;
  const { water } = w.terrain;
  w.shade.fill(0);
  for (let i = 0; i < w.n; i++) {
    if (!isDry(w, i)) w.shade[square(w, i)] += shade * (baseAbsorb + w.cells.photo[i]);
  }
  for (let x = 0; x < W; x++) {
    let passed = 1;
    for (let y = 0; y < H; y++) {
      const s = y * W + x;
      if (!water[s]) passed = 0; // rock blocks light
      const depthLight = y > lightCutoff ? 0 : light / (1 + y / lightDepth);
      passed /= 1 + w.shade[s]; // includes own square, so crowding limits population
      w.light[s] = depthLight * passed;
    }
  }
}

// Aging never kills directly: output falls until a cell can't feed itself.
const efficiency = (w, i) => 1 / (1 + w.cells.wear[i] / w.cfg.wearHalf);

const upkeepCost = (w, i) => w.cfg.upkeep * (1 + w.cfg.photoUpkeep * w.cells.photo[i]);

function stepCells(w) {
  const count = w.n; // daughters born this tick act next tick
  for (let i = 0; i < count; i++) {
    if (touchesEdge(w, i)) {
      kill(w, i);
    } else if (isDry(w, i)) {
      stepDry(w, i);
    } else {
      stepWet(w, i);
    }
  }
  compact(w);
}

// No energy out of water: upkeep burns fat until it runs out.
function stepDry(w, i) {
  const { fat, wear } = w.cells;
  wear[i]++;
  const paid = Math.min(upkeepCost(w, i), fat[i]);
  fat[i] -= paid;
  releaseFat(w, exchangeSquare(w, i), paid);
  if (fat[i] <= 0) kill(w, i);
  else move(w, i);
}

function stepWet(w, i) {
  const { cells: c, cfg } = w;
  const s = square(w, i);
  c.wear[i]++;

  // Photosynthesis: 2 spent + light -> 1 fat + 1 vital
  const made = Math.min(c.photo[i] * w.light[s] * efficiency(w, i), w.spent[s] / 2);
  w.spent[s] -= 2 * made;
  w.vital[s] += made;
  c.fat[i] += made;

  // Respiration: 1 fat + 1 vital -> 2 spent
  const cost = upkeepCost(w, i);
  const paid = Math.min(cost, c.fat[i], w.vital[s]);
  c.fat[i] -= paid;
  w.vital[s] -= paid;
  w.spent[s] += 2 * paid;

  if (paid < cost) {
    kill(w, i);
    return;
  }
  if (c.fat[i] >= c.thresh[i] && w.n < cfg.cap && w.rand() < cfg.splitChance) divide(w, i);
  move(w, i);
}

// Where a cell's matter goes: its own square, or the nearest shore if out of water.
function exchangeSquare(w, i) {
  const { water, shore } = w.terrain;
  const own = square(w, i);
  return water[own] ? own : shore[Math.min(w.cfg.gridW - 1, Math.max(0, Math.floor(w.cells.x[i])))];
}

// Fat becomes spent, using vital where available: 1 fat + 1 vital -> 2 spent, else 1 fat -> 1 spent.
function releaseFat(w, s, amount) {
  const burned = Math.min(amount, w.vital[s]);
  w.vital[s] -= burned;
  w.spent[s] += 2 * burned + (amount - burned);
}

// No detritus yet: all remaining fat decays straight to spent.
function kill(w, i) {
  const { fat } = w.cells;
  releaseFat(w, exchangeSquare(w, i), fat[i]);
  fat[i] = -1; // dead marker, removed by compact()
}

function divide(w, i) {
  const { cells: c, cfg, rand } = w;
  c.fat[i] -= cfg.divideCost; // dividing burns fat
  releaseFat(w, square(w, i), cfg.divideCost);
  const share = c.fat[i] / 2;
  c.fat[i] -= share;
  c.wear[i] += cfg.wearDivide;
  const mutate = (v, scale) => v + (rand() + rand() - 1) * cfg.mutation * scale;
  const photo = Math.min(1, Math.max(0, mutate(c.photo[i], 1)));
  const thresh = Math.max(cfg.minThresh, mutate(c.thresh[i], 10));
  const d = w.n;
  spawn(w, c.x[i], c.y[i], share, photo, thresh);

  // Parent and daughter push apart, equal and opposite.
  const kickX = (rand() - 0.5) * 2 * cfg.divideKick;
  const kickY = (rand() - 0.5) * 2 * cfg.divideKick;
  c.vx[d] = c.vx[i] + kickX;
  c.vy[d] = c.vy[i] + kickY;
  c.vx[i] -= kickX;
  c.vy[i] -= kickY;
}

// Water pushes back against gravity; fatter cells are less dense and rise. Air doesn't.
function buoyancy(w, i) {
  if (isDry(w, i)) return 0;
  const { gravity, fatLift, neutralFat } = w.cfg;
  return gravity * (1 + fatLift * (w.cells.fat[i] - neutralFat));
}

// Velocity: damped, nudged at random, pulled by gravity less buoyancy.
// Each axis moves separately, so rock stops one axis and the cell slides along it.
function move(w, i) {
  const { cells: c, cfg, rand, terrain } = w;
  c.vx[i] = c.vx[i] * cfg.damping + (rand() - 0.5) * 2 * cfg.drift;
  c.vy[i] = c.vy[i] * cfg.damping + (rand() - 0.5) * 2 * cfg.drift + cfg.gravity - buoyancy(w, i);

  const x = c.x[i] + c.vx[i];
  if (isOpen(terrain, cfg.gridW, x, c.y[i])) c.x[i] = x;
  else c.vx[i] = 0;

  const y = c.y[i] + c.vy[i];
  if (isOpen(terrain, cfg.gridW, c.x[i], y)) c.y[i] = y;
  else c.vy[i] = 0;
}

// Soft collisions: overlapping cells push apart, equal and opposite. Each pair is visited
// once, via its own square and the four "later" neighbors. contactDist must be < 1 square.
function repelCells(w) {
  const { cells: c, cfg, bucketHead: head, bucketNext: next } = w;
  const { gridW: W, gridH: H, skyRows, contactDist, repel: strength } = cfg;
  const rows = H + skyRows;

  head.fill(-1);
  for (let i = 0; i < w.n; i++) {
    const row = Math.min(rows - 1, Math.max(0, Math.floor(c.y[i]) + skyRows));
    const b = row * W + Math.floor(c.x[i]);
    next[i] = head[b];
    head[b] = i;
  }

  const push = (i, j) => {
    const dx = c.x[j] - c.x[i];
    const dy = c.y[j] - c.y[i];
    const d2 = dx * dx + dy * dy;
    if (d2 >= contactDist * contactDist || d2 === 0) return;
    const d = Math.sqrt(d2);
    const f = (strength * (1 - d / contactDist)) / d;
    c.vx[i] -= f * dx;
    c.vy[i] -= f * dy;
    c.vx[j] += f * dx;
    c.vy[j] += f * dy;
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < W; col++) {
      for (let i = head[row * W + col]; i >= 0; i = next[i]) {
        for (let j = next[i]; j >= 0; j = next[j]) push(i, j);
        for (const [dc, dr] of NEIGHBORS) {
          const nc = col + dc;
          const nr = row + dr;
          if (nc < 0 || nc >= W || nr >= rows) continue;
          for (let j = head[nr * W + nc]; j >= 0; j = next[j]) push(i, j);
        }
      }
    }
  }
}

// Stable removal keeps iteration order deterministic.
function compact(w) {
  const c = w.cells;
  let to = 0;
  for (let from = 0; from < w.n; from++) {
    if (c.fat[from] < 0) continue;
    if (to !== from) for (const k of CELL_KEYS) c[k][to] = c[k][from];
    to++;
  }
  w.n = to;
}

// Surface squares move toward the air's level, trading matter with its reservoir.
function exchangeAir(w, gas) {
  const { airRows, airExchange } = w.cfg;
  const { surface } = w.terrain;
  const f = w[gas];
  const level = w.air[gas] / (surface.length * airRows);
  for (let i = 0; i < surface.length; i++) {
    const s = surface[i];
    const flux = airExchange * (level - f[s]);
    f[s] += flux;
    w.air[gas] -= flux;
  }
}

// Conservative flux form between water squares only. No wrap.
function diffuse(w, f) {
  const { gridW: W, gridH: H, diffusion: r } = w.cfg;
  const { water } = w.terrain;
  w.tmp.set(f);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = y * W + x;
      if (!water[s]) continue;
      if (x < W - 1 && water[s + 1]) {
        const flux = r * (w.tmp[s + 1] - w.tmp[s]);
        f[s] += flux;
        f[s + 1] -= flux;
      }
      if (y < H - 1 && water[s + W]) {
        const flux = r * (w.tmp[s + W] - w.tmp[s]);
        f[s] += flux;
        f[s + W] -= flux;
      }
    }
  }
}
