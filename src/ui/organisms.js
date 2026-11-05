// An organism is a set of cells connected by bonds, found fresh from each snapshot.
export function findOrganisms({ n, bondA, bondB }) {
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let k = 0; k < bondA.length; k++) parent[find(bondA[k])] = find(bondB[k]);

  const roots = new Int32Array(n); // organism per cell
  const sizeOfRoot = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    roots[i] = find(i);
    sizeOfRoot[roots[i]]++;
  }

  let count = 0;
  let largest = 0;
  let largestRoot = -1;
  for (let i = 0; i < n; i++) {
    if (sizeOfRoot[i] > 0) count++;
    if (sizeOfRoot[i] > largest) {
      largest = sizeOfRoot[i];
      largestRoot = i;
    }
  }
  return { roots, count, largest, largestRoot };
}

// Indices of every cell in the organism that cell `root` is the root of.
export function membersOf({ roots }, root) {
  const members = [];
  for (let i = 0; i < roots.length; i++) if (roots[i] === root) members.push(i);
  return members;
}
