# Token Radar — make.fun entry for `token-radar-01`

[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/flavyn/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/flavyn/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A dashboard for make.fun's *Build the best token launch radar* bounty. Live entry page:
<https://make.fun/bounty/token-radar-01>.

## What it does

`main.ts` reads the sealed snapshot at `/input/snapshot.json` and writes a ranked board of **178
pre-token protocols** — the 40 watchlist slugs, plus 138 protocols below the watchlist floor that the
same visibility rule keeps — together with a static dashboard and the dossier the judge reads. Every
row carries five farm steps with what they cost and how long they take.

The implied value is built only from the snapshot's own figures:

```
implied = tvl_usd × comp × momentum × maturity
```

- **comp** — the market's median market-cap ÷ TVL multiple, measured on the snapshot's 128
  token-bearing protocols. A category with fewer than five readings borrows its family's median
  (lending, trading, bridge, staking, rwa, yield, stablecoin, insurance, other); a family with fewer
  than five borrows the snapshot-wide median. The multiple is clamped to [0.05, 2.50].
- **momentum** — `1 + 0.75 × clamp(change_7d, −40, +40) / 100`, and exactly 1 when the snapshot
  reports no seven-day change.
- **maturity** — `0.70 + 0.30 × min(age_days, 1095) / 1095`, with an unknown listing date scored as
  365 days.

No protocol name is special-cased: one function scores every row. The dashboard shows the derivation
for each protocol — TVL × comp (with its sample size) × momentum × maturity = implied value — and marks
clearly when a row borrows a family or snapshot multiple instead of a measured one.

## Running it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Node 22 standard library only, no dependencies, no network, no clock. Two runs write byte-identical
output. `vendor/makefun-board.ts` is make.fun's own dossier library, copied unchanged.

## License

MIT — see [LICENSE](LICENSE).
