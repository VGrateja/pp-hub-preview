// =============================================================================
// ingest-remplan-industry.mjs — Data Forge path: INDUSTRY VALUE ADDED for the 35
// REMPLAN-sourced regions, straight from REMPLAN's public profile API.
//
// Found 2026-09-13: every council-funded REMPLAN economy profile the Industry card
// links to (app.remplan.com.au/<profile>/economy/industries/value-added) fills its
// "Value Added" table from
//   POST https://app.remplan.com.au/api/datasources/economy/<profile>/industries/value-added/dataset/matrix_valueadded
//   body {"options":{"sectorView":"256593420"}}          ← the "19 Sectors" (ANZSIC division) view
// with NO login (the page's own anonymous call). The reply is a flat matrix of
// destination zones × 19 sectors in DOLLARS; summing the zones gives the region's
// value added by division — Perth reproduces the store to the cent. The reply also
// names the vintage (dataSource.name, e.g. "Perth LGA (2025 Release 2)") and its
// lastUpdated stamp, which the store never recorded before.
//
// Canberra is NOT here (REMPLAN has no free ACT profile) — ingest-abs-act-industry
// keeps merging it from ABS 5220.0. Both scripts read-then-merge forge_industry,
// so their order in GATHER does not matter.
//
// Writes → forge_industry id 'latest' ({ industries:[19], regions:{ slug:{ label, total, values:{division:$}, src, release, dataUpdated, fetchedAt } } })
//   + forge_data_status 'industry' + rdp_runs. Manual drops through the Forge
//   view still work as a fallback (they overwrite the same region keys).
//
// Dry-run by DEFAULT (fetches everything, prints the parity v the store);
// --write merges. --only=slug1,slug2 limits the regions.
//   node scripts/ingest-remplan-industry.mjs
//   node scripts/ingest-remplan-industry.mjs --write
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

try { if (existsSync('.env')) for (const ln of readFileSync('.env', 'utf8').split(/\r?\n/)) { const m = ln.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {}
const WRITE = process.argv.includes('--write');
const ONLY = ((process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || '').split(',').filter(Boolean);
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' };
const API = p => `https://app.remplan.com.au/api/datasources/economy/${p}/industries/value-added/dataset/matrix_valueadded`;
const BODY = JSON.stringify({ options: { sectorView: '256593420' } });   // "19 Sectors" view — the same id worked for every profile tested

// Forge region slug → REMPLAN profile path (mirrors IND_REMPLAN_LINKS in data-forge.html,
// plus the three the link list lacked: gladstone, gold-coast, toowoomba).
const PROFILES = {
  melbourne: 'melbourne', sydney: 'sydney', perth: 'perth', brisbane: 'brisbane', adelaide: 'adelaide', hobart: 'hobart', darwin: 'darwin',
  mackay: 'mackay', bundaberg: 'bundaberg', ipswich: 'ipswich', rockhampton: 'rockhampton', cairns: 'cairns', townsville: 'townsville', 'sunshine-coast': 'sunshine-coast',
  gladstone: 'gladstone', 'gold-coast': 'gold-coast', toowoomba: 'toowoomba',
  albury: 'albury', 'central-coast': 'central-coast-nsw', 'coffs-harbour': 'coffs-harbour', orange: 'orange', 'port-macquarie': 'port-macquarie-hastings', newcastle: 'newcastle', tamworth: 'tamworth-regional', 'wagga-wagga': 'wagga-wagga', wollongong: 'wollongong',
  ballarat: 'ballarat', bendigo: 'greater-bendigo', geelong: 'greater-geelong', wodonga: 'wodonga', mildura: 'mildura-region',
  mandurah: 'mandurah', rockingham: 'rockingham', bunbury: 'bunbury', launceston: 'launceston',
};
// the same canonical divisions + matcher the Forge view uses (REMPLAN writes "&", the store "and")
const ANZSIC_DIVS = ['Agriculture, Forestry and Fishing','Mining','Manufacturing','Electricity, Gas, Water and Waste Services','Construction','Wholesale Trade','Retail Trade','Accommodation and Food Services','Transport, Postal and Warehousing','Information Media and Telecommunications','Financial and Insurance Services','Rental, Hiring and Real Estate Services','Professional, Scientific and Technical Services','Administrative and Support Services','Public Administration and Safety','Education and Training','Health Care and Social Assistance','Arts and Recreation Services','Other Services'];
const ANZSIC_KW = [['agricultur',0],['mining',1],['manufactur',2],['electricity',3],['gas, water',3],['construction',4],['wholesale',5],['retail',6],['accommodation',7],['food service',7],['postal',8],['transport',8],['information media',9],['telecommunication',9],['financial',10],['insurance',10],['real estate',11],['rental',11],['professional',12],['scientific',12],['administrative',13],['support service',13],['public admin',14],['safety',14],['education',15],['training',15],['health care',16],['social assist',16],['arts',17],['recreation',17],['other service',18]];
function canon(name) {
  const n = String(name).toLowerCase().replace(/&/g, 'and'); const flat = n.replace(/[^a-z]/g, '');
  for (const d of ANZSIC_DIVS) if (d.toLowerCase().replace(/[^a-z]/g, '') === flat) return d;
  for (const [kw, i] of ANZSIC_KW) if (n.includes(kw)) return ANZSIC_DIVS[i];
  return null;
}

const URL = process.env.SUPABASE_URL || 'https://cannojsxduvlewimwoxa.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });
async function recordStatus(status, message, extra = {}) {
  if (!WRITE) return;
  const now = new Date().toISOString();
  const row = { data_key: 'industry', label: 'Industry Value Added', source: 'REMPLAN economy profiles (public profile API, 19 ANZSIC divisions, $ value added) · ABS 5220.0 Table 9 for Canberra', status, message, last_run_at: now, updated_at: now, ...extra };
  if (status === 'ok') row.last_ok_at = now;
  const { error } = await sb.from('forge_data_status').upsert(row, { onConflict: 'data_key' });
  if (error) console.warn('  (forge_data_status not updated? ' + error.message + ')');
}

// ── fetch one profile → { label, total, values, release, dataUpdated } ──
async function fetchRegion(slug, profile) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(API(profile), { method: 'POST', headers: UA, body: BODY });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const sectors = (j.columns || []).find(c => c.id === 'sectors'), zones = (j.columns || []).find(c => c.id === 'zones');
      if (!sectors || !zones || !Array.isArray(j.data)) throw new Error('unexpected shape (no sectors/zones/data)');
      const nS = sectors.values.length, nZ = zones.values.length;
      if (j.data.length !== nZ * nS) throw new Error(`matrix ${j.data.length} != ${nZ} zones × ${nS} sectors`);
      if (j.unit && !/dollar/i.test(j.unit)) throw new Error('unit is ' + j.unit);
      if (nS !== 19) throw new Error(`${nS} sectors (expected the 19-division view)`);
      const values = {};
      sectors.values.forEach((s, i) => { const d = canon(s.name); if (!d) throw new Error('unmapped sector ' + s.name); let t = 0; for (let z = 0; z < nZ; z++) t += +j.data[z * nS + i] || 0; values[d] = t; });
      if (Object.keys(values).length !== 19) throw new Error('sector mapping collapsed to ' + Object.keys(values).length);
      const total = Object.values(values).reduce((a, b) => a + b, 0);
      if (!(total > 1e8)) throw new Error('total implausibly small: ' + total);
      return { label: (j.region && j.region.name) || slug, total, values, release: j.dataSource && j.dataSource.name, dataUpdated: j.lastUpdated, erpYear: j.region && j.region.erpYear };
    } catch (e) { lastErr = e; if (attempt < 3) await new Promise(res => setTimeout(res, 1500 * attempt)); }
  }
  throw lastErr;
}

// ── run ──
const targets = Object.entries(PROFILES).filter(([s]) => !ONLY.length || ONLY.includes(s));
const { data: row, error } = await sb.from('forge_industry').select('data').eq('id', 'latest').maybeSingle();
if (error) { console.error(error.message); process.exit(1); }
const store = (row && row.data) || { industries: ANZSIC_DIVS.slice(), regions: {} };
store.industries = store.industries && store.industries.length === 19 ? store.industries : ANZSIC_DIVS.slice();
store.regions = store.regions || {};

const fetched = {}, failed = [];
const fmtB = v => '$' + (v / 1e9).toFixed(2) + 'b';
console.log(`REMPLAN industry value added — ${targets.length} regions\n`);
console.log('region          release                                  total        v store    biggest division move');
for (let i = 0; i < targets.length; i += 4) {
  await Promise.all(targets.slice(i, i + 4).map(async ([slug, profile]) => {
    try {
      const r = await fetchRegion(slug, profile);
      fetched[slug] = r;
      const old = store.regions[slug];
      let note = 'new region';
      if (old && old.total) {
        const rel = (r.total - old.total) / old.total;
        let worst = ['', 0]; for (const d of ANZSIC_DIVS) { const a = r.values[d], b = old.values && old.values[d]; if (a != null && b != null && old.total) { const dd = Math.abs(a - b) / old.total; if (dd > worst[1]) worst = [d, dd]; } }
        note = `${(rel * 100).toFixed(1).padStart(6)}%   ${worst[0] ? worst[0].slice(0, 28) + ' ' + (worst[1] * 100).toFixed(1) + 'pp of total' : ''}`;
        if (Math.abs(rel) < 0.0005 && worst[1] < 0.0005) note = '  same';
      }
      console.log(`${slug.padEnd(16)}${String(r.release || '?').padEnd(40)} ${fmtB(r.total).padStart(9)}  ${note}`);
    } catch (e) { failed.push(slug); console.log(`${slug.padEnd(16)}✗ ${e.message}`); }
  }));
}
const releases = [...new Set(Object.values(fetched).map(r => (r.release || '').replace(/^.*\(|\)$/g, '')))];
console.log(`\n${Object.keys(fetched).length}/${targets.length} regions fetched · vintages: ${releases.join(', ') || '—'}${failed.length ? ` · FAILED: ${failed.join(', ')}` : ''}`);
if (!Object.keys(fetched).length) { console.error('\n✗ nothing fetched'); await recordStatus('error', 'REMPLAN API: nothing fetched (' + failed.join(', ') + ')'); process.exit(1); }
if (failed.length && WRITE) console.log('  (failed regions keep their stored values — REMPLAN is retried next gather)');

if (!WRITE) { console.log('\nDry run. Re-run with --write to merge into forge_industry.'); }
else {
  const now = new Date().toISOString();
  for (const [slug, r] of Object.entries(fetched)) {
    const old = store.regions[slug] || {};
    store.regions[slug] = { label: old.label || r.label, total: r.total, values: r.values, src: 'remplan-api', release: r.release, dataUpdated: r.dataUpdated, erpYear: r.erpYear, fetchedAt: now };
  }
  const { error: werr } = await sb.from('forge_industry').upsert({ id: 'latest', data: store, uploaded_by: 'remplan-api', uploaded_at: now, updated_at: now }, { onConflict: 'id' });
  if (werr) { console.error(werr.message); await recordStatus('error', werr.message); process.exit(1); }
  try { await sb.from('rdp_runs').insert({ dataset: 'raw', source_month: `REMPLAN industry ${now.slice(0, 7)}`, row_count: Object.keys(fetched).length, status: failed.length ? 'partial' : 'ok', notes: `value added by ANZSIC division from the REMPLAN profile API: ${Object.keys(fetched).length} regions (${releases.join(', ')})${failed.length ? '; failed: ' + failed.join(', ') : ''}; Canberra stays ABS` }); } catch {}
  await recordStatus(failed.length ? 'error' : 'ok', `${Object.keys(fetched).length} REMPLAN regions · ${releases.join(', ')}${failed.length ? ' · failed: ' + failed.join(', ') : ''} · Canberra from ABS`, { row_count: Object.keys(fetched).length, region_count: Object.keys(store.regions).length, latest_year: Math.max(...Object.values(fetched).map(r => +r.erpYear || 0)) || null });
  console.log(`\n✓ forge_industry merged: ${Object.keys(fetched).length} regions from REMPLAN (${releases.join(', ')}); ${Object.keys(store.regions).length} regions in the store.`);
}
