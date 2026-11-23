// Usage: node room-dump.cjs <sqlite file> <out.json> : writes {config, actions, members, meta} of a local room.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
const meta = Object.fromEntries(db.prepare('SELECT * FROM meta').all().map((r) => [r.key ?? r.k, r.value ?? r.v]));
const members = db.prepare('SELECT * FROM members').all();
const acts = db.prepare('SELECT * FROM actions ORDER BY 1').all();
const cols = acts[0] ? Object.keys(acts[0]) : [];
let config = null;
for (const [k, v] of Object.entries(meta)) { try { const j = JSON.parse(v); if (j && j.modules && j.players) config = j; } catch {} }
if (!config) for (const m of members) for (const v of Object.values(m)) { if (typeof v === 'string' && v.startsWith('{')) { try { const j = JSON.parse(v); if (j && j.modules && j.players) config = j; } catch {} } }
const actions = acts.map((r) => JSON.parse(r.action ?? r.json ?? r.data ?? Object.values(r).find((v) => typeof v === 'string' && v.startsWith('{'))));
fs.writeFileSync(process.argv[3], JSON.stringify({ config, actions, members: members.map((m) => ({ id: m.id, name: m.name, role: m.role, seat: m.seat, bot: m.bot })), meta: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, String(v).slice(0, 200)])) }));
console.log('tables', tables.join(','), '| action cols', cols.join(','), '| actions', actions.length, '| config', !!config, '| meta keys', Object.keys(meta).join(','));
console.log('members', JSON.stringify(members.map((m) => [m.name, m.role, m.seat, m.bot])));
