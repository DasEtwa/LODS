import type { GameState } from '../simulation/game';

const DB_NAME = 'inselzeit';
const STORE = 'saves';
const SLOT = 'main';
export interface SaveRecord { version: 1; savedAt: number; state: GameState; }

/** Serialization is also used to detach snapshots from the live mutable simulation. */
export function serializeGame(state: GameState): string {
  return JSON.stringify({version: 1, savedAt: Date.now(), state} satisfies SaveRecord);
}
export function deserializeGame(data: string): SaveRecord {
  const record: unknown = JSON.parse(data);
  if (!record || typeof record !== 'object') throw new Error('Der Spielstand ist beschädigt.');
  const candidate = record as Partial<SaveRecord>;
  const s = candidate.state;
  if (candidate.version !== 1 || !s || s.version !== 1 || typeof s.seed !== 'string' ||
      !Array.isArray(s.population) || !Array.isArray(s.buildings) || !s.resources || !s.arrival ||
      !s.rates || !Number.isFinite(s.time) || !Number.isFinite(s.tickRemainder)) {
    throw new Error('Der Spielstand ist beschädigt oder wird nicht unterstützt.');
  }
  return candidate as SaveRecord;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Speicher konnte nicht geöffnet werden.'));
    request.onblocked = () => reject(new Error('Der Speicher wird von einem anderen Tab blockiert.'));
  });
}
let pendingSave: Promise<void> = Promise.resolve();
async function writeSnapshot(snapshot: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(snapshot, SLOT);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Speichern fehlgeschlagen.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Speichern abgebrochen.'));
    });
  } finally { db.close(); }
}
export function saveGame(state: GameState): Promise<void> {
  // Capture immediately, and serialize writes so an older autosave cannot
  // overwrite a newer manual save if opening IndexedDB finishes out of order.
  const snapshot = serializeGame(state);
  const write = pendingSave.catch(() => undefined).then(() => writeSnapshot(snapshot));
  pendingSave = write;
  return write;
}
export async function loadGame(): Promise<SaveRecord | null> {
  // A load requested directly after save must see the completed write.
  await pendingSave.catch(() => undefined);
  const db = await database();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(SLOT);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Laden fehlgeschlagen.'));
    });
    if (value === undefined) return null;
    if (typeof value !== 'string') throw new Error('Der Spielstand ist beschädigt.');
    return deserializeGame(value);
  } finally { db.close(); }
}
