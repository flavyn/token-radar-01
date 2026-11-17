# Token Radar — make.fun entry for `token-radar-01`

[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/flavyn/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/flavyn/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A dashboard for make.fun's *Build the best token launch radar* bounty. Live entry page:
<https://make.fun/bounty/token-radar-01>.

## What it does

`main.ts` reads the sealed snapshot at `/input/snapshot.json` and writes a ranked board of 178
pre-token protocols (the 40 watchlist slugs plus 138 protocols below the floor that the same visibility
rule keeps), a static dashboard, and the dossier the judge reads.

The implied value of a protocol is its TVL times a market multiple, times its seven-day momentum, times
its maturity:

- **Multiple** — the family median of market cap ÷ TVL over the snapshot's 128 token-bearing protocols.
  A fitted size curve (least squares on `a + b·log10(TVL)`) was built and tested first; leave-one-out
  cross-validation showed the median wins in almost every family (median error 0.31× against the curve's
  1.02×), so the board keeps the median. The per-family comparison is printed on the page.
- **Momentum** — the seven-day TVL change, clamped.
- **Maturity** — a function of how long the protocol has run with no token.

Every row also carries a five-step farm plan and a **net-of-gas verdict** (`farm` / `thin` / `skip`)
computed from the protocol's implied value, an assumed airdrop pool, the required capital, gas per
transaction and the holding period. The arithmetic is shown in the detail panel, not hidden.

## Running it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Node 22 standard library only, no dependencies, no network, no clock. Two runs write byte-identical
output. `vendor/makefun-board.ts` is make.fun's own dossier library, copied unchanged.

## License

MIT — see [LICENSE](LICENSE).
