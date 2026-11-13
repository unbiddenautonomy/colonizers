import { describe, expect, it } from 'vitest';
import { ModuleLibrary } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import {
  blankDraft,
  checkDraft,
  cleanCustomMap,
  coastEdges,
  draftToMapFile,
  mapFileToDraft,
  PRESETS,
  randomHarbors,
  randomNumbers,
  startingSpots,
  validateMapFile,
  type MapDraft,
} from '../src/index.ts';

const lib = new ModuleLibrary([baseModule]);

/** A painted classic island: four of each resource but ore (three) and a desert. */
function painted(): MapDraft {
  const d = blankDraft('Test island');
  const kinds = [
    'desert',
    ...Array(4).fill('forest'),
    ...Array(4).fill('pasture'),
    ...Array(4).fill('fields'),
    ...Array(3).fill('hills'),
    ...Array(3).fill('mountains'),
  ];
  let i = 0;
  return {
    ...d,
    hexes: d.hexes.map((h) => (h.type === 'sea' ? h : { ...h, type: kinds[i++]! })),
  };
}

describe('Map editor', () => {
  it('starts with a classic island in a ring of sea', () => {
    const d = blankDraft();
    expect(d.hexes.filter((h) => h.type !== 'sea')).toHaveLength(19);
    expect(d.hexes.filter((h) => h.type === 'sea')).toHaveLength(18);
    expect(coastEdges(d.hexes)).toHaveLength(30);
  });

  it('asks for numbers, then passes with random numbers and harbors', () => {
    const d = painted();
    expect(checkDraft(d).errors.join(' ')).toMatch(/18 land hexes need numbers/);
    const done = randomHarbors(randomNumbers(d, 'x'), 'x');
    const check = checkDraft(done);
    expect(check.errors).toEqual([]);
    expect(done.hexes.find((h) => h.type === 'desert')!.token).toBeUndefined();
    expect(done.harbors.length).toBeGreaterThanOrEqual(5);
    expect(startingSpots(done.hexes).length).toBeGreaterThanOrEqual(8);
    // Same seed, same numbers.
    expect(randomNumbers(d, 'x')).toEqual(randomNumbers(d, 'x'));
  });

  it('turns a finished draft into a map a game can start on', () => {
    const done = randomHarbors(randomNumbers(painted(), 'y'), 'y');
    const file = draftToMapFile(done);
    expect(validateMapFile(file)).toEqual([]);
    expect(file.pieces?.[0]?.type).toBe('robber');
    const s = lib.createGame({
      seed: 'ed',
      players: ['A', 'B', 'C', 'D'],
      modules: ['base'],
      map: file,
      settings: { vpTarget: 10 },
    }).state;
    expect(Object.keys(s.hexes)).toHaveLength(37);
    expect(lib.legalActions(s, s.turn.player).length).toBeGreaterThan(20);
    expect(mapFileToDraft(file).hexes).toHaveLength(37);
  });

  it('says when too few players fit, or the numbers are wrong', () => {
    const done = randomNumbers(painted(), 'z');
    // A three-hex island is too small for four.
    const keep = ['0,0', '1,0', '0,1'];
    const small = {
      ...done,
      hexes: done.hexes.map((h) =>
        keep.includes(`${h.q},${h.r}`)
          ? { q: h.q, r: h.r, type: 'forest', token: 5 }
          : { q: h.q, r: h.r, type: 'sea' },
      ),
    };
    expect(checkDraft(small).errors.join(' ')).toMatch(/4 players need 8/);
    const bad = {
      ...done,
      hexes: done.hexes.map((h) => (h.type === 'desert' ? { ...h, token: 5 } : h)),
    };
    expect(checkDraft(bad).errors.join(' ')).toMatch(/Deserts and sea take no number/);
    const red = {
      ...done,
      hexes: done.hexes.map((h, i) => (i < 2 && h.type !== 'desert' ? { ...h, token: 6 } : h)),
    };
    expect(checkDraft(red).warnings.join(' ')).toMatch(/red numbers/);
  });

  it('cleans maps that come from outside', () => {
    const file = draftToMapFile(randomNumbers(painted(), 'w'));
    const ok = cleanCustomMap(JSON.parse(JSON.stringify(file)));
    expect('map' in ok && ok.map.hexes.length).toBe(37);
    expect(cleanCustomMap({ ...file, hexes: 'lots' })).toHaveProperty('errors');
    expect(
      cleanCustomMap({ ...file, harbors: [{ edge: 'nope', resource: 'any', ratio: 3 }] }),
    ).toHaveProperty('errors');
    expect(cleanCustomMap(PRESETS[0])).toHaveProperty('map');
  });
});
