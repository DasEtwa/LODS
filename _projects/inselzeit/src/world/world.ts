/** Deterministic island generation. All world coordinates are tile centres in [0, size). */
export type Biome = 'ocean' | 'lake' | 'river' | 'beach' | 'grass' | 'forest' | 'rock' | 'snow' | 'dry';
export interface Tile {
  x: number; z: number; height: number; biome: Biome;
  fertility: number; moisture: number; slope: number;
  forest: number; stone: number; iron: number; water: boolean; coast: boolean;
}
export interface Point { x: number; z: number }
export interface Chunk { x: number; z: number; tiles: Tile[] }
export interface World { seed: string; size: number; tiles: Tile[]; chunks: Chunk[]; spawn: Point; landing: Point; seaStart: Point }

const SIZE = 96;
const CHUNK_SIZE = 16;
const clamp = (x: number, low = 0, high = 1) => Math.min(high, Math.max(low, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

/** FNV-1a, so arbitrary text seeds are as reproducible as numeric seeds. */
function seedNumber(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hash(x: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}
function fbm(x: number, z: number, seed: number): number {
  let sum = 0, total = 0, weight = 1;
  for (let i = 0; i < 4; i++) {
    sum += noise(x, z, seed + i * 1013) * weight; total += weight;
    x *= 2; z *= 2; weight *= .5;
  }
  return sum / total;
}
export function getTile(world: World, x: number, z: number): Tile | undefined {
  x = Math.round(x); z = Math.round(z);
  if (x < 0 || z < 0 || x >= world.size || z >= world.size) return undefined;
  return world.tiles[z * world.size + x];
}

/** A small priority queue supports a priority-flood drainage map. */
class MinHeap {
  private data: { index: number; height: number }[] = [];
  push(index: number, height: number) {
    const a = this.data; let i = a.length; a.push({ index, height });
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].height <= height) break; a[i] = a[p]; i = p; }
    a[i] = { index, height };
  }
  pop(): { index: number; height: number } | undefined {
    const a = this.data; if (!a.length) return undefined;
    const first = a[0], last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && a[child + 1].height < a[child].height) child++;
        if (a[child].height >= last.height) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return first;
  }
}

export function generateWorld(inputSeed: string | number): World {
  const seed = String(inputSeed), s = seedNumber(seed), n = SIZE * SIZE;
  const heights = new Float64Array(n), tiles: Tile[] = [];
  const idx = (x: number, z: number) => z * SIZE + x;
  // A warped island mask creates bays and peninsulas. A long ridge cuts through
  // its interior; fine noise adds relief without turning plains into static.
  const angle = hash(18, 4, s) * Math.PI, ca = Math.cos(angle), sa = Math.sin(angle);
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
    const wx = x + (noise(x / 27, z / 27, s + 11) - .5) * 12;
    const wz = z + (noise(x / 27, z / 27, s + 23) - .5) * 12;
    const dx = (wx - SIZE / 2) / 37, dz = (wz - SIZE / 2) / 35;
    const radius = Math.sqrt(dx * dx + dz * dz);
    const coastNoise = (fbm(wx / 24, wz / 24, s + 31) - .5) * .36;
    const land = 1 - radius + coastNoise;
    const across = dx * ca + dz * sa, along = -dx * sa + dz * ca;
    const ridgeShift = (noise(along * 2 + 5, 9, s + 40) - .5) * .35;
    const ridge = Math.pow(clamp(1 - Math.abs(across - ridgeShift) / .32), 2) * clamp(1 - Math.abs(along) / .9);
    const foothills = fbm(wx / 15, wz / 15, s + 51);
    const elevation = land * 3.5 + ridge * 5.5 * (.65 + foothills * .7) + (foothills - .5) * 1.3 - .32;
    heights[idx(x, z)] = Math.max(-2.5, elevation);
  }

  // Priority-flood from the sea produces a continuous downstream path even in
  // local depressions; two rivers follow that drainage from the highlands.
  const downstream = new Int32Array(n).fill(-1), visited = new Uint8Array(n), heap = new MinHeap();
  for (let i = 0; i < n; i++) if (heights[i] <= 0) { visited[i] = 1; heap.push(i, heights[i]); }
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  let current: { index: number; height: number } | undefined;
  while ((current = heap.pop())) {
    const x = current.index % SIZE, z = Math.floor(current.index / SIZE);
    for (const [dx, dz] of dirs) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
      const j = idx(nx, nz); if (visited[j]) continue;
      visited[j] = 1; downstream[j] = current.index;
      heap.push(j, Math.max(heights[j], current.height + .001));
    }
  }
  const river = new Uint8Array(n);
  const sources = Array.from({ length: n }, (_, i) => i).filter(i => heights[i] > 2.8)
    .sort((a, b) => (heights[b] + hash(b % SIZE, Math.floor(b / SIZE), s + 99) * 2) - (heights[a] + hash(a % SIZE, Math.floor(a / SIZE), s + 99) * 2));
  const chosen: number[] = [];
  for (const source of sources) {
    const x = source % SIZE, z = Math.floor(source / SIZE);
    if (chosen.some(i => Math.hypot(x - i % SIZE, z - Math.floor(i / SIZE)) < 18)) continue;
    chosen.push(source); let p = source, steps = 0;
    while (p >= 0 && heights[p] > 0 && steps++ < n) { river[p] = 1; p = downstream[p]; }
    if (chosen.length === 2) break;
  }

  // Small inland lake near the first drainage line, carved gently into its valley.
  const lake = new Uint8Array(n);
  const riverTiles = Array.from({ length: n }, (_, i) => i).filter(i => river[i] && heights[i] > .5 && heights[i] < 1.6);
  if (riverTiles.length) {
    const center = riverTiles[Math.floor(riverTiles.length / 2)], cx = center % SIZE, cz = Math.floor(center / SIZE);
    const level = Math.max(.12, heights[center] - .18);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 1 || z < 1 || x >= SIZE - 1 || z >= SIZE - 1) continue;
      const j = idx(x, z), d = dx * dx / 7 + dz * dz / 3;
      if (d < 1 && heights[j] > 0 && heights[j] < level + .55) { lake[j] = 1; heights[j] = level; }
    }
  }

  const landWaterDistance = new Uint8Array(n).fill(99);
  for (let i = 0; i < n; i++) if (heights[i] <= 0 || river[i] || lake[i]) landWaterDistance[i] = 0;
  // Local distance field supplies shoreline and riparian moisture.
  for (let pass = 0; pass < 8; pass++) {
    for (let z = 1; z < SIZE - 1; z++) for (let x = 1; x < SIZE - 1; x++) {
      const i = idx(x, z);
      landWaterDistance[i] = Math.min(landWaterDistance[i], 1 + landWaterDistance[i - 1], 1 + landWaterDistance[i + 1], 1 + landWaterDistance[i - SIZE], 1 + landWaterDistance[i + SIZE]);
    }
    for (let z = SIZE - 2; z > 0; z--) for (let x = SIZE - 2; x > 0; x--) {
      const i = idx(x, z);
      landWaterDistance[i] = Math.min(landWaterDistance[i], 1 + landWaterDistance[i - 1], 1 + landWaterDistance[i + 1], 1 + landWaterDistance[i - SIZE], 1 + landWaterDistance[i + SIZE]);
    }
  }
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
    const i = idx(x, z), height = heights[i];
    let slope = 0;
    for (const [dx, dz] of dirs.slice(0, 4)) {
      const nx = x + dx, nz = z + dz;
      if (nx >= 0 && nz >= 0 && nx < SIZE && nz < SIZE) slope = Math.max(slope, Math.abs(height - heights[idx(nx, nz)]));
    }
    const ocean = height <= 0, water = ocean || !!river[i] || !!lake[i];
    const coast = !water && dirs.some(([dx,dz]) => x+dx >= 0 && z+dz >= 0 && x+dx < SIZE && z+dz < SIZE && heights[idx(x+dx,z+dz)] <= 0);
    const climate = fbm(x / 30, z / 30, s + 113);
    const soil = fbm(x / 13, z / 13, s + 114);
    const moisture = clamp(.18 + climate * .55 + Math.max(0, 7 - landWaterDistance[i]) * .045 - Math.max(0, height - 3) * .035);
    const fertility = water ? 0 : clamp(.12 + moisture * .5 + soil * .38 - slope * .24 - Math.max(0, height - 2.5) * .07 - (coast ? .13 : 0));
    const forestNoise = fbm(x / 9, z / 9, s + 119);
    const forest = water || height < .3 ? 0 : clamp((forestNoise - .34) * 2.8 + moisture * .35 - Math.max(0, height - 3.5) * .18);
    const geology = fbm(x / 10, z / 10, s + 125);
    const stone = water ? 0 : clamp((height - 1) * .12 + slope * .65 + (geology - .35) * .75);
    const iron = water ? 0 : clamp((height - 2.0) * .16 + (geology - .5) * 1.3);
    let biome: Biome = ocean ? 'ocean' : lake[i] ? 'lake' : river[i] ? 'river' : coast || height < .3 ? 'beach' : height > 5.7 ? 'snow' : height > 3.5 || slope > .8 ? 'rock' : forest > .52 ? 'forest' : fertility < .35 ? 'dry' : 'grass';
    tiles.push({ x, z, height, biome, fertility, moisture, slope, forest, stone, iron, water, coast });
  }
  // Pick a usable starting area near a real coastline, prioritising flat fertile
  // ground with room for a house and farm rather than a visually random beach.
  const coasts = tiles.filter(t => t.coast);
  let landing = coasts[0] ?? tiles[Math.floor(n / 2)], spawn = landing, best = -Infinity;
  for (const t of tiles) {
    if (t.water || t.slope > .5 || t.height > 2.5) continue;
    let near: Tile | undefined, nearDist = Infinity;
    for (const c of coasts) {
      const d = Math.hypot(c.x - t.x, c.z - t.z);
      if (d < nearDist) { nearDist = d; near = c; }
    }
    if (!near || nearDist < 2 || nearDist > 8) continue;
    let space = 0;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const xx = t.x + dx, zz = t.z + dz;
      if (xx < 0 || zz < 0 || xx >= SIZE || zz >= SIZE) continue;
      const other = tiles[idx(xx,zz)];
      if (!other.water && other.slope < .6 && other.fertility > .35) space++;
    }
    const score = space * .04 + t.fertility * 3 - t.slope * 2 - nearDist * .03;
    if (score > best) { best = score; spawn = t; landing = near; }
  }
  // Walk outwards from the coast through ocean to give the ship a visible approach.
  let seaStart: Point = { x: landing.x, z: landing.z }, farthest = -1;
  for (const t of tiles) if (t.biome === 'ocean') {
    const d = Math.hypot(t.x - landing.x, t.z - landing.z);
    if (d > 9 && d < 18) {
      // Reject approaches crossing a peninsula: the final tile alone may be land.
      let clear = true;
      for (let step = 1; step < Math.ceil(d); step++) {
        const f = step / Math.ceil(d);
        const px = Math.round(t.x + (landing.x - t.x) * f);
        const pz = Math.round(t.z + (landing.z - t.z) * f);
        if (heights[idx(px, pz)] > 0) { clear = false; break; }
      }
      if (!clear) continue;
      const towardLand = (t.x - landing.x) * (landing.x - SIZE / 2) + (t.z - landing.z) * (landing.z - SIZE / 2);
      if (towardLand > farthest) { farthest = towardLand; seaStart = {x:t.x,z:t.z}; }
    }
  }
  const chunks: Chunk[] = [];
  for (let z = 0; z < SIZE; z += CHUNK_SIZE) for (let x = 0; x < SIZE; x += CHUNK_SIZE) {
    const chunk: Chunk = { x: x / CHUNK_SIZE, z: z / CHUNK_SIZE, tiles: [] };
    for (let dz = 0; dz < CHUNK_SIZE; dz++) for (let dx = 0; dx < CHUNK_SIZE; dx++) chunk.tiles.push(tiles[idx(x + dx, z + dz)]);
    chunks.push(chunk);
  }
  return { seed, size: SIZE, tiles, chunks, spawn: {x:spawn.x,z:spawn.z}, landing: {x:landing.x,z:landing.z}, seaStart };
}
