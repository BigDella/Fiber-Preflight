# Confidence scoring heuristics

Implemented in [`packages/core/src/scoring.ts`](../packages/core/src/scoring.ts). This document is the
authoritative description of *why* a report says what it says.

## The honesty caveat (read first)

Fiber gossip announces each channel's **total capacity**, not its **directional balance**. A channel
with 1,000 CKB capacity might hold all 1,000 on the wrong side — publicly indistinguishable. This is
the same fundamental limitation Lightning pathfinders face. Consequently:

- a **high score improves odds; it is never a guarantee**
- tight capacity headroom is punished hard, because it leaves little room for the unknown balance
  split to be favourable
- `impossible` *is* authoritative in the negative direction: if no feasible route exists in the
  announced graph, the payment cannot succeed as specified.

## Route feasibility (hard constraints)

An edge (channel direction) can carry a payment iff:

- the channel direction is `enabled`
- the channel's asset (CKB or UDT type script) matches the payment asset
- `capacity ≥ amount + hop fee`
- `tlc_minimum_value ≤ amount ≤ tlc_maximum_value` (when announced)

Routes are found with **Dijkstra + Yen's k-shortest paths** (k=5, max 8 hops).
Edge cost = proportional fee (`fee_rate` in parts-per-million) + a constant hop penalty, so cheaper
*and* shorter routes rank first.

## Per-route score (starts at 100, multiplicative penalties)

| Factor | Rule |
|---|---|
| **Capacity headroom** | worst-hop utilisation `u = amount / capacity`. `u ≤ 10%` → no penalty; ramps linearly to **80% penalty** at `u ≥ 90%` |
| **Hop count** | ×0.93 per hop beyond the first |

Every applied factor emits a human-readable reason attached to the route.

## Aggregate score (best route, then adjustments)

| Factor | Adjustment |
|---|---|
| **Route diversity** | 1 channel-disjoint route → −15 (plus a `single_route` bottleneck); 2 → −5; 3+ → 0 |
| **Target connectivity** | target has one public channel → −15; total inbound capacity < 2× amount → −10 |
| **Graph staleness** | snapshot > 30 min old → −10; > 2 h → −25 (plus a `stale_graph` bottleneck) |

## Verdict bands

| Verdict | Condition |
|---|---|
| `likely` | score ≥ 70 |
| `uncertain` | 40 ≤ score < 70 |
| `unlikely` | 0 < score < 40 (routes exist but are badly constrained) |
| `impossible` | no feasible route (score 0) |

## Bottleneck kinds

`no_channels`, `low_target_inbound`, `tight_capacity`, `single_route`, `disabled_channels`,
`asset_unavailable`, `below_tlc_minimum`, `stale_graph` — each with severity `info | warning | critical`
and a message naming the constrained node/channel where applicable.

## Tuning

The constants (penalty ramp, hop factor, diversity/staleness deductions, verdict bands) are defined at
the top of `scoring.ts` behind named helpers and documented tests
(`packages/core/test/scoring.test.ts` covers healthy, chokepoint, island, wrong-asset, oversized and
stale-graph scenarios). Roadmap: replace static weights with probe-informed liquidity estimates.
