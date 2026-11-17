'use strict';
(function () {
  const d = window.RADAR;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (n, digits = 2) => n == null ? 'n/a' : n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const usd = n => (n < 0 ? '−$' : '$') + number(Math.abs(n));
  const compact = n => '$' + (n >= 1e9 ? number(n / 1e9) + 'B' : n >= 1e6 ? number(n / 1e6) + 'M' : n >= 1e3 ? number(n / 1e3, 1) + 'K' : number(n));
  const badge = verdict => '<span class="badge ' + esc(verdict) + '">' + esc(verdict) + '</span>';
  const params = new URLSearchParams(location.hash.slice(1));
  let selected = params.get('slug') || d.rows[0].slug;
  $('asof').textContent = d.as_of;
  $('source').textContent = d.source;
  $('facts').innerHTML = [[d.counts.ranked, 'Pre-token protocols'], [d.counts.watchlist, 'Watchlist covered'], [d.counts.below_floor, 'Below the $50M floor'], [d.counts.token_bearing, 'Market comparables']].map(([n, label]) => '<div class="fact"><strong>' + n + '</strong><span>' + label + '</span></div>').join('');
  const v = d.validation;
  $('validation').textContent = 'Tested curve leave-one-out: n=' + v.n + ' comparables, median |error| ' + number(v.median_absolute_error) + '×, ' + number(v.within_2x_pct, 0) + '% within 2×';
  $('baseline').textContent = 'Median predicted / actual: ' + number(v.median_predicted_to_actual) + '× (1.00 = perfect). Median-only LOO baseline error: ' + number(v.median_baseline_error) + '×. Lower error is better; a size curve is not assumed to win.';
  $('curves').innerHTML = Object.entries(d.curves).map(([family, c]) => '<div class="curve"><strong>' + esc(family) + ' <span>n=' + c.n + '</span></strong>' + (c.method === 'least squares' ? '<code>a ' + number(c.a, 3) + '<br>b ' + number(c.b, 3) + '</code>' : '<code>median ' + number(c.median, 3) + '×</code>') + '<small>' + esc(c.method) + '</small></div>').join('');
  $('family-validation').innerHTML = '<table class="validation-table"><thead><tr><th>Family</th><th>n</th><th>Median LOO</th><th>Curve LOO</th><th>Board uses</th></tr></thead><tbody>' + Object.entries(v.families).map(([f, x]) => '<tr><td>' + esc(f) + '</td><td>' + x.n + '</td><td>' + number(x.median_error) + '</td><td>' + number(x.curve_error) + '</td><td>' + esc(x.chosen) + '</td></tr>').join('') + '</tbody></table>';
  $('gas-table').textContent = Object.entries(d.gas_table).map(([c, n]) => c + ' ' + usd(n)).join(' · ') + ' · Unlisted chains ' + usd(d.assumptions.unknown_chain_gas) + ' (fallback).';
  for (const [id, values] of [['cat', d.rows.map(r => r.category || 'Uncategorized')], ['chain', d.rows.flatMap(r => r.chains)]]) {
    [...new Set(values)].sort().forEach(value => { const o = document.createElement('option'); o.value = value; o.textContent = value; $(id).append(o); });
  }
  ['q', 'cat', 'chain', 'verdict', 'sort'].forEach(id => { if (params.has(id)) $(id).value = params.get(id); });
  $('wl').checked = params.get('wl') === '1';
  function equation(label, value, total) { return '<div class="equation' + (total ? ' total' : '') + '"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>'; }
  function detail(r) {
    if (!r) { $('detail').innerHTML = '<div class="block">No protocol selected.</div>'; return; }
    const m = r.model, e = r.farm, c = d.curves[r.family], a = d.assumptions;
    const cv = d.validation.families[r.family];
    $('detail').innerHTML = '<div class="dhead"><div class="eyebrow">03 / Protocol worksheet · #' + r.rank + '</div><h3>' + esc(r.name) + '</h3><p class="meta">' + esc(r.category || 'Uncategorized') + ' · ' + esc(e.chain) + (r.watchlisted ? ' · Watchlist' : ' · Below floor') + '</p></div>' +
      '<section class="block"><h4>Implied token value</h4>' + equation('Snapshot TVL', usd(r.tvl_usd)) + equation('Selected multiple · n=' + c.n, number(m.comp_multiple, 4) + '×') + equation('Momentum', number(m.momentum_multiplier, 4) + '×') + equation('Maturity · age ' + (r.age_days === null ? 'unknown → 365d' : r.age_days + 'd'), number(m.maturity_multiplier, 4) + '×') + equation('Implied value (rounded)', usd(r.implied_value_usd), true) +
      '<p class="formula">' + (m.comp_source === 'least squares' ? 'clamp(' + number(c.a, 5) + ' + (' + number(c.b, 5) + ') × log10(' + number(r.tvl_usd, 0) + '), 0.05, 2.50)' : esc(m.comp_source) + ': ' + number(m.comp_multiple, 5) + '× (clamped to [0.05, 2.50])') + '</p><p>' + esc(r.family) + ' family. LOO n=' + cv.n + ', median LOO ' + number(cv.median_error) + '×; curve LOO ' + number(cv.curve_error) + '×. Board uses ' + esc(cv.chosen) + '.' + (m.extrapolated ? ' Outside the family training size range; this is an extrapolation.' : '') + '</p></section>' +
      '<section class="block"><h4>Net-of-gas verdict ' + badge(e.verdict) + '</h4>' +
      equation('Airdrop pool · implied × 0.5%', usd(e.pool_usd)) + equation('Equal allocation · pool / 10,000', usd(e.conditional_allocation_usd)) + equation('Expected value · allocation × 25%', usd(e.expected_value_usd)) +
      equation('Gas · ' + e.transactions + ' tx × ' + usd(e.gas_per_tx_usd), '−' + usd(e.gas_usd)) + equation('Protocol fees · capital × 0.3%', '−' + usd(e.fees_usd)) + equation('Capital × 5% × ' + e.hold_days + '/365', '−' + usd(e.opportunity_cost_usd)) + equation('Net expected value', usd(e.net_value_usd), true) +
      '<p><strong>Capital required: ' + usd(e.capital_usd) + '</strong> held for ' + e.hold_days + ' days, plus ' + usd(e.gas_usd + e.fees_usd) + ' fee reserve. Principal is not subtracted as an expense; it remains at risk. The opportunity cost is subtracted.</p>' +
      '<p>Gas count: 2 entry + ' + e.weeks + ' weekly + 1 withdrawal + 1 claim = ' + e.transactions + ' transactions on ' + esc(e.chain) + (e.gas_is_fallback ? ' (unknown-chain $2 fallback)' : '') + '. Start already funded on this chain. No bridging fee included.</p>' +
      '<p>Scenario assumptions: ' + number(a.pool_share * 100, 1) + '% total airdrop pool, ' + number(a.participants, 0) + ' equal participants, ' + number(a.probability * 100, 0) + '% chance of launch and eligibility. Your effective share is 0.0000125% of implied value. Calculations use unrounded values before rounding each dollar component to cents. This is a scenario EV, not an empirical forecast.</p>' +
      '<p><strong>' + e.verdict.toUpperCase() + ':</strong> ' + (e.verdict === 'farm' ? 'Net ≥ $5 and expected value ≥ 2 × total costs.' : e.verdict === 'thin' ? 'Positive net, but less than $5 or less than twice costs.' : 'Expected value does not cover gas, fees and capital cost.') + ' No principal-loss allowance or labor cost is included.</p></section>' +
      '<section class="block"><h4>Five-step farm plan</h4><ol>' + r.farm_steps.map(t => { const at = t.indexOf(' Cost:'); return '<li>' + esc(t.slice(0, at)) + '<span class="step-cost">' + esc(t.slice(at + 1)) + '</span></li>'; }).join('') + '</ol></section>';
  }
  function render() {
    const q = $('q').value.toLowerCase().trim();
    const rows = d.rows.filter(r => (!q || [r.name, r.slug, ...r.chains].join(' ').toLowerCase().includes(q)) && (!$('cat').value || (r.category || 'Uncategorized') === $('cat').value) && (!$('chain').value || r.chains.includes($('chain').value)) && (!$('verdict').value || r.farm.verdict === $('verdict').value) && (!$('wl').checked || r.watchlisted));
    const sort = $('sort').value;
    rows.sort((a, b) => (sort === 'name' ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : sort === 'net' ? b.farm.net_value_usd - a.farm.net_value_usd : b[sort] - a[sort]) || a.rank - b.rank);
    if (!rows.some(r => r.slug === selected)) selected = rows[0]?.slug || '';
    $('count').textContent = rows.length + ' / ' + d.rows.length + ' protocols';
    $('empty').hidden = rows.length > 0;
    $('rows').innerHTML = rows.map(r => '<tr data-slug="' + esc(r.slug) + '" class="' + (r.slug === selected ? 'selected' : '') + '"><td class="rank">' + r.rank + '</td><td><button type="button" aria-label="View ' + esc(r.name) + '" aria-pressed="' + (r.slug === selected) + '">' + esc(r.name) + '</button><small>' + esc(r.category || 'Uncategorized') + (r.watchlisted ? ' · W' : '') + '</small></td><td class="num">' + compact(r.tvl_usd) + '</td><td class="num">' + number(r.model.comp_multiple) + '<small>' + esc(r.family) + '</small></td><td class="num"><strong>' + compact(r.implied_value_usd) + '</strong></td><td>' + badge(r.farm.verdict) + '</td><td class="num">' + usd(r.farm.net_value_usd) + '</td></tr>').join('');
    detail(rows.find(r => r.slug === selected));
    const next = new URLSearchParams();
    ['q', 'cat', 'chain', 'verdict'].forEach(id => { if ($(id).value) next.set(id, $(id).value); });
    next.set('sort', sort); if ($('wl').checked) next.set('wl', '1'); if (selected) next.set('slug', selected);
    history.replaceState(null, '', '#' + next.toString());
  }
  ['q', 'cat', 'chain', 'verdict', 'sort', 'wl'].forEach(id => $(id).addEventListener(id === 'q' ? 'input' : 'change', render));
  $('rows').addEventListener('click', event => { const row = event.target.closest('tr[data-slug]'); if (row) { selected = row.dataset.slug; render(); } });
  render();
})();
