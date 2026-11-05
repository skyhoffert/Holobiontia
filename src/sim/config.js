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
  repel: 0.008, // velocity change per tick at full overlap

  // Bonds. Rest length sits inside contactDist, so spring and repulsion balance.
  bondStiffness: 0.01, // velocity change per tick per square of stretch
  bondRest: 0.4,
  bondBreak: 1.2, // bonds stretched past this distance snap
  fatFlow: 0.02, // fraction of the fat difference crossing a bond per tick

  vital0: 1,
  spent0: 2,
  diffusion: 0.1, // stability: keep < 0.25

  // Dead matter.
  cellBiomass: 0.3, // fat locked into each new cell's body; returned at death
  deathDetritus: 0.5, // fraction of a dead cell's matter left as detritus; the rest becomes spent
  detritusSink: 0.05, // fraction moving down one square per tick
  detritusDiffusion: 0.02, // stability: keep < 0.25
  detritusDecay: 0.001, // fraction decaying per tick, limited by local vital
  sedimentDecay: 0.0002, // fraction of a column's sediment breaking down per tick

  airExchange: 0.02, // fraction of the water-air difference closed per tick at the surface
  airRows: 10, // atmosphere size, in rows of water across the surface

  light: 1,
  lightDepth: 3,
  lightCutoff: 36,
  shade: 2,
  baseAbsorb: 0.02,

  upkeep: 0.01,
  photoUpkeep: 2, // upkeep multiplier per unit of photosynthesis
  noVitalCost: 3, // fat burned per unit of upkeep not covered by vital

  wearDivide: 300, // wear added to the parent at each division
  divideCost: 0.2, // fat burned at each division; with cellBiomass, keep below minThresh
  minThresh: 1, // lowest fat threshold and fat capacity that can evolve
  wearHalf: 10000, // wear at which photosynthesis output is halved

  capUpkeep: 0.05, // upkeep multiplier per unit of fat capacity
  minMutation: 0.002, // lowest mutation factor that can evolve, so evolution can't freeze

  lucaFat: 1,
  lucaPhoto: 0.05,
  lucaThresh: 2,
  lucaDetach: 0.9,
  lucaSplit: 0.1, // chance per tick of dividing once past the fat threshold
  lucaShare: 0.5, // fraction of fat given to the daughter
  lucaCap: 4, // photosynthesis stops at this much fat
  lucaMut: 0.02, // mutation factor
};

// Live sliders. Keys must exist in DEFAULTS.
export const KNOBS = [
  { key: 'light', label: 'Light', min: 0, max: 2, step: 0.01 },
  { key: 'lightDepth', label: 'Light depth', min: 0.5, max: 20, step: 0.1 },
  { key: 'upkeep', label: 'Upkeep', min: 0.001, max: 0.05, step: 0.001 },
  { key: 'capUpkeep', label: 'Fat capacity upkeep', min: 0, max: 0.5, step: 0.01 },
  { key: 'minMutation', label: 'Min mutation factor', min: 0, max: 0.05, step: 0.001 },
  { key: 'drift', label: 'Drift', min: 0, max: 0.006, step: 0.0001 },
  { key: 'airExchange', label: 'Air exchange', min: 0, max: 0.2, step: 0.005 },
  { key: 'divideCost', label: 'Division fat cost', min: 0, max: 0.6, step: 0.01 },
  { key: 'deathDetritus', label: 'Corpse to detritus', min: 0, max: 1, step: 0.01 },
  { key: 'detritusSink', label: 'Detritus sink', min: 0, max: 0.5, step: 0.005 },
  { key: 'detritusDecay', label: 'Detritus decay', min: 0, max: 0.01, step: 0.0001 },
  { key: 'sedimentDecay', label: 'Sediment decay', min: 0, max: 0.002, step: 0.00005 },
  { key: 'wearDivide', label: 'Division wear', min: 0, max: 2000, step: 10 },
  { key: 'wearHalf', label: 'Wear half-output', min: 1000, max: 30000, step: 500 },
  { key: 'minThresh', label: 'Min fat threshold', min: 1, max: 5, step: 0.1 },
  { key: 'repel', label: 'Repulsion', min: 0, max: 0.03, step: 0.0005 },
  { key: 'contactDist', label: 'Contact distance', min: 0.1, max: 0.95, step: 0.01 },
  { key: 'bondStiffness', label: 'Bond stiffness', min: 0, max: 0.05, step: 0.001 },
  { key: 'bondBreak', label: 'Bond break distance', min: 0.6, max: 3, step: 0.05 },
  { key: 'fatFlow', label: 'Fat flow', min: 0, max: 0.2, step: 0.005 },
];
