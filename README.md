# Momentum Radar — growth-first token launch board

A token launch radar for make.fun's token-radar-01 bounty. It reads the sealed
DefiLlama snapshot (`snapshot.json`, 758 protocols, 40-slug watchlist, $50M floor)
and ranks 180 pre-token protocols by implied launch value.

## Model (growth-first)

```
growthPct  = clamp(change_7d, -40, 200)          (null change -> 0)
growthMult = 1 + (growthPct / 100) * 1.2
ageMult    = 0.7 + 0.3 * min(age_days, 1095) / 1095   (age unknown -> 365 days)
implied    = round(TVL * 0.25 * growthMult * ageMult)
```

Growth dominates the ranking: a fast-growing protocol outranks a larger flat
one. Age adds at most 30%. No protocol name is special-cased — every figure
comes from the snapshot. A protocol is shown as *recording* no token, never as
having none.

Board: all 40 watchlist slugs + the 140 pre-token protocols below the $50M
floor with the most TVL (excluding CEX and versioned pools) = 180 rows.

## Dashboard

Dark red / ember theme. Sortable table (rank, protocol, category, chains, TVL,
7d momentum, implied value) with a highlighted momentum column and a
growth-sorted toggle; text + category filter; click a row for a detail view
with the farm plan. URL views: `?view=board` (default),
`?view=detail&slug=<slug>`, `?view=filtered&f=<text>`.

Each row carries 6 farm steps, each stating a cost and a time, built from the
protocol's category, chains, TVL and age, with one qualifying action every week.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only. Deterministic: no clock, no randomness, no
network — two runs write byte-identical `board.json` and `dossier.json`.
Output: `board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`.
