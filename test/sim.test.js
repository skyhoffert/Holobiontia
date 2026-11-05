import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULTS } from '../src/sim/config.js';
import { createWorld, stepWorld, totalMatter } from '../src/sim/world.js';

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
  const cost = upkeep * (1 + photoUpkeep * lucaPhoto + capUpkeep * lucaCap);
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
  const w = createWorld({ ...DEFAULTS });
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
  assert.ok(Math.abs(w.cells.fat[0] + w.cells.fat[1] - (3 - DEFAULTS.divideCost - DEFAULTS.cellBiomass)) < 1e-9);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

const total = (values) => values.reduce((a, b) => a + b, 0);

// An empty world with still water, except for any overrides.
const emptyWorld = (overrides) => {
  const w = createWorld({ ...DEFAULTS, airExchange: 0, diffusion: 0, detritusDiffusion: 0, ...overrides });
  w.n = 0;
  return w;
};

test('a corpse leaves its share of fat and biomass as detritus, matter conserved', () => {
  const w = createWorld({ ...DEFAULTS, detritusDecay: 0, sedimentDecay: 0 });
  w.cells.x[0] = 0.1;
  w.cells.y[0] = -7;
  stepWorld(w);
  assert.equal(w.n, 0);
  const expected = (DEFAULTS.lucaFat + DEFAULTS.cellBiomass) * DEFAULTS.deathDetritus;
  assert.ok(Math.abs(total(w.detritus) + total(w.sediment) - expected) < 1e-9);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-6);
});

test('a cell that starves at zero fat still leaves detritus', () => {
  const w = createWorld({ ...DEFAULTS, lucaPhoto: 0, lucaThresh: 1e9, detritusDecay: 0, sedimentDecay: 0 });
  w.cells.y[0] = 10;
  for (let t = 0; t < 500 && w.n; t++) stepWorld(w);
  assert.equal(w.n, 0);
  assert.ok(Math.abs(total(w.detritus) + total(w.sediment) - DEFAULTS.cellBiomass * DEFAULTS.deathDetritus) < 1e-9);
});

test('detritus sinks through its column and settles as sediment, matter conserved', () => {
  const w = emptyWorld({ detritusDecay: 0, sedimentDecay: 0 });
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

test('with no vital, a cell burns extra fat instead of dying at once', () => {
  const w = createWorld({ ...DEFAULTS, lucaPhoto: 0, lucaFat: 1, lucaThresh: 1e9, airExchange: 0 });
  const before = totalMatter(w);
  w.vital.fill(0);
  const matter = totalMatter(w);
  stepWorld(w);
  assert.equal(w.n, 1);
  const cost = DEFAULTS.upkeep * (1 + DEFAULTS.capUpkeep * DEFAULTS.lucaCap);
  assert.ok(Math.abs(w.cells.fat[0] - (1 - cost * DEFAULTS.noVitalCost)) < 1e-9);
  assert.ok(Math.abs(totalMatter(w) - matter) < 1e-6);
  assert.ok(before > matter);
  for (let t = 0; t < 100 && w.n; t++) stepWorld(w);
  assert.equal(w.n, 0); // starves in about 1 / (upkeep * noVitalCost) ticks
});

// Two cells joined by one bond, on the deep floor's open water.
const bondedPair = (overrides, gap) => {
  const w = createWorld({ ...DEFAULTS, drift: 0, gravity: 0, repel: 0, upkeep: 0, lucaPhoto: 0, lucaThresh: 1e9, lucaSplit: 0, ...overrides });
  const c = w.cells;
  c.y[0] = 20;
  c.x[1] = c.x[0] + gap;
  c.y[1] = 20;
  c.fat[1] = c.fat[0];
  c.thresh[1] = 1e9;
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
  const left = 3 - DEFAULTS.divideCost - DEFAULTS.cellBiomass;
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

test('different seeds diverge', () => {
  const a = run(1000, { seed: 1 });
  const b = run(1000, { seed: 2 });
  assert.notDeepEqual(a.cells.x.slice(0, a.n), b.cells.x.slice(0, b.n));
});
