# Token Radar 3 — radar-3 entry for make.fun's token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ahmadcrypto/token-radar-entry-2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ahmadcrypto/token-radar-entry-2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols,
ranks the 200 pre-token launch candidates by an implied value, and shows a
reader how to farm each one. The dashboard is a static page (no network, no
framework) with a sortable, filterable board, a detail view per protocol with
the model's four factors and a farm plan, and a separate panel of the
protocols whose token already trades.

## The model (radar-3)

Four factors, all from the snapshot's own figures — no protocol name is ever
special-cased:

- **Category ratio** — median(mcap / TVL) of the live-token protocols in the
  row's category (3+ live peers, else the global median). A DEX token is not
  priced like a lending token.
- **Growth** — `1 + clamp(change_7d, -50, 100) / 100 x 0.35`; a missing 7d
  change is neutral.
- **Age** — `0.75 + 0.25 x min(age_days, 1460) / 1460`; how long the protocol
  has run with no token on record (unknown age: 0.875).
- **Chains** — `1 + 0.05 x min(chains - 1, 4)`; each extra chain the protocol
  runs on.

`implied = round(tvl_usd x category ratio x growth x age x chains)`.

The board covers all 40 watchlist protocols plus the 160 other pre-token
protocols that pass the launch-candidate screen (not an exchange, bridge,
liquid staking/restaking product, versioned pool, wrapped/staked product, or
exchange-branded product), scored by the same function.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22, standard library only. The program writes `out/board.json`,
`out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`.
It is deterministic: two runs write identical bytes.

## Notes

- Implied value is the entry's own claim, never a price and never a
  prediction that a token will be issued. The snapshot records no token; it
  does not prove a protocol has none.
- Farm plans are generic DeFi actions derived from each protocol's category,
  chains, TVL and age. No step claims an airdrop exists.

---

Entered on [make.fun](https://make.fun/?ref=f2f8brv2&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
