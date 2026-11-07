import { describe, expect, it } from 'vitest';
import { generateWorld, getTile } from '../src/world/world';
import { canBuild, createGame, housing, placeBuilding, tickGame } from '../src/simulation/game';
import { deserializeGame, serializeGame } from '../src/storage/save';

const world = generateWorld('839274');
function landNearSpawn() {
  return world.tiles.filter(t => !t.water && t.slope <= 1.4 && t.fertility >= .3)
    .sort((a,b) => Math.hypot(a.x-world.spawn.x,a.z-world.spawn.z) - Math.hypot(b.x-world.spawn.x,b.z-world.spawn.z));
}
describe('settlement simulation', () => {
  it('lands the first settlers with cargo instead of creating them at the start', () => {
    const game = createGame(world.seed);
    expect(game.population).toHaveLength(0);
    expect(game.resources.wood).toBe(0);
    tickGame(game, 11, world);
    expect(game.population).toHaveLength(5);
    expect(game.resources.wood).toBe(70);
    expect(game.arrival.phase).toBe('complete');
  });
  it('deducts building costs and rejects missing resources or occupied positions', () => {
    const game = createGame(world.seed); const t = landNearSpawn()[0];
    expect(canBuild(game, world, 'house', t.x, t.z).ok).toBe(false);
    tickGame(game, 11, world);
    expect(placeBuilding(game, world, 'house', t.x, t.z).ok).toBe(true);
    expect(game.resources.wood).toBe(58);
    expect(game.resources.stone).toBe(37);
    expect(housing(game)).toBe(4);
    expect(placeBuilding(game, world, 'house', t.x, t.z).ok).toBe(false);
    expect(game.resources.wood).toBe(58);
  });
  it('consumes food and produces food with workers on fertile land', () => {
    const game = createGame(world.seed); tickGame(game, 11, world);
    const before = game.resources.food;
    tickGame(game, 30, world);
    expect(game.resources.food).toBeLessThan(before);
    const t = landNearSpawn()[0];
    expect(placeBuilding(game, world, 'farm', t.x, t.z).ok).toBe(true);
    tickGame(game, 1, world);
    expect(game.rates.production.food).toBeGreaterThan(0);
    expect(game.rates.consumption.food).toBe(5);
    expect(game.buildings[0].workers).toBe(2);
  });
  it('round-trips an arrival and continues identically after loading', () => {
    const a = createGame(world.seed); tickGame(a, 4.5, world);
    const b = deserializeGame(serializeGame(a)).state;
    expect(b).toEqual(a);
    tickGame(a, 80, world); tickGame(b, 80, world);
    expect(b).toEqual(a);
  });
  it('advances the same fixed ticks regardless of frame duration', () => {
    const a = createGame(world.seed); const b = createGame(world.seed);
    tickGame(a, 30, world);
    for (let i = 0; i < 120; i++) tickGame(b, .25, world);
    expect(b).toEqual(a);
  });
  it('reduces happiness and eventually population when food runs out', () => {
    const game = createGame(world.seed); tickGame(game, 11, world);
    game.resources.food = 0;
    tickGame(game, 121, world);
    expect(game.happiness).toBeLessThan(.5);
    expect(game.population.length).toBeLessThan(5);
  });
  it('supports a growing population only with food and free housing', () => {
    const game = createGame(world.seed); tickGame(game, 11, world);
    const tiles = landNearSpawn(); const first = tiles[0];
    expect(placeBuilding(game, world, 'house', first.x, first.z).ok).toBe(true);
    const second = tiles.find(t => Math.abs(t.x-first.x) > 1 || Math.abs(t.z-first.z) > 1)!;
    expect(placeBuilding(game, world, 'house', second.x, second.z).ok).toBe(true);
    const farm = tiles.find(t => canBuild(game, world, 'farm', t.x, t.z).ok)!;
    expect(placeBuilding(game, world, 'farm', farm.x, farm.z).ok).toBe(true);
    tickGame(game, 100, world);
    expect(game.population.length).toBeGreaterThan(5);
    expect(game.population.some(p => p.age < 18)).toBe(true);
  });
});
