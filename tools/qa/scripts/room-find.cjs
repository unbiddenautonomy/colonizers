// Usage: node room-find.cjs <dir> <code> : prints the sqlite file of the room with that code.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const [dir, code] = process.argv.slice(2);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')) {
  try {
    const db = new DatabaseSync(dir + '/' + f, { readOnly: true });
    const row = db.prepare("SELECT value FROM meta WHERE key='code'").get();
    if (row && String(row.value).includes(code)) { console.log(dir + '/' + f); break; }
    db.close();
  } catch {}
}
