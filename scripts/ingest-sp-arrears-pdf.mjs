// =============================================================================
// ingest-sp-arrears-pdf.mjs — Data Forge path: MORTGAGE ARREARS from the monthly
// S&P Global Ratings PDF "RMBS Arrears Statistics: Australia (Including
// Noncapital Market Issuance) <Month YYYY>" (spglobal.com/ratings → Regulatory;
// needs the S&P login, so a person downloads it — the article endpoint serves
// the PDF only, no spreadsheet). Found 2026-09-13.
//
// What it reads:
//   • page 2 "30+ Arrears By State" — six month-end columns (e.g. 28-Feb … 31-Jul)
//     for the eight states/territories + Australia, prime loans, 30+ days, in %.
//     The year comes from the "Data as of <Month YYYY>" line.
//   • page 1 "Prime SPIN" — the national 12-month row, used as a cross-check of
//     the Australia column.
// Verified 2026-09-13 against the store: the four overlapping months (Feb–May
// 2026) match forge_arrears exactly for all nine series.
//
// What it writes → forge_arrears id 'latest' ({ months:[YYYY-MM], regions:{slug:{label,values[]}} }):
//   appends months the store lacks, and REPLACES overlapping months with the
//   newer publication's figure (S&P revises the latest month), keeping every
//   older month untouched. source_publication is updated; basis stays 'prime'.
//   Also stamps forge_data_status 'arrears' and logs rdp_runs.
//
// Dry-run by DEFAULT; --write updates the store.
//   node scripts/ingest-sp-arrears-pdf.mjs <report.pdf>            # parse + parity, print
//   node scripts/ingest-sp-arrears-pdf.mjs <report.pdf> --write    # update forge_arrears
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');   // index.js runs a fixture self-test under ESM → ENOENT

try { if (existsSync('.env')) for (const ln of readFileSync('.env', 'utf8').split(/\r?\n/)) { const m = ln.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {}
const WRITE = process.argv.includes('--write');
const FILE = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!FILE || !existsSync(FILE)) { console.error('usage: node scripts/ingest-sp-arrears-pdf.mjs <S&P RMBS Arrears Statistics PDF> [--write]'); process.exit(1); }

const SLUG = { 'New South Wales': 'st-nsw', 'Victoria': 'st-vic', 'Queensland': 'st-qld', 'Western Australia': 'st-wa', 'South Australia': 'st-sa', 'Tasmania': 'st-tas', 'Australian Capital Territory': 'st-act', 'Northern Territory': 'st-nt', 'Australia': 'australia' };
const LABEL = { 'st-nsw': 'NSW', 'st-vic': 'VIC', 'st-qld': 'QLD', 'st-wa': 'WA', 'st-sa': 'SA', 'st-tas': 'TAS', 'st-act': 'ACT', 'st-nt': 'NT', australia: 'National' };
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_NAME = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

// ── Supabase only needed for --write ──
const URL = process.env.SUPABASE_URL || 'https://cannojsxduvlewimwoxa.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// ── parse ──
const buf = readFileSync(FILE);
if (buf.subarray(0, 5).toString() !== '%PDF-') { console.error('not a PDF: ' + FILE); process.exit(1); }
const text = (await pdfParse(buf)).text.replace(/ /g, ' ');
const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
const title = (lines.find(l => /^RMBS Arrears Statistics/i.test(l)) || 'RMBS Arrears Statistics: Australia').slice(0, 120);
const asOf = lines.map(l => l.match(/Data as of ([A-Z][a-z]+) (20\d{2})/)).find(Boolean);
if (!asOf) { console.error('no "Data as of <Month YYYY>" line — is this the RMBS Arrears Statistics report?'); process.exit(1); }
const lastM = MONTH_NAME[asOf[1].toLowerCase()], lastY = +asOf[2];
if (!lastM) { console.error('unreadable as-of month: ' + asOf[1]); process.exit(1); }

// page-2 header: six DD-Mon tokens (e.g. "28-Feb31-Mar30-Apr31-May30-Jun31-Jul")
const hi = lines.findIndex(l => /^(\d{2}-[A-Z][a-z]{2}){4,8}$/.test(l));
if (hi < 0) { console.error('state table header (DD-Mon…) not found'); process.exit(1); }
const monTokens = [...lines[hi].matchAll(/\d{2}-([A-Z][a-z]{2})/g)].map(m => MON[m[1].toLowerCase()]);
if (monTokens[monTokens.length - 1] !== lastM) { console.error(`header ends ${monTokens[monTokens.length - 1]} but the as-of month is ${lastM}`); process.exit(1); }
// walk back from the as-of month to assign years (handles a December → January wrap)
const months = []; let y = lastY, m = lastM;
for (let i = monTokens.length - 1; i >= 0; i--) { if (monTokens[i] !== m) { console.error('header months are not consecutive'); process.exit(1); } months.unshift(ym(y, m)); m--; if (m === 0) { m = 12; y--; } }

const table = {};   // slug -> [values]
for (let i = hi + 1; i < Math.min(lines.length, hi + 40); i++) {
  const slug = SLUG[lines[i]]; if (!slug) continue;
  const vals = [...(lines[i + 1] || '').matchAll(/(\d+\.\d+)%/g)].map(x => +x[1]);
  if (vals.length !== months.length) { console.error(`${lines[i]}: expected ${months.length} values, got ${vals.length} ("${lines[i + 1]}")`); process.exit(1); }
  table[slug] = vals; i++;
  if (Object.keys(table).length === Object.keys(SLUG).length) break;   // the chart page repeats the state names without values
}
const missing = Object.values(SLUG).filter(s => !table[s]);
if (missing.length) { console.error('rows missing from the state table: ' + missing.join(', ')); process.exit(1); }
for (const [s, vals] of Object.entries(table)) for (const v of vals) if (v <= 0 || v > 15) { console.error(`implausible ${s} value ${v}`); process.exit(1); }

// page-1 national cross-check: "(%)Aug-25Sep-25…Jul-26" then rows 31-60 / 61-90 / 90+ / Prime SPIN / TCLB
const ph = lines.findIndex(l => /^\(%\)([A-Z][a-z]{2}-\d{2}){6,}$/.test(l));
let spinCheck = null;
if (ph >= 0) {
  const hdr = [...lines[ph].matchAll(/([A-Z][a-z]{2})-(\d{2})/g)].map(x => ym(2000 + +x[2], MON[x[1].toLowerCase()]));
  const rows = []; for (let i = ph + 1; i < ph + 20 && rows.length < 4; i++) { const v = [...lines[i].matchAll(/\d+\.\d{2}/g)].map(x => +x[0]); if (v.length === hdr.length) rows.push(v); }
  if (rows.length === 4) spinCheck = Object.fromEntries(hdr.map((k, i) => [k, rows[3][i]]));   // 4th numeric row = Prime SPIN
}

console.log(`${title || 'S&P RMBS Arrears Statistics'} — data as of ${asOf[1]} ${asOf[2]}`);
console.log(`State table months: ${months.join(', ')}`);
for (const slug of Object.values(SLUG)) console.log(`  ${LABEL[slug].padEnd(9)} ${table[slug].map(v => v.toFixed(2)).join('  ')}`);
if (spinCheck) {
  const diffs = months.filter(k => spinCheck[k] != null && Math.abs(spinCheck[k] - table.australia[months.indexOf(k)]) > 0.011);
  console.log(`Prime SPIN cross-check (page 1): ${diffs.length ? '⚠ differs for ' + diffs.join(', ') : '✓ matches the Australia column'}`);
}

// ── merge with the store ──
const { data: row, error } = await sb.from('forge_arrears').select('data,updated_at').eq('id', 'latest').maybeSingle();
if (error) { console.error(error.message); process.exit(1); }
if (!row || !row.data || !Array.isArray(row.data.months)) { console.error('forge_arrears.latest is empty — seed it first'); process.exit(1); }
const store = row.data;
if (store.basis && store.basis !== 'prime') { console.error(`store basis is "${store.basis}", this report is prime — refusing`); process.exit(1); }
const idx = new Map(store.months.map((k, i) => [k, i]));
let appended = 0, replaced = 0, same = 0, worst = 0;
for (const k of months) {
  const j = idx.get(k);
  if (j == null) {
    store.months.push(k);
    for (const slug of Object.values(SLUG)) { const r = (store.regions[slug] ||= { label: LABEL[slug], values: [] }); while (r.values.length < store.months.length - 1) r.values.push(null); r.values.push(table[slug][months.indexOf(k)]); }
    appended++;
  } else {
    let changed = false;
    for (const slug of Object.values(SLUG)) { const r = store.regions[slug]; if (!r) continue; const nv = table[slug][months.indexOf(k)], ov = r.values[j]; if (ov == null || Math.abs(ov - nv) > 0.0001) { if (ov != null) worst = Math.max(worst, Math.abs(ov - nv)); r.values[j] = nv; changed = true; } }
    changed ? replaced++ : same++;
  }
}
// keep months ascending (appends are newer, but be safe)
const order = store.months.map((k, i) => [k, i]).sort((a, b) => a[0].localeCompare(b[0])).map(x => x[1]);
store.months = order.map(i => store.months[i]);
for (const r of Object.values(store.regions)) { const v = r.values; while (v.length < order.length) v.push(null); r.values = order.map(i => v[i]); }
console.log(`\nStore: ${appended} month(s) appended, ${replaced} replaced by the newer publication (max change ${worst.toFixed(2)} pp), ${same} unchanged → ${store.months[0]} … ${store.months[store.months.length - 1]} (${store.months.length} months)`);
if (worst > 0.3) { console.error('✗ a revision larger than 0.3 pp — check the PDF before writing'); process.exit(1); }

if (!WRITE) console.log('\nDry run. Re-run with --write to update forge_arrears.');   // no process.exit after a fetch — libuv asserts on Windows
if (WRITE) {
const now = new Date().toISOString();
store.source_publication = `S&P Global Ratings — RMBS Arrears Statistics: Australia (Including Noncapital Market Issuance), ${asOf[1]} ${asOf[2]} report (PDF state table, prime 30+ days)`;
store.source_series = store.source_series || 'Aust Prime State Arrears (PRIME loans only, 30+ days) + Australian Prime SPIN (national)';
const { error: werr } = await sb.from('forge_arrears').update({ data: store, updated_at: now }).eq('id', 'latest');
if (werr) { console.error(werr.message); process.exit(1); }
try { await sb.from('rdp_runs').insert({ dataset: 'raw', source_month: `S&P arrears ${ym(lastY, lastM)}`, row_count: months.length * Object.keys(SLUG).length, status: 'ok', notes: `forge_arrears from the S&P RMBS Arrears Statistics PDF (${asOf[1]} ${asOf[2]}): ${appended} month(s) appended, ${replaced} revised; series to ${store.months[store.months.length - 1]}` }); } catch {}
try { await sb.from('forge_data_status').upsert({ data_key: 'arrears', label: 'Mortgage Arrears', source: 'S&P Global Ratings — RMBS Arrears Statistics: Australia (Including Noncapital Market Issuance), monthly PDF (login), prime 30+ days by state', status: 'ok', message: `prime series to ${store.months[store.months.length - 1]} from the ${asOf[1]} ${asOf[2]} report`, last_run_at: now, last_ok_at: now, updated_at: now }, { onConflict: 'data_key' }); } catch {}
console.log(`\n✓ forge_arrears updated to ${store.months[store.months.length - 1]}.`);
}
