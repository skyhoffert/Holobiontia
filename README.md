# Holobiontia
Evolution simulation with structured entities that form organisms. Design: [holobiontia-design.md](holobiontia-design.md).

## Run
No build step or dependencies. Needs a local server (module workers don't load from `file://`).

```
npm start   # http://localhost:8000
npm test
```

## Layout
- `src/sim/` no DOM. `world.js` rules, `worker.js` loop + messages, `config.js` constants + sliders, `rng.js` PRNG.
- `src/ui/` no sim rules. `main.js` wiring, `view.js` world canvas, `graph.js`, `inspector.js`.
- `test/` Node tests of sim invariants.

## Rules
- Determinism: seeded RNG only, no wall-clock in `world.js`.
- Conservation: vital + spent + fat, in water, cells and air, stays constant.
