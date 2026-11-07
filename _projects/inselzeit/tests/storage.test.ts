import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/world/world';
import { createGame, tickGame } from '../src/simulation/game';
import { loadGame, saveGame } from '../src/storage/save';

describe('IndexedDB persistence', () => {
  it('stores the latest detached snapshot and resumes an arrival in progress', async () => {
    const world = generateWorld('839274');
    const game = createGame(world.seed);
    tickGame(game, 3.5, world);
    const olderWrite = saveGame(game);
    tickGame(game, 3, world);
    const expected = structuredClone(game);
    expect(expected.arrival.phase).toBe('sailing');
    expect(expected.arrival.progress).toBeGreaterThan(0);
    const newerWrite = saveGame(game);
    // Further simulation must not mutate the saved snapshot.
    tickGame(game, 20, world);
    // Loading immediately after the writes must wait for the latest one.
    const pendingLoad = loadGame();
    await Promise.all([olderWrite, newerWrite]);
    const loaded = await pendingLoad;
    expect(loaded?.state).toEqual(expected);
    expect(typeof loaded?.savedAt).toBe('number');
    tickGame(expected, 20, world);
    tickGame(loaded!.state, 20, world);
    expect(loaded!.state).toEqual(expected);
    expect(loaded!.state.arrival.phase).toBe('complete');
    expect(loaded!.state.population).toHaveLength(5);
  });
});
