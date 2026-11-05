// All rates are per tick. Base unit: one cell's upkeep.
export const DEFAULTS = {
  seed: 1,
  gridW: 320,
  gridH: 40,
  cap: 20000,

  // Floor profile, [x, y]. y = 0 is the surface, negative is above it. Last x must equal gridW.
  terrain: [
    [0, -4], [5, -4], // left land
    [25, 8], [50, 8], // shelf
    [72, 20], [97, 20], // shelf
    [125, 38], [175, 38], // deep floor
    [197, 28], [217, 28], // shelf
    [239, 12], [264, 12], // shelf
    [284, 3], [302, 3], // shallows
    [315, -6], [320, -6], // right land
  ],
  edgeMargin: 0.25, // cells this close to a side edge die
  skyRows: 16, // open air shown above the surface

  // Motion. Spread rate scales with drift / (1 - damping).
  damping: 0.97, // velocity kept per tick
  drift: 0.0015, // largest random velocity nudge per tick
  divideKick: 0.02, // largest velocity change when parent and daughter part
  gravity: 0.004, // velocity gained downward per tick, everywhere
  neutralFat: 1, // fat at which a cell neither rises nor sinks in water
  fatLift: 0.025, // buoyancy per unit of fat away from neutral, as a fraction of gravity
  contactDist: 0.5, // cells closer than this repel; must be < 1 square
  repel: 0.003, // velocity change per tick at full overlap

  vital0: 1,
  spent0: 2,
  diffusion: 0.1, // stability: keep < 0.25
  airExchange: 0.02, // fraction of the water-air difference closed per tick at the surface
  airRows: 10, // atmosphere size, in rows of water across the surface

  light: 1,
  lightDepth: 3,
  lightCutoff: 36,
  shade: 2,
  baseAbsorb: 0.02,

  upkeep: 0.01,
  photoUpkeep: 2, // upkeep multiplier per unit of photosynthesis

  wearDivide: 300, // wear added to the parent at each division
  divideCost: 0.2, // fat burned at each division; keep below minThresh
  minThresh: 1, // lowest fat threshold that can evolve
  wearHalf: 10000, // wear at which photosynthesis output is halved

  splitChance: 0.1,
  mutation: 0.02,

  lucaFat: 1,
  lucaPhoto: 0.05,
  lucaThresh: 2,
};

// Live sliders. Keys must exist in DEFAULTS.
export const KNOBS = [
  { key: 'light', label: 'Light', min: 0, max: 2, step: 0.01 },
  { key: 'lightDepth', label: 'Light depth', min: 0.5, max: 20, step: 0.1 },
  { key: 'upkeep', label: 'Upkeep', min: 0.001, max: 0.05, step: 0.001 },
  { key: 'mutation', label: 'Mutation', min: 0.001, max: 0.2, step: 0.001 },
  { key: 'drift', label: 'Drift', min: 0, max: 0.006, step: 0.0001 },
  { key: 'airExchange', label: 'Air exchange', min: 0, max: 0.2, step: 0.005 },
  { key: 'divideCost', label: 'Division fat cost', min: 0, max: 0.9, step: 0.01 },
  { key: 'wearDivide', label: 'Division wear', min: 0, max: 2000, step: 10 },
  { key: 'wearHalf', label: 'Wear half-output', min: 1000, max: 30000, step: 500 },
  { key: 'minThresh', label: 'Min fat threshold', min: 1, max: 5, step: 0.1 },
  { key: 'splitChance', label: 'Split chance', min: 0.001, max: 0.2, step: 0.001 },
];
