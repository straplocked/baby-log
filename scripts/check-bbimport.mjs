// Guard for the Baby Buddy importer (src/bbimport.js) — run with:
//   node scripts/check-bbimport.mjs
// Fixtures and expected values below are HAND-WRITTEN (120 ml → 4.06 oz was
// worked out on paper: 120 / 29.5735 = 4.0577 → 4.06), never derived from the
// module's own constants — so breaking the ml→oz conversion fails loudly here.
import { mapBabyBuddy, parseCsv, chunk } from '../src/bbimport.js'

let failures = 0
const check = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) console.log('ok   ' + name)
  else { failures++; console.error('FAIL ' + name + '\n  want ' + w + '\n  got  ' + g) }
}

// ── fixtures: one file per Baby Buddy model, headers as its admin exports ────
const feedings = `id,child_id,child_first_name,child_last_name,start,end,duration,type,method,amount,notes,tags
10,1,Robin,Doe,2025-01-15 10:30:00,2025-01-15 10:48:00,0:18:00,breast milk,left breast,,,
11,1,Robin,Doe,2025-01-15 14:00:00,2025-01-15 14:10:00,0:10:00,formula,bottle,120.0,"fussy, but ate ""fine""",
12,1,Robin,Doe,2025-01-16 09:00:00,2025-01-16 09:05:00,0:05:00,breast milk,bottle,4,,
13,1,Robin,Doe,2025-01-16 12:00:00,2025-01-16 12:15:00,0:15:00,solid food,parent fed,30,,
`
const pumping = `id,child_id,child_first_name,child_last_name,start,end,duration,amount,notes,tags
3,1,Robin,Doe,2025-01-15 08:00:00,2025-01-15 08:20:00,0:20:00,90,,
`
const changes = `id,child_id,child_first_name,child_last_name,time,wet,solid,color,amount,notes,tags
5,1,Robin,Doe,2025-01-15 11:00:00,True,False,,,,
6,1,Robin,Doe,2025-01-15 13:00:00,False,True,brown,,,
7,1,Robin,Doe,2025-01-15 15:00:00,True,True,,,,
8,1,Robin,Doe,2025-01-15 16:00:00,False,False,,,,
`
const sleep = `id,child_id,child_first_name,child_last_name,start,end,duration,nap,notes,tags
2,1,Robin,Doe,2025-01-15 12:00:00,2025-01-15 13:35:00,1:35:00,True,,
9,1,Robin,Doe,2025-01-15 20:00:00,,,True,,
`
const notes = `id,child_id,child_first_name,child_last_name,time,note,tags
1,1,Robin,Doe,2025-01-15 12:00:00,"Hello, ""world""
second line",
`
const files = [
  { name: 'feedings.csv', text: feedings },
  { name: 'pumping.csv', text: pumping },
  { name: 'changes.csv', text: changes },
  { name: 'sleep.csv', text: sleep },
  { name: 'notes.csv', text: notes },
]

// ── CSV parser: quoted commas, escaped quotes, embedded newline ──────────────
const noteRows = parseCsv(notes)
check('csv: quoted field with comma, "" escape and newline', noteRows[0].note, 'Hello, "world"\nsecond line')
check('csv: one data row despite embedded newline', noteRows.length, 1)

// ── mapping ──────────────────────────────────────────────────────────────────
const at = (d, h, m) => new Date(2025, 0, d, h, m).getTime() // hand-picked local stamps matching the fixtures
const res = mapBabyBuddy(files)
const bare = res.entries.map(({ type, t, detail }) => ({ type, t, detail }))
check('mapping: entries in file order with hand-written values', bare, [
  { type: 'nurse', t: at(15, 10, 30), detail: 'Left · 18m' },
  { type: 'bottle', t: at(15, 14, 0), detail: '4.06 formula' }, // 120 ml → 4.06 oz, worked out by hand
  { type: 'bottle', t: at(16, 9, 0), detail: '4 breastmilk' }, // 4 ≤ 15 reads as oz already
  { type: 'pump', t: at(15, 8, 0), detail: '3.04 · 20m' }, // 90 ml → 3.04 oz by hand
  { type: 'wet', t: at(15, 11, 0), detail: null },
  { type: 'dirty', t: at(15, 13, 0), detail: null },
  { type: 'both', t: at(15, 15, 0), detail: null },
  { type: 'sleep', t: at(15, 13, 35), detail: 95 }, // stamped at wake-up, bare minutes — 1h35m by hand
])
check('counts: imported', res.imported, 8)
// skipped: parent-fed solids, dry change, endless sleep, the note row
check('counts: skipped', res.skipped, 4)
check('counts: per-model', res.models, {
  feedings: { imported: 3, skipped: 1 },
  pumping: { imported: 1, skipped: 0 },
  changes: { imported: 3, skipped: 1 },
  sleep: { imported: 1, skipped: 1 },
  notes: { imported: 0, skipped: 1 },
})

// ── deterministic, idempotent ids ────────────────────────────────────────────
const ids = res.entries.map(e => e.id)
check('ids: uuid-shaped', ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)), true)
check('ids: unique per source row', new Set(ids).size, 8)
const again = mapBabyBuddy(files)
check('ids: identical on re-import of the same files', again.entries.map(e => e.id), ids)
const renamed = mapBabyBuddy([{ name: 'export (1).csv', text: feedings }])
check('ids: filename plays no part', renamed.entries.map(e => e.id), ids.slice(0, 3))
const merged = mapBabyBuddy([...files, ...files]) // both files picked twice in one go
check('dedupe: same rows twice in one import collapse', merged.imported, 8)

// ── outbox chunking (sync() pushes through chunk(payload, 500)) ──────────────
const nums = Array.from({ length: 1101 }, (_, i) => i + 1)
const parts = chunk(nums, 500)
check('chunk: 1101 → 500/500/101', parts.map(p => p.length), [500, 500, 101])
check('chunk: order preserved end to end', [parts[0][0], parts[1][0], parts[2][100]], [1, 501, 1101])
check('chunk: small batch stays one call', chunk([1, 2, 3], 500), [[1, 2, 3]])
check('chunk: empty stays empty', chunk([], 500), [])

if (failures) { console.error('\n' + failures + ' check(s) failed'); process.exit(1) }
console.log('\nall checks passed')
