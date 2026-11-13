import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  cornerToPixel,
  edgeCorners,
  hexCorners,
  hexId,
  hexToPixel,
  type EdgeId,
} from '@colonizers/engine';
import {
  analyzeMap,
  blankDraft,
  checkDraft,
  cleanCustomMap,
  coastEdges,
  draftToMapFile,
  EDITOR_LAND,
  EDITOR_NUMBERS,
  HARBOR_KINDS,
  isLandType,
  mapFileToDraft,
  MAX_RADIUS,
  randomHarbors,
  randomNumbers,
  slugify,
  type DraftHex,
  type MapDraft,
} from '@colonizers/maps';
import { useTheme } from '../theme/themes.tsx';
import { RESOURCE_ICON } from '../theme/clean.ts';
import { deleteCustomMap, freeId, loadCustomMaps, saveCustomMap } from '../game/customMaps.ts';

/** Draw your own board: paint terrain, deal numbers, place harbors, then play it. */

type Tool =
  | { kind: 'terrain'; type: string }
  | { kind: 'erase' }
  | { kind: 'number'; token: number | null }
  | { kind: 'harbor'; resource: string | null };

const S = 40;
const TERRAIN_NAME: Record<string, string> = {
  forest: 'Forest',
  hills: 'Hills',
  pasture: 'Pasture',
  fields: 'Fields',
  mountains: 'Mountains',
  desert: 'Desert',
  sea: 'Sea',
};

const ring = (q: number, r: number) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const keyOf = (q: number, r: number) => `${q},${r}`;

function points(q: number, r: number, scale = 1): string {
  const c = hexToPixel(q, r, S);
  return hexCorners(q, r)
    .map((id) => {
      const p = cornerToPixel(id, S);
      return `${c.x + (p.x - c.x) * scale},${c.y + (p.y - c.y) * scale}`;
    })
    .join(' ');
}

function seedNow(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function MapEditor({ editId, onHome }: { editId: string | null; onHome: () => void }) {
  const theme = useTheme();
  const [draft, setDraft] = useState<MapDraft>(() => {
    const saved = editId ? loadCustomMaps().find((m) => m.id === editId) : undefined;
    return saved ? mapFileToDraft(saved) : blankDraft();
  });
  // The id the map was saved under, so saving again replaces it.
  const [savedId, setSavedId] = useState<string | null>(() =>
    editId && loadCustomMaps().some((m) => m.id === editId) ? editId : null,
  );
  const [tool, setTool] = useState<Tool>({ kind: 'terrain', type: 'forest' });
  const [note, setNote] = useState<string | null>(null);
  const painting = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const check = useMemo(() => checkDraft(draft), [draft]);
  const grade = useMemo(() => {
    if (check.errors.length) return null;
    try {
      return analyzeMap(draftToMapFile(draft), draft.players.max).grade;
    } catch {
      return null;
    }
  }, [draft, check]);

  // The grid: everything drawn, plus one ring around it to draw into.
  const radius = Math.min(MAX_RADIUS, Math.max(3, ...draft.hexes.map((h) => ring(h.q, h.r) + 1)));
  const cells = useMemo(() => {
    const out: { q: number; r: number }[] = [];
    for (let q = -radius; q <= radius; q++)
      for (let r = -radius; r <= radius; r++) if (ring(q, r) <= radius) out.push({ q, r });
    return out;
  }, [radius]);
  const byKey = useMemo(() => new Map(draft.hexes.map((h) => [keyOf(h.q, h.r), h])), [draft]);
  const coast = useMemo(() => coastEdges(draft.hexes), [draft]);
  const harborAt = useMemo(() => new Map(draft.harbors.map((h) => [h.edge, h])), [draft]);

  const viewBox = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of cells) {
      const p = hexToPixel(c.q, c.r, S);
      xs.push(p.x);
      ys.push(p.y);
    }
    const pad = S * 1.2;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return `${x} ${y} ${Math.max(...xs) + pad - x} ${Math.max(...ys) + pad - y}`;
  }, [cells]);

  const update = (fn: (d: MapDraft) => MapDraft) => {
    setNote(null);
    setDraft((d) => fn(d));
  };

  const paintHex = (q: number, r: number) => {
    const k = keyOf(q, r);
    update((d) => {
      const others = d.hexes.filter((h) => keyOf(h.q, h.r) !== k);
      const old = d.hexes.find((h) => keyOf(h.q, h.r) === k);
      let hex: DraftHex | null;
      if (tool.kind === 'erase') hex = null;
      else if (tool.kind === 'terrain') {
        hex = { q, r, type: tool.type };
        // A number stays with land that can carry one.
        if (old?.token !== undefined && isLandType(tool.type) && tool.type !== 'desert')
          hex.token = old.token;
      } else if (tool.kind === 'number') {
        if (!old || !isLandType(old.type) || old.type === 'desert') return d;
        hex = { q, r, type: old.type };
        if (tool.token !== null) hex.token = tool.token;
      } else return d;
      const hexes = hex ? [...others, hex] : others;
      // Harbors that are no longer on the coast go.
      const still = new Set(coastEdges(hexes));
      return { ...d, hexes, harbors: d.harbors.filter((h) => still.has(h.edge)) };
    });
  };

  const placeHarbor = (edge: EdgeId) => {
    if (tool.kind !== 'harbor') return;
    update((d) => {
      const rest = d.harbors.filter((h) => h.edge !== edge);
      if (tool.resource === null) return { ...d, harbors: rest };
      const resource = tool.resource;
      return { ...d, harbors: [...rest, { edge, resource, ratio: resource === 'any' ? 3 : 2 }] };
    });
  };

  const save = () => {
    const id = freeId(slugify(draft.name), savedId ?? undefined);
    const file = draftToMapFile({ ...draft, id });
    saveCustomMap(file);
    setSavedId(id);
    setDraft((d) => ({ ...d, id }));
    setNote(`Saved as “${file.name}”. Pick it under Your maps when you start a game.`);
  };

  const exportFile = () => {
    const file = draftToMapFile(draft);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (f: File) => {
    try {
      const r = cleanCustomMap(JSON.parse(await f.text()));
      if ('errors' in r) {
        setNote(`That file can't be used: ${r.errors[0]}`);
        return;
      }
      setDraft(mapFileToDraft(r.map));
      setSavedId(null);
      setNote(`Loaded “${r.map.name}”. Save it to keep it.`);
    } catch {
      setNote('That file is not a map.');
    }
  };

  const toolButton = (t: Tool, label: ReactNode, title: string, on: boolean) => (
    <button
      type="button"
      className={on ? 'on' : ''}
      aria-pressed={on}
      title={title}
      onClick={() => setTool(t)}
    >
      {label}
    </button>
  );

  const fill = (type: string) => (type === 'sea' ? theme.sea : (theme.terrain[type] ?? '#ccc'));

  return (
    <main className="editor-page">
      <header className="row editor-head">
        <button type="button" onClick={onHome}>
          ← Home
        </button>
        <h1>Map editor</h1>
      </header>
      <div className="editor">
        <div className="editor-board card">
          <svg
            viewBox={viewBox}
            role="application"
            aria-label="Map being drawn"
            onPointerUp={() => (painting.current = false)}
            onPointerLeave={() => (painting.current = false)}
          >
            {cells.map(({ q, r }) => {
              const h = byKey.get(keyOf(q, r));
              const c = hexToPixel(q, r, S);
              const paintable = tool.kind !== 'harbor';
              return (
                <g
                  key={hexId(q, r)}
                  data-hex={keyOf(q, r)}
                  className={paintable ? 'editor-cell' : undefined}
                  onPointerDown={(e) => {
                    if (!paintable) return;
                    (e.target as Element).releasePointerCapture?.(e.pointerId);
                    painting.current = true;
                    paintHex(q, r);
                  }}
                  onPointerEnter={() => {
                    if (paintable && painting.current && tool.kind !== 'number') paintHex(q, r);
                  }}
                >
                  <polygon
                    points={points(q, r)}
                    fill={h ? fill(h.type) : 'transparent'}
                    stroke={h ? (h.type === 'sea' ? theme.seaEdge : theme.landStroke) : '#9aa4ad'}
                    strokeWidth={h ? 2 : 1}
                    strokeDasharray={h ? undefined : '4 4'}
                  >
                    <title>
                      {h ? (TERRAIN_NAME[h.type] ?? h.type) : 'Empty: paint to add a hex'}
                    </title>
                  </polygon>
                  {h && isLandType(h.type) && theme.terrainIcon[h.type] && (
                    <text
                      x={c.x}
                      y={c.y - S * 0.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={S * 0.3}
                      pointerEvents="none"
                    >
                      {theme.terrainIcon[h.type]}
                    </text>
                  )}
                  {h?.token !== undefined && (
                    <g pointerEvents="none">
                      <circle cx={c.x} cy={c.y + S * 0.05} r={S * 0.32} fill={theme.token} />
                      <text
                        x={c.x}
                        y={c.y + S * 0.16}
                        textAnchor="middle"
                        fontSize={S * 0.32}
                        fontWeight={700}
                        fill={h.token === 6 || h.token === 8 ? theme.tokenHot : theme.tokenText}
                      >
                        {h.token}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            {coast.map((e) => {
              const [a, b] = edgeCorners(e).map((c) => cornerToPixel(c, S)) as [
                { x: number; y: number },
                { x: number; y: number },
              ];
              const hb = harborAt.get(e);
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              if (!hb && tool.kind !== 'harbor') return null;
              return (
                <g
                  key={e}
                  className={tool.kind === 'harbor' ? 'editor-edge' : undefined}
                  onClick={() => placeHarbor(e)}
                >
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={hb ? theme.harborWood : 'rgba(255,255,255,0.7)'}
                    strokeWidth={hb ? 7 : 9}
                    strokeLinecap="round"
                  />
                  {hb && (
                    <g pointerEvents="none">
                      <circle cx={mid.x} cy={mid.y} r={S * 0.27} fill={theme.harborFace} />
                      <text
                        x={mid.x}
                        y={mid.y + S * 0.08}
                        textAnchor="middle"
                        fontSize={S * 0.22}
                        fontWeight={700}
                        fill={theme.harborText}
                      >
                        {hb.resource === 'any' ? '3:1' : RESOURCE_ICON[hb.resource]}
                      </text>
                    </g>
                  )}
                  <title>
                    {hb
                      ? `Harbor: ${hb.resource === 'any' ? '3 of a kind for 1' : `2 ${hb.resource} for 1`}`
                      : 'Coast: tap to place the harbor'}
                  </title>
                </g>
              );
            })}
          </svg>
          <p className="muted small">
            {tool.kind === 'harbor'
              ? 'Tap a glowing coast edge to place or replace a harbor.'
              : tool.kind === 'number'
                ? 'Tap a land hex to give it this number.'
                : 'Tap or drag across hexes to paint. Empty spots around the land become sea when you play.'}
          </p>
        </div>

        <div className="editor-tools">
          <section className="card">
            <h2 className="subhead">Terrain</h2>
            <div className="row wrap">
              {[...EDITOR_LAND, 'sea'].map((t) =>
                toolButton(
                  { kind: 'terrain', type: t },
                  <>
                    <span className="swatch" style={{ background: fill(t) }} aria-hidden="true" />{' '}
                    {TERRAIN_NAME[t]}
                  </>,
                  `Paint ${TERRAIN_NAME[t]}`,
                  tool.kind === 'terrain' && tool.type === t,
                ),
              )}
              {toolButton({ kind: 'erase' }, '🧽 Erase', 'Remove hexes', tool.kind === 'erase')}
            </div>
            <h2 className="subhead">Numbers</h2>
            <div className="row wrap">
              {EDITOR_NUMBERS.map((n) =>
                toolButton(
                  { kind: 'number', token: n },
                  <span style={{ color: n === 6 || n === 8 ? theme.tokenHot : undefined }}>
                    {n}
                  </span>,
                  `Number ${n}`,
                  tool.kind === 'number' && tool.token === n,
                ),
              )}
              {toolButton(
                { kind: 'number', token: null },
                'None',
                'Take the number off',
                tool.kind === 'number' && tool.token === null,
              )}
            </div>
            <h2 className="subhead">Harbors</h2>
            <div className="row wrap">
              {HARBOR_KINDS.map((k) =>
                toolButton(
                  { kind: 'harbor', resource: k },
                  k === 'any' ? '3:1' : <>2:1 {RESOURCE_ICON[k]}</>,
                  k === 'any' ? 'Any 3 of a kind for 1' : `2 ${k} for 1`,
                  tool.kind === 'harbor' && tool.resource === k,
                ),
              )}
              {toolButton(
                { kind: 'harbor', resource: null },
                'Remove',
                'Remove a harbor',
                tool.kind === 'harbor' && tool.resource === null,
              )}
            </div>
            <div className="row wrap editor-quick">
              <button type="button" onClick={() => update((d) => randomNumbers(d, seedNow()))}>
                🎲 Random numbers
              </button>
              <button type="button" onClick={() => update((d) => randomHarbors(d, seedNow()))}>
                ⚓ Random harbors
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(blankDraft());
                  setSavedId(null);
                  setNote(null);
                }}
              >
                Start over
              </button>
            </div>
          </section>

          <section className="card">
            <label className="field">
              Name
              <input
                value={draft.name}
                maxLength={40}
                onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label className="field">
              Description
              <input
                value={draft.description}
                maxLength={200}
                placeholder="Optional"
                onChange={(e) => update((d) => ({ ...d, description: e.target.value }))}
              />
            </label>
            <div className="row">
              <label className="field">
                Players from
                <select
                  value={draft.players.min}
                  onChange={(e) =>
                    update((d) => {
                      const min = Number(e.target.value);
                      return { ...d, players: { min, max: Math.max(min, d.players.max) } };
                    })
                  }
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                to
                <select
                  value={draft.players.max}
                  onChange={(e) =>
                    update((d) => {
                      const max = Number(e.target.value);
                      return { ...d, players: { min: Math.min(max, d.players.min), max } };
                    })
                  }
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>

            <div aria-live="polite">
              {check.errors.length === 0 ? (
                <p className="editor-ok">
                  ✅ Ready to play{grade ? ` · fairness grade ${grade}` : ''}
                </p>
              ) : (
                <ul className="editor-problems">
                  {check.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              {check.warnings.length > 0 && (
                <ul className="editor-warnings">
                  {check.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {note && <p className="muted">{note}</p>}
            </div>

            <div className="row wrap">
              <button
                type="button"
                className="primary"
                disabled={check.errors.length > 0}
                onClick={save}
              >
                Save
              </button>
              <button type="button" disabled={check.errors.length > 0} onClick={exportFile}>
                Export file
              </button>
              <button type="button" onClick={() => fileInput.current?.click()}>
                Import file
              </button>
              {savedId && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    deleteCustomMap(savedId);
                    setSavedId(null);
                    setNote('Deleted from your maps. It is still here until you leave.');
                  }}
                >
                  Delete
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = '';
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
