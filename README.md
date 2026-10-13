# Tibard & Oliver Harvey — Operations KPIs

A single-page board dashboard (`index.html`, Chart.js) for Tibard Ltd. It is password-gated: the
Google Sheet URL it reads is encrypted in the page and only decrypts with the password.

## Where each figure comes from

| Figure | Source | From |
|---|---|---|
| On-shore production £, stock valuation, OTIF, orders despatched, late orders, DPD | **KPI Data sheet** (typed each month) | always |
| Garments made (OH / Tibard), works orders raised and completed | **Production planner** `data.json` | Sep 2026 |
| Fabric cut (metres and £), fabric completed £, fabric in WIP at month end | **Cutting log** `cutlog.json` + production planner | Oct 2026 |
| Fabric cut before Oct 2026 | KPI Data sheet rows `Fabric Cut Metres` / `Fabric Cost of Usage £` | Apr 2025 – Sep 2026 |
| Clockwork stock bought in, USD | KPI Data sheet (typed; the metric `Off-Shore Production £` was always entered in USD) | always |
| Containers booked in and their units | **Stock planner** `data.json`, `bookedPOs` whose ref starts `C` (container) or `AF` (airfreight), by booked-in date | Sep 2026 |

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
  when the page cannot be fetched.

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
- **Fabric in WIP** at month end (today for the current month) = lines marked cut on or before that
  day whose works order was not completed by then, valued the same way; plus, while they are still
  live, works orders printed before the log began, taken as cut at standard — as the planner's
  KPIs tab does. A count of works orders the log never had is shown when any exist.

## Adding a month to the sheet

Rows are `Date, Brand, Area, Metric, Value` with `Date` as `YYYY-MM`. Values typed by hand each
month: on-shore production £ per brand, stock valuation, OTIF, orders despatched, late orders, DPD,
and Clockwork USD per brand (`Off-Shore Production £`, or the clearer `Clockwork Stock Bought In USD`).
