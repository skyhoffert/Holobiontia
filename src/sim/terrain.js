// Floor profile from cfg.terrain: [x, y] points, smoothed between. Equal y = flat shelf.
// y = 0 is the water surface; y grows downward, so land heights are negative.
const smoothstep = (t) => t * t * (3 - 2 * t);

function floorAt(points, x) {
  let i = 1;
  while (i < points.length - 1 && x > points[i][0]) i++;
  const [x0, y0] = points[i - 1];
  const [x1, y1] = points[i];
  return y0 + (y1 - y0) * smoothstep((x - x0) / (x1 - x0));
}

export function createTerrain({ gridW: W, gridH: H, terrain: points }) {
  const heights = Float64Array.from({ length: W + 1 }, (_, x) => floorAt(points, x));

  // A square is water if any part of it is. Every point in water is then in a water square.
  // bottom: deepest water square per column, -1 for dry columns.
  const water = new Uint8Array(W * H);
  const bottom = new Int32Array(W).fill(-1);
  for (let x = 0; x < W; x++) {
    const deepest = Math.max(heights[x], heights[x + 1]);
    for (let y = 0; y < H && y < deepest; y++) {
      water[y * W + x] = 1;
      bottom[x] = y * W + x;
    }
  }

  // Nearest top-row water square per column: where matter from dry cells runs off to.
  const firstWet = water.indexOf(1);
  const lastWet = water.subarray(0, W).lastIndexOf(1);
  const shore = Int32Array.from({ length: W }, (_, x) => Math.min(lastWet, Math.max(firstWet, x)));

  // Top-row water squares: where water meets the atmosphere.
  const surface = Int32Array.from({ length: lastWet - firstWet + 1 }, (_, i) => firstWet + i)
    .filter((s) => water[s]);

  return { heights, water, bottom, shore, surface };
}

// True unless inside rock or past a side edge. Open air above the surface counts as open.
export function isOpen({ heights }, W, x, y) {
  if (x < 0 || x >= W) return false;
  const i = Math.floor(x);
  return y < heights[i] + (heights[i + 1] - heights[i]) * (x - i);
}
