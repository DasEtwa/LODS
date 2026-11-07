import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const remove = vi.fn(async () => true);
  const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => {}), addAll: vi.fn(async () => {}) };
  const caches = { keys: vi.fn(async () => ['main-website-cache', 'inselzeit-wgv1-obsolete', 'inselzeit-wgv1-__WGV1_VERSION__']), delete: remove, open: vi.fn(async () => cache) };
  const network = vi.fn(async () => ({ ok: true, type: 'basic', clone: () => ({}) }));
  const self = { location: {origin: 'https://levelsofdungeons.de'}, addEventListener: (name: string, fn: (event: any) => void) => { handlers[name] = fn; }, clients: { claim: vi.fn(async () => {}) }, skipWaiting: vi.fn(async () => {}) };
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, caches, fetch: network, URL, Response });
  return { handlers, caches, cache, network, remove };
}

describe('isolated game service worker', () => {
  it('removes only obsolete caches belonging to this game', async () => {
    const {handlers, remove} = worker();
    let pending: Promise<unknown> | undefined;
    handlers.activate({waitUntil: (p: Promise<unknown>) => { pending = p; }});
    await pending;
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('inselzeit-wgv1-obsolete');
  });
  it('intercepts only GET requests within the game path on the same origin', async () => {
    const {handlers, network, cache} = worker();
    const response = vi.fn();
    for (const url of ['https://levelsofdungeons.de/', 'https://levelsofdungeons.de/wgv1-other/a', 'https://elsewhere.example/wgv1/a']) {
      handlers.fetch({request: {method:'GET', url}, respondWith: response});
    }
    handlers.fetch({request: {method:'POST', url:'https://levelsofdungeons.de/wgv1/a'}, respondWith: response});
    expect(response).not.toHaveBeenCalled();
    handlers.fetch({request: {method:'GET', url:'https://levelsofdungeons.de/wgv1/assets/a.js'}, respondWith: response});
    expect(response).toHaveBeenCalledOnce();
    await response.mock.calls[0][0];
    expect(network).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledOnce();
  });
});
