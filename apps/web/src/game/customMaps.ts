import { cleanCustomMap, type MapFile } from '@colonizers/maps';

/** Maps made in the map editor, kept in this browser. */

const KEY = 'colonizers.customMaps';

export function loadCustomMaps(): MapFile[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list.flatMap((m) => {
      const r = cleanCustomMap(m);
      return 'map' in r ? [r.map] : [];
    });
  } catch {
    return [];
  }
}

function store(list: MapFile[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the map stays in the editor until exported.
  }
}

/** Saves a map, replacing one with the same id. */
export function saveCustomMap(map: MapFile): void {
  store([...loadCustomMaps().filter((m) => m.id !== map.id), map]);
}

export function deleteCustomMap(id: string): void {
  store(loadCustomMaps().filter((m) => m.id !== id));
}

/** An id not used by another saved map (unless it is this map's own). */
export function freeId(base: string, own?: string): string {
  const taken = new Set(loadCustomMaps().map((m) => m.id));
  if (own) taken.delete(own);
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}
