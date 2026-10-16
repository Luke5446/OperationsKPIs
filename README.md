# Tibard & Oliver Harvey — Operations KPIs

A single-page board dashboard (`index.html`, Chart.js) for Tibard Ltd. It is password-gated: the
Google Sheet URL it reads is encrypted in the page and only decrypts with the password.

## Where each figure comes from

| Figure | Source | From |
|---|---|---|
| On-shore production £, stock valuation, OTIF, orders despatched, late orders, DPD | **KPI Data sheet** (typed each month) | always |
| Garments made (OH / Tibard), works orders raised and completed | **Production planner** `data.json` | Sep 2026 |
| Fabric cut (metres and £), fabric completed £, fabric in WIP, each month as at its **last working day** and frozen there | **Cutting log** `cutlog.json` + production planner; `data/fabric-snapshots.json` once frozen | Oct 2026 |
| Fabric cut before Oct 2026 | KPI Data sheet rows `Fabric Cut Metres` / `Fabric Cost of Usage £` | Apr 2025 – Sep 2026 |
| Clockwork stock bought in, USD, before Sep 2026 | KPI Data sheet (typed; the metric `Off-Shore Production £` was always entered in USD) | — |
| Clockwork stock bought in, USD, containers and units | **Stock planner** `data.json`, `bookedPOs` whose ref starts `C` (container) or `AF` (airfreight), by booked-in date, each garment valued at `data/clockwork-prices.json` (USD per garment from the Container Order Template's Data tab) | Sep 2026 |

The cutover months are in `FEED_FROM` near the top of the script. Before a cutover, and whenever a
feed cannot be fetched, the sheet figure is shown and the header badge says which feed is down.

### Feeds

The planner apps publish their state into public GitHub repos; the dashboard reads the GitHub Pages
copy first and `raw.githubusercontent.com` as a fallback. No token is needed.

- `https://luke5446.github.io/Tibard-Productionplan/data.json` — works orders (`WOs`, `completedWOs`)
- `https://luke5446.github.io/Tibard-Cutlog/cutlog.json` — the cutting room log
- `https://luke5446.github.io/Tibard-Stock-Planner/data.json` — containers (`bookedPOs`)
- `https://luke5446.github.io/Tibard-Productionplan/index.html` — only for the planner's fabric cost
  list (`FABRIC_PRICES`, standard £ per metre). `data/fabric-prices.json` is a dated snapshot used
  when the page cannot be fetched; `data/fabric-price-overrides.json` adds £/m for codes the list
  lacks (the 25mm webbing), with exact codes winning and prefix rules only filling gaps.
- `data/clockwork-prices.json` — Clockwork USD per garment. Update it when Clockwork sends new
  prices (it is the Data tab of the container order template). A code missing from it is listed
  on the tile and in the detail table as unpriced.

### How the planner figures are worked out

- **Brand** of a garment: a special make uses its Sage company; otherwise a product code starting
  `OH` is Oliver Harvey and everything else (Tibard codes and customer-branded codes) is Tibard.
- **Works orders completed** = distinct works order refs with a completion in the month; a works
  order with lines of both brands counts once, under the brand of most of its garments.
  **Raised** = distinct refs by the day they entered the planner (`createdAt`, stamped from 7 Sep 2026;
  before that the planned start date, then the print date).
- **Fabric cut** = cut-log lines marked cut in the month (the cutting room's metres where typed,
  else the standard) × the planner's price per metre.
- **Fabric completed** = the planner's own write-off: on every line completed in the month, the
  cutting room's metres (else standard) × the price frozen on the record, mesh and contrast extras
  included.
- **Fabric in WIP** as at a day = lines marked cut on or before that day whose works order was not
  completed by then, valued the same way; plus, while they are still live, works orders printed
  before the log began, taken as cut at standard — as the planner's KPIs tab does. A count of works
  orders the log never had is shown when any exist.
- **Month end = the last working day** (Monday to Friday, England's bank holidays excluded). The
  month in progress shows figures to date; a closed month shows them as at its last working day.

### Freezing the month

`tools/snapshot-fabric.js` runs every weekday at 10:30 UTC through the `Freeze month-end fabric KPIs`
workflow (`.github/workflows/fabric-snapshot.yml`). The first run after a month's last working day
works out that month's fabric cut, completed and WIP as at that day and commits them to
`data/fabric-snapshots.json`; the dashboard then shows those figures for good (the tile says
"frozen") however the feeds change afterwards. To redo a month, run the workflow by hand with the
month in its box, or locally: `node tools/snapshot-fabric.js 2026-10`.

The feed maths lives in `kpi-feeds.js`, used by both the page and the freeze job, so the two cannot
disagree.

## Tiles

Click a headline tile (or press Enter on it) to jump to its chart.

## Adding a month to the sheet

Rows are `Date, Brand, Area, Metric, Value` with `Date` as `YYYY-MM`. Values typed by hand each
month: on-shore production £ per brand, stock valuation, OTIF, orders despatched, late orders, DPD,
and Clockwork USD per brand (`Off-Shore Production £`, or the clearer `Clockwork Stock Bought In USD`).
