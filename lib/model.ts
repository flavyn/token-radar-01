// Deterministic snapshot model. No external prices, runtime clock or network.
export interface Protocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number | null; change_7d: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot {
  as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[];
}
type Comparable = { slug: string; family: string; x: number; actual: number };
export const FAMILIES = ['lending', 'trading', 'bridge', 'staking', 'rwa', 'yield', 'stablecoin', 'insurance', 'other'];
const WORDS = [ ['lend', 'cdp', 'collateral', 'credit'], ['dex', 'swap', 'perpetual', 'derivative', 'basis', 'perp'], ['bridge'], ['staking', 'restak'], ['rwa'], ['yield', 'farm', 'vault', 'curator', 'allocator', 'strateg'], ['stable'], ['insurance'] ];
export function familyOf(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  const i = WORDS.findIndex(words => words.some(word => c.includes(word)));
  return FAMILIES[i < 0 ? 8 : i];
}
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function median(ns: number[]): number {
  const a = [...ns].sort((a, b) => a - b), n = a.length;
  return n ? (a[Math.floor((n - 1) / 2)] + a[Math.floor(n / 2)]) / 2 : 0.05;
}
export function fit(points: Comparable[], all: Comparable[]) {
  const n = points.length;
  const meanX = n ? points.reduce((s, p) => s + p.x, 0) / n : 0;
  const meanY = n ? points.reduce((s, p) => s + p.actual, 0) / n : 0;
  const xx = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  const xy = points.reduce((s, p) => s + (p.x - meanX) * (p.actual - meanY), 0);
  const b = xx > 1e-12 ? xy / xx : 0, a = meanY - b * meanX;
  const fitted = n >= 8 && xx > 1e-12 && Number.isFinite(a) && Number.isFinite(b);
  return { n, method: fitted ? 'least squares' : n ? 'family median' : 'snapshot median', a: fitted ? a : 0, b: fitted ? b : 0,
    median: median((n ? points : all).map(p => p.actual)), min_log_tvl: n ? Math.min(...points.map(p => p.x)) : null,
    max_log_tvl: n ? Math.max(...points.map(p => p.x)) : null };
}
export function predict(curve: ReturnType<typeof fit>, x: number): number {
  return clamp(curve.method === 'least squares' ? curve.a + curve.b * x : curve.median, 0.05, 2.50);
}
export function validate(comps: Comparable[]) {
  const predictions = comps.map(held => {
    // Remove the held observation from every source, including sparse-family fallback.
    const train = comps.filter(p => p.slug !== held.slug);
    const curve = fit(train.filter(p => p.family === held.family), train);
    const predicted = predict(curve, held.x);
    const baseline = clamp(median((train.filter(p => p.family === held.family).length ? train.filter(p => p.family === held.family) : train).map(p => p.actual)), 0.05, 2.5);
    return { slug: held.slug, family: held.family, actual: held.actual, predicted, predicted_to_actual: predicted / held.actual,
      absolute_error: Math.abs(predicted - held.actual), median_baseline_error: Math.abs(baseline - held.actual), method: curve.method, training_n: curve.n };
  });
  const summarize = (ps: typeof predictions) => ({ n: ps.length,
    median_absolute_error: ps.length ? median(ps.map(p => p.absolute_error)) : null,
    median_predicted_to_actual: ps.length ? median(ps.map(p => p.predicted_to_actual)) : null,
    within_2x_pct: ps.length ? 100 * ps.filter(p => p.predicted_to_actual >= 0.5 && p.predicted_to_actual <= 2).length / ps.length : null,
    median_baseline_error: ps.length ? median(ps.map(p => p.median_baseline_error)) : null });
  return { ...summarize(predictions), families: Object.fromEntries(FAMILIES.map(f => {
    const scores = summarize(predictions.filter(p => p.family === f));
    return [f, { ...scores, median_error: scores.median_baseline_error, curve_error: scores.median_absolute_error,
      chosen: scores.n < 8 ? 'snapshot median' : scores.median_absolute_error! < scores.median_baseline_error! ? 'curve' : 'family median' }];
  })), predictions };
}
// Fixed scenario dollars per transaction, not live fee quotes. Unknown chains use $2.
export const GAS: Record<string, number> = { Ethereum: 6, Base: 0.25, Arbitrum: 0.25, Optimism: 0.25, Polygon: 0.10, Solana: 0.05, Sui: 0.05, Aptos: 0.05, Binance: 0.30, Avalanche: 0.40, Bitcoin: 3, 'Hyperliquid L1': 0.10, Plasma: 0.10, Sonic: 0.10, Berachain: 0.10, Unichain: 0.10, Linea: 0.30, Scroll: 0.40, Mantle: 0.10, Katana: 0.10, Starknet: 0.30, 'Plume Mainnet': 0.10 };
export const FARM = { pool_share: 0.005, participants: 10000, probability: 0.25, annual_capital_cost: 0.05, fee_fraction: 0.003, unknown_chain_gas: 2 };
const cents = (n: number) => Math.round(n * 100) / 100;
export function economics(p: Protocol, implied: number, age: number | null) {
  const chain = p.chains[0] ?? 'Unknown chain', gasUnit = GAS[chain] ?? FARM.unknown_chain_gas;
  const capital = p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 250e6 ? 100 : p.tvl_usd >= 50e6 ? 75 : 50;
  const days = age === null ? 45 : age < 180 ? 60 : age < 365 ? 45 : 30;
  const weeks = Math.ceil(days / 7), transactions = 2 + weeks + 2;
  const gas = cents(gasUnit * transactions), fees = cents(capital * FARM.fee_fraction);
  const opportunity = cents(capital * FARM.annual_capital_cost * days / 365);
  const pool = cents(implied * FARM.pool_share), allocation = cents(pool / FARM.participants);
  const expected = cents(implied * FARM.pool_share / FARM.participants * FARM.probability);
  const costs = cents(gas + fees + opportunity), net = cents(expected - costs);
  const verdict = net <= 0 ? 'skip' : net >= 5 && expected >= costs * 2 ? 'farm' : 'thin';
  return { chain, capital_usd: capital, hold_days: days, weeks, transactions, gas_per_tx_usd: gasUnit, gas_usd: gas, fees_usd: fees,
    opportunity_cost_usd: opportunity, pool_usd: pool, conditional_allocation_usd: allocation, expected_value_usd: expected,
    total_cost_usd: costs, net_value_usd: net, verdict, gas_is_fallback: GAS[chain] === undefined };
}
export function farmSteps(p: Protocol, e: ReturnType<typeof economics>): string[] {
  const family = familyOf(p.category);
  const actions: Record<string, string> = { lending: 'supply an unlevered position', trading: 'provide liquidity to an established pool', bridge: 'bridge funds and use the destination app', staking: 'stake the supported asset', rwa: 'check eligibility and mint the supported asset', yield: 'deposit in a documented vault', stablecoin: 'open a conservatively collateralized mint position', insurance: 'check cover terms before buying a policy', other: 'use the documented core deposit or payment action' };
  const money = (n: number) => `$${n.toFixed(2)}`;
  return [
    `Check ${p.name}'s official eligibility rules and asset risks on ${e.chain}; do not proceed if the selected action is unavailable. Cost: $0. Time: 15 minutes.`,
    `Use ${money(e.capital_usd)} on ${p.name} to ${actions[family]}; budget two entry transactions on ${e.chain}. Cost: ${money(e.capital_usd)} capital plus ${money(2 * e.gas_per_tx_usd)} gas. Time: 20 minutes.`,
    `Repeat one small supported core action weekly, keeping receipts; budget ${e.weeks} transactions in total, without wash trading or leverage. Cost: ${money(e.weeks * e.gas_per_tx_usd)} gas across ${e.weeks} weeks. Time: 10 minutes per week.`,
    `Keep the position for ${e.hold_days} days and monitor withdrawal conditions; capital remains at risk and eligibility is unconfirmed. Cost: ${money(e.opportunity_cost_usd)} opportunity cost plus ${money(e.fees_usd)} estimated protocol fees. Time: ${e.hold_days} days.`,
    `Exit the position and, only if eligible, claim from ${p.name}'s verified rewards page; budget two transactions including the claim. Cost: ${money(2 * e.gas_per_tx_usd)} gas. Time: 15 minutes.`
  ];
}
const EXCLUDED = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
export function selectUniverse(s: Snapshot): Protocol[] {
  const watch = new Set(s.watchlist);
  return s.protocols.filter(p => watch.has(p.slug) || (p.tvl_usd < s.floor_usd && p.mcap_usd === null && p.gecko_id === null && p.symbol === null
    && !EXCLUDED.has(p.category ?? '') && !/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)
    && !['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'].some(x => p.name.toLowerCase().startsWith(x))
    && !/\b(wrapped|staked|staking)\b/.test(p.name.toLowerCase())));
}
export function buildRadar(s: Snapshot) {
  const comps: Comparable[] = s.protocols.filter(p => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0)
    .map(p => ({ slug: p.slug, family: familyOf(p.category), x: Math.log10(p.tvl_usd), actual: p.mcap_usd! / p.tvl_usd }));
  const curves = Object.fromEntries(FAMILIES.map(f => [f, fit(comps.filter(p => p.family === f), comps)]));
  const validation = validate(comps);
  const snapshotMedian = median(comps.map(p => p.actual));
  const board = selectUniverse(s).map(p => {
    const family = familyOf(p.category), curve = curves[family];
    const chosen = validation.families[family].chosen;
    const estimator = chosen === 'curve' ? curve : { ...curve, method: chosen, median: chosen === 'snapshot median' ? snapshotMedian : curve.median };
    const age = p.listed_at && Number.isFinite(Date.parse(p.listed_at)) ? Math.max(0, Math.floor((Date.parse(s.as_of) - Date.parse(p.listed_at)) / 86400000)) : null;
    const multiple = predict(estimator, Math.log10(Math.max(1, p.tvl_usd)));
    const momentum = 1 + 0.75 * clamp(p.change_7d ?? 0, -40, 40) / 100;
    const maturity = 0.7 + 0.3 * clamp(age ?? 365, 0, 1095) / 1095;
    const implied = clamp(Math.round(p.tvl_usd * multiple * momentum * maturity), 1, 1e14);
    const farm = economics(p, implied, age);
    return { ...p, rank: 0, family, age_days: age, token_status: 'pre-token', watchlisted: s.watchlist.includes(p.slug), below_floor: p.tvl_usd < s.floor_usd,
      implied_value_usd: implied, model: { comp_multiple: multiple, comp_sample: curve.n, comp_source: estimator.method, momentum_multiplier: momentum, maturity_multiplier: maturity,
        extrapolated: chosen === 'curve' && curve.min_log_tvl !== null && (Math.log10(Math.max(1, p.tvl_usd)) < curve.min_log_tvl || Math.log10(Math.max(1, p.tvl_usd)) > curve.max_log_tvl!) },
      farm, farm_steps: farmSteps(p, farm) };
  }).sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  board.forEach((r, i) => { r.rank = i + 1; });
  return { board, radar: { as_of: s.as_of, source: s.source, floor_usd: s.floor_usd, model_version: 'radar-3', curves,
    validation, assumptions: FARM, gas_table: GAS,
    counts: { protocols: s.protocols.length, ranked: board.length, watchlist: s.watchlist.length, below_floor: board.filter(r => r.below_floor).length, token_bearing: comps.length }, rows: board } };
}
export function boardIssue(board: ReturnType<typeof buildRadar>['board'], s: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return 'row count outside 100..4000';
  const slugs = new Set(board.map(r => r.slug));
  if (slugs.size !== board.length || s.watchlist.some(slug => !slugs.has(slug))) return 'duplicate slug or missing watchlist';
  if (board[0].implied_value_usd === board[board.length - 1].implied_value_usd) return 'identical values';
  for (const [i, r] of board.entries()) {
    if (r.rank !== i + 1 || !Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd < 1 || (i > 0 && r.implied_value_usd > board[i - 1].implied_value_usd)) return 'invalid rank or value';
    if (r.farm_steps.length !== 5 || r.farm_steps.some(t => t !== t.trim() || t.length < 20 || t.length > 600 || !/ Cost: .+\. Time: .+\.$/.test(t))) return 'invalid farm plan';
  }
  return null;
}
export function parseSnapshot(text: string): Snapshot {
  const s = JSON.parse(text) as Snapshot;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.as_of) || !Number.isFinite(Date.parse(s.as_of)) || !Array.isArray(s.protocols) || !Array.isArray(s.watchlist) || !Number.isFinite(s.floor_usd)) throw Error('Invalid snapshot');
  const slugs = new Set<string>();
  for (const p of s.protocols) {
    if (!p.slug || !p.name || slugs.has(p.slug) || !Number.isFinite(p.tvl_usd) || !Array.isArray(p.chains)) throw Error('Invalid or duplicate protocol');
    slugs.add(p.slug);
  }
  return s;
}
export function dataScript(radar: ReturnType<typeof buildRadar>['radar']): string {
  return `window.RADAR=${JSON.stringify(radar).replace(/</g, '\\u003c')};\n`;
}
