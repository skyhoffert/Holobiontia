import { GENE_SCALE, SAVE_VERSION, geneDistance, traitLoad } from './config.js';
import { createRng } from './rng.js';
import { createTerrain, isOpen } from './terrain.js';

const GENE_KEYS = Object.keys(GENE_SCALE);
const CELL_KEYS = ['x', 'y', 'vx', 'vy', 'fat', 'biomass', 'wear', 'id', 'born', 'species', ...GENE_KEYS];
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
    detritus: new Float64Array(size),
    sediment: new Float64Array(cfg.gridW), // per column
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
    // Bonds: pairs of cell indices, kept in step with cells by compact().
    nBonds: 0,
    bondA: new Int32Array(cfg.cap * 2),
    bondB: new Int32Array(cfg.cap * 2),
    remap: new Int32Array(cfg.cap),
    // Display only: no rule reads species. Index is the species id.
    species: [],
  };
  const luca = {
    photo: cfg.lucaPhoto,
    thresh: cfg.lucaThresh,
    detach: cfg.lucaDetach,
    split: cfg.lucaSplit,
    share: cfg.lucaShare,
    cap: cfg.lucaCap,
    stiff: cfg.lucaStiff,
    strength: cfg.lucaStrength,
    perm: cfg.lucaPerm,
    digest: cfg.lucaDigest,
    mut: cfg.lucaMut,
  };
  w.species.push({ genes: luca, parent: -1, born: 0 });
  spawn(w, cfg.gridW / 2, 1, cfg.lucaFat, luca, 0, buildCost(cfg, luca));
  w.matter0 = totalMatter(w);
  computeLight(w);
  return w;
}

export function stepWorld(w) {
  computeLight(w);
  stepCells(w);
  stepBonds(w);
  repelCells(w);
  exchangeAir(w, 'vital');
  exchangeAir(w, 'spent');
  stepDetritus(w);
  stepSediment(w);
  driftField(w, w.vital, -w.cfg.vitalRise);
  driftField(w, w.spent, w.cfg.spentSink);
  diffuse(w, w.vital, w.cfg.diffusion);
  diffuse(w, w.spent, w.cfg.diffusion);
  diffuse(w, w.detritus, w.cfg.detritusDiffusion);
  w.tick++;
}

const FIELD_KEYS = ['vital', 'spent', 'detritus', 'sediment'];

// Everything a run needs to continue identically, as plain JSON-safe data. Light, shade and the
// neighbor lookups are rebuilt each tick, so they aren't saved.
export function saveWorld(w) {
  return {
    version: SAVE_VERSION,
    cfg: w.cfg,
    tick: w.tick,
    n: w.n,
    nextId: w.nextId,
    rng: w.rand.state(),
    matter0: w.matter0,
    air: w.air,
    species: w.species,
    cells: Object.fromEntries(CELL_KEYS.map((k) => [k, Array.from(w.cells[k].subarray(0, w.n))])),
    fields: Object.fromEntries(FIELD_KEYS.map((k) => [k, Array.from(w[k])])),
    bondA: Array.from(w.bondA.subarray(0, w.nBonds)),
    bondB: Array.from(w.bondB.subarray(0, w.nBonds)),
  };
}

// cfg becomes the world's live config, so it should already include data.cfg.
export function loadWorld(data, cfg) {
  const w = createWorld(cfg);
  w.tick = data.tick;
  w.n = data.n;
  w.nextId = data.nextId;
  w.rand = createRng(data.rng);
  w.matter0 = data.matter0;
  w.air = { ...data.air };
  w.species = data.species;
  data.cells.biomass ??= new Array(data.n).fill(cfg.cellBiomass); // saves from before build costs
  data.cells.digest ??= new Array(data.n).fill(0); // saves from before digestion
  for (const { genes } of data.species) genes.digest ??= 0;
  for (const k of CELL_KEYS) w.cells[k].set(data.cells[k]);
  for (const k of FIELD_KEYS) w[k].set(data.fields[k]);
  w.nBonds = data.bondA.length;
  w.bondA.set(data.bondA);
  w.bondB.set(data.bondB);
  computeLight(w);
  return w;
}

// Conservation invariant: must stay equal to w.matter0.
export function totalMatter(w) {
  let sum = w.air.vital + w.air.spent;
  for (let i = 0; i < w.vital.length; i++) sum += w.vital[i] + w.spent[i] + w.detritus[i];
  for (let i = 0; i < w.sediment.length; i++) sum += w.sediment[i];
  for (let i = 0; i < w.n; i++) sum += w.cells.fat[i] + w.cells.biomass[i];
  return sum;
}

// Fat locked into the body of a new cell with these genes.
function buildCost(cfg, genes) {
  return cfg.cellBiomass
    + cfg.photoBuild * genes.photo
    + cfg.capBuild * genes.cap
    + cfg.stiffBuild * genes.stiff
    + cfg.strengthBuild * genes.strength
    + cfg.permBuild * genes.perm
    + cfg.digestBuild * genes.digest;
}

function spawn(w, x, y, fat, genes, species, biomass) {
  const c = w.cells;
  const i = w.n++;
  c.x[i] = x;
  c.y[i] = y;
  c.vx[i] = 0;
  c.vy[i] = 0;
  c.fat[i] = fat;
  c.biomass[i] = biomass;
  for (const k of GENE_KEYS) c[k][i] = genes[k];
  c.wear[i] = 0;
  c.id[i] = w.nextId++;
  c.born[i] = w.tick;
  c.species[i] = species;
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

function upkeepCost(w, i) {
  const { cells: c, cfg } = w;
  return cfg.upkeep * (1
    + cfg.photoUpkeep * c.photo[i]
    + cfg.capUpkeep * c.cap[i]
    + cfg.stiffUpkeep * c.stiff[i]
    + cfg.strengthUpkeep * c.strength[i]
    + cfg.permUpkeep * c.perm[i]
    + cfg.digestUpkeep * c.digest[i]);
}

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
  toSpent(w, exchangeSquare(w, i), paid);
  if (fat[i] <= 0) kill(w, i);
  else move(w, i);
}

function stepWet(w, i) {
  const { cells: c, cfg } = w;
  const s = square(w, i);
  c.wear[i]++;

  // Photosynthesis: 2 spent + light -> 1 fat + 1 vital. A full cell makes no more.
  const room = Math.max(0, c.cap[i] - c.fat[i]);
  const made = Math.min(c.photo[i] * w.light[s] * efficiency(w, i), w.spent[s] / 2, room);
  w.spent[s] -= 2 * made;
  w.vital[s] += made;
  c.fat[i] += made;

  // Digestion: detritus -> fat, paid for by respiring extra fat. Only what's digested leaves the
  // square: the undigested remainder would be released right back as detritus.
  const eaten = Math.min(c.digest[i] * cfg.digestRate * w.detritus[s] * efficiency(w, i), room - made);
  w.detritus[s] -= eaten;
  c.fat[i] += eaten;

  // Respiration: 1 fat + 1 vital -> 2 spent
  const cost = upkeepCost(w, i) + cfg.digestCost * eaten;
  const breathed = Math.min(cost, c.fat[i], w.vital[s]);
  c.fat[i] -= breathed;
  w.vital[s] -= breathed;
  w.spent[s] += 2 * breathed;

  // Short of vital: cover the rest by burning extra fat, 1 fat -> 1 spent.
  const burned = Math.min((cost - breathed) * cfg.noVitalCost, c.fat[i]);
  c.fat[i] -= burned;
  w.spent[s] += burned;

  if (c.fat[i] <= 0) {
    kill(w, i);
    return;
  }
  if (c.fat[i] >= c.thresh[i] && w.n < cfg.cap && w.rand() < c.split[i]) divide(w, i);
  move(w, i);
}

// Where a cell's matter goes: its own square, or the nearest shore if out of water.
function exchangeSquare(w, i) {
  const { water, shore } = w.terrain;
  const own = square(w, i);
  return water[own] ? own : shore[Math.min(w.cfg.gridW - 1, Math.max(0, Math.floor(w.cells.x[i])))];
}

// Matter becomes spent, using vital where available: 1 + 1 vital -> 2 spent, else 1 -> 1 spent.
function toSpent(w, s, amount) {
  const burned = Math.min(amount, w.vital[s]);
  w.vital[s] -= burned;
  w.spent[s] += 2 * burned + (amount - burned);
}

// A corpse's fat and biomass split into detritus and spent.
function kill(w, i) {
  const { cells: { fat, biomass }, cfg } = w;
  const s = exchangeSquare(w, i);
  const matter = fat[i] + biomass[i];
  const remains = matter * cfg.deathDetritus;
  w.detritus[s] += remains;
  toSpent(w, s, matter - remains);
  fat[i] = -1; // dead marker, removed by compact()
}

// A new organism's genes: each is nudged by an amount set by the parent's mutation factor.
function mutatedGenes(w, i) {
  const { cells: c, cfg, rand } = w;
  const nudge = (key, min, max) =>
    Math.min(max, Math.max(min, c[key][i] + (rand() + rand() - 1) * c.mut[i] * GENE_SCALE[key]));
  return fitCapacity(cfg, {
    photo: nudge('photo', 0, 1),
    thresh: nudge('thresh', cfg.minThresh, Infinity),
    detach: nudge('detach', 0, 1),
    split: nudge('split', 0, 1),
    share: nudge('share', 0, 1),
    cap: nudge('cap', cfg.minThresh, Infinity),
    stiff: nudge('stiff', 0, cfg.maxTrait),
    strength: nudge('strength', 0, cfg.maxTrait),
    perm: nudge('perm', 0, cfg.maxTrait),
    digest: nudge('digest', 0, 1),
    mut: nudge('mut', cfg.minMutation, Infinity),
  });
}

// Over budget: every body trait shrinks in proportion, so gaining one means giving up others.
function fitCapacity(cfg, genes) {
  const load = traitLoad(cfg, genes);
  if (load <= cfg.traitCapacity) return genes;
  const k = cfg.traitCapacity / load;
  genes.photo *= k;
  genes.stiff *= k;
  genes.strength *= k;
  genes.perm *= k;
  genes.digest *= k;
  genes.cap = cfg.minThresh + (genes.cap - cfg.minThresh) * k;
  return genes;
}

// NEAT-style: join the parent's species if close to its representative, else found a new one.
function assignSpecies(w, parent, genes) {
  if (geneDistance(genes, w.species[parent].genes) < w.cfg.speciesThreshold) return parent;
  w.species.push({ genes, parent, born: w.tick });
  return w.species.length - 1;
}

function divide(w, i) {
  const { cells: c, cfg, rand } = w;
  const detached = rand() < c.detach[i] || w.nBonds >= w.bondA.length;
  // A detached daughter is a new organism: mutation happens only here. One that stays is the
  // same organism: identical genes, joined by a bond.
  const genes = detached ? mutatedGenes(w, i) : Object.fromEntries(GENE_KEYS.map((k) => [k, c[k][i]]));
  const biomass = buildCost(cfg, genes);
  if (c.fat[i] <= cfg.divideCost + biomass) return; // can't afford this daughter

  c.fat[i] -= cfg.divideCost + biomass; // burned, and locked into the daughter's body
  toSpent(w, square(w, i), cfg.divideCost);
  const share = c.fat[i] * c.share[i];
  c.fat[i] -= share;
  c.wear[i] += cfg.wearDivide;
  const d = w.n;
  const species = detached ? assignSpecies(w, c.species[i], genes) : c.species[i];
  spawn(w, c.x[i], c.y[i], share, genes, species, biomass);
  if (!detached) {
    w.bondA[w.nBonds] = i;
    w.bondB[w.nBonds] = d;
    w.nBonds++;
  }

  // Parent and daughter push apart, equal and opposite.
  const kickX = (rand() - 0.5) * 2 * cfg.divideKick;
  const kickY = (rand() - 0.5) * 2 * cfg.divideKick;
  c.vx[d] = c.vx[i] + kickX;
  c.vy[d] = c.vy[i] + kickY;
  c.vx[i] -= kickX;
  c.vy[i] -= kickY;
}

// Water pushes back against gravity. Fat lowers density, stiffness above 1 raises it. Air doesn't.
function buoyancy(w, i) {
  if (isDry(w, i)) return 0;
  const { gravity, fatLift, neutralFat, stiffDensity } = w.cfg;
  const { fat, stiff } = w.cells;
  return gravity * (1 + fatLift * (fat[i] - neutralFat) - stiffDensity * (stiff[i] - 1));
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

const mean = (values, a, b) => (values[a] + values[b]) / 2;

// Bonds: a spring toward bondRest that balances repulsion, passive fat flow from fuller
// to emptier, and a snap past the break distance. Each bond averages its cells' genes.
// Fat updates in turn, so it can't go negative.
function stepBonds(w) {
  const { cells: c, cfg, bondA, bondB } = w;
  const { bondStiffness, bondRest, bondBreak, fatFlow } = cfg;
  let kept = 0;
  for (let k = 0; k < w.nBonds; k++) {
    const a = bondA[k];
    const b = bondB[k];
    const dx = c.x[b] - c.x[a];
    const dy = c.y[b] - c.y[a];
    const d = Math.hypot(dx, dy);
    if (d > bondBreak * mean(c.strength, a, b)) continue;

    if (d > 0) {
      const f = (bondStiffness * mean(c.stiff, a, b) * (d - bondRest)) / d;
      c.vx[a] += f * dx;
      c.vy[a] += f * dy;
      c.vx[b] -= f * dx;
      c.vy[b] -= f * dy;
    }

    const flow = fatFlow * mean(c.perm, a, b) * (c.fat[a] - c.fat[b]);
    c.fat[a] -= flow;
    c.fat[b] += flow;

    bondA[kept] = a;
    bondB[kept] = b;
    kept++;
  }
  w.nBonds = kept;
}

// Soft collisions: overlapping cells push apart, equal and opposite, as firmly as their mean
// stiffness. Each pair is visited once, via its own square and the four "later" neighbors.
// contactDist must be < 1 square.
function repelCells(w) {
  const { cells: c, cfg, bucketHead: head, bucketNext: next } = w;
  const { gridW: W, gridH: H, skyRows, contactDist, repel } = cfg;
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
    const f = (repel * mean(c.stiff, i, j) * (1 - d / contactDist)) / d;
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

// Stable removal keeps iteration order deterministic. Bonds follow their cells or die with them.
function compact(w) {
  const { cells: c, remap, bondA, bondB } = w;
  let to = 0;
  for (let from = 0; from < w.n; from++) {
    if (c.fat[from] < 0) {
      remap[from] = -1;
      continue;
    }
    if (to !== from) for (const k of CELL_KEYS) c[k][to] = c[k][from];
    remap[from] = to;
    to++;
  }
  w.n = to;

  let kept = 0;
  for (let k = 0; k < w.nBonds; k++) {
    const a = remap[bondA[k]];
    const b = remap[bondB[k]];
    if (a < 0 || b < 0) continue;
    bondA[kept] = a;
    bondB[kept] = b;
    kept++;
  }
  w.nBonds = kept;
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

// Decay: 1 detritus + 1 vital -> 2 spent, so without vital it just piles up.
// Sinking runs bottom-up so matter moves one square per tick. In the last square it collects as
// a layer on the floor, still edible, and is only slowly buried as sediment.
function stepDetritus(w) {
  const { gridW: W, gridH: H, detritusDecay, detritusSink, detritusBury } = w.cfg;
  const { detritus, vital, spent, sediment } = w;
  const { water, bottom } = w.terrain;
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      const s = y * W + x;
      if (!water[s]) continue;
      const rotted = Math.min(detritusDecay * detritus[s], vital[s]);
      vital[s] -= rotted;
      spent[s] += 2 * rotted;
      const onFloor = s === bottom[x];
      const left = (onFloor ? detritusBury : detritusSink) * (detritus[s] - rotted);
      detritus[s] -= rotted + left;
      if (onFloor) sediment[x] += left;
      else detritus[s + W] += left;
    }
  }
}

// Sediment slowly returns to the deepest water in its column as spent.
function stepSediment(w) {
  const { sediment } = w;
  const { bottom } = w.terrain;
  for (let x = 0; x < sediment.length; x++) {
    if (bottom[x] < 0) continue;
    const amount = w.cfg.sedimentDecay * sediment[x];
    sediment[x] -= amount;
    toSpent(w, bottom[x], amount);
  }
}

// Vertical drift between water squares only: rate > 0 sinks, rate < 0 rises. Each square loses
// a fraction of its own contents, so with |rate| <= 1 it can't go negative.
function driftField(w, f, rate) {
  const { gridW: W, gridH: H } = w.cfg;
  const { water } = w.terrain;
  w.tmp.set(f);
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      const s = y * W + x;
      if (!water[s] || !water[s + W]) continue;
      const flux = rate * (rate > 0 ? w.tmp[s] : w.tmp[s + W]);
      f[s] -= flux;
      f[s + W] += flux;
    }
  }
}

// Conservative flux form between water squares only. No wrap.
function diffuse(w, f, r) {
  const { gridW: W, gridH: H } = w.cfg;
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
