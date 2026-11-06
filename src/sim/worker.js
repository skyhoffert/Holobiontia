// Drives the sim. Wall-clock timing lives here only, never in world.js.
import { DEFAULTS } from './config.js';
import { createWorld, loadWorld, saveWorld, stepWorld, totalMatter } from './world.js';

const FRAME_MS = 33;
const MAX_TICKS_PER_FRAME = 50;

const cfg = { ...DEFAULTS };
let world = createWorld(cfg);
let playing = false;
let tps = 60;
let owed = 0;

const handlers = {
  play(msg) { playing = msg.on; owed = 0; },
  step() { advance(1); },
  speed(msg) { tps = msg.tps; },
  set(msg) { cfg[msg.key] = msg.value; },
  reset(msg) {
    cfg.seed = msg.seed;
    world = createWorld(cfg);
    playing = false;
  },
  save() {
    self.postMessage({ saved: JSON.stringify(saveWorld(world)), seed: cfg.seed, tick: world.tick });
  },
  load({ data }) {
    Object.assign(cfg, DEFAULTS, data.cfg); // settings added since the save take their defaults
    world = loadWorld(data, cfg);
    playing = false;
  },
};

self.onmessage = ({ data }) => {
  handlers[data.type](data);
  post();
};

function advance(ticks) {
  for (let i = 0; i < ticks && world.n > 0; i++) stepWorld(world);
  if (world.n === 0) playing = false; // extinction ends the run
}

function post() {
  const { n, cells, tick } = world;
  const snapshot = {
    tick,
    n,
    playing,
    gridW: cfg.gridW,
    gridH: cfg.gridH,
    skyRows: cfg.skyRows,
    heights: world.terrain.heights,
    air: { ...world.air },
    // Sky overlay values, on the same scale as the water squares.
    skyLevels: {
      light: cfg.light,
      vital: world.air.vital / (world.terrain.surface.length * cfg.airRows),
      spent: world.air.spent / (world.terrain.surface.length * cfg.airRows),
      detritus: 0,
    },
    matter: totalMatter(world),
    matter0: world.matter0,
    cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, v.slice(0, n)])),
    fields: {
      light: world.light.slice(),
      vital: world.vital.slice(),
      spent: world.spent.slice(),
      detritus: world.detritus.slice(),
    },
    sediment: world.sediment.slice(),
    bondA: world.bondA.slice(0, world.nBonds),
    bondB: world.bondB.slice(0, world.nBonds),
    // Living species only: the full list grows for the whole run.
    speciesInfo: [...new Set(cells.species.subarray(0, n))].map((id) => ({
      id,
      parent: world.species[id].parent,
      born: world.species[id].born,
    })),
  };
  const buffers = [
    ...Object.values(snapshot.cells),
    ...Object.values(snapshot.fields),
    snapshot.sediment,
    snapshot.bondA,
    snapshot.bondB,
  ].map((a) => a.buffer);
  self.postMessage(snapshot, buffers);
}

setInterval(() => {
  if (!playing) return;
  owed = Math.min(owed + (tps * FRAME_MS) / 1000, MAX_TICKS_PER_FRAME);
  const ticks = Math.floor(owed);
  owed -= ticks;
  if (ticks > 0) {
    advance(ticks);
    post();
  }
}, FRAME_MS);

post();
