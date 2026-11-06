// Seeded PRNG (mulberry32). Sim must never use Math.random().
// rand.state() is a seed that resumes the sequence from this point.
export function createRng(seed) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rand.state = () => s;
  return rand;
}
