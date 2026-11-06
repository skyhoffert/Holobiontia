import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULTS, GENE_SCALE, KNOBS, geneDistance, traitLoad } from '../src/sim/config.js';
import { createWorld, loadWorld, saveWorld, stepWorld, totalMatter } from '../src/sim/world.js';

const run = (ticks, overrides = {}) => {
  const w = createWorld({ ...DEFAULTS, ...overrides });
  for (let i = 0; i < ticks; i++) stepWorld(w);
  return w;
};

test('matter is conserved', () => {
  const w = run(2000);
  assert.ok(w.n > 1, 'population should grow');
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

test('fields never go negative', () => {
  const w = run(2000);
  assert.ok(w.vital.every((v) => v >= 0));
  assert.ok(w.spent.every((v) => v >= 0));
  assert.ok(w.detritus.every((v) => v >= 0));
  assert.ok(w.sediment.every((v) => v >= 0));
});

test('same seed replays identically', () => {
  const a = run(1000);
  const b = run(1000);
  assert.equal(a.n, b.n);
  assert.deepEqual(a.cells.x.slice(0, a.n), b.cells.x.slice(0, b.n));
  assert.deepEqual(a.spent, b.spent);
  assert.deepEqual(a.detritus, b.detritus);
  assert.deepEqual(a.sediment, b.sediment);
});

// Upkeep multiplier from LUCA's stiffness, bond strength and permeability.
const bondTraitUpkeep = DEFAULTS.stiffUpkeep * DEFAULTS.lucaStiff
  + DEFAULTS.strengthUpkeep * DEFAULTS.lucaStrength
  + DEFAULTS.permUpkeep * DEFAULTS.lucaPerm;

// A world holding one cell at a given spot.
const placed = (x, y) => {
  const w = createWorld({ ...DEFAULTS });
  w.cells.x[0] = x;
  w.cells.y[0] = y;
  return w;
};

test('cells stay out of rock and dry squares hold no matter', () => {
  const w = run(3000);
  const { heights, water } = w.terrain;
  for (let i = 0; i < w.n; i++) {
    const col = Math.floor(w.cells.x[i]);
    const floor = heights[col] + (heights[col + 1] - heights[col]) * (w.cells.x[i] - col);
    assert.ok(w.cells.y[i] < floor);
  }
  water.forEach((wet, s) => {
    if (!wet) assert.equal(w.vital[s] + w.spent[s] + w.detritus[s], 0);
  });
});

test('terrain has land above the surface and different shelves each side', () => {
  const { terrain, gridW: W } = DEFAULTS;
  const { heights } = createWorld({ ...DEFAULTS }).terrain;
  terrain.forEach(([x, y]) => assert.equal(heights[x], y));
  assert.ok(heights[0] < 0 && heights[W] < 0);
  const shelves = (points) => points.filter(([, y], i) => i && y === points[i - 1][1]).map(([, y]) => y);
  const mid = terrain.length / 2;
  assert.notDeepEqual(shelves(terrain.slice(0, mid)), shelves(terrain.slice(mid)).reverse());
  assert.equal(terrain.at(-1)[0], W);
});

test('fields do not cross the side edges', () => {
  const w = createWorld({ ...DEFAULTS, airExchange: 0 });
  w.n = 0;
  w.spent.fill(0);
  w.vital.fill(0);
  const { gridW: W, gridH: H } = DEFAULTS;
  w.spent[w.terrain.water.indexOf(1)] = 100; // leftmost water
  for (let t = 0; t < 100; t++) stepWorld(w);
  for (let y = 0; y < H; y++) {
    for (let x = W / 2; x < W; x++) assert.equal(w.spent[y * W + x], 0);
  }
});

test('touching a side edge kills a cell, matter conserved', () => {
  for (const x of [0.1, DEFAULTS.gridW - 0.1]) {
    const w = placed(x, -7);
    stepWorld(w);
    assert.equal(w.n, 0);
    assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
  }
});

test('cell on land burns fat at upkeep and starves, matter conserved', () => {
  const w = placed(2, -4.5);
  const { lucaFat, lucaPhoto, lucaCap, upkeep, photoUpkeep, capUpkeep } = DEFAULTS;
  const cost = upkeep * (1 + photoUpkeep * lucaPhoto + capUpkeep * lucaCap + bondTraitUpkeep);
  const lifespan = Math.ceil(lucaFat / cost);

  for (let t = 1; t < lifespan; t++) {
    stepWorld(w);
    assert.equal(w.n, 1);
    assert.ok(Math.abs(w.cells.fat[0] - (lucaFat - t * cost)) < 1e-9);
    assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
  }
  stepWorld(w);
  assert.equal(w.n, 0);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
  w.terrain.water.forEach((wet, s) => {
    if (!wet) assert.equal(w.spent[s] + w.vital[s], 0);
  });
});

test('cell in the air falls back into water', () => {
  const w = placed(DEFAULTS.gridW / 2, -0.5);
  let reached = false;
  for (let t = 0; t < 80 && !reached; t++) {
    stepWorld(w);
    reached = w.n > 0 && w.cells.y[0] >= 0;
  }
  assert.ok(reached);
});

test('motion is smooth: velocity carries over between ticks', () => {
  const w = createWorld({ ...DEFAULTS, upkeep: 0, lucaThresh: 1e9 });
  w.cells.y[0] = 10;
  let matches = 0;
  let prev = 0;
  for (let t = 0; t < 400; t++) {
    const x = w.cells.x[0];
    stepWorld(w);
    const dx = w.cells.x[0] - x;
    if (dx * prev > 0) matches++;
    prev = dx;
  }
  assert.ok(matches > 300, `direction held on ${matches}/400 ticks`);
});

test('division is a push, not a jump, and conserves momentum', () => {
  const w = createWorld({ ...DEFAULTS, drift: 0, damping: 1, repel: 0, gravity: 0, lucaFat: 3, lucaThresh: 2, lucaDetach: 1, lucaSplit: 1 });
  const { x: x0, y: y0 } = { x: w.cells.x[0], y: w.cells.y[0] };
  stepWorld(w);
  assert.equal(w.n, 2);
  const c = w.cells;
  assert.ok(Math.abs(c.x[1] - x0) < 1e-12 && Math.abs(c.y[1] - y0) < 1e-12); // daughter starts at parent
  assert.ok(Math.abs(c.vx[0] + c.vx[1]) < 1e-12);
  assert.ok(Math.abs(c.vy[0] + c.vy[1]) < 1e-12);
  assert.ok(Math.hypot(c.vx[0], c.vy[0]) <= Math.SQRT2 * DEFAULTS.divideKick);
});

test('overlapping cells push apart, far cells do not', () => {
  const w = createWorld({ ...DEFAULTS, drift: 0, lucaThresh: 1e9, lucaFat: 5, lucaSplit: 0 });
  const c = w.cells;
  c.x[1] = c.x[0] + 0.1;
  c.y[1] = c.y[0];
  c.x[2] = c.x[0] + 5;
  c.y[2] = c.y[0];
  for (const i of [1, 2]) {
    c.fat[i] = 5;
    c.photo[i] = c.photo[0];
    c.thresh[i] = 1e9;
    c.stiff[i] = c.stiff[0];
  }
  w.n = 3;
  w.matter0 = totalMatter(w);
  stepWorld(w);
  assert.ok(c.vx[0] < 0 && c.vx[1] > 0);
  assert.ok(Math.abs(c.vx[0] + c.vx[1]) < 1e-12);
  assert.equal(c.vx[2], 0);
});

test('wear lowers output but does not kill a fed cell', () => {
  const gain = (wear) => {
    const w = createWorld({ ...DEFAULTS, upkeep: 0, lucaThresh: 1e9 });
    w.cells.wear[0] = wear;
    const before = w.cells.fat[0];
    stepWorld(w);
    return w.cells.fat[0] - before;
  };
  assert.ok(gain(DEFAULTS.wearHalf * 9) < gain(0) / 5);

  const w = createWorld({ ...DEFAULTS, upkeep: 0, lucaThresh: 1e9 });
  w.cells.wear[0] = 1e7;
  for (let t = 0; t < 2000; t++) stepWorld(w);
  assert.equal(w.n, 1);
});

test('old cell starves once output falls below upkeep', () => {
  const w = createWorld({ ...DEFAULTS, lucaThresh: 1e9 });
  w.cells.wear[0] = 1e7;
  for (let t = 0; t < 2000 && w.n; t++) stepWorld(w);
  assert.equal(w.n, 0);
});

test('in water, fat cells rise and lean cells sink', () => {
  const depthAfter = (fat) => {
    const w = createWorld({ ...DEFAULTS, drift: 0, upkeep: 0, lucaPhoto: 0, lucaFat: fat, lucaThresh: 1e9 });
    w.cells.y[0] = 20;
    for (let t = 0; t < 200; t++) stepWorld(w);
    return w.cells.y[0];
  };
  assert.ok(depthAfter(1.8) < 20);
  assert.ok(depthAfter(0.2) > 20);
  assert.equal(depthAfter(DEFAULTS.neutralFat), 20);
});

test('atmosphere refills depleted surface water, matter conserved', () => {
  const w = createWorld({ ...DEFAULTS });
  w.n = 0;
  w.spent.fill(0);
  const before = totalMatter(w);
  const airBefore = w.air.spent;
  for (let t = 0; t < 50; t++) stepWorld(w);
  for (const s of w.terrain.surface) assert.ok(w.spent[s] > 0);
  assert.ok(w.air.spent < airBefore);
  assert.ok(Math.abs(totalMatter(w) - before) < 1e-6);
});

test('atmosphere and water start in balance', () => {
  const w = createWorld({ ...DEFAULTS, vitalRise: 0, spentSink: 0 });
  w.n = 0;
  const spent = w.spent.slice();
  for (let t = 0; t < 50; t++) stepWorld(w);
  w.terrain.water.forEach((wet, s) => {
    if (wet) assert.ok(Math.abs(w.spent[s] - spent[s]) < 1e-9);
  });
});

test('division burns fat at the set cost, matter conserved', () => {
  const w = createWorld({ ...DEFAULTS, upkeep: 0, lucaPhoto: 0, lucaFat: 3, lucaThresh: 2, lucaSplit: 1 });
  stepWorld(w);
  assert.equal(w.n, 2);
  assert.ok(Math.abs(w.cells.fat[0] + w.cells.fat[1] - (3 - DEFAULTS.divideCost - w.cells.biomass[1])) < 1e-9);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

const total = (values) => values.reduce((a, b) => a + b, 0);

// An empty world with still water, except for any overrides.
const emptyWorld = (overrides) => {
  const w = createWorld({ ...DEFAULTS, airExchange: 0, diffusion: 0, detritusDiffusion: 0, vitalRise: 0, spentSink: 0, ...overrides });
  w.n = 0;
  return w;
};

test('a corpse leaves its share of fat and biomass as detritus, matter conserved', () => {
  const w = createWorld({ ...DEFAULTS, detritusDecay: 0, sedimentDecay: 0 });
  w.cells.x[0] = 0.1;
  w.cells.y[0] = -7;
  const expected = (DEFAULTS.lucaFat + w.cells.biomass[0]) * DEFAULTS.deathDetritus;
  stepWorld(w);
  assert.equal(w.n, 0);
  assert.ok(Math.abs(total(w.detritus) + total(w.sediment) - expected) < 1e-9);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

test('a cell that starves at zero fat still leaves detritus', () => {
  const w = createWorld({ ...DEFAULTS, lucaPhoto: 0, lucaThresh: 1e9, detritusDecay: 0, sedimentDecay: 0 });
  w.cells.y[0] = 10;
  const biomass = w.cells.biomass[0];
  for (let t = 0; t < 500 && w.n; t++) stepWorld(w);
  assert.equal(w.n, 0);
  assert.ok(Math.abs(total(w.detritus) + total(w.sediment) - biomass * DEFAULTS.deathDetritus) < 1e-9);
});

test('detritus sinks through its column and settles as sediment, matter conserved', () => {
  const w = emptyWorld({ detritusSink: 0.05, detritusBury: 0.05, detritusDecay: 0, sedimentDecay: 0 });
  const x = DEFAULTS.gridW / 2;
  w.detritus[x] = 1; // top row
  const before = totalMatter(w);
  stepWorld(w);
  assert.ok(w.detritus[x] < 1);
  assert.ok(w.detritus[x + DEFAULTS.gridW] > 0);
  assert.equal(w.detritus[x + 2 * DEFAULTS.gridW], 0); // one square per tick
  for (let t = 0; t < 5000; t++) stepWorld(w);
  assert.ok(w.sediment[x] > 0.99);
  assert.ok(Math.abs(totalMatter(w) - before) < 1e-6);
});

test('detritus collects in a layer on the floor before slowly becoming sediment', () => {
  const x = DEFAULTS.gridW / 2;
  const settling = emptyWorld({ detritusSink: 0.5, detritusBury: 0, detritusDecay: 0, sedimentDecay: 0 });
  const floor = settling.terrain.bottom[x];
  settling.detritus[x] = 1; // top row
  for (let t = 0; t < 500; t++) stepWorld(settling);
  assert.ok(settling.detritus[floor] > 0.99);
  assert.equal(settling.sediment[x], 0);

  const burying = emptyWorld({ detritusDecay: 0, sedimentDecay: 0 });
  burying.detritus[floor] = 1;
  const before = totalMatter(burying);
  stepWorld(burying);
  assert.ok(Math.abs(burying.sediment[x] - DEFAULTS.detritusBury) < 1e-12);
  assert.ok(Math.abs(burying.detritus[floor] - (1 - DEFAULTS.detritusBury)) < 1e-12);
  assert.ok(Math.abs(totalMatter(burying) - before) < 1e-6);
});

test('detritus decay turns vital into spent, and stalls without vital', () => {
  const s = 20 * DEFAULTS.gridW + DEFAULTS.gridW / 2;

  const aired = emptyWorld({ detritusSink: 0 });
  aired.detritus[s] = 1;
  stepWorld(aired);
  const rotted = DEFAULTS.detritusDecay;
  assert.ok(Math.abs(aired.detritus[s] - (1 - rotted)) < 1e-12);
  assert.ok(Math.abs(aired.vital[s] - (DEFAULTS.vital0 - rotted)) < 1e-12);
  assert.ok(Math.abs(aired.spent[s] - (DEFAULTS.spent0 + 2 * rotted)) < 1e-12);

  const dead = emptyWorld({ detritusSink: 0 });
  dead.vital.fill(0);
  dead.detritus[s] = 1;
  for (let t = 0; t < 100; t++) stepWorld(dead);
  assert.equal(dead.detritus[s], 1);
});

test('sediment breaks down into the deepest water of its column, matter conserved', () => {
  const w = emptyWorld({});
  const x = DEFAULTS.gridW / 2;
  const s = w.terrain.bottom[x];
  w.sediment[x] = 10;
  const before = totalMatter(w);
  stepWorld(w);
  const amount = 10 * DEFAULTS.sedimentDecay;
  assert.ok(Math.abs(w.sediment[x] - (10 - amount)) < 1e-12);
  assert.ok(Math.abs(w.vital[s] - (DEFAULTS.vital0 - amount)) < 1e-12);
  assert.ok(Math.abs(w.spent[s] - (DEFAULTS.spent0 + 2 * amount)) < 1e-12);
  assert.ok(Math.abs(totalMatter(w) - before) < 1e-6);
});

test('vital rises and spent sinks one square per tick', () => {
  const { vitalRise, spentSink, vital0, spent0, gridW: W } = DEFAULTS;
  const w = emptyWorld({ vitalRise, spentSink });
  const x = W / 2;
  const floor = w.terrain.bottom[x];
  stepWorld(w);
  assert.ok(Math.abs(w.vital[x] - vital0 * (1 + vitalRise)) < 1e-12);
  assert.ok(Math.abs(w.spent[x] - spent0 * (1 - spentSink)) < 1e-12);
  assert.ok(Math.abs(w.vital[floor] - vital0 * (1 - vitalRise)) < 1e-12);
  assert.ok(Math.abs(w.spent[floor] - spent0 * (1 + spentSink)) < 1e-12);
  assert.ok(Math.abs(w.vital[x + W] - vital0) < 1e-12); // in equals out mid-column
});

test('drift against diffusion builds a gradient and stays in the water, matter conserved', () => {
  const { vitalRise, spentSink, diffusion, gridW: W } = DEFAULTS;
  const w = emptyWorld({ vitalRise, spentSink, diffusion });
  const before = totalMatter(w);
  for (let t = 0; t < 1000; t++) stepWorld(w);
  const x = W / 2;
  const floor = w.terrain.bottom[x];
  assert.ok(w.spent[floor] > w.spent[x]);
  assert.ok(w.vital[x] > w.vital[floor]);
  assert.ok(Math.abs(totalMatter(w) - before) < 1e-6);
  w.terrain.water.forEach((wet, s) => {
    if (!wet) assert.equal(w.vital[s] + w.spent[s], 0);
  });
});

test('with no vital, a cell burns extra fat instead of dying at once', () => {
  const w = createWorld({ ...DEFAULTS, lucaPhoto: 0, lucaFat: 1, lucaThresh: 1e9, airExchange: 0 });
  const before = totalMatter(w);
  w.vital.fill(0);
  const matter = totalMatter(w);
  stepWorld(w);
  assert.equal(w.n, 1);
  const cost = DEFAULTS.upkeep * (1 + DEFAULTS.capUpkeep * DEFAULTS.lucaCap + bondTraitUpkeep);
  assert.ok(Math.abs(w.cells.fat[0] - (1 - cost * DEFAULTS.noVitalCost)) < 1e-9);
  assert.ok(Math.abs(totalMatter(w) - matter) < 1e-6);
  assert.ok(before > matter);
  for (let t = 0; t < 2 / (cost * DEFAULTS.noVitalCost) && w.n; t++) stepWorld(w);
  assert.equal(w.n, 0); // starves in about 1 / (cost * noVitalCost) ticks
});

const BOND_GENES = ['stiff', 'strength', 'perm'];

// Two cells joined by one bond, on the deep floor's open water.
const bondedPair = (overrides, gap) => {
  const w = createWorld({ ...DEFAULTS, drift: 0, gravity: 0, repel: 0, upkeep: 0, lucaPhoto: 0, lucaThresh: 1e9, lucaSplit: 0, ...overrides });
  const c = w.cells;
  c.y[0] = 20;
  c.x[1] = c.x[0] + gap;
  c.y[1] = 20;
  c.fat[1] = c.fat[0];
  c.thresh[1] = 1e9;
  for (const k of BOND_GENES) c[k][1] = c[k][0];
  w.n = 2;
  w.bondA[0] = 0;
  w.bondB[0] = 1;
  w.nBonds = 1;
  w.matter0 = totalMatter(w);
  return w;
};

test('a daughter that stays is bonded and genetically identical', () => {
  const w = createWorld({ ...DEFAULTS, lucaFat: 3, lucaThresh: 2, lucaDetach: 0, lucaSplit: 1 });
  stepWorld(w);
  const c = w.cells;
  assert.equal(w.n, 2);
  assert.equal(w.nBonds, 1);
  assert.deepEqual([w.bondA[0], w.bondB[0]], [0, 1]);
  assert.equal(c.photo[0], c.photo[1]);
  assert.equal(c.thresh[0], c.thresh[1]);
  assert.equal(c.detach[0], c.detach[1]);
  assert.equal(c.split[0], c.split[1]);
  assert.equal(c.share[0], c.share[1]);
  assert.equal(c.cap[0], c.cap[1]);
  for (const k of BOND_GENES) assert.equal(c[k][0], c[k][1]);
  assert.equal(c.mut[0], c.mut[1]);
});

test('a full cell makes no more fat', () => {
  const w = createWorld({ ...DEFAULTS, upkeep: 0, lucaFat: 2, lucaCap: 2, lucaThresh: 1e9 });
  stepWorld(w);
  assert.equal(w.cells.fat[0], 2);

  const roomy = createWorld({ ...DEFAULTS, upkeep: 0, lucaFat: 2, lucaCap: 3, lucaThresh: 1e9 });
  stepWorld(roomy);
  assert.ok(roomy.cells.fat[0] > 2);
});

test('more fat capacity costs more upkeep', () => {
  const burned = (lucaCap) => {
    const w = createWorld({ ...DEFAULTS, lucaCap });
    w.cells.x[0] = 2;
    w.cells.y[0] = -4.5;
    stepWorld(w);
    return DEFAULTS.lucaFat - w.cells.fat[0];
  };
  assert.ok(burned(8) > burned(2));
});

test('a cell with no split chance never divides', () => {
  const w = createWorld({ ...DEFAULTS, upkeep: 0, lucaPhoto: 0, lucaFat: 3, lucaSplit: 0 });
  for (let t = 0; t < 100; t++) stepWorld(w);
  assert.equal(w.n, 1);
});

test('the daughter share gene sets how fat is divided', () => {
  const w = createWorld({ ...DEFAULTS, upkeep: 0, lucaPhoto: 0, lucaFat: 3, lucaDetach: 1, lucaSplit: 1, lucaShare: 0.25 });
  stepWorld(w);
  assert.equal(w.n, 2);
  const left = 3 - DEFAULTS.divideCost - w.cells.biomass[1];
  assert.ok(Math.abs(w.cells.fat[1] - left * 0.25) < 1e-9);
  assert.ok(Math.abs(w.cells.fat[0] - left * 0.75) < 1e-9);
});

test('the mutation factor sets mutation size, mutates itself, and has a minimum', () => {
  const founded = (overrides) => {
    const w = createWorld({ ...DEFAULTS, lucaFat: 3, lucaDetach: 1, lucaSplit: 1, ...overrides });
    stepWorld(w);
    assert.equal(w.n, 2);
    return w.cells;
  };
  const frozen = founded({ lucaMut: 0, minMutation: 0 });
  assert.equal(frozen.photo[0], frozen.photo[1]);
  assert.equal(frozen.mut[1], 0);

  const normal = founded({});
  assert.notEqual(normal.mut[0], normal.mut[1]);

  const low = founded({ lucaMut: 0.001, minMutation: 0.002 });
  assert.equal(low.mut[1], 0.002);
});

test('a daughter that detaches has no bond and mutates', () => {
  const w = createWorld({ ...DEFAULTS, lucaFat: 3, lucaThresh: 2, lucaDetach: 1, lucaSplit: 1 });
  stepWorld(w);
  assert.equal(w.n, 2);
  assert.equal(w.nBonds, 0);
  assert.notEqual(w.cells.photo[0], w.cells.photo[1]);
});

test('bond spring pulls stretched cells together and pushes close ones apart', () => {
  const far = bondedPair({}, 1);
  stepWorld(far);
  assert.ok(far.cells.vx[0] > 0 && far.cells.vx[1] < 0);
  assert.ok(Math.abs(far.cells.vx[0] + far.cells.vx[1]) < 1e-12);

  const near = bondedPair({}, 0.2);
  stepWorld(near);
  assert.ok(near.cells.vx[0] < 0 && near.cells.vx[1] > 0);
});

test('spring and repulsion settle a pair near the balance point', () => {
  const w = bondedPair({ repel: DEFAULTS.repel }, 1);
  for (let t = 0; t < 3000; t++) stepWorld(w);
  const gap = Math.abs(w.cells.x[1] - w.cells.x[0]);
  assert.ok(gap > DEFAULTS.bondRest && gap < DEFAULTS.contactDist, `gap ${gap}`);
});

test('a bond stretched past its limit snaps; the cells live on', () => {
  const w = bondedPair({}, DEFAULTS.bondBreak + 0.1);
  stepWorld(w);
  assert.equal(w.nBonds, 0);
  assert.equal(w.n, 2);
});

test('fat flows across a bond from fuller to emptier, matter conserved', () => {
  const w = bondedPair({}, 0.4);
  w.cells.fat[0] = 2;
  w.cells.fat[1] = 0.5;
  w.matter0 = totalMatter(w);
  stepWorld(w);
  assert.ok(w.cells.fat[0] < 2 && w.cells.fat[1] > 0.5);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

test('bonds follow compaction and die with their cells', () => {
  const w = bondedPair({}, 0.4);
  const c = w.cells;
  // Add a third cell, bonded to cell 1, then kill cell 0 by putting it on the edge.
  c.x[2] = c.x[1] + 0.4;
  c.y[2] = 20;
  c.fat[2] = 1;
  c.thresh[2] = 1e9;
  for (const k of BOND_GENES) c[k][2] = c[k][0];
  c.id[2] = 99;
  w.n = 3;
  w.bondA[1] = 1;
  w.bondB[1] = 2;
  w.nBonds = 2;
  c.x[0] = 0.1;
  c.y[0] = -7;
  stepWorld(w);
  assert.equal(w.n, 2);
  assert.equal(w.nBonds, 1);
  assert.deepEqual([w.bondA[0], w.bondB[0]], [0, 1]);
  assert.equal(c.id[1], 99);
});

test('stiffness sets spring force, averaged across the bond', () => {
  const pull = (w) => {
    stepWorld(w);
    return w.cells.vx[0];
  };
  const expected = DEFAULTS.bondStiffness * 2 * (1 - DEFAULTS.bondRest);
  assert.ok(Math.abs(pull(bondedPair({ lucaStiff: 2 }, 1)) - expected) < 1e-12);

  const mixed = bondedPair({}, 1);
  mixed.cells.stiff[0] = 3;
  mixed.cells.stiff[1] = 1;
  assert.ok(Math.abs(pull(mixed) - expected) < 1e-12);
});

test('stiffer cells collide more firmly', () => {
  const push = (lucaStiff) => {
    const w = createWorld({ ...DEFAULTS, drift: 0, gravity: 0, lucaThresh: 1e9, lucaSplit: 0, lucaStiff });
    const c = w.cells;
    c.y[0] = 20;
    c.x[1] = c.x[0] + 0.1;
    c.y[1] = 20;
    c.fat[1] = c.fat[0];
    c.thresh[1] = 1e9;
    c.stiff[1] = lucaStiff;
    w.n = 2;
    stepWorld(w);
    return c.vx[1];
  };
  assert.ok(push(2) > push(1));
  assert.equal(push(0), 0);
});

test('stiffness raises density', () => {
  const depthAfter = (lucaStiff) => {
    const w = createWorld({ ...DEFAULTS, drift: 0, upkeep: 0, lucaPhoto: 0, lucaFat: DEFAULTS.neutralFat, lucaThresh: 1e9, lucaStiff });
    w.cells.y[0] = 20;
    for (let t = 0; t < 200; t++) stepWorld(w);
    return w.cells.y[0];
  };
  assert.ok(depthAfter(3) > 20);
  assert.ok(depthAfter(0) < 20);
});

test('bond strength sets the snap distance', () => {
  const gap = DEFAULTS.bondBreak + 0.1;
  const strong = bondedPair({ lucaStrength: 2 }, gap);
  stepWorld(strong);
  assert.equal(strong.nBonds, 1);

  const weak = bondedPair({ lucaStrength: 0.5 }, DEFAULTS.bondBreak * 0.6);
  stepWorld(weak);
  assert.equal(weak.nBonds, 0);
});

test('permeability sets fat flow, matter conserved', () => {
  const flowed = (lucaPerm) => {
    const w = bondedPair({ lucaPerm }, 0.4);
    w.cells.fat[0] = 2;
    w.cells.fat[1] = 0.5;
    w.matter0 = totalMatter(w);
    stepWorld(w);
    assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
    return 2 - w.cells.fat[0];
  };
  assert.equal(flowed(0), 0);
  assert.ok(Math.abs(flowed(2) - DEFAULTS.fatFlow * 2 * 1.5) < 1e-12);
});

test('each bond trait costs upkeep', () => {
  const burned = (overrides) => {
    const w = createWorld({ ...DEFAULTS, ...overrides });
    w.cells.x[0] = 2;
    w.cells.y[0] = -4.5;
    stepWorld(w);
    return DEFAULTS.lucaFat - w.cells.fat[0];
  };
  const base = burned({});
  assert.ok(burned({ lucaStiff: 3 }) > base);
  assert.ok(burned({ lucaStrength: 3 }) > base);
  assert.ok(burned({ lucaPerm: 3 }) > base);
});

test('bond traits mutate in a new organism and stay in range', () => {
  const w = createWorld({ ...DEFAULTS, lucaFat: 3, lucaDetach: 1, lucaSplit: 1, lucaMut: 10 });
  stepWorld(w);
  assert.equal(w.n, 2);
  for (const k of BOND_GENES) {
    assert.notEqual(w.cells[k][0], w.cells[k][1]);
    assert.ok(w.cells[k][1] >= 0 && w.cells[k][1] <= DEFAULTS.maxTrait);
  }
});

// LUCA divides on the first tick.
const firstDivision = (overrides) => {
  const w = createWorld({ ...DEFAULTS, lucaFat: 3, lucaSplit: 1, ...overrides });
  stepWorld(w);
  assert.equal(w.n, 2);
  return w;
};

test('genetic distance is measured in mutation scales', () => {
  const a = Object.fromEntries(Object.keys(GENE_SCALE).map((k) => [k, 1]));
  assert.equal(geneDistance(a, a), 0);
  assert.equal(geneDistance(a, { ...a, thresh: 1 + GENE_SCALE.thresh }), 1);
});

test('a bonded daughter stays in its species', () => {
  const w = firstDivision({ lucaDetach: 0, speciesThreshold: 0 });
  assert.equal(w.species.length, 1);
  assert.equal(w.cells.species[1], 0);
});

test('a detached daughter within the threshold joins its parent species', () => {
  const w = firstDivision({ lucaDetach: 1, speciesThreshold: Infinity });
  assert.equal(w.species.length, 1);
  assert.equal(w.cells.species[1], 0);
});

test('a detached daughter past the threshold founds a species', () => {
  const w = firstDivision({ lucaDetach: 1, speciesThreshold: 0 });
  assert.equal(w.species.length, 2);
  assert.equal(w.cells.species[0], 0);
  assert.equal(w.cells.species[1], 1);
  assert.equal(w.species[1].parent, 0);
  assert.equal(w.species[1].born, 0);
  assert.equal(w.species[1].genes.photo, w.cells.photo[1]);
});

test('species labels do not affect the simulation', () => {
  const split = run(1000, { speciesThreshold: 0 });
  const lumped = run(1000, { speciesThreshold: Infinity });
  assert.ok(split.species.length > lumped.species.length);
  assert.equal(split.n, lumped.n);
  assert.deepEqual(split.cells.x.slice(0, split.n), lumped.cells.x.slice(0, lumped.n));
  assert.deepEqual(split.spent, lumped.spent);
});

test('knob defaults sit inside their hard limits', () => {
  for (const { key, hardMin = 0, hardMax = Infinity } of KNOBS) {
    assert.ok(DEFAULTS[key] >= hardMin && DEFAULTS[key] <= hardMax, key);
  }
});

test('a new cell body costs its base plus each body trait', () => {
  const genes = { lucaPhoto: 0.5, lucaCap: 6, lucaStiff: 2, lucaStrength: 3, lucaPerm: 4, lucaDigest: 0.5 };
  const w = firstDivision({ lucaFat: 4, lucaDetach: 0, upkeep: 0, ...genes });
  const { cellBiomass, photoBuild, capBuild, stiffBuild, strengthBuild, permBuild, digestBuild } = DEFAULTS;
  const expected = cellBiomass + photoBuild * 0.5 + capBuild * 6 + stiffBuild * 2 + strengthBuild * 3 + permBuild * 4 + digestBuild * 0.5;
  assert.ok(Math.abs(w.cells.biomass[1] - expected) < 1e-12);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

test('a costlier daughter leaves the family less fat', () => {
  const fatLeft = (lucaStiff) => {
    const w = firstDivision({ lucaDetach: 0, upkeep: 0, lucaPhoto: 0, lucaStiff });
    return w.cells.fat[0] + w.cells.fat[1];
  };
  assert.ok(fatLeft(4) < fatLeft(1));
});

test('a parent that cannot afford a daughter does not divide or pay', () => {
  const w = createWorld({ ...DEFAULTS, upkeep: 0, lucaPhoto: 0, lucaFat: 0.5, lucaThresh: 0.1, lucaSplit: 1, lucaDetach: 1, speciesThreshold: 0 });
  stepWorld(w);
  assert.equal(w.n, 1);
  assert.equal(w.cells.fat[0], 0.5);
  assert.equal(w.cells.wear[0], 1); // aged only by the tick
  assert.equal(w.species.length, 1);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

test('a heavily built corpse returns all its matter', () => {
  const w = createWorld({ ...DEFAULTS, lucaStiff: 5, lucaStrength: 5, lucaPerm: 5 });
  w.cells.x[0] = 0.1;
  w.cells.y[0] = -7;
  stepWorld(w);
  assert.equal(w.n, 0);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

// The detached daughter's body traits, with this trait capacity.
const founded = (traitCapacity) => {
  const c = firstDivision({ lucaDetach: 1, traitCapacity }).cells;
  return { photo: c.photo[1], cap: c.cap[1], stiff: c.stiff[1], strength: c.strength[1], perm: c.perm[1], digest: c.digest[1] };
};

test('LUCA starts within its trait capacity', () => {
  const load = traitLoad(DEFAULTS, { photo: DEFAULTS.lucaPhoto, cap: DEFAULTS.lucaCap, stiff: DEFAULTS.lucaStiff, strength: DEFAULTS.lucaStrength, perm: DEFAULTS.lucaPerm, digest: DEFAULTS.lucaDigest });
  assert.ok(load < DEFAULTS.traitCapacity);
});

test('a new organism under capacity keeps its mutated traits', () => {
  assert.deepEqual(founded(DEFAULTS.traitCapacity), founded(Infinity));
});

test('a new organism over capacity shrinks all body traits in proportion', () => {
  const free = founded(Infinity);
  const capacity = traitLoad(DEFAULTS, free) / 2;
  const fitted = founded(capacity);
  assert.ok(Math.abs(traitLoad(DEFAULTS, fitted) - capacity) < 1e-12);
  for (const k of ['photo', 'stiff', 'strength', 'perm', 'digest']) {
    assert.ok(Math.abs(fitted[k] - free[k] / 2) < 1e-12, k);
  }
  const { minThresh } = DEFAULTS;
  assert.ok(Math.abs(fitted.cap - minThresh - (free.cap - minThresh) / 2) < 1e-12);
});

test('zero trait capacity leaves fat capacity at its minimum', () => {
  const fitted = founded(0);
  assert.equal(fitted.photo, 0);
  assert.equal(fitted.stiff, 0);
  assert.equal(fitted.cap, DEFAULTS.minThresh);
});

test('a bonded daughter keeps its parent genes even over capacity', () => {
  const c = firstDivision({ lucaDetach: 0, traitCapacity: 0 }).cells;
  assert.equal(c.photo[1], c.photo[0]);
  assert.equal(c.stiff[1], c.stiff[0]);
  assert.equal(c.cap[1], c.cap[0]);
});

// One still cell in open water with a square of detritus and nothing else going on.
const digester = (overrides) => {
  const w = createWorld({ ...DEFAULTS, drift: 0, gravity: 0, upkeep: 0, lucaPhoto: 0, lucaDigest: 1, lucaThresh: 1e9, lucaSplit: 0, detritusSink: 0, detritusDecay: 0, detritusDiffusion: 0, ...overrides });
  w.cells.y[0] = 20;
  const s = 20 * DEFAULTS.gridW + DEFAULTS.gridW / 2;
  w.detritus[s] = 1;
  w.matter0 = totalMatter(w);
  return { w, s };
};

test('digestion turns detritus into fat, pays in respiration, matter conserved', () => {
  const { w, s } = digester({});
  stepWorld(w);
  const eaten = DEFAULTS.digestRate / (1 + 1 / DEFAULTS.wearHalf);
  assert.ok(Math.abs(w.detritus[s] - (1 - eaten)) < 1e-12);
  assert.ok(Math.abs(w.cells.fat[0] - (DEFAULTS.lucaFat + eaten * (1 - DEFAULTS.digestCost))) < 1e-12);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

test('a cell can digest the detritus layer on the floor', () => {
  const x = DEFAULTS.gridW / 2;
  const { w } = digester({});
  const floor = w.terrain.bottom[x];
  w.detritus.fill(0);
  w.detritus[floor] = 1;
  w.cells.y[0] = Math.floor(floor / DEFAULTS.gridW) + 0.5;
  w.matter0 = totalMatter(w);
  stepWorld(w);
  assert.ok(w.detritus[floor] < 1);
  assert.ok(w.cells.fat[0] > DEFAULTS.lucaFat);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

test('a cell without digestion leaves detritus alone', () => {
  const { w, s } = digester({ lucaDigest: 0 });
  stepWorld(w);
  assert.equal(w.detritus[s], 1);
  assert.equal(w.cells.fat[0], DEFAULTS.lucaFat);
});

test('a full cell digests no more', () => {
  const { w, s } = digester({ lucaFat: 2, lucaCap: 2 });
  stepWorld(w);
  assert.equal(w.detritus[s], 1);
  assert.equal(w.cells.fat[0], 2);
});

test('digestion costs upkeep', () => {
  const burned = (lucaDigest) => {
    const w = createWorld({ ...DEFAULTS, lucaDigest });
    w.cells.x[0] = 2;
    w.cells.y[0] = -4.5;
    stepWorld(w);
    return DEFAULTS.lucaFat - w.cells.fat[0];
  };
  assert.ok(burned(0.5) > burned(0));
});

test('a cell can live on detritus alone in the dark, and starves without it', () => {
  const liveOn = (lucaDigest) => {
    const w = createWorld({ ...DEFAULTS, lucaPhoto: 0, lucaDigest, lucaThresh: 1e9, lucaSplit: 0, detritusSink: 0, detritusDecay: 0 });
    w.cells.y[0] = 30;
    w.terrain.water.forEach((wet, s) => { w.detritus[s] = wet; });
    const before = totalMatter(w);
    for (let t = 0; t < 1000 && w.n; t++) stepWorld(w);
    assert.ok(Math.abs(totalMatter(w) - before) < 1e-6);
    return w.n;
  };
  assert.equal(liveOn(1), 1);
  assert.equal(liveOn(0), 0);
});

test('digestion mutates within range from zero', () => {
  const w = firstDivision({ lucaDetach: 1, lucaMut: 10 });
  assert.equal(w.cells.digest[0], 0);
  assert.ok(w.cells.digest[1] >= 0 && w.cells.digest[1] <= 1);
});

test('a save from before digestion loads with no digestion and sane species', () => {
  const a = run(1000);
  const data = JSON.parse(JSON.stringify(saveWorld(a)));
  delete data.cells.digest;
  for (const { genes } of data.species) delete genes.digest;
  const b = loadWorld(data, data.cfg);
  for (let i = 0; i < b.n; i++) assert.equal(b.cells.digest[i], 0);
  for (const { genes } of b.species) assert.equal(genes.digest, 0);
  stepWorld(b);
  assert.ok(Math.abs(totalMatter(b) - b.matter0) < 1e-6);
});

test('a save from before build costs loads with the base body cost', () => {
  const a = run(1000);
  const data = JSON.parse(JSON.stringify(saveWorld(a)));
  delete data.cells.biomass;
  const b = loadWorld(data, data.cfg);
  assert.equal(b.n, a.n);
  for (let i = 0; i < b.n; i++) assert.equal(b.cells.biomass[i], DEFAULTS.cellBiomass);
});

test('a loaded save restores the world and continues identically', () => {
  const a = run(1000, { lucaDetach: 0.5, speciesThreshold: 0.05 });
  assert.ok(a.nBonds > 0 && a.species.length > 1);

  const data = JSON.parse(JSON.stringify(saveWorld(a)));
  const b = loadWorld(data, data.cfg);
  assert.equal(b.tick, a.tick);
  assert.equal(b.n, a.n);
  assert.equal(totalMatter(b), totalMatter(a));
  assert.equal(b.matter0, a.matter0);

  for (let t = 0; t < 500; t++) {
    stepWorld(a);
    stepWorld(b);
  }
  assert.equal(b.n, a.n);
  assert.equal(b.nBonds, a.nBonds);
  assert.equal(b.nextId, a.nextId);
  assert.equal(b.rand.state(), a.rand.state());
  assert.deepEqual(b.species, a.species);
  assert.deepEqual(b.air, a.air);
  assert.deepEqual(b.cells.x.slice(0, b.n), a.cells.x.slice(0, a.n));
  assert.deepEqual(b.cells.species.slice(0, b.n), a.cells.species.slice(0, a.n));
  assert.deepEqual(b.bondA.slice(0, b.nBonds), a.bondA.slice(0, a.nBonds));
  assert.deepEqual(b.spent, a.spent);
  assert.deepEqual(b.sediment, a.sediment);
});

test('different seeds diverge', () => {
  const a = run(1000, { seed: 1 });
  const b = run(1000, { seed: 2 });
  assert.notDeepEqual(a.cells.x.slice(0, a.n), b.cells.x.slice(0, b.n));
});
