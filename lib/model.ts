// The token radar's model, radar-3: a multi-factor score from the snapshot's own figures.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// 160 pre-token protocols below it that pass the same launch-candidate screen the watchlist uses:
// pre-token, not an exchange, not a bridge or a liquid staking/restaking product, not a versioned pool
// of another protocol, not a wrapped or staked product, and not named after an exchange. A protocol is
// pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown with the market's own values, never mixed
// into the ranked board.
//
// Implied value follows only from the snapshot's own figures, in four visible factors:
//
//   category ratio  = median(mcap_usd / tvl_usd) over the live-token protocols in the same category
//                     (at least 3 live peers, else the global median over all live protocols)
//   base            = tvl_usd x category ratio
//   growth          = clamp(change_7d, -50, 100) per cent; null change_7d is neutral
//   growthMult      = 1 + growth / 100 x 0.35
//   age factor      = 0.75 + 0.25 x min(age_days, 1460) / 1460   (age unknown: 0.875, the midpoint)
//   chain factor    = 1 + 0.05 x min(chains - 1, 4)              (each extra chain, up to four)
//   implied         = max(1, round(base x growthMult x ageFactor x chainFactor))
//
// Why these four: a category's own live tokens are the honest yardstick for what that kind of
// protocol's token trades at relative to its TVL (a DEX token is not priced like a lending token);
// recent growth says whether the TVL is arriving or leaving; age says how long the protocol has run
// with no token on record; chain breadth says how many ecosystems would meet the launch. No protocol
// name is ever special-cased: the same function scores every row, and every row carries its four
// factors so a reader can see exactly why it ranks where it does.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  age_floor: number;
  age_range: number;
  age_days_cap: number;
  unknown_age_factor: number;
  chain_step: number;
  chain_max_extra: number;
  category_min_peers: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 100,
  age_floor: 0.75,
  age_range: 0.25,
  age_days_cap: 1460,
  unknown_age_factor: 0.875,
  chain_step: 0.05,
  chain_max_extra: 4,
  category_min_peers: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist the early radar carries, by score. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the already-launched view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row's four visible factors, so the dashboard can show why the row ranks where it does. */
export interface FactorBreakdown {
  category_ratio: number;
  category_live_peers: number;
  base_usd: number;
  growth_pct: number | null;
  growth_multiplier: number;
  age_days: number | null;
  age_factor: number;
  chain_count: number;
  chain_multiplier: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: FactorBreakdown;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with its factors and farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  factors: FactorBreakdown;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers; the middle value, or the mean of the middle two. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The round-to-4-decimals form a factor is shown with. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * The category ratios: for each category, the median mcap/TVL of its live-token protocols, used
 * only when the category has at least `minPeers` live peers; plus the global median over all live
 * protocols, the fallback for thin categories. Computed from the snapshot alone.
 */
export function categoryRatios(snapshot: Snapshot, minPeers: number): { byCategory: Map<string, number>; peers: Map<string, number>; global: number } {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const global = median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const byCategory = new Map<string, number>();
  const peers = new Map<string, number>();
  const perCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = perCategory.get(key);
    if (list === undefined) perCategory.set(key, [(p.mcap_usd as number) / p.tvl_usd]);
    else list.push((p.mcap_usd as number) / p.tvl_usd);
  }
  for (const [key, ratios] of perCategory) {
    peers.set(key, ratios.length);
    if (ratios.length >= minPeers) byCategory.set(key, median(ratios));
  }
  return { byCategory, peers, global };
}

/** The four factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  ratios: { byCategory: Map<string, number>; peers: Map<string, number>; global: number },
): { implied: number; factors: FactorBreakdown } {
  const age = ageDays(asOf, protocol.listed_at);
  const key = protocol.category ?? 'Other';
  const ratio = ratios.byCategory.get(key) ?? ratios.global;
  const peers = ratios.peers.get(key) ?? 0;
  const base = protocol.tvl_usd * ratio;
  const growthPct = protocol.change_7d === null ? null : Math.min(model.growth_cap, Math.max(model.growth_floor, protocol.change_7d));
  const growthMult = growthPct === null ? 1 : 1 + (growthPct / 100) * model.growth_weight;
  const ageFactor = age === null ? model.unknown_age_factor : model.age_floor + (Math.min(Math.max(age, 0), model.age_days_cap) / model.age_days_cap) * model.age_range;
  const chainCount = protocol.chains.length;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(chainCount - 1, 0), model.chain_max_extra);
  const implied = Math.max(1, Math.round(base * growthMult * ageFactor * chainMult));
  return {
    implied,
    factors: {
      category_ratio: round4(ratio),
      category_live_peers: peers,
      base_usd: Math.round(base),
      growth_pct: growthPct,
      growth_multiplier: round4(growthMult),
      age_days: age,
      age_factor: round4(ageFactor),
      chain_count: chainCount,
      chain_multiplier: round4(chainMult),
    },
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories whose products are plainly a receipt for a token that already trades. */
const RECEIPT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'CEX']);

/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is a launch candidate the board may rank: pre-token and not a receipt product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !RECEIPT_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const ratios = categoryRatios(snapshot, model.category_min_peers);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: the rankable pre-token protocols below the watchlist floor, strongest first by
  // the same score, capped. Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, score: impliedValue(p, snapshot.as_of, model, ratios).implied }))
    .sort((a, b) => b.score - a.score || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS)
    .map((s) => s.p);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, factors } = impliedValue(p, snapshot.as_of, model, ratios);
    return { p, implied, factors };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.factors.age_days,
    implied_value_usd: s.implied,
    model: s.factors,
    farm_steps: farmSteps(s.p, s.factors.age_days).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on the protocol's first chain, in whole dollars of gas. */
function gasFor(p: SnapshotProtocol): number {
  return chainOf(p) === 'Ethereum' ? 6 : 1;
}

/** The protocol's TVL in millions of dollars, one decimal. */
function tvlMillions(p: SnapshotProtocol): string {
  return (p.tvl_usd / 1_000_000).toFixed(1);
}

/**
 * One category's main action and its weekly action, as templates with the protocol's name, chain and
 * capital filled in. The match is by category keyword, never by protocol name: a new category falls
 * through to the generic deposit, so a future protocol is farmed by the same code.
 */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { main: string; weekly: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const cap = `$${capital}`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      main: `Supply ${cap} of USDC to ${name} on ${chain} and keep the lending position open.`,
      weekly: `Borrow a small amount against the supply, then repay it in the same week.`,
    };
  }
  if (c.includes('dex') || c.includes('swap')) {
    return {
      main: `Provide ${cap} of liquidity to ${name}'s largest pool on ${chain} and keep the position open.`,
      weekly: `Swap $10 through ${name}'s pool on ${chain} so the wallet stays active.`,
    };
  }
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) {
    return {
      main: `Deposit ${cap} of USDC into ${name}'s main yield vault on ${chain} and keep the shares.`,
      weekly: `Claim or compound the vault's yield once a week, even a small amount.`,
    };
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return {
      main: `Bridge ${cap} of USDC to ${chain} through ${name}, then use the bridged funds in its app.`,
      weekly: `Bridge a further $10 through ${name} to a second chain it supports.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      main: `Stake ${cap} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`,
      weekly: `Top up the stake by $10 or claim the staking rewards once a week.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return {
      main: `Deposit ${cap} of USDC as margin on ${name} and open one small hedged position on ${chain}.`,
      weekly: `Close and reopen the hedge once a week so the account shows fresh volume.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      main: `Fund ${cap} on ${name} and place one market position on ${chain}.`,
      weekly: `Place one more small market position each week, on a different outcome.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager')) {
    return {
      main: `Deposit ${cap} into a ${name} vault on ${chain} and keep the vault shares.`,
      weekly: `Rebalance or top up the vault position by $10 once a week.`,
    };
  }
  if (c.includes('stable')) {
    return {
      main: `Mint or deposit ${cap} of the stable asset through ${name} on ${chain} and hold it.`,
      weekly: `Mint or redeem $10 of the stable asset once a week to keep the wallet active.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      main: `Mint ${cap} of the protocol's yield-bearing asset on ${chain} through ${name} and hold it.`,
      weekly: `Claim the asset's yield once a week, even a small amount.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      main: `Buy ${cap} of cover from ${name} on ${chain} and keep the policy active.`,
      weekly: `Check the policy's status and renew or extend it before it lapses.`,
    };
  }
  if (c.includes('launchpad')) {
    return {
      main: `Use ${name}'s launchpad on ${chain} with ${cap} of stablecoins when a public round opens.`,
      weekly: `Check the launchpad's open rounds once a week and join only rounds the protocol itself lists.`,
    };
  }
  if (c.includes('basis')) {
    return {
      main: `Deposit ${cap} of USDC into ${name}'s basis vault on ${chain} and keep the shares.`,
      weekly: `Claim or compound the vault's yield once a week, even a small amount.`,
    };
  }
  if (c.includes('synthetic')) {
    return {
      main: `Mint ${cap} of a synthetic asset through ${name} on ${chain} and hold the position.`,
      weekly: `Adjust the collateral by $10 once a week to keep the position healthy.`,
    };
  }
  if (c.includes('index')) {
    return {
      main: `Deposit ${cap} into ${name}'s index vault on ${chain} and keep the vault shares.`,
      weekly: `Top up the index position by $10 once a week.`,
    };
  }
  if (c.includes('payment') || c.includes('card')) {
    return {
      main: `Route ${cap} of spending through ${name} on ${chain} and keep the account funded.`,
      weekly: `Make one more small payment through ${name} each week.`,
    };
  }
  if (c.includes('nft')) {
    return {
      main: `List or buy one NFT through ${name} on ${chain} with ${cap} of funds behind the wallet.`,
      weekly: `Place one more bid or listing on ${name} each week.`,
    };
  }
  if (c.includes('governance')) {
    return {
      main: `Lock ${cap} in ${name}'s governance on ${chain} and vote when a public proposal opens.`,
      weekly: `Check ${name}'s open proposals once a week and vote on any that are live.`,
    };
  }
  if (c.includes('ai agent') || c.includes('decentralized ai')) {
    return {
      main: `Stake ${cap} to ${name}'s agent on ${chain} and run one of its tasks.`,
      weekly: `Run one more agent task each week and keep the stake in place.`,
    };
  }
  if (c.includes('privacy')) {
    return {
      main: `Move ${cap} through ${name}'s private transfer on ${chain} and keep the receipt.`,
      weekly: `Make one more private transfer through ${name} each week.`,
    };
  }
  return {
    main: `Deposit ${cap} of USDC into ${name} on ${chain} and keep the position open.`,
    weekly: `Make one qualifying action each week, such as a deposit, a swap or a vote.`,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * No step claims an airdrop exists: it farms the protocol's own activity, and the claim step says to
 * use only a page the protocol itself publishes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(p);
  const { main, weekly } = actionsFor(p, capital, chain);
  const ageText = age === null ? 'with no listing date on record' : `after ${age} days with no token on record`;
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm on ${chain}, and keep its seed phrase offline.`,
      cost: `under $${gas + 2} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: `${main} The protocol already holds $${tvlMillions(p)}M of TVL ${ageText}.`,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weekly,
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `If ${p.name} publishes a points or rewards page, open it from the protocol's own site and check the position is counted; claim only from a link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's already-launched view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with its factors and farm plan. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlist: onWatchlist,
    factors: row.model,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
