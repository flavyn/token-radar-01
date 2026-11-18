// The token radar's model.
//
// One snapshot of DefiLlama's protocol universe goes in; one ranked board comes out. The board
// answers a single question: what would a protocol's token be worth if the protocol's record stayed
// exactly as it is today? Every figure below is derived from the snapshot itself. No protocol name
// is special-cased and no multiple is typed in by hand: the same function scores every row.
//
//   implied = tvl_usd x comp x momentum x maturity
//
//   comp      The market's median market-cap-to-TVL multiple, measured on the protocols in this
//             same snapshot whose token already trades (mcap_usd > 0 and tvl_usd > 0; 128 of the
//             758 records). The median is the category's own when that category has at least five
//             readings; otherwise the family's (lending, trading, bridge, staking, rwa, yield,
//             stablecoin, insurance, other) when the family has five; otherwise the snapshot's
//             whole 128. A category with two readings is not a market, so it borrows. The multiple
//             is clamped to [0.05, 2.50]: a market that pays 40x TVL for one protocol is a reading,
//             not a multiple the whole category earns.
//   momentum  1 + 0.75 x clamp(change_7d, -40, +40) / 100, and exactly 1 when the snapshot reports
//             no seven-day change. TVL growing 40% in a week is worth 1.30x; shrinking 40% is worth
//             0.70x. The clamp keeps one violent week from deciding a whole row.
//   maturity  0.70 + 0.30 x min(age_days, 1095) / 1095, with age_days counted from listed_at to
//             as_of. A protocol DefiLlama has tracked for three years earns the whole 0.30; one it
//             started tracking last month earns almost none. An unknown listing date is scored as
//             365 days, the middle of the range, rather than as a fresh protocol.
//
// The universe. Every slug on the snapshot's watchlist is on the board (40), and every protocol
// under the watchlist's $50M floor that the same visibility rule keeps is on it too (138): no token
// recorded, not a wrapped, staked or bridged product of a token that already trades, not a versioned
// pool of another protocol, not an exchange's own arm. That is 178 rows. Above the floor the
// watchlist is authoritative: DefiLlama's parentProtocol, which the snapshot does not carry, keeps
// 19 sub-products out of it, so the visibility rule is applied below the floor only and the house's
// own list is trusted there. The watchlist is a floor, never a ceiling.

/** One record of the sealed snapshot: exactly the ten fields it carries. */
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

/** The model's constants, in one place: the dashboard quotes them and the formula uses them. */
export interface ModelConstants {
  /** How much of a week's growth carries into the value: 1 + weight x clamped change / 100. */
  momentum_weight: number;
  /** The seven-day change is clamped to plus or minus this many per cent before it is applied. */
  momentum_clamp_pct: number;
  /** The maturity multiplier at zero days. */
  maturity_floor: number;
  /** What three years of life adds to the maturity multiplier. */
  maturity_range: number;
  /** Days at which the maturity term is capped. */
  maturity_days: number;
  /** The age an unknown listing date is scored as. */
  unknown_age_days: number;
  /** The floor a borrowed or measured multiple is clamped to. */
  comp_min: number;
  /** The ceiling a borrowed or measured multiple is clamped to. */
  comp_max: number;
  /** The fewest readings a category or family needs before its median is used. */
  min_sample: number;
  /** The most dollars an implied value may name. */
  implied_cap: number;
}

export const MODEL: ModelConstants = {
  momentum_weight: 0.75,
  momentum_clamp_pct: 40,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  comp_min: 0.05,
  comp_max: 2.5,
  min_sample: 5,
  implied_cap: 100_000_000_000_000,
};

/** The model's version label: the page prints it beside the formula. */
export const MODEL_VERSION = 'radar-2';

/** Where a row's multiple came from: its own category, its family, or the whole snapshot. */
export type CompSource = 'category' | 'family' | 'snapshot';

/** One token-bearing protocol: the market's own reading of a market-cap-to-TVL multiple. */
export interface Comparable {
  slug: string;
  name: string;
  category: string | null;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

/** A median multiple and the readings behind it. */
export interface ComparableGroup {
  key: string;
  label: string;
  source: CompSource;
  median: number;
  sample: number;
  readings: Comparable[];
}

/** Every group the board can borrow from, by key. */
export type CompIndex = Map<string, ComparableGroup>;

/** One step of a farm plan: what to do, what it costs and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of the ranked board. */
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
  watchlisted: boolean;
  below_floor: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    comp_multiple: number;
    comp_sample: number;
    comp_source: CompSource;
    comp_key: string;
    momentum_multiplier: number;
    maturity_multiplier: number;
    growth_pct: number;
  };
  farm_steps: string[];
}

/** A board row as the page reads it from data.js. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  comp_multiple: number;
  comp_sample: number;
  comp_source: CompSource;
  comp_key: string;
  momentum_multiplier: number;
  maturity_multiplier: number;
  growth_pct: number;
  watchlisted: boolean;
  below_floor: boolean;
  verdict: Verdict;
  farm_steps: string[];
}

/** What the page's written rule says to do with a ranked row. */
export type Verdict = 'FARM' | 'MARGINAL' | 'SKIP';

/**
 * The verdict a row earns, by the rule the page prints beside it: a row the model prices below the
 * floor is a SKIP; a row that clears the floor earns FARM only when its multiple is its own
 * category's (at least `min_sample` readings) and its seven-day momentum is not negative; a row that
 * clears the floor but borrows a multiple or is fading is MARGINAL. Nothing here is decoration: the
 * three states are exactly these three predicates, and the dashboard counts them.
 */
export function verdictOf(row: BoardRow, model: ModelConstants = MODEL): Verdict {
  if (row.below_floor) return 'SKIP';
  const borrowed = row.model.comp_sample < model.min_sample;
  const fading = row.model.momentum_multiplier < 1;
  return borrowed || fading ? 'MARGINAL' : 'FARM';
}

/** One era of the leave-one-out check: protocols listed in a window, scored out of sample. */
export interface EraCheck {
  label: string;
  n: number;
  from: string;
  to: string;
  median_miss: number;
  within_2x: number;
}

/** A residual band fitted on the oldest protocols and then held against the newer ones. */
export interface RangeCheck {
  fit_on: string;
  n_fit: number;
  low: number;
  high: number;
  holds: number;
}

/**
 * The evidence panel: the model scored on the protocols it may not price from themselves. Every
 * token-bearing protocol is predicted once with its own reading removed from the multiples, so the
 * number is a leave-one-out miss and not a fit. `eras` splits the same check by listing date, and
 * `range` fits a residual band on the oldest third and reports how much of the rest it holds.
 */
export interface Validation {
  n: number;
  median_miss: number;
  within_2x: number;
  within_3x: number;
  eras: EraCheck[];
  range: RangeCheck;
  holds_newest: number;
  own_category_share: number;
}

/** A protocol whose token already trades: the market's evidence, never a ranked row. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  ratio: number;
}

/** The figures the page's header states. */
export interface RadarCounts {
  protocols: number;
  ranked: number;
  watchlist: number;
  below_floor: number;
  token_bearing: number;
}

/** Everything the page renders, written to /output/data.js as one script. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  counts: RadarCounts;
  comps: Record<string, ComparableGroup>;
  rows: RadarRow[];
  live: LiveRow[];
  validation: Validation;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The median of a non-empty list: the middle reading, or the mean of the middle two. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

/** The families a category belongs to, and the words that name them. */
const FAMILIES: Array<{ name: string; words: string[] }> = [
  { name: 'lending', words: ['lend', 'cdp', 'collateral', 'credit'] },
  { name: 'trading', words: ['dex', 'swap', 'perpetual', 'derivative', 'basis', 'perp'] },
  { name: 'bridge', words: ['bridge'] },
  { name: 'staking', words: ['staking', 'restak'] },
  { name: 'rwa', words: ['rwa'] },
  { name: 'yield', words: ['yield', 'farm', 'vault', 'curator', 'allocator', 'strateg'] },
  { name: 'stablecoin', words: ['stable'] },
  { name: 'insurance', words: ['insurance'] },
];

/** The family a category belongs to; anything unrecognised is other. */
export function familyOf(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  for (const family of FAMILIES) for (const word of family.words) if (c.includes(word)) return family.name;
  return 'other';
}

/** The market's multiples, measured once from the snapshot's token-bearing protocols. */
export function buildCompIndex(protocols: SnapshotProtocol[]): CompIndex {
  const comparables: Comparable[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    comparables.push({ slug: p.slug, name: p.name, category: p.category, mcap_usd: p.mcap_usd, tvl_usd: p.tvl_usd, ratio: p.mcap_usd / p.tvl_usd });
  }
  const groupOf = (readings: Comparable[], key: string, label: string, source: CompSource): ComparableGroup => ({
    key,
    label,
    source,
    median: median(readings.map((r) => r.ratio)),
    sample: readings.length,
    readings: [...readings].sort((a, b) => b.ratio - a.ratio || byText(a.slug, b.slug)),
  });

  const byCategory = new Map<string, Comparable[]>();
  const byFamily = new Map<string, Comparable[]>();
  for (const c of comparables) {
    const catKey = c.category ?? 'no category';
    const catReadings = byCategory.get(catKey);
    if (catReadings === undefined) byCategory.set(catKey, [c]);
    else catReadings.push(c);
    const famKey = familyOf(c.category);
    const famReadings = byFamily.get(famKey);
    if (famReadings === undefined) byFamily.set(famKey, [c]);
    else famReadings.push(c);
  }

  const index: CompIndex = new Map();
  const categories = [...byCategory.keys()].sort(byText);
  for (const key of categories) {
    index.set(key, groupOf(byCategory.get(key)!, key, key, 'category'));
  }
  const families = [...byFamily.keys()].sort(byText);
  for (const key of families) {
    index.set(`family:${key}`, groupOf(byFamily.get(key)!, `family:${key}`, `${key} family`, 'family'));
  }
  index.set('snapshot:all', groupOf(comparables, 'snapshot:all', `all ${comparables.length} token-bearing protocols`, 'snapshot'));
  return index;
}

/** The group a category's multiple comes from: its own, else its family's, else the snapshot's. */
export function groupFor(category: string | null, index: CompIndex, minSample: number = MODEL.min_sample): ComparableGroup {
  const own = index.get(category ?? 'no category');
  if (own !== undefined && own.sample >= minSample) return own;
  const family = index.get(`family:${familyOf(category)}`);
  if (family !== undefined && family.sample >= minSample) return family;
  return index.get('snapshot:all')!;
}

/** A whole day count from the snapshot's as_of back to a listing date; null when it has none. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const to = Date.parse(`${asOf}T00:00:00Z`);
  const from = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(to) || !Number.isFinite(from)) return null;
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

/** The seven-day change after the clamp, and the multiplier it earns. */
export function momentumOf(change: number | null, model: ModelConstants = MODEL): { growthPct: number; momentum: number } {
  if (change === null) return { growthPct: 0, momentum: 1 };
  const clamp = model.momentum_clamp_pct;
  const growthPct = Math.min(clamp, Math.max(-clamp, change));
  return { growthPct, momentum: 1 + (growthPct / 100) * model.momentum_weight };
}

/** The maturity multiplier an age earns; an unknown age is scored as the model's middle value. */
export function maturityOf(age: number | null, model: ModelConstants = MODEL): number {
  const days = age ?? model.unknown_age_days;
  const capped = Math.min(Math.max(days, 0), model.maturity_days);
  return model.maturity_floor + (capped / model.maturity_days) * model.maturity_range;
}

/** The clamped market multiple one category is scored at. */
export function compOf(category: string | null, index: CompIndex, model: ModelConstants = MODEL): { multiple: number; group: ComparableGroup } {
  const group = groupFor(category, index, model.min_sample);
  return { multiple: Math.min(model.comp_max, Math.max(model.comp_min, group.median)), group };
}

/** The three multipliers and the implied value one protocol earns. */
export interface Valuation {
  implied: number;
  compMultiple: number;
  compGroup: ComparableGroup;
  momentum: number;
  maturity: number;
  growthPct: number;
  age: number | null;
}

/** Score one protocol: TVL x comparables multiple x momentum x maturity, rounded to dollars. */
export function valueOf(p: SnapshotProtocol, asOf: string, index: CompIndex, model: ModelConstants = MODEL): Valuation {
  const age = ageDays(asOf, p.listed_at);
  const { growthPct, momentum } = momentumOf(p.change_7d, model);
  const maturity = maturityOf(age, model);
  const { multiple, group } = compOf(p.category, index, model);
  const raw = p.tvl_usd * multiple * momentum * maturity;
  const implied = Math.max(1, Math.min(model.implied_cap, Math.round(raw)));
  return { implied, compMultiple: round6(multiple), compGroup: group, momentum, maturity, growthPct, age };
}

// ---------------------------------------------------------------- the universe

/** DefiLlama's version marker: a name ending in a release is a pool of another protocol, not one. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories whose protocols are a venue or a product of a token that already trades. */
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** The exchanges whose own arms are not protocols still waiting on a launch of their own. */
const EXCHANGE_NAMES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no ticker. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a subject the radar may rank: it records no token, it is not a versioned
 * pool of another protocol, its category is not a venue or a derivative of a token that trades, and
 * its name is not an exchange's own arm nor a wrapped, staked or bridged product of another token.
 */
export function isVisible(p: SnapshotProtocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  const lower = p.name.toLowerCase();
  for (const exchange of EXCHANGE_NAMES) if (lower.startsWith(exchange)) return false;
  return !/\b(wrapped|staked|staking)\b/.test(lower);
}

/** The protocols the board ranks: the whole watchlist, plus every visible protocol below the floor. */
export function selectUniverse(snapshot: Snapshot): SnapshotProtocol[] {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen: SnapshotProtocol[] = [];
  const taken = new Set<string>();
  // The watchlist is the floor of the board, never its ceiling: every slug on it is a row, even one
  // the snapshot no longer carries (it cannot, but coverage is not gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p === undefined || taken.has(slug)) continue;
    taken.add(slug);
    chosen.push(p);
  }
  // The early radar: every protocol under the floor the same visibility rule keeps, in slug order so
  // two runs of the program agree on the universe before the model sorts it.
  const early = snapshot.protocols
    .filter((p) => !taken.has(p.slug) && p.tvl_usd < snapshot.floor_usd && isVisible(p))
    .sort((a, b) => byText(a.slug, b.slug));
  for (const p of early) {
    taken.add(p.slug);
    chosen.push(p);
  }
  return chosen;
}

// ---------------------------------------------------------------- the farm plan

/** The chains whose gas is cheap enough to name, and the phrase the plan uses for each. */
const CHAIN_GAS: Record<string, string> = {
  Ethereum: 'about $6 of gas',
  Base: 'under $1 of gas',
  Arbitrum: 'under $0.50 of gas',
  Optimism: 'under $0.50 of gas',
  Polygon: 'about $0.10 of gas',
  Solana: 'under $0.05 of gas',
  Sui: 'under $0.05 of gas',
  Aptos: 'under $0.05 of gas',
  Monad: 'under $0.05 of gas',
  Binance: 'about $0.30 of gas',
  Avalanche: 'about $0.40 of gas',
  'Hyperliquid L1': 'under $0.10 of gas',
  Plasma: 'under $0.10 of gas',
  Sonic: 'about $0.10 of gas',
  Berachain: 'about $0.10 of gas',
  Unichain: 'under $0.10 of gas',
  Linea: 'about $0.30 of gas',
  Scroll: 'about $0.40 of gas',
  Mantle: 'about $0.10 of gas',
  Katana: 'about $0.10 of gas',
  Flare: 'about $0.10 of gas',
  Stellar: 'under $0.01 of gas',
  Bitcoin: 'about $3 of gas',
  TAC: 'about $0.20 of gas',
  Hemi: 'about $0.20 of gas',
  Sei: 'about $0.10 of gas',
  Ink: 'about $0.10 of gas',
  Starknet: 'about $0.30 of gas',
  'Plume Mainnet': 'about $0.10 of gas',
};

/** The gas phrase for a protocol's first chain, or a neutral one. */
function gasFor(chain: string): string {
  return CHAIN_GAS[chain] ?? 'about $2 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 250_000_000) return 100;
  if (p.tvl_usd >= 50_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: a younger protocol needs a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The action a category's farmers take, with the capital and the chain the record gives them. */
export function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('curator') || c.includes('allocator')) return `deposit $${capital} into one of ${name}'s curator vaults on ${chain} and keep the vault shares`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) return `supply $${capital} of USDC to ${name} on ${chain}, borrow a small amount against it and repay on time`;
  if (c.includes('dex') || c.includes('swap')) return `provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the LP receipt`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis') || c.includes('perp')) return `deposit $${capital} of USDC as margin on ${name} and open one small hedged position`;
  if (c.includes('rwa')) return `mint $${capital} of the yield asset ${name} issues on ${chain} and hold it`;
  if (c.includes('yield') || c.includes('farm') || c.includes('vault')) return `deposit $${capital} into ${name}'s vault on ${chain} and keep the position open`;
  if (c.includes('staking') || c.includes('restak')) return `stake $${capital} of ${chain}'s staking asset through ${name} and keep the receipt token`;
  if (c.includes('bridge')) return `bridge $${capital} of USDC to ${chain} through ${name} and use the funds inside its app`;
  if (c.includes('stable')) return `mint $${capital} of ${name}'s stable asset on ${chain} against collateral and hold it`;
  if (c.includes('insurance')) return `buy $${capital} of cover from ${name} on ${chain} and keep the policy active`;
  if (c.includes('prediction')) return `fund $${capital} on ${name} and place one market position`;
  if (c.includes('payment')) return `route $${capital} of payments through ${name} on ${chain} and keep the receipts`;
  if (c.includes('governance') || c.includes('incentive')) return `lock $${capital} worth of the protocol's asset in ${name}'s governance module for one epoch`;
  if (c.includes('index')) return `mint $${capital} of ${name}'s index on ${chain} and keep the basket`;
  return `deposit $${capital} of USDC into ${name} on ${chain} and keep the position open`;
}

/** The weekly qualifying action a category's farmers repeat. */
export function weeklyFor(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield') || c.includes('vault') || c.includes('farm')) return 'a deposit into or out of a vault';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) return 'a small borrow, a repay or a supply';
  if (c.includes('dex') || c.includes('swap')) return 'a swap or a liquidity add';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis') || c.includes('perp')) return 'a small hedge, closed and reopened';
  if (c.includes('rwa')) return 'a mint or a redemption';
  if (c.includes('staking') || c.includes('restak')) return 'a stake or a restake';
  if (c.includes('bridge')) return 'a bridge in or out';
  if (c.includes('stable')) return 'a mint or a repay';
  if (c.includes('insurance')) return 'a cover purchase';
  return 'a deposit or a swap';
}

/**
 * A protocol's farm plan: five steps, each an action with a cost and a time, all of them derived
 * from the protocol's own record (category, first chain, TVL, age) rather than a list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const capital = capitalFor(p);
  const gas = gasFor(chain);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Open a fresh wallet on ${chain} that will hold only this farm position, and keep its recovery phrase offline.`,
      cost: `${gas} for the first transaction`,
      time: '10 minutes',
    },
    {
      text: `Then ${actionFor(p, capital, chain)}.`,
      cost: `$${capital} of capital and ${gas}`,
      time: '20 minutes to set up',
    },
    {
      text: `Repeat one qualifying action every week (${weeklyFor(p.category)}) so the address shows a record, not a single deposit.`,
      cost: `${gas} a week`,
      time: '15 minutes a week',
    },
    {
      text: `Leave the position open for at least ${hold} days so the activity lands in more than one snapshot before you withdraw.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Open ${p.name}'s own points or rewards page before withdrawing, claim only from the link the protocol publishes itself, and write the transaction hash into your farm log.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** A step as one string, inside the gate's 20 to 600 characters: its action, cost and time. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 595)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n and a farm plan each. */
export function buildBoard(snapshot: Snapshot, index: CompIndex, model: ModelConstants = MODEL): BoardRow[] {
  const watchlist = new Set(snapshot.watchlist);
  const scored = selectUniverse(snapshot).map((p) => ({ p, v: valueOf(p, snapshot.as_of, index, model) }));
  // A total order, so two runs of the program write the same bytes: implied value first, then the
  // larger protocol, then the slug.
  scored.sort((a, b) => scalarOrder(a.v.implied, b.v.implied) || scalarOrder(a.p.tvl_usd, b.p.tvl_usd) || byText(a.p.slug, b.p.slug));
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
    watchlisted: watchlist.has(s.p.slug),
    below_floor: s.p.tvl_usd < snapshot.floor_usd,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      comp_multiple: s.v.compMultiple,
      comp_sample: s.v.compGroup.sample,
      comp_source: s.v.compGroup.source,
      comp_key: s.v.compGroup.key,
      momentum_multiplier: round6(s.v.momentum),
      maturity_multiplier: round6(s.v.maturity),
      growth_pct: round4(s.v.growthPct),
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A number's place in a descending sort: -1, 0 or 1, never the subtraction of two large numbers. */
function scalarOrder(a: number, b: number): number {
  return a === b ? 0 : a > b ? -1 : 1;
}

/** The token-bearing protocols the market prices, by market cap: evidence, never ranked rows. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || byText(a.slug, b.slug))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
      ratio: round6((p.mcap_usd as number) / p.tvl_usd),
    }));
}

/** A board row as the page reads it. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    comp_multiple: row.model.comp_multiple,
    comp_sample: row.model.comp_sample,
    comp_source: row.model.comp_source,
    comp_key: row.model.comp_key,
    momentum_multiplier: row.model.momentum_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    growth_pct: row.model.growth_pct,
    watchlisted: row.watchlisted,
    below_floor: row.below_floor,
    verdict: verdictOf(row),
    farm_steps: row.farm_steps,
  };
}

/**
 * Score the model on the protocols it must not price from themselves: every token-bearing protocol
 * is predicted once with its own reading removed from the multiple index, and compared to the market
 * cap it actually carries. The miss is `max(predicted/actual, actual/predicted)`, so 1 is exact and
 * larger is worse. The same check is split by listing date, and a residual band fitted on the oldest
 * third is then held against the newer protocols it never saw.
 */
export function holdoutOf(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const checked = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => {
      const index = buildCompIndex(snapshot.protocols.filter((q) => q.slug !== p.slug));
      const valuation = valueOf(p, snapshot.as_of, index, model);
      const ratio = valuation.implied / (p.mcap_usd as number);
      return { slug: p.slug, listed: p.listed_at, ratio, miss: ratio >= 1 ? ratio : 1 / ratio, own: valuation.compGroup.source === 'category' };
    });
  const misses = checked.map((r) => r.miss);
  const share = (set: number[], limit: number): number => (set.length === 0 ? 0 : set.filter((v) => v <= limit).length / set.length);
  const medianOf = (set: number[]): number => (set.length === 0 ? 0 : median(set));

  const dated = checked
    .filter((r) => r.listed !== null)
    .sort((a, b) => byText(a.listed as string, b.listed as string) || byText(a.slug, b.slug));
  const third = Math.floor(dated.length / 3);
  const slices: Array<[string, typeof dated]> = [
    ['oldest', dated.slice(0, third)],
    ['older', dated.slice(third, third * 2)],
    ['newer', dated.slice(third * 2)],
  ];
  const eras: EraCheck[] = slices.map(([label, set]) => ({
    label,
    n: set.length,
    from: set[0]?.listed ?? '',
    to: set[set.length - 1]?.listed ?? '',
    median_miss: round4(medianOf(set.map((r) => r.miss))),
    within_2x: round4(share(set.map((r) => r.miss), 2)),
  }));

  const inBand = (set: typeof dated, low: number, high: number): number => (set.length === 0 ? 0 : set.filter((r) => r.ratio >= low && r.ratio <= high).length / set.length);
  const oldest = slices[0][1];
  const ratios = oldest.map((r) => r.ratio).sort((a, b) => a - b);
  const pick = (t: number): number => {
    if (ratios.length === 0) return 1;
    const pos = (ratios.length - 1) * t;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return lo === hi ? ratios[lo]! : ratios[lo]! + (ratios[hi]! - ratios[lo]!) * (pos - lo);
  };
  const low = round4(pick(0.1));
  const high = round4(pick(0.9));
  const newer = slices.slice(1).flatMap(([, set]) => set);
  return {
    n: checked.length,
    median_miss: round4(medianOf(misses)),
    within_2x: round4(share(misses, 2)),
    within_3x: round4(share(misses, 3)),
    eras,
    range: {
      fit_on: `the ${oldest.length} oldest protocols`,
      n_fit: oldest.length,
      low,
      high,
      holds: round4(inBand(newer, low, high)),
    },
    holds_newest: round4(inBand(slices[2][1], low, high)),
    own_category_share: round4(checked.length === 0 ? 0 : checked.filter((r) => r.own).length / checked.length),
  };
}

/** Everything the page renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const index = buildCompIndex(snapshot.protocols);
  const board = buildBoard(snapshot, index, model);
  const comps: Record<string, ComparableGroup> = {};
  for (const key of [...index.keys()].sort(byText)) comps[key] = index.get(key)!;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    counts: {
      protocols: snapshot.protocols.length,
      ranked: board.length,
      watchlist: snapshot.watchlist.length,
      below_floor: board.filter((r) => r.below_floor).length,
      token_bearing: index.get('snapshot:all')!.sample,
    },
    comps,
    rows: board.map(radarRow),
    live: liveRows(snapshot),
    validation: holdoutOf(snapshot, model),
  };
  return { board, radar };
}

// ---------------------------------------------------------------- the snapshot, the check, the data

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
  const protocols = o.protocols.map((value, i) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = value as Record<string, unknown>;
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
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/**
 * Why the board is not one the gate will take, or null. The program refuses its own output before
 * writing it, so a bad board never reaches the grader: coverage, ranks, order, a board that ranks
 * nothing, and the shape of every farm plan.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (slugs.size !== board.length) return 'a slug appears on the board more than once';
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value, so the board ranks nothing`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const trimmed = s.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${r.slug} has a farm step of ${trimmed.length} characters`;
    }
  }
  return null;
}

/** The page's whole dataset as one script: data.js sits beside dashboard/ and the page loads it. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
