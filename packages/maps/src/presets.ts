import type { MapFile } from './mapfile.ts';
import starter from '../presets/starter.json' with { type: 'json' };
import classic56 from '../presets/classic-5-6.json' with { type: 'json' };
import big78 from '../presets/big-7-8.json' with { type: 'json' };

/** Preset boards shipped with the game. Special maps join this list in phase 9. */
export const PRESETS: MapFile[] = [starter, classic56, big78] as MapFile[];

export function presetById(id: string): MapFile | undefined {
  return PRESETS.find((p) => p.id === id);
}
