export const SAVE_VERSION = 1; // bump when a save's meaning changes, not for added settings

// Largest change per mutation, as a multiple of the mutation factor. Also the unit of genetic distance.
export const GENE_SCALE = {
  photo: 1,
  thresh: 10,
  detach: 5,
  split: 1,
  share: 2,
  cap: 10,
  stiff: 5,
  strength: 5,
  perm: 5,
  mut: 0.25,
};

export function geneDistance(a, b) {
  let sum = 0;
  for (const k in GENE_SCALE) sum += ((a[k] - b[k]) / GENE_SCALE[k]) ** 2;
  return Math.sqrt(sum);
}

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
  stiffDensity: 0.025, // buoyancy lost per unit of stiffness above 1, as a fraction of gravity
  contactDist: 0.5, // cells closer than this repel; must be < 1 square
  repel: 0.008, // velocity change per tick at full overlap, at stiffness 1

  // Bonds. Rest length sits inside contactDist, so spring and repulsion balance.
  // The scales below are the value at gene 1; each bond multiplies by its cells' mean gene.
  bondStiffness: 0.01, // velocity change per tick per square of stretch
  bondRest: 0.4,
  bondBreak: 1.2, // bonds stretched past this distance snap
  fatFlow: 0.02, // fraction of the fat difference crossing a bond per tick

  vital0: 1,
  spent0: 2,
  diffusion: 0.1, // stability: keep < 0.25
  // Fraction moving one square per tick. Against diffusion, gradient scale = diffusion / rate squares.
  vitalRise: 0.001,
  spentSink: 0.002,

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
  stiffUpkeep: 0.02, // upkeep multiplier per unit of stiffness
  strengthUpkeep: 0.03, // upkeep multiplier per unit of bond strength
  permUpkeep: 0.02, // upkeep multiplier per unit of permeability
  maxTrait: 5, // highest stiffness, bond strength or permeability that can evolve
  minMutation: 0.002, // lowest mutation factor that can evolve, so evolution can't freeze
  speciesThreshold: 0.25, // genetic distance from the representative that founds a new species; display only

  lucaFat: 1,
  lucaPhoto: 0.05,
  lucaThresh: 2,
  lucaDetach: 0.9,
  lucaSplit: 0.1, // chance per tick of dividing once past the fat threshold
  lucaShare: 0.5, // fraction of fat given to the daughter
  lucaCap: 4, // photosynthesis stops at this much fat
  lucaStiff: 1,
  lucaStrength: 1,
  lucaPerm: 1,
  lucaMut: 0.02, // mutation factor
};

// Live sliders. Keys must exist in DEFAULTS. min and max only set the slider's starting range; typed
// values can go past them, up to hardMin (default 0) and hardMax (default none), which keep the sim valid.
// divideCost + cellBiomass must stay below minThresh's hardMin, or dividing could push fat negative.
export const KNOBS = [
  { key: 'light', label: 'Light', min: 0, max: 2, step: 0.01, hint: 'Sunlight at the surface. More light means more fat made everywhere.' },
  { key: 'lightDepth', label: 'Light depth', min: 0.5, max: 20, step: 0.1, hardMin: 0.01, hint: 'Depth in squares at which light falls to half. Higher lets light reach deeper.' },
  { key: 'upkeep', label: 'Upkeep', min: 0.001, max: 0.05, step: 0.001, hint: 'Fat a cell burns per tick just to exist. All trait upkeeps are multiples of this, so lowering it makes every trait cheaper too. Also sets how deep cells can survive and how much wear they can take.' },
  { key: 'capUpkeep', label: 'Fat capacity upkeep', min: 0, max: 0.5, step: 0.01, hint: 'Extra upkeep per unit of fat capacity, as a multiple of Upkeep.' },
  { key: 'stiffUpkeep', label: 'Stiffness upkeep', min: 0, max: 0.5, step: 0.01, hint: 'Extra upkeep per unit of the stiffness gene, as a multiple of Upkeep.' },
  { key: 'strengthUpkeep', label: 'Bond strength upkeep', min: 0, max: 0.5, step: 0.01, hint: 'Extra upkeep per unit of the bond strength gene, as a multiple of Upkeep.' },
  { key: 'permUpkeep', label: 'Permeability upkeep', min: 0, max: 0.5, step: 0.01, hint: 'Extra upkeep per unit of the permeability gene, as a multiple of Upkeep.' },
  { key: 'minMutation', label: 'Min mutation factor', min: 0, max: 0.05, step: 0.001, hint: 'Lowest mutation factor a new organism can inherit, so evolution cannot freeze. Applies to births from now on.' },
  { key: 'speciesThreshold', label: 'Species threshold', min: 0.02, max: 1, step: 0.01, hint: 'How far a detached daughter must drift from its species representative to found a new species. Labels only, no effect on the simulation. Applies to births from now on.' },
  { key: 'drift', label: 'Drift', min: 0, max: 0.006, step: 0.0001, hint: 'Largest random nudge to a cell per tick. Higher spreads cells faster. Moves cells only, not water contents.' },
  { key: 'vitalRise', label: 'Vital rise', min: 0, max: 0.02, step: 0.0005, hardMax: 1, hint: 'Fraction of vital moving up one square per tick. Higher leaves less vital in the depths.' },
  { key: 'spentSink', label: 'Spent sink', min: 0, max: 0.02, step: 0.0005, hardMax: 1, hint: 'Fraction of spent moving down one square per tick. Higher leaves less spent at the surface, where cells need it.' },
  { key: 'airExchange', label: 'Air exchange', min: 0, max: 0.2, step: 0.005, hardMax: 1, hint: 'Fraction of the difference between surface water and air closed per tick. Higher resupplies the shallows faster.' },
  { key: 'divideCost', label: 'Division fat cost', min: 0, max: 0.6, step: 0.01, hardMax: 0.69, hint: 'Fat burned at each division, on top of the fat locked into the new cell. Higher makes dividing early less rewarding.' },
  { key: 'deathDetritus', label: 'Corpse to detritus', min: 0, max: 1, step: 0.01, hardMax: 1, hint: 'Fraction of a dead cell left as detritus. The rest becomes spent at once.' },
  { key: 'detritusSink', label: 'Detritus sink', min: 0, max: 0.5, step: 0.005, hardMax: 1, hint: 'Fraction of detritus moving down one square per tick, on its way to becoming sediment.' },
  { key: 'detritusDecay', label: 'Detritus decay', min: 0, max: 0.01, step: 0.0001, hardMax: 1, hint: 'Fraction of detritus rotting into spent per tick, using up vital. Lower keeps more matter locked up as dead material.' },
  { key: 'sedimentDecay', label: 'Sediment decay', min: 0, max: 0.002, step: 0.00005, hardMax: 1, hint: 'Fraction of floor sediment returning to the water as spent per tick. Lower traps more matter on the floor.' },
  { key: 'wearDivide', label: 'Division wear', min: 0, max: 2000, step: 10, hint: 'Wear added to the parent at each division. Time adds only 1 wear per tick, so this usually drives aging. New cells start at 0.' },
  { key: 'wearHalf', label: 'Wear half-output', min: 1000, max: 30000, step: 500, hardMin: 1, hint: 'Wear at which a cell makes fat at half speed. Higher means slower aging.' },
  { key: 'minThresh', label: 'Min fat threshold', min: 1, max: 5, step: 0.1, hardMin: 1, hint: 'Lowest fat threshold and fat capacity a new organism can inherit. Applies to births from now on.' },
  { key: 'repel', label: 'Repulsion scale', min: 0, max: 0.03, step: 0.0005, hint: 'How hard overlapping cells push apart at stiffness 1. Multiplied by the pair\'s mean stiffness gene.' },
  { key: 'contactDist', label: 'Contact distance', min: 0.1, max: 0.95, step: 0.01, hardMax: 0.99, hint: 'Cells closer than this push apart, in squares. Effectively cell size for crowding. Bonds rest at 0.4, so going below that changes how bonded cells sit.' },
  { key: 'bondStiffness', label: 'Bond stiffness scale', min: 0, max: 0.05, step: 0.001, hint: 'Spring force of a bond at stiffness 1. Multiplied by the mean stiffness gene of its two cells.' },
  { key: 'bondBreak', label: 'Bond break scale', min: 0.6, max: 3, step: 0.05, hint: 'Distance in squares at which a bond snaps at strength 1. Multiplied by the mean strength gene of its two cells.' },
  { key: 'fatFlow', label: 'Fat flow scale', min: 0, max: 0.2, step: 0.005, hardMax: 0.2, hint: 'Fraction of the fat difference crossing a bond per tick at permeability 1. Multiplied by the mean permeability gene of its two cells.' },
];
