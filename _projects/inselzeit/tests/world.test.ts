import { describe, expect, it } from 'vitest';
import { generateWorld, getTile } from '../src/world/world';

describe('seeded island', () => {
  it('recreates every generated tile and the starting location from the same seed', () => {
    const first = generateWorld('839274');
    const second = generateWorld('839274');
    expect(second).toEqual(first);
    const another = generateWorld('839275');
    expect(another.tiles.map(tile => tile.height)).not.toEqual(first.tiles.map(tile => tile.height));
  });

  it.each(['839274', '0', 'demo'])('creates a useful, varied island for seed %s', seed => {
    const world = generateWorld(seed);
    const land = world.tiles.filter(tile => !tile.water);
    expect(world.tiles).toHaveLength(world.size ** 2);
    expect(world.chunks.flatMap(chunk => chunk.tiles)).toHaveLength(world.tiles.length);
    expect(new Set(world.chunks.flatMap(chunk => chunk.tiles).map(tile => `${tile.x},${tile.z}`)).size).toBe(world.tiles.length);
    expect(world.tiles.filter(tile => tile.biome === 'ocean').length).toBeGreaterThan(1000);
    expect(world.tiles.some(tile => tile.biome === 'river')).toBe(true);
    expect(world.tiles.some(tile => tile.biome === 'lake')).toBe(true);
    expect(land.some(tile => tile.height > 3)).toBe(true);
    expect(land.some(tile => tile.forest > .5)).toBe(true);
    expect(land.some(tile => tile.iron > .3)).toBe(true);
    expect(land.some(tile => tile.stone > .3)).toBe(true);
    const spawn = getTile(world, world.spawn.x, world.spawn.z)!;
    expect(spawn.water).toBe(false);
    expect(spawn.slope).toBeLessThan(.5);
    expect(spawn.fertility).toBeGreaterThan(.35);
    expect(getTile(world, world.landing.x, world.landing.z)?.coast).toBe(true);
    expect(getTile(world, world.seaStart.x, world.seaStart.z)?.biome).toBe('ocean');
  });
});
