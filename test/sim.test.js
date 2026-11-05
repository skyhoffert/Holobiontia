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
});

test('same seed replays identically', () => {
  const a = run(1000);
  const b = run(1000);
  assert.equal(a.n, b.n);
  assert.deepEqual(a.cells.x.slice(0, a.n), b.cells.x.slice(0, b.n));
  assert.deepEqual(a.spent, b.spent);
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
    if (!wet) assert.equal(w.vital[s] + w.spent[s], 0);
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
    assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-9);
  }
});

test('cell on land burns fat at upkeep and starves, matter conserved', () => {
  const w = placed(2, -4.5);
  const { lucaFat, lucaPhoto, upkeep, photoUpkeep } = DEFAULTS;
  const cost = upkeep * (1 + photoUpkeep * lucaPhoto);
  const lifespan = Math.ceil(lucaFat / cost);

  for (let t = 1; t < lifespan; t++) {
    stepWorld(w);
    assert.equal(w.n, 1);
    assert.ok(Math.abs(w.cells.fat[0] - (lucaFat - t * cost)) < 1e-9);
    assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-9);
  }
  stepWorld(w);
  assert.equal(w.n, 0);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-9);
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
  const w = createWorld({ ...DEFAULTS, drift: 0, damping: 1, repel: 0, gravity: 0, lucaFat: 3, lucaThresh: 2, splitChance: 1 });
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
  const w = createWorld({ ...DEFAULTS, drift: 0, lucaThresh: 1e9, lucaFat: 5, splitChance: 0 });
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
  const w = createWorld({ ...DEFAULTS, upkeep: 0, lucaPhoto: 0, lucaFat: 3, lucaThresh: 2, splitChance: 1 });
  stepWorld(w);
  assert.equal(w.n, 2);
  assert.ok(Math.abs(w.cells.fat[0] + w.cells.fat[1] - (3 - DEFAULTS.divideCost)) < 1e-9);
  assert.ok(Math.abs(totalMatter(w) - w.matter0) < 1e-9);
});

test('different seeds diverge', () => {
  const a = run(1000, { seed: 1 });
  const b = run(1000, { seed: 2 });
  assert.notDeepEqual(a.cells.x.slice(0, a.n), b.cells.x.slice(0, b.n));
});
