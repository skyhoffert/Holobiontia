# Holobiontia — Design Document

*An evolution simulator. The name means "the kingdom of holobionts": a holobiont is a host plus all the symbionts living in it, treated as one unit.*

*Living document for planning only; implementation comes later. Last updated: 2026-11-05.*

Everything in this document is decided unless marked **Proposed** or listed under Open Questions.

---

## 1. Vision

An open-ended evolution simulator in a 2D water world. Organisms are not designed; they are built from generic building blocks (cells), assembled according to a heritable genome. Complexity — specialized tissues, swimming, predation, ecosystems, and eventually organisms living inside organisms — should **emerge**, even if that takes a very long time. The user can optionally **nudge** evolution.

All life descends from a single minimal ancestor (LUCA). Hoped-for outcomes include coral-like organisms: anchored hosts with photosynthetic symbionts, building reefs.

### Observation goals
There is no strict success metric; the goal is to **observe evolution**. In particular:
- **Plant life** emerging (Milestones 1–2)
- **Worm- or fish-like organisms** (Milestone 3)
- **Predation** (Milestone 4)

### Guiding principles
- **Generic over specific.** One cell type with continuous traits. Specialization must evolve.
- **Conservation.** Matter is conserved. Energy is instantaneous and enters only as sunlight and vent chemistry.
- **Cheap approximations over real physics**, as long as the behavior that matters is preserved.
- **Everything local.** Cells read and affect only their own grid square, their own state, and what they touch.
- **Hierarchy.** Cell → multicellular organism → organism hosting symbionts.
- **Biology as inspiration, not a constraint.** Departures from real biology are fine when they keep things simpler.

---

## 2. World

- **2D vertical slice** of water (side view, like an aquarium). **Sides do not wrap:** the world is a basin (see 2.3), and anything touching a side edge dies.
- Minimal gravity; things float or sink by density relative to water.
- **Passive motion:** cells have velocity. Water damps it and adds small random nudges, so cells glide rather than vibrate. Rock stops motion along the blocked axis only, so cells can slide. Parent and daughter push apart, equal and opposite, at division.

### 2.1 Concentration grid
Water contents are **concentrations on a coarse grid**, not particles.
- Each field diffuses to neighboring squares and drifts vertically by buoyancy.
- A cell draws from and releases into the square it occupies. **Draws are clamped** so values never go negative.
- No flow through the floor.
- **Atmosphere exchange:** surface squares trade vital and spent with one shared air reservoir per gas, moving toward the air's level. Like real gas exchange, this resupplies shallows from above. Air counts toward total matter.
- **Fields pass through bodies:** cells are not diffusion barriers.
- **Body motion does not stir the water.**
- **Membrane boundary:** outside a cell, resources are diffuse and shared; organisms cannot grab, carry or herd them. To own a resource is to absorb it.
- **Display:** toggleable heatmap overlay for every field. No dots.

| Field | Kind | Behavior |
|---|---|---|
| Vital | Matter | Rises slightly |
| Spent | Matter | Sinks slowly. Input for photosynthesis. |
| Detritus | Matter | Sinks faster. Settles into floor sediment. |
| Vent chemical | Energy | Emitted at vents, diffuses, fades |
| Light | Energy | Recomputed every tick (see 2.2) |
| Metabolic scent | Signal | Passive, fast decay (see 6.3) |
| Signature scents ×4 | Signal | Active, decays (see 6.3) |

- **Drift vs diffusion** sets each substance's vertical profile. Key tuning knob.
- **Stability rules:** diffusion rate × timestep ÷ spacing² below ~0.25; drift speed × timestep at most one grid spacing.

### 2.2 Light and shading
- Light at depth x = **L₀ / (1 + x/d)**, zero below a cutoff depth. (Exponential falloff is a possible later swap.)
- **Shading:** computed column by column, top to bottom. Light in a square = water falloff × the fraction that passed through every square above.
- A cell absorbs light in proportion to its photosynthesis factor (pigment) plus a small base amount.
- Effects: competition for the top, canopies starving what's beneath, and light sensors detecting "something above me."

### 2.3 Floor
- **Sloped/varied terrain**, stored as a **heightmap** (one height per column). Creates habitats from sunlit shallows to dark depths.
- **Basin shape:** each side rises in **stepped slopes** with flat shelves at several depths, different on each side, to a sloping mountain above the water surface, ending in a little flat land before the edge.
- **Out of water:** cells can cross the surface and rest on land. There is no energy or other resource there, so upkeep burns stored fat and a cell starves at zero, as anywhere else. Gravity pulls cells back down. Matter released out of water runs off to the nearest shore.
- **Sediment:** each column stores detritus that lands on it; it slowly breaks down into spent.
- **Vents:** a few fixed points that
  - emit the **vent chemical** (second energy source, used by chemosynthesis);
  - create a **rising plume** that carries spent upward — upwelling.
- **Anchoring:** cells can bond to the floor (governed by stickiness); anchor bonds break like any other.
- **The matter trap** this solves: without a return path, sinking matter accumulates on the floor and the surface starves.
- **Future floor interaction** (cheap thanks to the heightmap), in rough order of cost: eating sediment; **reef building** (dead high-stiffness cells become floor height); digging/burrowing.

---

## 3. Matter and Energy

**Energy is instantaneous:** produced and used in the same tick. Everything persistent is matter.

**Naming:** Vital and Spent are this world's own substances, loosely inspired by O₂ and CO₂. Fat burns with Vital and leaves Spent; light turns Spent back into fat and Vital.

| Material | Analog | Where it lives |
|---|---|---|
| Vital | O₂ | Grid field; inside cells once absorbed |
| Fat | Sugars/lipids | Inside cells. Stored energy. Less dense than water. Moves freely across bonds. |
| Biomass | Body tissue | Inside cells. Locked-in body material; must be digested to be eaten. |
| Spent | CO₂ | Grid field |
| Detritus | Dead organic matter | Grid field, then floor sediment |

Reactions (unit counts are conserved):
- **Photosynthesis:** 2 spent + light → 1 fat + 1 vital
- **Chemosynthesis:** 2 spent + vent chemical → 1 fat + 1 vital *(Proposed: same form as photosynthesis)*
- **Respiration:** 1 fat + 1 vital → 2 spent + energy (used immediately)
- **Building:** a trait's build cost converts fat into **biomass** (1 fat → 1 biomass), locked in the cell's body.
- **Digestion:** biomass or detritus + energy → part becomes fat; the undigested remainder is released as **detritus (poop)**.
- **Death:** much of the body's biomass and fat decays straight into spent; the rest becomes detritus.
- **Decay:** 1 detritus + 1 vital → 2 spent (slow, ambient). Heavy decay uses up vital, creating **low-vital dead zones**, as in real oceans.
- **Limiting factor:** production = trait factor × local light (or vent chemical), capped by available spent.

Outputs of living things:
- **Respiration** → spent (exhaling).
- **Digestion leftovers** → detritus (pooping). Sinks like marine snow and feeds detritivores; scavengers following larger animals can evolve.
- **Death** → spent and detritus.

Fat:
- Every cell holds a little fat; dedicated storage emerges as cells or clusters with high fat capacity.
- Fat flows passively between bonded cells, from more to less, at a rate set by bond permeability.

Because bodies lock up matter as biomass, **total matter limits how much life can exist**.

**Conservation check:** total vital + fat + biomass + spent + detritus (including sediment), plus the atmosphere's vital and spent, is constant. A built-in debugging invariant.

---

## 4. Cells

### 4.1 Traits
**One generic cell type.** Each cell's behavior comes from continuous traits set by the genome.

| Trait | Effect | Cost tier | Milestone |
|---|---|---|---|
| Photosynthesis | Makes fat from light; absorbs light (shade) | Moderate | 1 |
| Fat capacity | How much fat the cell can store | Cheap | 1 |
| Stiffness | Bond springiness and collision firmness; raises density | Cheap | 1 |
| Bond strength (adhesion) | How hard bonds are to break | Cheap–moderate | 1 |
| Permeability (bond target) | Fat and hormone flow across bonds | Cheap | 1 |
| Bending stiffness | Resists bond-angle changes | **Expensive** | 2 |
| Chemosynthesis | Makes fat from vent chemical | Moderate | 2 |
| Stickiness | Forming new bonds on contact | Moderate | 2 (own) / 4 (foreign) |
| Contractility | Muscle: shortens bonds when signaled | Moderate | 3 |
| Conductance (bond target) | Signal transmission | Moderate | 3 |
| Sensitivities | One per sense (see 6.3) | Moderate–expensive | 3 |
| Susceptibility | How easily strangers can grab this cell (low = defended, costs upkeep) | Moderate | 4 |
| Digestion (per food type) | Breaks down living tissue, detritus, sediment into fat | Moderate | 4 |
| Scent emission ×4 | Signature scent channels | Expensive | 4 |

- Every trait has a **build cost** (fat → biomass, once) and an **upkeep cost** (fat, every tick), tunable per trait.
- Each cell has a **total trait capacity**: investing in one trait means giving up others.
- Every cell pays a base upkeep just to exist; this is the base unit for balancing (section 11).

### 4.2 Buoyancy
- A **weak** force: a gentle bias, small compared with muscle power.
- **Gravity is the same everywhere.** Water pushes back according to density, so the net force in water is small; air doesn't, so cells out of water fall.
- Density comes from existing traits: **fat lowers it, stiffness raises it.**
- Applied **per cell**, so bodies feel **torque**. Placement of dense and fatty cells sets orientation (dense holdfast below, buoyant floats above).

### 4.3 Aging and death
- Each cell has a **wear** value that rises every tick and jumps at each division (cost of reproduction).
- **Wear lowers efficiency:** a cell's processing output falls as wear rises (halved at a set wear level). Aging never kills directly.
- **Every new cell starts at zero wear.** Only the parent carries the cost of dividing.
- **Starvation** is the only natural death: a cell that can't cover upkeep burns its fat and dies at zero.
- On death, the cell's matter becomes spent and detritus (section 3).

---

## 5. Bonds

A bond is a **spring between two cell centers**. Rest length comes from cell sizes.

| Bond role | Driven by |
|---|---|
| Spring | Stiffness |
| Muscle | Contractility changes its rest length |
| Nerve | Conductance carries signals |
| Pipe | Permeability carries fat and hormones |
| Paddle | Drag approximation (section 6.1) |
| Breakable | Strength; snaps when overstretched |

- **Target bonds:** each cell's genome specifies the bond it wants (stiffness, strength, conductance, permeability). The actual bond is the **average of both cells' targets, plus imperfection** that grows with genetic distance.
- **Bending:** angle springs at each cell (expensive bending-stiffness trait). Rigidity from **triangulated** bonds is cheap but needs more cells.
- **Breaking:** a bond stretched past its strength snaps. Enables tearing prey, natural fragmentation, and a toughness-vs-upkeep trade-off.
- **Contact bonding** (one rule for all bonds formed on touch): bond chance = grabber's **stickiness** × target's **willingness**, reduced by genetic distance. Same-organism bonds are the zero-distance case. Without contact bonding, bodies could only be chains and trees — never triangles or closed shapes.
  - **Self-recognition:** willingness toward self and close kin is high regardless of susceptibility; toward strangers it approaches the susceptibility trait as genetic distance grows. A heavily defended organism can still bond freely within its own body.
- **Foreign bonds:** contact bonds between different organisms.
  - **Do not merge organisms.** Each cell keeps its genome and identity; the bond is flagged foreign.
  - Carry anything a normal bond can. Averaging means a parasite can force a bond partly open (arms race).
  - Built in from the start; **disabled by a world setting** until Milestone 4.
- **Collisions:** only cells collide; **bonds pass through everything**. Collisions are **soft**: touching cells repel with a force set by their stiffness, so soft cells can be squeezed past.
- **Implementation note:** stiff springs need a small timestep or position-based dynamics.

---

## 6. Movement, Signals, Senses and Hormones

### 6.1 Movement
- Muscles are contracting bonds; contraction burns fat + vital in the moment.
- **Drag approximation:** each bond acts as a paddle. Velocity perpendicular to the bond is damped strongly, along it weakly. Enough for swimming to produce thrust.

### 6.2 Signals and brain
The nervous system is **distributed through the body.**
- Every cell holds a **signal value**; signals pass across bonds according to conductance, with a small delay per hop.
- **Nerves** are chains of high-conductance cells. A **brain** is a cluster of cells doing heavy signal combining.
- Each cell has a small **signal network** (weights for combining inputs), separate from the gene-regulation network.
- **Muscles** contract when their cell's signal is high. Signal loops can produce rhythm with no sensors at all.
- Future: a symbiont's signals wired into its host's network.

### 6.3 Senses
Every sense is a **sensitivity trait** starting at zero; a sensing cell feeds its reading into its signal network. **LUCA senses nothing.**

| Tier | Sense | Reads |
|---|---|---|
| Cheap | Internal | Own fat, wear |
| Cheap | Stretch | Own bond stretch |
| Moderate | Chemical | Vital, spent, vent chemical, scents in its square |
| Moderate | Light | Light in its square |
| Moderate | Touch | Contact with self/kin/foreign cells or the floor |

- **Direction emerges** from bodies comparing readings across cells.
- **Change sensing:** reporting change over time lets even one cell navigate (bacterial run-and-tumble).
- **Gene-regulation inputs are free**; paid sensitivity applies only to the fast signal network.
- **Smell:**
  - **Metabolic scent** — passive and free, emitted in proportion to energy burned. Active organisms are loud; still ones are quiet.
  - **4 signature channels** — active and costly. Evolved scent mixes enable kin recognition, prey specialization, future mate finding.
- **Sound** *(deferred)*: a grid field rebuilt each tick from sources (muscle noise, active calls), fading with distance. Instant and non-lingering, unlike smell.
- **Sight** *(deferred)*: ray casting is costly. Shading gives light sensors a crude version for free.

### 6.4 Hormones
Two internal messaging systems, as in real bodies:
- **Signals (nerves):** fast, point-to-point across bonds by conductance. Drive muscles and behavior.
- **Hormones:** slow and body-wide. Govern growth, reproduction and long-term state ("well fed," "time to reproduce").

Design:
- Each cell holds a few **hormone values**.
- Hormones **seep slowly across bonds by permeability** (the same pipes that carry fat), spreading through the body like chemicals in blood.
- The **gene-regulation network** reads and releases hormones. Like real morphogens, they also guide development.
- **Reproduction decisions** (division, detachment, bond release) respond to hormones, enabling body-wide coordination (e.g., shed fragments only from the edges, or only when the whole body is well fed).
- Because hormones travel by permeability, a bonded symbiont can eventually "hear" its host's hormones — a channel for coordination.

---

## 7. Genome

Real biology: every cell carries the same DNA but switches genes on differently (regulatory networks, neighbor signals, epigenetic memory, uneven division). Captured organisms keep their own genomes.

Two routes to specialization, both supported:
1. **Differentiation** — the organism's own cells specialize.
2. **Capture** — symbionts with their own genomes do jobs inside a host.

### 7.1 Structure
- The genome is stored **once per organism**; cells point to it.
- Each cell carries a few **regulator values** (start ~4; can grow).
- **Gene-regulation network:** inputs = local conditions (signal, hormones, fat, light, bond count, age) + current regulators → outputs = new regulators, hormone release, and the cell's trait values.
- **Memory:** regulators are copied to the daughter at division. **Uneven division:** a genome-controlled nudge lets daughters start different.
- **Signal network:** separate from regulation; both grow by the same rules.
- In **Milestone 1**, before the regulation network exists, the genome sets trait values directly and every cell in an organism is identical.

### 7.2 Reproduction genes

| Gene | Controls |
|---|---|
| Fat threshold | Minimum fat before dividing (the gate) |
| Split tendency | Chance per tick of dividing once past the gate |
| Daughter share | Fraction of fat given to the daughter (seeds vs investment) |
| Detach chance | Whether a daughter detaches or stays bonded |
| Mutation factor | Size of mutations; mutates itself; has a hard minimum |

### 7.3 Mutation and growth
- **Mutation happens only when a new organism is founded** (a detaching daughter or a released fragment). Cells within one body share an identical genome.
- Operators: **nudge weights** (scaled by the mutation factor), **duplicate a regulator** (main growth operator), **add a connection**, **remove a connection or regulator**.
- **Innovation IDs:** each new gene gets a unique ID that its copies keep. Used for genetic distance (unmatched IDs + weight differences), remapping regulator values after structural mutation, species assignment, and future meiosis.
- **Anti-bloat:** each regulator and connection adds a small upkeep cost.
- The mutation factor's **hard minimum** prevents evolution from freezing; it is a nudging knob.

---

## 8. Reproduction

- **Mitosis does double duty:** a daughter that stays bonded is **growth**; one that detaches is **reproduction**.
- **Dividing costs the parent:** it burns some fat and adds wear, so dividing as early as possible doesn't automatically win.
- **Fragmentation / shedding:** an organism can deliberately release one of its own bonds (controlled by the genome and hormones). Everything beyond it leaves as a new organism, including bonded symbionts. Single-cell detachment is the smallest case. (Real example: lichens.)
- A fragment gets **one newly mutated genome shared by all its cells**. Regulator values remap by innovation ID; bonds recompute from the new targets. Negligible compute cost.
- **Meiosis / sexual reproduction is deferred** until organisms can sense and find each other.

---

## 9. Eating and Symbiosis

### 9.1 Predation
- Organisms can **physically break** other organisms (tear bonds) to eat them.
- **Draining:** a predator or parasite bonds to a prey cell, and fat flows across the bond by permeability. Averaged bond targets mean prey can resist but not fully stop the drain.
- **Digesting:** captured or torn-off cells have their biomass broken down by digestion (9.2).
- Future: an **active breaking** trait that weakens foreign cells' bonds on contact (enzyme-like digestion) — a natural job for a symbiont.

### 9.2 Digestion and diet
- **Digestion traits per food type** — living tissue, detritus, possibly sediment. These make eating possible, including the decomposers and scavengers from the original idea.
- Digesting **costs energy**, and only part of the food becomes fat; the undigested remainder is released as **detritus (poop)**, which feeds detritivores.
- Digestion traits compete for trait capacity, so cells specialize: **herbivores, carnivores and detritivores emerge** from the trade-off.
- **Fat vs biomass:** fat moves freely across bonds (cheap sharing between hosts and symbionts, and draining by parasites); biomass must be digested.
- **Cells are far more energy-dense than the fields**, to make predation pay:
  1. **Concentrated packets:** a cell holds much more matter than a typical square of detritus, which is thin and slow to gather.
  2. **Digestion efficiency:** living tissue yields much more usable fat than detritus.
  3. **Corpses lose value fast:** at death, much of a cell's matter decays straight into spent.
  - Result: a ladder of strategies — photosynthesis (slow, free), scavenging (easy, poor), predation (risky, rich).

### 9.3 Guts, mouths and butts
- **Tubes are emergent shapes** (two rows of bonded cells, or a ring around a cavity). A **mouth** is wherever digestion-capable cells meet food; a **butt** is wherever leftovers are released. No designed parts.
- **The 2D gut problem** (*The Planiverse*): a mouth-to-butt tube splits a 2D creature in two. Solved because **bonds don't collide**: a bond can span a gut and hold both halves together.
- Since fields pass through bodies, **guts are for whole prey**, which wall muscles can squeeze along (emergent peristalsis).
- **Soft collisions** let soft cells be squeezed past and soft bonds stretch to open gaps. A channel lined with soft cells acts as a **throat** (small prey pass, large fragments jam); contractile cells around an opening form a **sphincter**.

### 9.4 Symbiosis (hierarchy)
- **"Inside" means bonded in.** A symbiont is held in the host's body by foreign bonds; enclosure happens if the host grows around it. (Real example: corals hosting algae.)
- **Captured organisms keep their own genomes.** The host influences them only through signals, hormones and fat flow.
- **Inheritance through fragmentation:** offspring that bud off with symbionts attached keep the partnership.
- **No special symbiosis rules.** Benefits emerge from existing mechanics.
- Far future: hosts absorbing symbiont genes over time (as with mitochondria).

---

## 10. Seeding and Extinction

- All life descends from **LUCA**: a small photosynthesis factor (just above upkeep near the surface), the reproduction genes with a high detach chance, and everything else at zero.
- True abiogenesis is out of scope; the cell is the smallest building block.
- Consequences: a **single tree of life**; predators must evolve from plant-like ancestors; a long quiet start.
- **Extinction ends the run.** No automatic reseeding.

---

## 11. Balancing

- **Base unit:** one cell's base upkeep per tick. All rates are multiples of it.
- **Compensation depth:** where production equals upkeep. Primary tuning knob (e.g., top third of the world).
- **World knobs:** total light (energy inflow), total matter (how much life can exist), vent output, drift vs diffusion.
- **Tune by targets:** a well-adapted surface cell divides at a reasonable rate; populations level off rather than explode or collapse.
- All constants live in a config with **live sliders**.

---

## 12. Nudging

**Principle:** nudges act through the world's rules — costs and conditions — never by scoring organisms.

1. **World knobs** (live sliders): light, total matter, vent output, light falloff, drift, mutation-factor minimum.
2. **Trait cost multipliers** (primary tool): cheaper traits pull evolution toward them.
3. **World events:** "winter" (dimmed light), vents opening/closing, floor reshaping.
4. **Direct intervention:** inspect, clone, move, feed, remove, hand-edit.
   - **Copy-and-edit:** click a cell or organism, copy it, edit the copy, place it.
   - Future: a **test tank** side world; **saved organisms** (export/import genome files).
- Every nudge is recorded as a milestone event once logging exists.

---

## 13. Platform

- **Browser-based**, on the user's website.
- Simulation in a **Web Worker**; cell data in **typed arrays**; rendering on canvas/WebGL.
- **Upgrade path:** C core compiled to **WebAssembly** (near-native speed; consistent floating-point across browsers).

### 13.1 Determinism
The same starting state and seed always play out identically. Makes bugs reproducible and enables replay from checkpoints.
- **Fixed simulation timestep**, decoupled from the display frame rate.
- **Seeded pseudo-random number generator** for all randomness. Never `Math.random()`.
- **Deterministic iteration order** over cells, bonds and grid squares.
- **No wall-clock time** inside the simulation.
- Floating-point results are guaranteed identical on the same machine and browser; WebAssembly extends that across browsers.
- Built in from Milestone 1 — cheap now, painful to retrofit.

---

## 14. User Interface

**A lab tool, not a showcase.** Dense display, every knob exposed, built for experimenting. The **world rendering should look good** (to be refined as we go); the panels around it prioritize information over polish.

### 14.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│ Top bar: ▶ ❚❚ step · speed · tick · seed · population    │
├────────────┬─────────────────────────────┬───────────────┤
│ Left:      │                             │ Right:        │
│ Controls   │        World view           │ Inspector     │
│ - World    │     (pan / zoom / click)    │ - Cell        │
│ - Costs    │                             │ - Organism    │
│ - Overlays │                             │ - Genome      │
│ - Tools    │                             │               │
├────────────┴─────────────────────────────┴───────────────┤
│ Bottom: graphs — population, conservation totals, traits │
└──────────────────────────────────────────────────────────┘
```

- **Top bar:** pause/play, single step, speed, fast-forward (draws less often so the sim runs faster), tick counter, seed, population.
- **Left panel:** all knobs in collapsible groups — world settings, trait cost multipliers, overlay toggles, intervention tools.
- **World view:** pan, zoom, click to select; as large as possible.
- **Right panel (inspector):** full detail on the selected cell or organism.
- **Bottom strip:** live graphs over time.
- **Keyboard shortcuts** for everything common (pause, speed, overlays).
- **Collapsible panels** so the world can go full screen.

### 14.2 Interaction areas
1. **Watching:** world view and time controls.
2. **Seeing:** heatmap overlays; cell coloring by trait, organism, lineage or species.
3. **Inspecting:** click a cell (fat, wear, traits) or an organism (body, genome, ancestry, stats); follow with the camera.
4. **Intervening:** the nudging tools (section 12).
5. **Understanding:** population graphs, conservation check, eventually the tree of life.
6. **Managing runs:** new world (seed and settings), save/load, share.

### 14.3 Species (display only)
- Species is a **loose label for humans**: there is always some genetic distance. Species **never affect the simulation**; they exist only for graphs, coloring and the tree of life.
- **Assignment by threshold** (NEAT-style): each species keeps a representative genome. A newborn joins its parent's species if its genetic distance to the representative is under the threshold; otherwise it founds a new species.
- Cost: one distance check per birth. New species always branch from the parent's species, so the scheme lines up with the tree of life.
- The threshold is a **slider**, so the tree can be split finely or coarsely.

---

## 15. Logging and Analysis *(deferred)*

Requires backend/storage not yet in place. Log organisms, not cells:
1. **Lineage records** — ID, parent, birth/death ticks, cause of death; genome stored as mutations relative to parent.
2. **Periodic stats** — population, conservation totals, trait distributions, species count.
3. **Milestone events** — firsts (first multicellular organism, first foreign bond, first tear, first sense) and every user nudge.
4. **Checkpoints** — full snapshots for resuming and inspection.
- **Replay:** thanks to determinism (13.1), any moment can be regenerated from the nearest checkpoint, so detail between checkpoints needn't be logged.
- Format: append-only binary, chunk-compressed; loadable into a database for analysis.

---

## 16. Roadmap

Each milestone must run, and be interesting to watch, on its own before the next begins.

| Milestone | Theme | Adds |
|---|---|---|
| **1** | The dividing cell | Grid (vital, spent, detritus), light + shading, simple floor heightmap with sediment, cells (photosynthesis, fat, biomass, stiffness, strength, permeability), decay, buoyancy, wear and death, division/detach/daughter share, numeric mutation with mutation factor, springs and soft collisions, LUCA, heatmaps, sliders, determinism. Genome sets traits directly; all cells in an organism are identical. |
| **2** | Bodies | Gene-regulation network and structural genome growth, innovation IDs, hormones, contact bonding, bending stiffness, fragmentation, sloped terrain, vents and chemosynthesis, anchoring, species display |
| **3** | Movement and senses | Signal network, conductance, contractility, drag paddles, local senses, change sensing |
| **4** | Ecology | Foreign bonding, predation by tearing and draining, digestion traits (diets), guts, metabolic and signature scents |
| **5** | Symbiosis | Inherited partnerships via fragmentation; tuning toward stable symbioses |
| **Later** | | Logging, nudging tools beyond sliders, sound, sight, meiosis, reef building, digging, test tank, saved organisms, 3D |

---

## 17. Open Questions

1. **Chemosynthesis reaction** — confirm it mirrors photosynthesis (2 spent + vent chemical → 1 fat + 1 vital), or should it differ (e.g., produce no vital, as real chemosynthesis doesn't)?
2. **Scale targets** — world size and typical cell count.
3. **Visual style** of the world rendering.

New questions will surface during implementation; add them here.

---

## 18. Parking Lot

- **Repair** trait: slows wear at an upkeep cost.
- **Somatic mutation** (mutations within a body; cancer-like effects).
- **Muscle pumping / water currents:** a contracting cell pushes its square's contents to a neighbor at an energy cost. Would enable filter feeding.
- **Tree-of-life viewer.**
- **3D mode.**
