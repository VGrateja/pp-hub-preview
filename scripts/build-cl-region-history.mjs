// =============================================================================
// build-cl-region-history.mjs — the regions for Market Cycles' "Regional growth"
// race: the biggest urban areas and councils, with a price series for each,
// from January 1980 to the Forge's latest month (forge_cotality id `cl_region_history`).
//
// WHY THIS EXISTS
// ---------------
// Saskia via Van, 2026-11-27: Davie wants the "which capital is ahead" race with
// the top 100 regions by population, filterable by population, smooth v workforce
// and capital v regional. Saskia: SUAs for the bigger regions, then the biggest
// councils (LGAs) that are not inside the SUAs already included.
//
// WHAT IT WRITES
// --------------
//   forge_cotality / cl_region_history
//     data.from, data.to          '1980-01' .. the Forge's latest month
//     data.months                 the months the value arrays hold (see MONTHS below)
//     data.lists.top              ids of the 100 most populous Significant Urban Areas (SUA)
//     data.lists.mixed            ids of every SUA of 50,000 people or more, then the most
//                                 populous councils outside them, to 100 in all
//     data.regions[id] = { name, kind: 'capital'|'sua'|'lga', st, pop, type, city?, v? }
//       pop   ABS estimated resident population, latest year (SUA = sum of its SA2s)
//       type  'smooth' | 'workforce' | null, from the 36 Runway v Demand markets
//       city  capitals only: the page draws them from cl_capital_history + the Forge's
//             capital rows, exactly as on Rolling capital growth (so no v here)
//       v     { lga: {H, U}, sub: {H, U} }: one value per data.months entry, in $100,
//             null where there is no figure or it rests on fewer than data.minSales sales
//             in 12 months. lga = "Councils it covers", sub = "Suburbs inside it".
//   Only growth between two months is ever read from v: the level is an index pinned to
//   a typical 12-month median at its last month, so it reads as dollars.
//
// THE TWO MEASURES
// ----------------
//   lga (Councils it covers): the Cotality 12-month median of each council the region
//     covers, combined month to month as a weighted geometric mean of each council's
//     growth, weighted by the number of the region's people living in that council
//     (Census 2021 mesh blocks). A council region is its own council's median.
//   sub (Suburbs inside it): the Cotality suburbs whose ABS suburb (SAL) has most of its
//     people inside the region, combined month to month as a weighted geometric mean of
//     each suburb's growth, weighted by its sales (the mean of its 12-month sales at the
//     two ends of the step). Cotality suburbs are matched to ABS suburbs by state and name
//     (postcode settles a name used twice in a state).
//   Both are chained from one stored month to the next using only the places with a
//   median at both ends, so a place joining or leaving does not move the line.
//
// WHERE IT READS (nothing here is committed; this repo is public)
//   --abs=<dir>   ABS ASGS Edition 3 allocation files (MB_2021_AUST, SAL_2021_AUST,
//                 LGA_2025_AUST, POA_2021_AUST) and Census 2021 Mesh Block Counts, downloaded
//                 there if missing (default scratch/_mc-regions/abs); SA2 and council ERP
//                 from the ABS Data API; SA2 -> SUA from scripts/data/sa2-sua-2021.json
//   --dir=<dir>   the CoreLogic CSTDAT4294 history files, January 1980 to June 2018
//                 (default ~/Downloads/corelogic-history; see build-cl-start-medians.mjs)
//   the Forge     forge_cl_suburbs, levels suburb and lga, July 2018 on, read through the
//                 Supabase CLI (`supabase db query --linked`, read-only SELECTs), one month
//                 at a time and only the months stored
//   Each source is cached under scratch/_mc-regions/cache (gitignored); --fresh re-reads the
//   Forge months. The two eras are joined as build-cl-capital-history.mjs joins them: the
//   history to June 2018, the Forge from July 2018, no rescaling at the join.
//
// The history is closed but the Forge grows: re-run after each Cotality month lands.
//
//   node scripts/build-cl-region-history.mjs            dry run (default): writes
//                                                       scratch/_mc-regions/cl_region_history.json
//   node scripts/build-cl-region-history.mjs --write    store it (needs the service key in .env)
// =============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').slice(n.length + 3);
const WRITE = process.argv.includes('--write'), FRESH = process.argv.includes('--fresh');
const OUT = join(ROOT, 'scratch', '_mc-regions'), CACHE = join(OUT, 'cache');
const ABS_DIR = arg('abs') || join(OUT, 'abs');
const HIST_DIR = arg('dir') || join(homedir(), 'Downloads', 'corelogic-history');
const ROW_ID = 'cl_region_history';
const MIN_SALES = 20;          // a region's 12-month figure needs at least this many sales behind it
const MIN_COVER = 0.5;         // ... and, for "councils it covers", councils holding half its people
const LIST_SIZE = 100, MIXED_SUA_MIN = 50000, INSIDE = 0.5;
for (const d of [OUT, CACHE, ABS_DIR]) mkdirSync(d, { recursive: true });
const log = (...a) => console.log(...a);

/* the eight capitals: their SUA name and the city name the page's capital series use */
const CAPITAL_SUA = { Sydney: 'Sydney', Melbourne: 'Melbourne', Brisbane: 'Brisbane', Perth: 'Perth', Adelaide: 'Adelaide', 'Canberra - Queanbeyan': 'Canberra', Hobart: 'Hobart', Darwin: 'Darwin' };
/* the 28 regional Runway v Demand markets, each one council (ABS LGA code), as scripts/ingest-abs-population.mjs has them */
const MARKET_LGA = {
  Albury: '10050', Ballarat: '20570', Bendigo: '22620', Bunbury: '51190', Bundaberg: '31820', Cairns: '32080', 'Central Coast': '11650',
  'Coffs Harbour': '11800', Geelong: '22750', Gladstone: '33360', 'Gold Coast': '33430', Ipswich: '33960', Launceston: '64010', Mackay: '34770',
  Mandurah: '55110', Mildura: '24780', Newcastle: '15900', Orange: '16150', 'Port Macquarie': '16380', Rockhampton: '36370', Rockingham: '57490',
  'Sunshine Coast': '36720', Tamworth: '17310', Toowoomba: '36910', Townsville: '37010', 'Wagga Wagga': '17750', Wodonga: '27170', Wollongong: '18450',
};
const STATE = { 1: 'NSW', 2: 'VIC', 3: 'QLD', 4: 'SA', 5: 'WA', 6: 'TAS', 7: 'NT', 8: 'ACT', 9: 'OT' };

/* council names: the rule in build-cl-start-medians.mjs (Cotality has spelled one council three ways since 2018) */
const canonLga = n => String(n || '').toUpperCase().replace(/\s*\([^)]*\)/g, ' ').replace(/&/g, ' ').replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\b(THE|AND)\b/g, ' ').replace(/\s+/g, ' ').trim().replace(/ (SHIRE|REGIONAL|CITY)$/, '');
/* councils Cotality still files under an older name or spelling (renamed or respelt since; the ABS 2025 name on the right) */
const LGA_ALIAS = { 'VIC|MORELAND': 'VIC|MERRI BEK', 'TAS|BREAK ODAY': 'TAS|BREAK O DAY', 'NSW|NAMBUCCA': 'NSW|NAMBUCCA VALLEY', 'NSW|WESTERN PLAINS': 'NSW|DUBBO',
  'SA|MALLALA': 'SA|ADELAIDE PLAINS', 'SA|PORT PIRIE CITY DISTS': 'SA|PORT PIRIE', 'SA|LOWER EYRE PENINSULA': 'SA|LOWER EYRE' };
/* suburb names: upper case, no "(Vic.)" qualifier, no punctuation */
const canonSub = n => String(n || '').toUpperCase().replace(/\s*\([^)]*\)\s*$/, '').replace(/['’`.]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
const num = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : null; };
const addM = (m, n) => { let y = +m.slice(0, 4), k = +m.slice(5, 7) - 1 + n; y += Math.floor(k / 12); k = ((k % 12) + 12) % 12; return y + '-' + String(k + 1).padStart(2, '0'); };
const readJson = f => JSON.parse(readFileSync(f, 'utf8'));
const kb = o => Math.round(JSON.stringify(o).length / 1024) + ' KB';

// ── 1. ABS geography: who lives where (cache/geo.json) ──────────────────────────
async function absFile(name, url) {
  const f = join(ABS_DIR, name);
  if (!existsSync(f)) {
    log('  downloading ' + name);
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return f;
}
const ALLOC = 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/allocation-files/';
const SDMX = 'https://data.api.abs.gov.au/rest/data/';
async function sdmx(flow, key, from) {
  const r = await fetch(SDMX + flow + '/' + key + '?startPeriod=' + from + '&format=jsondata&dimensionAtObservation=AllDimensions', { headers: { Accept: 'application/vnd.sdmx.data+json' } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { throw new Error('ABS ' + flow + ' ' + r.status + ': ' + t.slice(0, 80)); }
  const od = (j.data.structure || j.data.structures[0]).dimensions.observation, out = [];
  for (const [k, v] of Object.entries(j.data.dataSets[0].observations)) { const ix = k.split(':').map(Number), o = {}; od.forEach((d, i) => { o[d.id] = d.values[ix[i]].id; }); o.value = v[0]; out.push(o); }
  return out;
}
async function buildGeo() {
  const f = join(CACHE, 'geo.json'); if (existsSync(f)) return readJson(f);
  log('geography: reading the ABS allocation files (a minute or two)');
  const XLSX = createRequire(import.meta.url)('xlsx');
  const sheetRows = (file, sheet) => { const wb = XLSX.readFile(file, { dense: true, cellHTML: false, cellText: false, cellFormula: false }); const out = []; for (const s of (sheet ? [sheet] : wb.SheetNames)) for (const r of XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: null, raw: true })) out.push(r); return out; };
  const cols = (rows, names) => { const h = rows[0].map(x => String(x || '')); return names.map(n => { const i = h.indexOf(n); if (i < 0) throw new Error('column ' + n + ' not found'); return i; }); };
  const mb = new Map();     // MB code -> [sa2, state, persons, area, sal, lga, poa]
  { const rows = sheetRows(await absFile('MB_2021_AUST.xlsx', ALLOC + 'MB_2021_AUST.xlsx')); const [a, b, c, d] = cols(rows, ['MB_CODE_2021', 'SA2_CODE_2021', 'STATE_CODE_2021', 'AREA_ALBERS_SQKM']);
    for (const r of rows.slice(1)) if (r[a]) mb.set(String(r[a]), [String(r[b]), STATE[r[c]] || String(r[c]), 0, +r[d] || 0, null, null, null]); }
  { const rows = sheetRows(await absFile('mbcounts.xlsx', 'https://www.abs.gov.au/census/guide-census-data/mesh-block-counts/2021/Mesh%20Block%20Counts%2C%202021.xlsx'));
    let n = 0; for (const r of rows) { const e = r && r[0] != null && mb.get(String(r[0])); if (e && isFinite(+r[4])) { e[2] = +r[4]; n++; } } log('  mesh blocks: ' + mb.size + ', with a Census count ' + n); }
  const sal = {}, lga = {};
  { const rows = sheetRows(await absFile('SAL_2021_AUST.xlsx', ALLOC + 'SAL_2021_AUST.xlsx')); const [a, b, c] = cols(rows, ['MB_CODE_2021', 'SAL_CODE_2021', 'SAL_NAME_2021']);
    for (const r of rows.slice(1)) { const e = mb.get(String(r[a])); if (!e) continue; e[4] = String(r[b]); sal[e[4]] = sal[e[4]] || { name: String(r[c]), st: e[1] }; } }
  { const rows = sheetRows(await absFile('LGA_2025_AUST.xlsx', ALLOC + 'LGA_2025_AUST.xlsx')); const [a, b, c] = cols(rows, ['MB_CODE_2021', 'LGA_CODE_2025', 'LGA_NAME_2025']);
    for (const r of rows.slice(1)) { const e = mb.get(String(r[a])); if (!e) continue; e[5] = String(r[b]); lga[e[5]] = lga[e[5]] || { name: String(r[c]), st: e[1] }; } }
  { const rows = sheetRows(await absFile('POA_2021_AUST.xlsx', ALLOC + 'POA_2021_AUST.xlsx')); const [a, b] = cols(rows, ['MB_CODE_2021', 'POA_CODE_2021']);
    for (const r of rows.slice(1)) { const e = mb.get(String(r[a])); if (e) e[6] = String(r[b]); } }
  const corr = readJson(join(ROOT, 'scripts', 'data', 'sa2-sua-2021.json'));
  /* tallies by Census persons; a mesh block with nobody in it still counts a little (by area), so an empty suburb has a home */
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
  const suaLga = {}, lgaSua = {}, lgaPersons = {}, suaPersons = {}, salSua = {}, salLga = {}, salPoa = {}, suaState = {}, lgaState = {};
  for (const [, [sa2, st, p, area, s, l, poa]] of mb) {
    const sua = corr.sa2_to_sua[sa2] || null, w = p + area * 1e-3;
    if (l) { add(lgaPersons, l, p); add(lgaState[l] = lgaState[l] || {}, st, p); }
    if (sua) { add(suaPersons, sua, p); add(suaState[sua] = suaState[sua] || {}, st, p); }
    if (sua && l) { add(suaLga[sua] = suaLga[sua] || {}, l, p); add(lgaSua[l] = lgaSua[l] || {}, sua, p); }
    if (s) { add(salSua[s] = salSua[s] || {}, sua || '-', w); if (l) add(salLga[s] = salLga[s] || {}, l, w); if (poa) add(salPoa[s] = salPoa[s] || {}, poa, w); }
  }
  const top = o => { let k = null, v = -1, t = 0; for (const [a, b] of Object.entries(o || {})) { t += b; if (b > v) { k = a; v = b; } } return { k, share: t ? v / t : 0 }; };
  for (const [s, o] of Object.entries(sal)) { const a = top(salSua[s]), b = top(salLga[s]); o.sua = a.k === '-' ? null : a.k; o.lga = b.k; o.poa = Object.keys(salPoa[s] || {}); }
  log('geography: the ABS Data API (estimated resident population)');
  const sa2Erp = await sdmx('ABS_ANNUAL_ERP_ASGS2021', '....A', new Date().getFullYear() - 3);
  const erpYear = sa2Erp.filter(o => o.REGION_TYPE === 'SA2').map(o => o.TIME_PERIOD).sort().pop();
  const suaErp = {}; for (const o of sa2Erp) if (o.REGION_TYPE === 'SA2' && o.TIME_PERIOD === erpYear) { const sua = corr.sa2_to_sua[o.ASGS_2021]; if (sua) add(suaErp, sua, o.value); }
  const lgaFlow = 'ERP_LGA2025', lgaRows = await sdmx(lgaFlow, 'all', new Date().getFullYear() - 3);
  const lgaYear = lgaRows.filter(o => o.MEASURE === 'ERP' && /^LGA/.test(o.REGION_TYPE)).map(o => o.TIME_PERIOD).sort().pop();
  const lgaErp = {}; for (const o of lgaRows) if (o.MEASURE === 'ERP' && /^LGA/.test(o.REGION_TYPE) && o.TIME_PERIOD === lgaYear) lgaErp[o.REGION] = o.value;
  const geo = {
    erpYear, lgaYear, lgaFlow, suaNames: corr.sua_names,
    sua: Object.fromEntries(Object.keys(corr.sua_names).map(c => [c, { name: corr.sua_names[c], st: top(suaState[c]).k, pop: Math.round(suaErp[c] || 0), persons: suaPersons[c] || 0, lgas: suaLga[c] || {} }])),
    lga: Object.fromEntries(Object.entries(lga).map(([c, o]) => [c, { name: o.name, st: top(lgaState[c]).k || o.st, pop: Math.round(lgaErp[c] || 0), persons: lgaPersons[c] || 0, suas: lgaSua[c] || {} }])),
    sal,
  };
  writeFileSync(f, JSON.stringify(geo)); log('  cached ' + f + ' (' + kb(geo) + ')');
  return geo;
}

// ── 2. the CoreLogic history, January 1980 to June 2018 (cache/hist.json) ────────
const H_FROM = '1980-01', H_TO = '2018-06', HN = 462;
const hIdx = m => (+m.slice(0, 4) - 1980) * 12 + (+m.slice(5, 7) - 1);
const splitCsv = line => {
  if (line.indexOf('"') < 0) return line.split(',');
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
};
const monthOf = v => { const s = String(v || '').trim(); let m = s.match(/^(\d{4})-(\d{2})/); if (m) return m[1] + '-' + m[2]; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? m[3] + '-' + String(+m[1] > 12 ? +m[2] : +m[1]).padStart(2, '0') : null; };
async function buildHistory() {
  const f = join(CACHE, 'hist.json'); if (existsSync(f)) return readJson(f);
  if (!existsSync(HIST_DIR)) throw new Error('no folder ' + HIST_DIR + ' (the CSTDAT4294 files; see build-cl-start-medians.mjs)');
  const files = readdirSync(HIST_DIR).filter(x => /^CSTDAT4294-.*\.csv$/i.test(x) && !/CapitalCities/i.test(x)).sort();
  log('history: reading ' + files.length + ' CoreLogic files (several minutes)');
  const series = new Map();   // 's|ST|NAME|pc|pt' or 'l|ST|LGA||pt' -> { med, s12 }
  for (const fn of files) {
    const rl = createInterface({ input: createReadStream(join(HIST_DIR, fn), { encoding: 'utf8' }), crlfDelay: Infinity });
    let map = null, n = 0;
    for await (const line of rl) {
      if (!line) continue;
      const r = splitCsv(line);
      if (!map) {
        const hd = r.map(h => h.replace(/^﻿/, '').replace(/^"+|"+$/g, '').toLowerCase().replace(/\s+/g, ' ').trim()), find = p => hd.findIndex(h => h.startsWith(p));
        map = { st: find('state'), lga: find('lga name'), pc: find('post'), sub: find('suburb'), pt: find('property type'), mon: hd.findIndex(h => h.includes('month end')), med: find('median sales price last 12'), s12: find('# of sales last 12') };
        if ([map.st, map.lga, map.pt, map.mon, map.med, map.s12].some(i => i < 0)) throw new Error(fn + ': header not recognised');
        continue;
      }
      const pt = (r[map.pt] || '').trim().toUpperCase(); if (pt !== 'H' && pt !== 'U') continue;
      const mon = monthOf(r[map.mon]); if (!mon) continue; const i = hIdx(mon); if (i < 0 || i >= HN) continue;
      const med = num(r[map.med]); if (!(med > 0)) continue;
      const st = (r[map.st] || '').trim().toUpperCase(), isSub = map.sub >= 0;
      const k = isSub ? 's|' + st + '|' + (r[map.sub] || '').trim().toUpperCase() + '|' + (r[map.pc] || '').trim() + '|' + pt : 'l|' + st + '|' + (r[map.lga] || '').trim() + '||' + pt;
      let e = series.get(k); if (!e) { e = { med: Array(HN).fill(null), s12: Array(HN).fill(null) }; series.set(k, e); }
      e.med[i] = med; e.s12[i] = num(r[map.s12]); n++;
    }
    log('  ' + fn.padEnd(40) + String(n).padStart(9) + ' rows with a median');
  }
  const out = Object.fromEntries(series); writeFileSync(f, JSON.stringify(out)); log('  cached ' + f + ' (' + series.size + ' series)');
  return out;
}

// ── 3. the Forge, July 2018 on: only the months stored (cache/forge-YYYY-MM.json) ──
let CLI = null;
function cli(sql) {
  if (!CLI) {
    const local = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Programs', 'supabase', 'supabase.exe');
    CLI = existsSync(local) ? local : 'supabase';
  }
  const t = execFileSync(CLI, ['db', 'query', '--linked', sql], { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const j = JSON.parse(t.slice(t.indexOf('{')));
  if (!Array.isArray(j.rows)) throw new Error('unexpected CLI reply: ' + t.slice(0, 200));
  return j.rows;   // data only: the CLI marks the rows as untrusted content, and nothing here treats them as anything else
}
function forgeMonth(m, refresh) {
  const f = join(CACHE, 'forge-' + m + '.json');
  if (existsSync(f) && !refresh) return readJson(f);
  if (!/^\d{4}-\d{2}$/.test(m)) throw new Error('bad month ' + m);
  const rows = cli("select level, ptype, state, name_key, name, metrics->>'med12' as m, metrics->>'sales12' as s from public.forge_cl_suburbs where month = '" + m + "' and level in ('suburb','lga') and metrics->>'med12' is not null");
  const out = rows.map(r => [r.level === 'lga' ? 'l' : 's', r.ptype, r.state, r.level === 'lga' ? r.name : r.name_key, num(r.m), num(r.s)]);
  writeFileSync(f, JSON.stringify(out)); return out;
}

// ── 4. put it together ──────────────────────────────────────────────────────────
const geo = await buildGeo();
const hist = await buildHistory();
const TO = cli("select max(month) as m from public.forge_cl_suburbs where level = 'suburb'")[0].m;
if (!/^\d{4}-\d{2}$/.test(TO)) throw new Error('no latest month in the Forge');
/* MONTHS: what the page can ask for. Its race stops at every December and at TO, and looks back whole or half years
   (7.5 years; a custom period rounds to the half year, 30 years at most), so every June and December, plus TO's month
   and the month six from it for the 30 years before TO. Everything is chained over these months only. */
const ends = new Set([6, 12]), toEnds = new Set([+TO.slice(5, 7), ((+TO.slice(5, 7) + 5) % 12) + 1]), back30 = addM(TO, -360);
const MONTHS = []; for (let m = H_FROM; m <= TO; m = addM(m, 1)) if (ends.has(+m.slice(5, 7)) || (toEnds.has(+m.slice(5, 7)) && m >= back30)) MONTHS.push(m);
const NM = MONTHS.length;
log('months stored: ' + NM + ' (' + MONTHS[0] + ' .. ' + MONTHS[NM - 1] + '; every June and December, and months ' + [...toEnds].sort((a, b) => a - b).join(' and ') + ' from ' + back30 + ')');

/* component series on MONTHS: suburbs by 'ST|NAME|pc', councils by ABS LGA code */
const lgaByCanon = {}; for (const [c, o] of Object.entries(geo.lga)) { const k = o.st + '|' + canonLga(o.name); (lgaByCanon[k] = lgaByCanon[k] || []).push(c); }
const lgaCodeOf = (st, name) => { let k = st + '|' + canonLga(name); k = LGA_ALIAS[k] || k; const c = lgaByCanon[k]; return c && c.length === 1 ? c[0] : null; };
const comp = { s: { H: new Map(), U: new Map() }, l: { H: new Map(), U: new Map() } }, cotLgaNames = new Map();
const slot = (lev, pt, key) => { const M = comp[lev][pt]; let e = M.get(key); if (!e) { e = { med: Array(NM).fill(null), s12: Array(NM).fill(null) }; M.set(key, e); } return e; };
for (const [k, e] of Object.entries(hist)) {
  const [lev, st, name, pc, pt] = k.split('|');
  let key; if (lev === 's') key = st + '|' + name + '|' + pc; else { key = lgaCodeOf(st, name); cotLgaNames.set(st + '|' + name, key); if (!key) continue; }
  const o = slot(lev, pt, key);
  MONTHS.forEach((m, i) => { if (m <= H_TO) { const j = hIdx(m); if (e.med[j] > 0) { o.med[i] = e.med[j]; o.s12[i] = e.s12[j]; } } });
}
const forgeMonths = MONTHS.filter(m => m > H_TO);
log('the Forge: ' + forgeMonths.length + ' months (' + forgeMonths[0] + ' .. ' + TO + ')');
forgeMonths.forEach((m, n) => {
  const rows = forgeMonth(m, FRESH || n >= forgeMonths.length - 2), i = MONTHS.indexOf(m);
  for (const [lev, pt, st, name, med, s] of rows) {
    if (!(med > 0) || (pt !== 'H' && pt !== 'U')) continue;
    let key; if (lev === 's') key = st + '|' + name; else { key = lgaCodeOf(st, name); cotLgaNames.set(st + '|' + name, key); if (!key) continue; }
    const o = slot(lev, pt, key); o.med[i] = med; o.s12[i] = s;
  }
});
const lgaUnmatched = [...cotLgaNames].filter(([, c]) => !c).map(([n]) => n);

/* Cotality suburbs -> ABS suburbs (SAL): same state and name; a name used twice in a state is settled by postcode */
const salByName = {}; for (const [c, o] of Object.entries(geo.sal)) { const k = o.st + '|' + canonSub(o.name); (salByName[k] = salByName[k] || []).push(c); }
const salOf = new Map(); let subKeys = 0, subHit = 0, salesAll = 0, salesHit = 0;
const lastI = NM - 1;
for (const key of new Set([...comp.s.H.keys(), ...comp.s.U.keys()])) {
  const [st, name, pc] = key.split('|'), c = salByName[st + '|' + canonSub(name)] || [];
  const pick = c.length === 1 ? c[0] : c.find(x => geo.sal[x].poa.includes(pc.padStart(4, '0'))) || null;
  subKeys++; if (pick) { subHit++; salOf.set(key, pick); }
  const s = ['H', 'U'].reduce((a, pt) => a + ((((comp.s[pt].get(key) || {}).s12 || [])[lastI]) || 0), 0);
  salesAll += s; if (pick) salesHit += s;
}
log('suburbs: ' + subHit + ' of ' + subKeys + ' Cotality suburbs matched to an ABS suburb (' + (100 * subHit / subKeys).toFixed(1) + '%), ' + (100 * salesHit / salesAll).toFixed(1) + '% of ' + TO + ' sales');

// ── 5. the regions and the two lists ──────────────────────────────────────────
const regions = {};
for (const [code, s] of Object.entries(geo.sua)) {
  const city = CAPITAL_SUA[s.name];
  regions['sua' + code] = { name: city || s.name.replace(/ - /g, '–'), kind: city ? 'capital' : 'sua', st: s.st, pop: s.pop, code, ...(city ? { city } : {}) };
}
const byPop = (a, b) => regions[b].pop - regions[a].pop;
const suaIds = Object.keys(regions).sort(byPop);
const top = suaIds.slice(0, LIST_SIZE);
const big = suaIds.filter(id => regions[id].pop >= MIXED_SUA_MIN), bigCodes = new Set(big.map(id => regions[id].code));
/* a council is inside an included SUA when at least half of its people (Census 2021) live in it */
const insideOf = code => { const o = geo.lga[code], t = o.persons || 0; for (const [sua, p] of Object.entries(o.suas)) if (t && p / t >= INSIDE) return sua; return null; };
const hasCot = code => comp.l.H.has(code) || comp.l.U.has(code);
const lgaCandidates = Object.entries(geo.lga)
  .filter(([c, o]) => o.pop > 0 && !/^(Unincorporated|No usual address|Migratory)/i.test(o.name) && hasCot(c))
  .filter(([c]) => { const s = insideOf(c); return !s || !bigCodes.has(s); })
  .sort((a, b) => b[1].pop - a[1].pop);
const mixed = big.slice();
for (const [c, o] of lgaCandidates) {
  if (mixed.length >= LIST_SIZE) break;
  const id = 'lga' + c; regions[id] = { name: o.name.replace(/ \((NSW|Vic\.|Qld|SA|WA|Tas\.|NT|ACT)\)$/, ''), kind: 'lga', st: o.st, pop: o.pop, code: c, inside: insideOf(c) ? geo.sua[insideOf(c)].name : null };
  mixed.push(id);
}
/* a council keeps its state in its name where it would otherwise share one with another region in the list (Central Coast, Tas.) */
for (const id of mixed) if (regions[id].kind === 'lga' && mixed.some(o => o !== id && regions[o].name === regions[id].name)) regions[id].name = geo.lga[regions[id].code].name;
const used = new Set([...top, ...mixed]);
for (const id of Object.keys(regions)) if (!used.has(id)) delete regions[id];

/* smooth v workforce: the 36 Runway v Demand markets, as tools/runway-demand.html holds them */
const rvd = (() => { const t = readFileSync(join(ROOT, 'tools', 'runway-demand.html'), 'utf8'), ln = t.split('\n').find(l => /^const RAW = \{/.test(l)); if (!ln) throw new Error('RAW not found in runway-demand.html');
  const RAW = JSON.parse(ln.slice(ln.indexOf('{'), ln.lastIndexOf('}') + 1)), m = {}; Object.values(RAW).flat().forEach(d => { if (d && d.city && d.type && !m[d.city]) m[d.city] = d.type; }); return m; })();
const typeNotes = [], claims = {};   // region id -> [[market, type, people]]
const claim = (id, market, type, people) => { (claims[id] = claims[id] || []).push([market, type, people]); };
for (const [market, type] of Object.entries(rvd)) {
  const capId = Object.keys(regions).find(id => regions[id].city === market);
  if (capId) { claim(capId, market, type, Infinity); continue; }
  if (Object.values(CAPITAL_SUA).includes(market)) { typeNotes.push(market + ': capital not in the lists'); continue; }
  const code = MARKET_LGA[market]; if (!code || !geo.lga[code]) { typeNotes.push(market + ': no council code'); continue; }
  const people = geo.lga[code].persons, sua = insideOf(code);
  let hit = 0;
  if (regions['lga' + code]) { claim('lga' + code, market, type, people); hit++; }
  if (sua && regions['sua' + sua]) { claim('sua' + sua, market, type, people); hit++; }
  if (!hit) typeNotes.push(market + ' (' + geo.lga[code].name + '): not inside any listed region');
}
for (const [id, list] of Object.entries(claims)) {
  list.sort((a, b) => b[2] - a[2]); regions[id].type = list[0][1]; regions[id].markets = list.map(x => x[0]);
  if (new Set(list.map(x => x[1])).size > 1) typeNotes.push(regions[id].name + ': markets disagree (' + list.map(x => x[0] + ' ' + x[1]).join(', ') + '); took ' + list[0][0] + "'s");
}
for (const r of Object.values(regions)) if (!r.type) r.type = null;

// ── 6. the two measures, chained over MONTHS ──────────────────────────────────
/* comps: [{ med, s12, w }] on MONTHS. weight(c, a, b): the weight of c in the step from month a to b.
   ok(i, present): whether month i's figure stands. Returns values in $100, or null. */
function chained(comps, weight, ok, anchorWeight) {
  const lvl = Array(NM).fill(null); let prev = -1, level = 1, breaks = 0;
  for (let i = 0; i < NM; i++) {
    if (!comps.some(c => c.med[i] > 0)) continue;
    if (prev >= 0) {
      let sw = 0, sl = 0;
      for (const c of comps) { if (!(c.med[i] > 0 && c.med[prev] > 0)) continue; const w = weight(c, prev, i); if (!(w > 0)) continue; sw += w; sl += w * Math.log(c.med[i] / c.med[prev]); }
      if (sw > 0) level *= Math.exp(sl / sw);
      else { for (let k = 0; k < i; k++) lvl[k] = null; level = 1; breaks++; }   // nothing in common: the line restarts
    }
    lvl[i] = level; prev = i;
  }
  const good = lvl.map((v, i) => v != null && ok(i, comps.filter(c => c.med[i] > 0)));
  const at = good.lastIndexOf(true); if (at < 0) return { v: null, breaks };
  /* pin the level to the weighted geometric mean of the medians at its last good month, so it reads as dollars */
  let sw = 0, sl = 0; for (const c of comps) if (c.med[at] > 0) { const w = anchorWeight(c, at); if (w > 0) { sw += w; sl += w * Math.log(c.med[at]); } }
  const scale = Math.exp(sl / sw) / lvl[at];
  return { v: lvl.map((v, i) => good[i] ? Math.round(v * scale / 100) : null), breaks };
}
const sales = (c, i) => c.s12[i] > 0 ? c.s12[i] : 0;
const stats = { lga: { breaks: 0, series: 0 }, sub: { breaks: 0, series: 0 }, subsPerRegion: [], lgasPerRegion: [] };
const salRegionSua = new Map(), salRegionLga = new Map();
for (const [key, s] of salOf) { const o = geo.sal[s]; if (o.sua) salRegionSua.set(key, o.sua); if (o.lga) salRegionLga.set(key, o.lga); }
for (const [id, r] of Object.entries(regions)) {
  if (r.kind === 'capital') continue;
  r.v = { lga: {}, sub: {} };
  /* councils it covers: fixed weights = the region's people in each council */
  const wts = r.kind === 'lga' ? { [r.code]: 1 } : geo.sua[r.code].lgas;
  const totalW = Object.values(wts).reduce((a, b) => a + b, 0);
  stats.lgasPerRegion.push(Object.keys(wts).length);
  /* suburbs inside it */
  const keys = [...salOf.keys()].filter(k => (r.kind === 'lga' ? salRegionLga.get(k) : salRegionSua.get(k)) === r.code);
  stats.subsPerRegion.push(keys.length);
  for (const pt of ['H', 'U']) {
    const lc = Object.entries(wts).map(([c, w]) => comp.l[pt].get(c) && { ...comp.l[pt].get(c), w }).filter(Boolean);
    const a = chained(lc, c => c.w, (i, here) => here.reduce((s, c) => s + c.w, 0) >= MIN_COVER * totalW && here.reduce((s, c) => s + sales(c, i), 0) >= MIN_SALES, c => c.w);
    r.v.lga[pt] = a.v; stats.lga.breaks += a.breaks; stats.lga.series++;
    const sc = keys.map(k => comp.s[pt].get(k)).filter(Boolean);
    const b = chained(sc, (c, i, j) => (sales(c, i) + sales(c, j)) / 2, (i, here) => here.reduce((s, c) => s + sales(c, i), 0) >= MIN_SALES, (c, i) => sales(c, i));
    r.v.sub[pt] = b.v; stats.sub.breaks += b.breaks; stats.sub.series++;
  }
}

// ── 7. summary + payload ──────────────────────────────────────────────────────
/* store each series from its first figure: { s: index into months of the first value, d: values } */
const pack = a => { if (!a) return null; const s = a.findIndex(x => x != null); if (s < 0) return null; let e = a.length; while (e > s && a[e - 1] == null) e--; return { s, d: a.slice(s, e) }; };
const outRegions = {};
for (const [id, r] of Object.entries(regions)) {
  const o = { name: r.name, kind: r.kind, st: r.st, pop: r.pop, type: r.type };
  if (r.city) o.city = r.city;
  if (r.inside) o.inside = r.inside;
  if (r.v) o.v = { lga: { H: pack(r.v.lga.H), U: pack(r.v.lga.U) }, sub: { H: pack(r.v.sub.H), U: pack(r.v.sub.U) } };
  outRegions[id] = o;
}
const payload = {
  note: 'Market Cycles, Regional growth: the 100 most populous Significant Urban Areas (lists.top), and every SUA of 50,000 people or more followed by the most populous councils outside them (lists.mixed), with ABS population (pop), the Runway v Demand market type (type), and two 12-month median series per region and property type in $100 on data.months (v.lga: the councils it covers, weighted by its people in each; v.sub: the Cotality suburbs inside it, weighted by sales; each { s: first index into months, d: values }). Capitals carry no series: the page uses cl_capital_history and the Forge. Built by scripts/build-cl-region-history.mjs from the CoreLogic CSTDAT4294 history (to June 2018), forge_cl_suburbs (from July 2018) and ABS ASGS Edition 3.',
  updated: new Date().toISOString(), from: H_FROM, to: TO, months: MONTHS, minSales: MIN_SALES, minCover: MIN_COVER,
  pop: { year: geo.erpYear, lgaYear: geo.lgaYear, source: 'ABS estimated resident population (ABS_ANNUAL_ERP_ASGS2021 SA2 sums; ' + geo.lgaFlow + ')' },
  lists: { top, mixed },
  match: { suburbs: subHit, of: subKeys, salesShare: +(salesHit / salesAll).toFixed(4), councilsUnmatched: lgaUnmatched.length },
  regions: outRegions,
};
writeFileSync(join(OUT, 'cl_region_history.json'), JSON.stringify(payload));

const pops = id => regions[id].pop;
const bandOf = p => p >= 1e6 ? '1M+' : p >= 250e3 ? '250k-1M' : p >= 100e3 ? '100k-250k' : p >= 50e3 ? '50k-100k' : p >= 25e3 ? '25k-50k' : 'under 25k';   // the page's population bands
for (const [name, list] of [['top', top], ['mixed', mixed]]) {
  const bands = {}, types = {}, kinds = {}; list.forEach(id => { bands[bandOf(pops(id))] = (bands[bandOf(pops(id))] || 0) + 1; types[regions[id].type || 'not typed'] = (types[regions[id].type || 'not typed'] || 0) + 1; kinds[regions[id].kind] = (kinds[regions[id].kind] || 0) + 1; });
  log('\nlist ' + name + ': ' + list.length + ' regions (' + Object.entries(kinds).map(([k, v]) => v + ' ' + k).join(', ') + '), population ' + Math.round(list.reduce((a, id) => a + pops(id), 0) / 1e6 * 10) / 10 + 'M, smallest ' + regions[list[list.length - 1]].name + ' ' + pops(list[list.length - 1]).toLocaleString('en-AU'));
  log('  bands: ' + Object.entries(bands).map(([k, v]) => k + ' ' + v).join(' · ') + '   types: ' + Object.entries(types).map(([k, v]) => k + ' ' + v).join(' · '));
}
log('\nmixed list councils: ' + mixed.filter(id => regions[id].kind === 'lga').map(id => regions[id].name + ' (' + regions[id].st + ' ' + Math.round(pops(id) / 1000) + 'k' + (regions[id].inside ? ', mostly in ' + regions[id].inside : '') + ')').join('; '));
log('typed regions: ' + Object.values(regions).filter(r => r.type).map(r => r.name + ' ' + r.type[0].toUpperCase() + (r.markets && r.markets.length > 1 ? ' [' + r.markets.join('+') + ']' : '')).join('; '));
if (typeNotes.length) log('type notes: ' + typeNotes.join(' | '));
log('Cotality councils with no ABS 2025 match (' + lgaUnmatched.length + '): ' + lgaUnmatched.slice(0, 30).join('; ') + (lgaUnmatched.length > 30 ? ' …' : ''));
const dec = MONTHS.map((m, i) => [m, i]).filter(([m]) => m.endsWith('-12'));
const firstYear = (r, meas, pt) => { const a = r.v && r.v[meas][pt], s = a ? a.findIndex(x => x != null) : -1; return s < 0 ? '-' : MONTHS[s].slice(0, 4); };
const gaps = (r, meas, pt) => { const a = r.v && r.v[meas][pt]; if (!a) return 0; const s = a.findIndex(x => x != null); return a.slice(s).filter(x => x == null).length; };
for (const meas of ['lga', 'sub']) for (const pt of ['H', 'U']) {
  const rs = Object.values(regions).filter(r => r.v), none = rs.filter(r => !r.v[meas][pt] || r.v[meas][pt].every(x => x == null));
  const yrs = rs.map(r => firstYear(r, meas, pt)).filter(y => y !== '-').sort(), g = rs.reduce((a, r) => a + gaps(r, meas, pt), 0);
  log(meas.padEnd(3) + ' ' + pt + ': ' + (rs.length - none.length) + ' of ' + rs.length + ' regions have figures; first figure from ' + yrs[0] + ' (median region ' + yrs[Math.floor(yrs.length / 2)] + ', latest ' + yrs[yrs.length - 1] + '); ' + g + ' blank months after a region starts' + (none.length ? '; none for ' + none.map(r => r.name).join(', ') : ''));
}
log('chain restarts (no place in common between two stored months): councils ' + stats.lga.breaks + ', suburbs ' + stats.sub.breaks);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
log('per region: councils covered median ' + med(stats.lgasPerRegion) + ' (max ' + Math.max(...stats.lgasPerRegion) + '), Cotality suburbs median ' + med(stats.subsPerRegion) + ' (min ' + Math.min(...stats.subsPerRegion) + ')');
log('payload ' + kb(payload) + ' -> ' + join(OUT, 'cl_region_history.json'));

if (!WRITE) log('dry run — nothing written. Re-run with --write to store it.');
else {
  try {
    if (existsSync(join(ROOT, '.env'))) for (const ln of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = ln.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1); }
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, KEY, { auth: { persistSession: false } });
  const { error } = await sb.from('forge_cotality').upsert({ id: ROW_ID, data: payload, file_name: 'CSTDAT4294 history + forge_cl_suburbs to ' + TO + ' + ABS ASGS Ed. 3', uploaded_by: 'build-cl-region-history', updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) { console.error('write failed: ' + error.message); process.exitCode = 1; }
  else log('WRITTEN forge_cotality id=' + ROW_ID);
}
