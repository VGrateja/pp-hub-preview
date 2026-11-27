# Market cycles — feature note for the pp-os port

Hub page: `tools/market-cycles.html`. Built 2026-11-17 for the client presentation Saskia and David are giving
(first version, under review; not ported).

## Why it exists

The presentation opens on the state of the market. Saskia asked for two charts as its second and third pages:

1. **The biggest falls.** A chart in the style of one going around from Coolabah Capital: the five biggest falls in
   capital city home values since 1980, each from its own peak, with the 2026 fall on top. The point is hopeful:
   it looks bad, and every earlier fall was followed by a recovery.
2. **The fastest-growing capital.** David wants the familiar "race" of capital cities overtaking each other, but on
   long-term growth rate instead of dollar value, to show that the leading capital keeps changing. Saskia asked for
   two versions to choose between: long term, and rolling 10 years.

## What it shows

- `?view=falls`: one line per fall, months since the peak across, peak = 100 up. Each line stops when values are
  back at the peak, or at 30 months. The current fall is the thick amber line. Right: the legend, with each fall's
  depth, months to the low and months back to the peak. Below: three figures, then the last 3 months as a yearly
  rate for each of the five capitals and the five together. The title, the amber line under it and the figures are
  all worked out from the data; when values are at a peak the page says so and draws no current fall.
- `?view=growth`: eight bars that re-sort as the years run (press play, or drag the slider), Melbourne in teal and
  Darwin in amber because those are the markets the presentation is about. Under it, a strip naming the leader of
  each year. A switch picks "Rolling 10 years" (default) or "Long term".
- `?view=regions` ("Regional growth", 2026-11-27): the same race over up to 100 regions, with filters. See
  "Regional growth" below.
- `?embed=1` draws one view at exactly 1280 x 720 with no app bar. `?theme=light|dark` picks the ground (an embed
  is dark by default; the page on its own follows the OS shade). `?mode=long` and `?play=1` set the growth view's
  switch and start it playing.

## Data it reads (live, read-only)

| Source | What |
|---|---|
| `forge_cotality` row `cl_capital_history` | The eight capitals, houses and units, monthly January 1980 to June 2018: `data.cities[<City>][H|U] = { avm, n, med12 }`, one array entry per month from `data.from` |
| `forge_cl_suburbs` level `capital` | The same three figures from July 2018 (`metrics.avm`, `metrics.props`, `metrics.med12`) |
| `forge_cotality` row `cl_region_history` | Regional growth only, read when that tab opens: the regions, the two lists, population, market type and two price series per region (below) |

The history row was written once by `node scripts/build-cl-capital-history.mjs --write` from
`CSTDAT4294-CapitalCities_1980-2018.csv` (shared drive, "CoreLogic files / Historic"; kept outside the repo in
`~/Downloads/corelogic-history`). The history is closed, so there is no monthly step: a new Cotality month arrives
in `forge_cl_suburbs` and the page picks it up.

## Rules worth keeping

- **The falls are measured on our own series, not Cotality's hedonic index.** The series is the median estimated
  value (AVM) of all dwellings in Sydney, Melbourne, Brisbane, Adelaide and Perth, houses and units, chained month
  to month with each leg weighted by its value times its dwelling count the month before. It tracks the published
  index closely on the two biggest falls (2017-19: ours -9.1% over 19 months, Cotality's -8.6% over 19; 2022-23:
  ours -9.9% over 9 months, Cotality's -8.1% over 9) and less well on the early ones, because estimated values
  start in 1980 for Sydney, Melbourne and Brisbane only, 1983 for Perth and 1993 for Adelaide. The footnote says so.
- **It ends where our data ends.** Coolabah's chart used Cotality's daily index to 12 November 2026 and called 2026
  the worst fall on record (-8.8%). Our monthly files run to August 2026, where the fall is -4.6%, four months in.
  The page does not claim "worst ever"; it says what the data shows. The headline changes by itself as months arrive.
- **July 2018 is bridged.** It is the first month of the Forge's own files and its estimated values sit well off
  the months either side (Sydney houses 986k, 1,098k, 974k). Left alone it reads as a false peak.
- **A zero is a blank.** The history file writes 0 for the months before a capital's valuations begin.
- **1980 is not a peak.** A fall whose "peak" is in 1980 is the start of the series and is left out.
- **Growth uses the 12-month median sale price of houses**, the measure behind the Data Extractor's long-term
  growth rate. Rolling: the 10 years to each December. Long term: from the capital's first median on record, shown
  once there are 8 years of it (the Suburb Scoring rule). A capital appears when it has enough history, so the
  early years have fewer bars.
- A near tie (a quarter of a point) is described as a tie, not a ranking.

## Regional growth (`?view=regions`, 2026-11-27)

Asked by Saskia via Van for Davie: the "which capital is ahead" race with the top 100 regions by population,
filterable by population, smooth v workforce and capital v regional. Saskia: urban areas (SUA) for the bigger
regions, then the biggest councils not inside the SUAs already included. Hub first; OS later.

**On the slide.** The capitals view's controls (House/Unit, 7.5 / 9 / 10 years, Long term, Custom, Yearly/Total, Play
from 2007, speed, the year row, "Who led each year") plus six dropdowns:

| Dropdown | Options | URL |
|---|---|---|
| Regions | Top 100 urban areas · Urban areas 50k+, then councils | `list=top\|mixed` |
| Price | Councils it covers · Suburbs inside it | `price=councils\|suburbs` |
| Market | All · Smooth · Workforce · Not typed | `market=smooth\|workforce\|untyped` |
| Area | All · Capitals · Regional | `area=capitals\|regional` |
| People | All sizes · 1M+ · 250k–1M · 100k–250k · 50k–100k · 25k–50k · Under 25k | `pop=1m\|250k\|100k\|50k\|25k\|small` |
| Show | Top 10 (default) · Top 20 · All | `show=10\|20\|all` |

`mode`, `years`, `growth`, `type`, `speed`, `play`, `theme` and `embed` work as on the capitals view. Capitals keep
their own colour as solid bars; every other region takes its state capital's colour half way to the ground (the name
is always on the axis, so colour never works alone). The x-axis fits the bars on screen each year, because one
mining-boom town would otherwise flatten every other year. Over 25 bars ("All") every second or later name is shown
and the figures are dropped. Present from this tab shows it alone; the arrows still switch only falls and growth.

**Data: `forge_cotality` / `cl_region_history`**, built by `node scripts/build-cl-region-history.mjs` (dry run writes
`scratch/_mc-regions/cl_region_history.json`; `--write` stores it). `data.lists.top|mixed` (ids), `data.regions[id] =
{ name, kind: capital|sua|lga, st, pop, type, city?, v? }`, `data.months`, `data.minSales`, `data.pop`, `data.match`.
`v.lga|sub.H|U = { s, d }`: values in $100 on `data.months` from index `s`, null where blank. Capitals carry no `v`.
About 440 KB. Unlike the capital history it **needs a re-run after each Cotality month** (the page cannot read 30,000
suburb rows live); until then the race stops at the row's `to` month. The script reads the Forge through the Supabase
CLI (`supabase db query --linked`, read-only SELECTs, one stored month at a time) and caches each source under
`scratch/_mc-regions/cache` (`--fresh` re-reads the Forge months).

**Rules (decided 2026-11-27):**
- **Lists.** *Top 100 urban areas*: the 100 most populous of the 103 ABS Significant Urban Areas (ASGS Ed. 3), by
  2025 ERP (sum of SA2s). *Urban areas 50k+, then councils*: every SUA of 50,000 people or more (31), then councils
  (ABS LGA 2025, ERP 2025) from the most populous down, until 100. A council is **inside** an included SUA when at
  least half of its people (Census 2021 mesh-block counts) live in it, and is then left out; councils mostly inside
  a smaller SUA, and unincorporated areas excluded, are eligible. A council keeps its state in its name only where
  another region in the list shares the name (Central Coast (Tas.)).
- **Capitals** use the capital series of Rolling capital growth (`cl_capital_history` + `forge_cl_suburbs` level
  capital) under both measures, so they match that chart figure for figure. Canberra is the "Canberra - Queanbeyan" SUA.
- **Councils it covers**: the Cotality 12-month median of each council a region covers, chained as a weighted geometric
  mean of each council's growth, weighted by the region's people in that council (Census 2021). A council region is its
  own council's median. Cotality council names are matched to ABS 2025 names with the `canonLga` rule plus seven renames
  (Moreland → Merri-bek, Nambucca → Nambucca Valley, Western Plains → Dubbo, Mallala → Adelaide Plains, Port Pirie City
  and Dists → Port Pirie, Lower Eyre Peninsula → Lower Eyre, Break ODay → Break O'Day); three old names stay unmatched
  (Botany Bay, Rockdale, Gundagai).
- **Suburbs inside it**: the Cotality suburbs whose ABS suburb (SAL 2021) has most of its people inside the region,
  chained as a weighted geometric mean of each suburb's growth, **weighted by sales** (the mean of its 12-month sales at
  the two ends of each step). Cotality suburbs are matched to ABS suburbs by state and name; a name used twice in a
  state is settled by postcode. Match: 9,077 of 9,111 Cotality suburbs with a median (99.6%), 100% of the latest
  month's sales.
- Both measures chain only places with a median at both ends of a step, so a place joining or leaving does not move
  the line; where two stored months share no place, the line restarts and the earlier figures are dropped.
- **Too few sales = blank, never zero.** A region's figure for a month is blank when the places behind it have fewer
  than 20 sales in the 12 months, or (councils) when the councils with a median hold less than half its people. A
  frame needs a figure at both ends of the window.
- **Months stored**: every June and December from 1980, plus the latest month and the month six from it for the 30
  years before it (all a window from a December or the latest month can reach). So **a custom period rounds to the half
  year** here (8.3 → 8.5), unlike the capitals view.
- **The join** is the capital history's: CoreLogic history to June 2018, the Forge from July 2018, no rescaling. The
  step across it (June to August 2018, against the months around it) is about 1% for the typical region; a handful of
  small places step much more (`node scratch/_mc-regions/tools/validate.mjs` lists them).
- **Smooth v workforce**: the 36 Runway v Demand markets, read from `tools/runway-demand.html` (`RAW`) at build time.
  A capital takes its own type; each regional market is one council (the codes `scripts/ingest-abs-population.mjs`
  uses) and types the council region, and the SUA holding at least half of its people. Albury and Wodonga share one
  SUA; Ipswich falls in Brisbane, Rockingham and Mandurah in Perth (no disagreements). 32 regions typed in each list;
  the rest are "Not typed".
- **Population bands** from the real spread: under 50k holds 69 of the top 100 urban areas, so it is split at 25k.

**Method check** (`scratch/_mc-regions/tools/validate.mjs`): both measures built for the eight capital SUAs land within
about half a point a year of Cotality's own capital-city median on 10-year rates (councils 0.45, suburbs 0.59 points on
average over 104 comparisons). Darwin's suburbs measure runs well above the capital in the 10 years to 2010 and 2015,
when the NT history is short.

## In the presentation builder

`tools/presentation.html` lists both under Add embed ("Biggest falls since 1980", "Fastest-growing capital"). They
go in at the full slide (`EMBED_KINDS` entries with `full: true`, 1280 x 720).

## What the port needs

- A home for the 1980 to 2018 capital history (one store key; copy the hub row, 139 KB).
- The capital-level rows of `forge_cl_suburbs` (pp-os already keeps them).
- The page's arithmetic as a contracts module with tests: the chained index, the falls, the two growth rates.
- Regional growth (when OS gets it): the `cl_region_history` row as one store key (copy from the hub, re-copied after
  each monthly rebuild, hub first) and the region frames (`rFramesFor`), with the half-year rounding of custom periods.

## Checks (hub, in `scratch/`)

`_mc-check.mjs` drives both views as slide embeds in both grounds and compares every figure with
`_pres-charts/analyse.mjs`, which joins the history file and the Forge by itself. `_pres-embed-check.mjs` confirms
the builder lists the two embeds and loads without an error.
`_mc-regions/check-regions.mjs` drives Regional growth: the `cl_region_history` read is answered from the dry-run JSON by
request interception, everything else is live; expected figures are worked out from that JSON and the analysis join.

## Not checked yet

- Inserting the embed into a real deck and presenting it (needs an editor account; the check does not write to a deck).
- How an embed behaves in a deck's PDF or JPG export.

## Changelog

- 2026-11-17: first version, for Saskia's review before Thursday's planning session. Two views, an embed mode, the
  history row, the two entries in the presentation builder. Open with Saskia: whether to source Cotality's hedonic
  index so the falls match the published figures; long term or rolling 10 years for the growth chart; the AFR chart
  it was modelled on was described in the meeting but not seen.
- 2026-11-18: live, and in the Vault. Van asked for it to be pushed and made available in the Vault: a Vault window
  card and a search entry in `index.html`, both shown to whoever can open the Vault. The tool has NO registry key on
  purpose: the page is embedded in slides, and a key would let the page gate turn away a staff member presenting a
  deck when their group does not hold it. So the page opens for any signed-in staff member, and the card cannot be
  ticked per group. The app bar says "The Vault".
- 2026-11-18, later: it has a registry key after all. Van could not find it in Staff Groups and asked for every tool
  to be tickable there. Key `market-cycles` (sec `vault`) on the card and the search entry, so a group sees them only
  when ticked. The slide embed stays open to everyone: the registry entry carries `embedOpen`, and the page gate
  (`shared/auth-gate.js`) lets a page with that flag load when it is opened with `?embed=1`. Opened on its own, the
  page turns away a staff member whose groups do not hold the key. Median Prices got its key (`median-prices`) in the
  same change; until then both cards showed to whoever could open the Vault.
- 2026-11-18, polish (Van, with feedback passed on by Saskia). Fastest-growing capital: one colour per capital in the
  bars and in the year-by-year strip (tokens `--syd` to `--cbr` on `.cy`, a step of the brand tone ramps each, a set per
  ground; the Melbourne teal / Darwin orange / grey scheme is gone), and a Speed control beside the slider (Slow 2.4 s a
  year, Normal 0.9 s, Fast 0.45 s; `?speed=slow|normal|fast` presets it for a slide; changing it mid-run carries on from
  the year showing). Both charts: less text. Falls lost its paragraph and its three tiles (their facts are in the one
  line under the title: how far, how it compares at the same stage, how long the five took to regain their peak); the
  legend lines, the pace row, the footnotes and the growth subtitle are shorter; no label is set in spaced capitals.
  Nothing about the figures changed. Check: `node scratch/_pres-charts/analyse.mjs && node scratch/_mc-check.mjs` (32).
- 2026-11-19: Speed control re-paced on the owner's word. Fast is now what Normal was (0.9 s a year), Slow is unchanged
  (2.4 s) and Normal is a new step between them (1.5 s). The old 0.45 s Fast is gone. Normal is still the starting
  speed, so the chart now opens slower than before; `?speed=` keeps its three names.
- 2026-11-19, later (from the director and the research lead reviewing the chart): the growth chart is now called
  **Rolling capital growth** (page tab and the Presentation builder's Add embed entry; the on-chart headline stays).
  New: a **Rolling 7.5 years** window beside Rolling 10 years and Long term (7.5 is the middle of the firm's 6 to 9
  year holding period; `WINDOWS`, `?mode=roll75`), and a **Yearly / Total** switch (the yearly compounding rate, or
  the total growth over the window; `gTotal`, `?growth=total`). Total is switched off for Long term, where every
  capital's period has a different length. **Play starts at 2007** when pressed at the end (`START_YEAR`); the years
  from 1990 stay on the slider and Play from any other year carries on from there. Perth after 2018 was checked by
  hand against the medians and is right: on 10 years it stays seventh or eighth until 2024 because the window still
  holds the 2014 to 2019 fall; on 7.5 years it reaches third by 2025 while Melbourne goes from first (2019) to last.
  Parked, waiting for the data: marking each capital by year as buying (blue), holding (yellow) or selling (red).
  Check: `node scratch/_mc-check.mjs` (38).
- 2026-11-19, later still: **Buying tags** on Rolling capital growth. Each year, a blue "Buying" tag sits beside the
  figure of every capital the firm was buying in (`BUYING`, `buyingIn`; tokens `--buy` / `--buyink`, a cobalt step
  per ground), with a key on the line under the title. The years, from the research lead: Adelaide to 2021,
  Brisbane to 2022, Perth 2019 to 2025, Melbourne and Darwin from 2025. Taken from the director's words in the
  review, to be confirmed: Sydney in 2014, and 2015 as the first year for Adelaide and Brisbane. Hold (yellow) and
  sell (red) are to follow when the years are known; they go in the same place. Check: `node scratch/_mc-check.mjs` (40).
- 2026-11-19, afternoon (owner): the growth chart's headline is now "Rolling capital growth" (it was "The
  fastest-growing capital keeps changing") and the line under it is gone; the Buying key sits beside the headline.
  New **House / Unit** switch (`gType`, `?type=unit`): the same chart on the units' 12-month medians, which the
  history row and the Forge already hold for all eight capitals. The window buttons read "10 years", "7.5 years",
  "Long term" (the headline carries "rolling") so the year slider keeps its room.
  **Known and not yet fixed: the two sources do not meet at mid-2018.** The 12-month median steps where the history
  file (to June 2018) hands over to the Forge's own months (from July 2018): houses Melbourne about +10%, Perth +8%,
  Brisbane +4%; units Adelaide about -8%, Darwin -7%, Perth -6%. Any window that starts before July 2018 and ends
  after it carries that step (up to about one point a year on 10 years; the latest 7.5-year frames are clear of it).
  Rescaling the history to meet the Forge would, for example, make Melbourne houses in 2018 about 6.3% (second to
  Sydney) where the chart shows 7.3% (first). Sizing: `node scratch/_mc-seam-size.mjs`. A fix needs the research
  lead's call on the method. Check: `node scratch/_mc-check.mjs` (44).
- 2026-11-20 (owner): Rolling capital growth gains a **9 years** period and a **Custom** period. The period buttons read
  "7.5 years | 9 years | 10 years | Long term | Custom" (`WINDOWS`, `windowOf`); Custom opens a years box (any 1 to 30
  years, to one decimal, applied on Enter or on leaving the box; anything else is refused and the box goes back to the
  last good figure) and starts from the period on screen. `?mode=roll9` and `?years=N` preset them for a slide. The
  controls now take two rows, what to show and playing it, so the year slider keeps its width (about 890 px).
- 2026-11-20: **data check of "the biggest falls"** (`node scratch/_mc-falls-verify.mjs`, `_mc-falls-verify2.mjs`,
  `_mc-falls-levelled.mjs`). The stored history equals the CoreLogic file to the dollar (22,176 figures); the Forge
  rows run July 2018 to August 2026 for every capital and type with no gap or duplicate; the page's index and falls
  equal an independent recomputation. **Two breaks in the source, not fixed (waiting on the owner and the research
  lead):** (1) the mid-2018 join: the Forge's estimated values sit above the history's trend for Melbourne houses
  (+5.4%), Perth houses (+6.3%) and others, which takes about two points off the 2017–19 fall: shown −9.1% (second),
  levelled about −11.1% (the biggest, back in 28 months). Cotality's published capital-city figures also put 2017–19
  (about −10.1%) deeper than 2022–23 (about −9.6%). (2) July 2023: several capitals' estimated values step and stay
  (Melbourne houses −6.9%, Perth houses −4.0%, Adelaide houses −3.7% against the months either side), which only moves
  2022–23's recovery from about 21 to 24 months. The 2026 line, the other three falls and the pace row are unaffected.
  The 12-month medians the growth chart uses carry the mid-2018 join (see 2026-11-19) but not July 2023.
- 2026-11-20, later (owner: "apply the 2018 data fix to both charts but make it like an option, so I can show it to
  Saskia. So keep the original and the fixed"): a **2018 join** switch, **Original | Fixed**, top right of the slide,
  page-wide (both charts). Original stays the default and is unchanged. It shows for dev and admin only, never in an
  embed; `?join=fixed` presets Fixed for anyone, and the footnote then says the mid-2018 step is levelled.
  Fixed (`buildFixed`, `SF`, `D()`): for each capital, type and measure (estimated value, 12-month median), the Forge's
  months from July 2018 are scaled so that June to August 2018 moves at the average monthly rate of March to June
  (history) and August to November (Forge), and July is bridged between them. The falls index keeps the Original's
  weights and takes only each month's growth from the fixed figures, so only what crosses the join changes: 2017–19
  becomes the biggest fall (−11.2%, back in 28 months; Original −9.1%, 26), while 1989–90, 2008, 2010–12, 2022–23,
  the 2026 line and the pace row are exactly the Original's. Each fall keeps its Original colour across the switch.
  Growth chart: 10-year house rate to 2018, Melbourne 6.3% (Original 7.3%); to August 2026, Melbourne 3.1% (4.1%),
  Perth 5.6% (6.5%). The July 2023 step in the estimated values is not part of this fix. Check: `node
  scratch/_mc-check.mjs` (74).
- 2026-11-20, evening (owner: "make 9 years the default on the market cycles page"): the growth chart now opens on
  **9 years** (`gMode` default `roll9`, and the 9 years button carries `on` in the markup). `?mode=roll` still presets
  10 years; 7.5 years, Long term and Custom are unchanged. The deck's growth slide already shows 9 years and links to
  `?view=growth&mode=roll9`. Check: `node scratch/_mc-check.mjs` (75, with "opens on 9 years by default").
- 2026-11-20, evening (owner: "add a legend - interest rates at the peak, interest rate at the turn"): each fall in the
  falls legend now has a third line, **Cash rate <at the peak> → <at the turn>**, where the turn is the month of the
  low; the 2026 line reads **<at the peak> → <latest> now**. A key under the legend reads "Cash rate at the peak → at
  the turn (the low)", and the footnote adds "Cash rate: RBA, end of month (mid-1989: RBA Annual Report 1991)."
  The figures come from the Forge's monthly RBA cash rate (`rdp_raw_series` source `rba`, metric `cash_rate`, freq
  `M`, from January 1990), loaded with the other data. If that read fails the chart still draws and the rate line
  is left out. Mid-1989 predates the series, so it shows "about 18%", the RBA's own words. Today: 1989–90 about 18%
  → 17.00%; 2008 7.25% → 4.25%; 2010–12 4.50% → 4.25%; 2017–19 1.50% → 1.25%; 2022–23 0.10% → 3.10%; 2026 4.10% →
  4.85% now. Check: `node scratch/_mc-check.mjs` (76; the new check reads the Forge independently of the page).
- 2026-11-23 (owner: "Remove the buying tag in the capital graph"): the **Buying tags are gone** from Rolling capital
  growth, with their key beside the headline (`BUYING`, `buyingIn`, the `--buy` / `--buyink` tokens and the label's
  `rich` style removed; the chart's right margin is back to 70 px). The hold/sell idea goes with them. Check: `node
  scratch/_mc-check.mjs` (75; the buying-years check is replaced by one that no tag or key shows).
- 2026-11-24 (owner, for the research lead): Rolling capital growth now **opens on Houses, 9 years, Total capital
  growth, at 1990** (the first year), instead of the yearly rate at the latest month. The Total button reads "Total
  capital growth"; `?growth=yearly` presets the yearly rate (`?growth=total` still works). Switching House/Unit, the
  period or Yearly/Total keeps the year on screen instead of jumping to the latest. A **year row under the play line**
  (`#gTicks`): one label per frame ('90 to '26) under the slider thumb's positions, the year on screen lit, and a click
  jumps to that year. Play from the end still restarts at 2007. Check: `node scratch/_mc-check.mjs` (81; the yearly-rate
  checks now preset `growth=yearly`).
- 2026-11-24, later (owner: "remove the fixed option. We will bring it up next time."): the **2018 join switch is
  gone**. The page has only the Original figures again: `#cyJoin`, `gFixed`, `SF`, `D()`, `buildFixed`, the
  per-fall colour map and the "levelled" footnote are removed, and `?join=fixed` is ignored. `chain`, `falls` and
  `frames` read `S` directly, exactly as before 2026-11-20. The July 2018 bridge in `load()` (one month, so it cannot
  pass for a peak) stays; it predates the switch. To bring Fixed back, start from commit `c506862`. The port carries
  no switch. Check: `node scratch/_mc-check.mjs` (69; the Fixed checks are replaced by one that the switch is gone
  and `?join=fixed` reads as the Original, and staff and admin both see no switch).
- 2026-11-24, meeting (Davey via Saskia: remove 2022-23 from the falls; Van: "just four, don't add another"):
  **`?skip=<year>`** (comma list) leaves out the fall that peaked in that year *after* the top five are picked, so no
  sixth fall comes in; the words count what is left ("compares with four of the biggest since 1980", "any of the
  four"). The one line under the title now says how long the falls lasted, then how long from the low back to the
  peak: "All five fell for 7 to 19 months, then were back at their peak 7 to 29 months after the low." (was "All five
  were back at their peak within 16 to 36 months"). The deck's falls slides link `?view=falls&skip=2022`. pp-os: the
  same parameter and sentence if OS gets this tool. Check: `node scratch/_mc-check.mjs` (72; new: the sentence
  follows the data, and three `?skip=2022` checks).
- 2026-11-25 (owner: the 2026 line stops at August; "a faint line and dot per month … Sep, then Oct, then Nov"): after
  the Forge's last month the falls chart's 2026 line carries on **faint** (hot colour at ~40% opacity, a dot per month,
  each labelled "Sep −6.1%", "Oct −7.4%", "Nov (to 25th) −8.8%"), from **Cotality's Daily Home Value Index**,
  five-capital aggregate, joined to the Forge's last month (each point = the last solid point × aggregate(month end) /
  aggregate(Forge's last month end)); the month in progress uses the latest day. The solid line's label reads "2026:
  −4.6% to Aug" when the faint months show; the 2026 legend adds "Faint: Cotality daily index, to 25 Nov"; the footnote
  names the source and the join. The line under the title and the pace row stay on the Forge's months. Data: new
  `forge_cotality` row **`cl_daily_hvi`** (`data.series[<City>|'Five capitals'] = { monthEnd: {YYYY-MM: value}, latest }`,
  `data.latest`), written by **`node scripts/ingest-cotality-daily-hvi.mjs --write`** from Cotality's public feed
  `https://au-indices.cotality.com/asx.json` (the indices page's rolling 365-day back series; Cotality revises the past
  12 months on the 1st, so re-run after the 1st). Without the row the chart is as before. pp-os: the same store row
  (via sync-from-hub) and the same faint extension, after 072.
- 2026-11-25, later (Davey via Saskia, meeting 2026-11-25; Van: "do it in slide 9 too"): the line under the falls
  title drops the time back to the peak: "All five fell for 7 to 19 months." (with `?skip=2022`, "All four …"). Check:
  `node scratch/_mc-check.mjs` (74).
- 2026-11-25, push (owner: "make sure 2022 is removed and 2026 biggest fall will show the Nov data"): with no `skip`
  parameter the falls view now leaves 2022 out (`SKIP = ['2022']` by default; `?skip=none` shows all five), so the
  plain address shows four falls. With the faint Cotality months, the 2026 legend entry reads at the latest of them
  ("2026 −8.8%", "7 months in, to 25 Nov 2026", then "Faint: Cotality daily index from Sep"); the solid line's own
  label stays "2026: −4.6% to Aug" and the line under the title stays on the Forge's months. Check:
  `node scratch/_mc-check.mjs` (75; section 1 reads `?skip=none`).
- 2026-11-25, deck audit (owner: "fix … 10"): with the faint Cotality months, the line under the falls title now reads at
  the latest of them too ("Down 8.8% in 7 months, further than any of the four at the same stage. …"), compared with
  each fall at that same month; without them it is unchanged. The "Pace over the last 3 months" strip now runs to the
  latest day from Cotality's daily index ("as a yearly rate, to 25 Nov 2026"): each series' latest / its value three
  months back, to the 4th power, less 1; the footnote adds "Pace: Cotality Daily Home Value Index, 25 Aug 2026 to
  25 Nov 2026 (Brisbane incl. Gold Coast)." For that, `scripts/ingest-cotality-daily-hvi.mjs` stores a third field per
  series, `ago3: { day, value }` (the last day on or before the same date three months back); a row without it keeps
  the Forge's three months. pp-os: carry `ago3` in the `cl_daily_hvi` store key when that key is ported. The 1989 rate
  stays "about 18%" (the RBA Annual Report 1991 the footnote cites: "cash rates reaching 18 per cent in mid 1989"); the
  deck's slide 10 was changed to match it instead. Check: `node scratch/_mc-check.mjs` (77).
- 2026-11-25, Present (owner: "add a present feature in market Cycles for both graph"): a "▶ Present" button at the
  right of the tabs shows the slide alone, full screen where the browser allows it, scaled to fit and centred exactly
  as an embed is (`slideScale()`; the edges take the slide's own ground). ← → (or Page Up/Down, or the bar's arrows)
  switch between the falls and the growth chart; Esc, the bar's Exit, or leaving full screen ends it. A small bar at the
  bottom right ("The biggest falls · 1 of 2") hides after 2.5 s without the mouse moving. The growth chart's canvas is
  now always drawn at 2x at least, so it stays sharp at Present's scale (1.5x at 1080p, 2x at 1440p); open tooltips are
  closed before a key redraws a chart (otherwise ECharts' pending tooltip move hit the removed tooltip). Checks:
  `node scratch/_mc-present-check.mjs` (1920x1080 and 1440x900) and `node scratch/_mc-check.mjs` (77). pp-os: its
  Market Cycles has no Present yet; carry this with the 11-25 follow-up.
- 2026-11-27 (Saskia via Van, for Davie: "a version with all the top 100 regions for population … customisable"): new
  **Regional growth** tab (`?view=regions`), the growth race over up to 100 regions with Regions / Price / Market /
  Area / People / Show dropdowns, and new `forge_cotality` row **`cl_region_history`** from new
  `scripts/build-cl-region-history.mjs` (dry run only so far; the row is not written). Van's calls: both lists and both
  price measures as dropdowns; smooth v workforce from the 36 Runway v Demand markets; hub first. The two existing views
  are unchanged; the falls view does not fetch the new row. Present from the new tab shows it alone. Not yet in the
  presentation builder's Add embed list. Checks: `node scratch/_mc-regions/check-regions.mjs` (64), `node
  scratch/_mc-check.mjs` (77; its tab check now expects three tabs), `node scratch/_mc-present-check.mjs` (22).
