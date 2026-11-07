import { getTile, type Tile, type World } from '../world/world';

export type Resource = 'wood' | 'stone' | 'food' | 'iron';
export type Resources = Record<Resource, number>;
export type BuildingType = 'house' | 'farm' | 'lumber' | 'quarry' | 'mine' | 'warehouse';
export interface BuildingDefinition {
  name: string; description: string; cost: Resources; capacity: number; jobs: number;
}
export const BUILDINGS: Record<BuildingType, BuildingDefinition> = {
  house: { name: 'Wohnhaus', description: 'Bietet vier Menschen ein Zuhause.', cost: {wood: 12, stone: 8, food: 0, iron: 0}, capacity: 4, jobs: 0 },
  farm: { name: 'Bauernhof', description: 'Erzeugt Nahrung auf fruchtbarem Boden.', cost: {wood: 20, stone: 5, food: 0, iron: 0}, capacity: 0, jobs: 2 },
  lumber: { name: 'Holzfäller', description: 'Gewinnt Holz in der Nähe eines Waldes.', cost: {wood: 15, stone: 10, food: 0, iron: 0}, capacity: 0, jobs: 2 },
  quarry: { name: 'Steinbruch', description: 'Gewinnt Stein an einem Gesteinsvorkommen.', cost: {wood: 15, stone: 10, food: 0, iron: 0}, capacity: 0, jobs: 2 },
  mine: { name: 'Eisenmine', description: 'Fördert Eisen an einem Erzvorkommen.', cost: {wood: 20, stone: 15, food: 0, iron: 0}, capacity: 0, jobs: 2 },
  warehouse: { name: 'Lagerhaus', description: 'Erhöht die Lagerkapazität jeder Ressource um 150.', cost: {wood: 18, stone: 12, food: 0, iron: 0}, capacity: 0, jobs: 0 },
};
export const RESOURCE_KEYS: Resource[] = ['wood', 'stone', 'food', 'iron'];
const emptyResources = (): Resources => ({wood: 0, stone: 0, food: 0, iron: 0});
export interface Person { id: number; age: number; }
export interface Building { id: number; type: BuildingType; x: number; z: number; workers: number; production: Resources; }
export interface Arrival { phase: 'sailing' | 'landing' | 'complete'; progress: number; passengers: number; initial: boolean; nextAt: number; }
export interface GameState {
  version: 1; seed: string; time: number; tickRemainder: number; resources: Resources;
  population: Person[]; buildings: Building[]; arrival: Arrival; happiness: number;
  rates: { production: Resources; consumption: Resources }; nextId: number;
  birthProgress: number; hunger: number;
}
export function createGame(seed: string | number): GameState {
  return { version: 1, seed: String(seed), time: 0, tickRemainder: 0, resources: emptyResources(),
    population: [], buildings: [], arrival: {phase: 'sailing', progress: 0, passengers: 5, initial: true, nextAt: 0},
    happiness: 1, rates: {production: emptyResources(), consumption: emptyResources()}, nextId: 1, birthProgress: 0, hunger: 0 };
}
export function housing(state: GameState): number { return state.buildings.reduce((sum,b) => sum + BUILDINGS[b.type].capacity, 0); }
export function storageCapacity(state: GameState): number { return 200 + state.buildings.filter(b => b.type === 'warehouse').length * 150; }
export function workingAdults(state: GameState): number { return state.population.filter(p => p.age >= 18).length; }
function nearby(world: World, x: number, z: number, key: 'forest'|'stone'|'iron'): number {
  let best = 0;
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dz * dz > 9) continue;
    const tile = getTile(world, x + dx, z + dz);
    if (tile && !tile.water) best = Math.max(best, tile[key]);
  }
  return best;
}
export interface BuildCheck { ok: boolean; reason: string; }
export function canBuild(state: GameState, world: World, type: BuildingType, x: number, z: number): BuildCheck {
  x = Math.round(x); z = Math.round(z);
  const definition = BUILDINGS[type];
  if (!definition) return {ok: false, reason: 'Unbekanntes Gebäude.'};
  const tile: Tile | undefined = getTile(world, x, z);
  if (!tile || tile.water) return {ok: false, reason: 'Hier ist Wasser.'};
  if (tile.slope > 1.4) return {ok: false, reason: 'Der Hang ist zu steil.'};
  if (state.buildings.some(b => Math.abs(b.x - x) <= 1 && Math.abs(b.z - z) <= 1)) return {ok: false, reason: 'Hier steht bereits ein Gebäude.'};
  if (type === 'farm' && tile.fertility < 0.3) return {ok: false, reason: 'Der Boden ist nicht fruchtbar genug.'};
  if (type === 'lumber' && nearby(world,x,z,'forest') < 0.25) return {ok: false, reason: 'Ein Wald muss in der Nähe sein.'};
  if (type === 'quarry' && nearby(world,x,z,'stone') < 0.25) return {ok: false, reason: 'Ein Gesteinsvorkommen muss in der Nähe sein.'};
  if (type === 'mine' && nearby(world,x,z,'iron') < 0.25) return {ok: false, reason: 'Ein Eisenvorkommen muss in der Nähe sein.'};
  for (const key of RESOURCE_KEYS) if (state.resources[key] + 1e-8 < definition.cost[key]) return {ok: false, reason: 'Nicht genügend Ressourcen.'};
  return {ok: true, reason: 'Hier kannst du bauen.'};
}
export function placeBuilding(state: GameState, world: World, type: BuildingType, x: number, z: number): BuildCheck {
  const check = canBuild(state, world, type, x, z);
  if (!check.ok) return check;
  for (const key of RESOURCE_KEYS) state.resources[key] -= BUILDINGS[type].cost[key];
  state.buildings.push({id: state.nextId++, type, x: Math.round(x), z: Math.round(z), workers: 0, production: emptyResources()});
  return check;
}
function step(state: GameState, world: World): void {
  state.time++;
  const arrival = state.arrival;
  if (arrival.phase === 'sailing') {
    arrival.progress = Math.min(1, arrival.progress + 1 / 8);
    if (arrival.progress >= 1) { arrival.phase = 'landing'; arrival.progress = 0; }
  } else if (arrival.phase === 'landing') {
    arrival.progress = Math.min(1, arrival.progress + 1 / 3);
    if (arrival.progress >= 1) {
      for (let i = 0; i < arrival.passengers; i++) state.population.push({id: state.nextId++, age: 22 + i * 3});
      if (arrival.initial) { state.resources.wood += 70; state.resources.stone += 45; state.resources.food += 60; }
      arrival.phase = 'complete'; arrival.progress = 1; arrival.nextAt = state.time + 300;
    }
  } else if (state.time >= arrival.nextAt && housing(state) - state.population.length >= 2 && state.resources.food >= 15) {
    state.arrival = {phase: 'sailing', progress: 0, passengers: 2, initial: false, nextAt: 0};
  }
  let available = workingAdults(state);
  const production = emptyResources(); const consumption = emptyResources();
  for (const b of state.buildings) { b.workers = 0; b.production = emptyResources(); }
  // Food receives the first workers, followed by the remaining buildings in construction order.
  const workplaces = [...state.buildings].sort((a,b) => Number(b.type === 'farm') - Number(a.type === 'farm'));
  for (const b of workplaces) {
    b.workers = Math.min(available, BUILDINGS[b.type].jobs); available -= b.workers;
    const tile = getTile(world,b.x,b.z);
    if (!tile || b.workers === 0) continue;
    let resource: Resource | undefined; let rate = 0;
    if (b.type === 'farm') { resource = 'food'; rate = b.workers * 8 * tile.fertility; }
    if (b.type === 'lumber') { resource = 'wood'; rate = b.workers * 5 * nearby(world,b.x,b.z,'forest'); }
    if (b.type === 'quarry') { resource = 'stone'; rate = b.workers * 4 * nearby(world,b.x,b.z,'stone'); }
    if (b.type === 'mine') { resource = 'iron'; rate = b.workers * 3 * nearby(world,b.x,b.z,'iron'); }
    if (resource) { const actual = Math.max(0, Math.min(rate / 60, storageCapacity(state) - state.resources[resource])); state.resources[resource] += actual; b.production[resource] = actual * 60; production[resource] += actual * 60; }
  }
  const foodNeeded = state.population.length / 60;
  const eaten = Math.min(state.resources.food, foodNeeded); state.resources.food -= eaten; consumption.food = eaten * 60;
  const fed = foodNeeded === 0 ? 1 : eaten / foodNeeded;
  state.hunger = fed < 0.99 ? state.hunger + 1 : Math.max(0, state.hunger - 2);
  const shelter = state.population.length ? Math.min(1, housing(state) / state.population.length) : 1;
  const target = 0.25 + 0.5 * fed + 0.25 * shelter;
  state.happiness += (target - state.happiness) * 0.03;
  // One real minute is one game year; children need eighteen game years to work.
  for (const p of state.population) p.age += 1 / 60;
  state.population = state.population.filter(p => p.age < 85);
  if (state.hunger >= 120 && state.population.length) { state.population.shift(); state.hunger = 60; }
  if (state.population.filter(p => p.age >= 18 && p.age < 55).length >= 2 && housing(state) > state.population.length && state.resources.food >= state.population.length * 3 && state.happiness > 0.7) {
    state.birthProgress += 1;
    if (state.birthProgress >= 90) { state.population.push({id: state.nextId++, age: 0}); state.birthProgress = 0; }
  }
  state.rates = {production, consumption};
}
/** Advances in fixed one-second simulation ticks, independent of rendering frame rate. */
export function tickGame(state: GameState, seconds: number, world: World): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  state.tickRemainder += seconds;
  while (state.tickRemainder >= 1) { step(state, world); state.tickRemainder -= 1; }
}
