/* Token Radar — the page's behaviour: five filters, a sortable board, and a detail view that shows
   where every implied value comes from. No framework, no fetch, no network: all of it is the
   dataset the builder wrote to data.js from the same model that wrote board.json. */

(function () {
  'use strict';

  var D = window.RADAR;
  if (!D) return;

  // ---------------------------------------------------------------- formatting

  var NF = new Intl.NumberFormat('en-US');

  function money(n) {
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  function dollars(n) { return '$' + NF.format(Math.round(n)); }

  function pct(x) { return (x * 100).toFixed(1) + '%'; }

  function mult(x) { return '\u00d7' + x.toFixed(4); }

  function change(n) {
    if (n === null || n === undefined) return '<span class="sub">no reading</span>';
    var up = n >= 0;
    return '<span class="chg ' + (up ? 'up' : 'down') + '">' + (up ? '\u25b2' : '\u25bc') + ' ' +
      Math.abs(n).toFixed(1) + '%</span>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
  }

  function chainsLine(chains) {
    if (!chains || chains.length === 0) return 'no chain listed';
    var shown = chains.slice(0, 3).join(', ');
    return chains.length > 3 ? shown + ' +' + (chains.length - 3) : shown;
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // ---------------------------------------------------------------- state

  var state = { q: '', cat: 'all', chain: 'all', sort: 'implied', desc: true, wl: false, live: false, slug: null, verdict: 'all' };

  var BOARD_SORT = { implied: true, tvl: true, change: true, comp: true, age: true, name: false };
  var LIVE_SORT = { mcap: true, tvl: true, ratio: true, change: true, name: false };

  function readHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var p = new URLSearchParams(raw);
    if (p.has('q')) state.q = p.get('q');
    if (p.has('cat')) state.cat = p.get('cat');
    if (p.has('chain')) state.chain = p.get('chain');
    if (p.has('sort')) state.sort = p.get('sort');
    if (p.has('dir')) state.desc = p.get('dir') !== 'asc';
    if (p.has('verdict')) state.verdict = p.get('verdict');
    state.wl = p.get('wl') === '1';
    state.live = p.get('live') === '1';
    if (p.has('slug')) state.slug = p.get('slug');
  }

  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat !== 'all') p.set('cat', state.cat);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (!state.desc) p.set('dir', 'asc');
    if (state.verdict !== 'all') p.set('verdict', state.verdict);
    if (state.wl) p.set('wl', '1');
    if (state.live) p.set('live', '1');
    if (state.slug) p.set('slug', state.slug);
    var next = p.toString();
    var url = window.location.pathname + window.location.search + (next ? '#' + next : '');
    window.history.replaceState(null, '', url);
  }

  // ---------------------------------------------------------------- the dataset, indexed once

  var rows = D.rows;
  var live = D.live;

  var categoryCounts = {};
  var chainCounts = {};
  rows.forEach(function (r) {
    var c = r.category || 'no category';
    categoryCounts[c] = (categoryCounts[c] || 0) + 1;
    r.chains.forEach(function (ch) { chainCounts[ch] = (chainCounts[ch] || 0) + 1; });
  });

  var categories = Object.keys(categoryCounts).sort();
  var chains = Object.keys(chainCounts).sort(function (a, b) {
    return chainCounts[b] - chainCounts[a] || (a < b ? -1 : 1);
  });

  // ---------------------------------------------------------------- rendering: the figures

  function renderFacts() {
    var V = D.validation;
    var total = 0;
    var farm = 0;
    var marginal = 0;
    var own = 0;
    rows.forEach(function (r) {
      total += r.implied_value_usd;
      if (r.verdict === 'FARM') farm++;
      else if (r.verdict === 'MARGINAL') marginal++;
      if (r.comp_source === 'category') own++;
    });
    var facts = [
      [String(D.counts.ranked), 'protocols ranked', D.counts.protocols + ' read \u00b7 ' + D.counts.below_floor + ' below the ' + money(D.floor_usd) + ' floor'],
      [money(total), 'implied value on the board', 'summed over the ranked rows'],
      ['\u00d7' + V.median_miss.toFixed(2), 'out-of-sample miss', 'leave-one-out over ' + V.n + ' token-bearing protocols'],
      [pct(V.within_2x), 'within 2\u00d7 of the market', Math.round(V.within_2x * V.n) + ' of ' + V.n + ' held out and scored'],
      [pct(V.range.holds), 'range holds out of sample', 'band fitted on the oldest ' + V.range.n_fit + ', held on newer'],
      [String(farm), 'worth farming', marginal + ' marginal \u00b7 ' + own + ' own-category']
    ];
    document.getElementById('facts').innerHTML = facts.map(function (f) {
      return '<div class="fact"><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span><em>' + esc(f[2]) + '</em></div>';
    }).join('');
  }

  // ---------------------------------------------------------------- rendering: the method and the check

  function renderProof() {
    var V = D.validation;
    var M = D.model;
    var band = '\u00d7' + V.range.low.toFixed(2) + ' to \u00d7' + V.range.high.toFixed(2);
    document.getElementById('checktag').textContent = 'leave-one-out \u00b7 n=' + V.n;
    document.getElementById('checkline').innerHTML =
      'Median miss <b>\u00d7' + V.median_miss.toFixed(2) + '</b>: ' + pct(V.within_2x) + ' of the ' + V.n +
      ' token-bearing protocols land within 2\u00d7 of their market cap and ' + pct(V.within_3x) + ' within 3\u00d7. ' +
      'A band of ' + band + ' fitted on the oldest ' + V.range.n_fit + ' holds <b>' + pct(V.range.holds) +
      '</b> of the newer protocols it never saw (' + pct(V.holds_newest) + ' of the newest third alone).';
    document.querySelector('#validation tbody').innerHTML = V.eras.map(function (e) {
      return '<tr><td>' + esc(e.label) + ' <span class="sub">' + esc(e.from) + ' \u2192 ' + esc(e.to) + '</span></td>' +
        '<td class="num">' + e.n + '</td><td class="num">\u00d7' + e.median_miss.toFixed(2) + '</td>' +
        '<td class="num">' + pct(e.within_2x) + '</td></tr>';
    }).join('');
    document.getElementById('method').innerHTML =
      '<h2>How the radar is built</h2>' +
      '<ol>' +
      '<li><b>One sealed snapshot, one multiple.</b> ' + D.counts.protocols + ' protocols read once; the multiple is the median market-cap \u00f7 TVL of the token-bearing protocols in this same snapshot; a category under ' +
      M.min_sample + ' readings borrows its family\u2019s, then the snapshot\u2019s; clamped to ' + M.comp_min + '\u2013' + M.comp_max + '.</li>' +
      '<li><b>The value and the rank.</b> TVL \u00d7 multiple \u00d7 (1 + ' + M.momentum_weight + ' \u00d7 the 7-day change clamped to \u00b1' + M.momentum_clamp_pct +
      '%) \u00d7 (' + M.maturity_floor + ' + ' + M.maturity_range + ' \u00d7 age \u00f7 ' + M.maturity_days + ' days), highest first \u2014 a total order on the snapshot\u2019s own figures, so the value never rises down the board.</li>' +
      '<li><b>Not used.</b> No network, no hand-picked names, no wall clock, no per-protocol exception: one function scores every row.</li>' +
      '</ol>';
  }

  function renderStamp() {
    document.getElementById('asof').textContent = D.as_of;
    var fetched = (D.source.match(/fetched\s+(\S+)/) || [])[1] || '';
    document.getElementById('stampsrc').textContent = 'DefiLlama protocol index' + (fetched ? ' \u00b7 ' + fetched : '');
    document.getElementById('footsrc').textContent =
      'Source: ' + D.source + ' \u2014 frozen for this competition and read once per run.';
  }

  // ---------------------------------------------------------------- rendering: filters

  function renderFilters() {
    var cat = document.getElementById('cat');
    cat.innerHTML = '<option value="all">All categories</option>' + categories.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    cat.value = categoryCounts[state.cat] ? state.cat : 'all';
    if (cat.value === 'all' && state.cat !== 'all') state.cat = 'all';

    var chain = document.getElementById('chain');
    chain.innerHTML = '<option value="all">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    chain.value = chainCounts[state.chain] ? state.chain : 'all';
    if (chain.value === 'all' && state.chain !== 'all') state.chain = 'all';

    document.getElementById('q').value = state.q;
    document.getElementById('sort').value = sortKeyForMode();
    document.getElementById('verdict').value = state.verdict;
    document.getElementById('wl').setAttribute('aria-pressed', state.wl ? 'true' : 'false');
    document.getElementById('live').setAttribute('aria-pressed', state.live ? 'true' : 'false');
  }

  function sortKeyForMode() {
    var allowed = state.live ? LIVE_SORT : BOARD_SORT;
    return allowed[state.sort] === undefined ? (state.live ? 'mcap' : 'implied') : state.sort;
  }

  // ---------------------------------------------------------------- rendering: the table

  var BOARD_COLUMNS = [
    { label: '#', num: true, sort: null },
    { label: 'Protocol', num: false, sort: 'name' },
    { label: 'TVL', num: true, sort: 'tvl' },
    { label: '7d', num: true, sort: 'change' },
    { label: 'Comparables', num: true, sort: 'comp' },
    { label: 'Implied value', num: true, sort: 'implied' },
    { label: 'Verdict', num: false, sort: null }
  ];

  var LIVE_COLUMNS = [
    { label: '#', num: true, sort: null },
    { label: 'Token-bearing protocol', num: false, sort: 'name' },
    { label: 'TVL', num: true, sort: 'tvl' },
    { label: 'Market cap', num: true, sort: 'mcap' },
    { label: 'MCap \u00f7 TVL', num: true, sort: 'ratio' },
    { label: '7d', num: true, sort: 'change' }
  ];

  function matches(row) {
    if (state.wl && !state.live && !row.watchlisted) return false;
    if (state.verdict !== 'all' && !state.live && row.verdict !== state.verdict) return false;
    if (state.cat !== 'all' && (row.category || 'no category') !== state.cat) return false;
    if (state.chain !== 'all' && (row.chains || []).indexOf(state.chain) < 0) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      var hay = (row.name + ' ' + row.slug + ' ' + (row.category || '') + ' ' + (row.chains || []).join(' ')).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  function compareText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function sortBoard(list) {
    var key = sortKeyForMode();
    var dir = state.desc ? -1 : 1;
    return list.slice().sort(function (a, b) {
      var d = 0;
      if (key === 'name') d = compareText(a.name.toLowerCase(), b.name.toLowerCase());
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'change') d = (a.change_7d === null ? -999 : a.change_7d) - (b.change_7d === null ? -999 : b.change_7d);
      else if (key === 'comp') d = a.comp_multiple - b.comp_multiple;
      else if (key === 'age') d = (a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days);
      else d = a.implied_value_usd - b.implied_value_usd;
      if (d !== 0) return d * dir;
      // A total order inside every tie, so the table never reshuffles between renders.
      return (b.implied_value_usd - a.implied_value_usd) || (b.tvl_usd - a.tvl_usd) || compareText(a.slug, b.slug);
    });
  }

  function sortLive(list) {
    var key = sortKeyForMode();
    var dir = state.desc ? -1 : 1;
    return list.slice().sort(function (a, b) {
      var d = 0;
      if (key === 'name') d = compareText(a.name.toLowerCase(), b.name.toLowerCase());
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'ratio') d = a.ratio - b.ratio;
      else if (key === 'change') d = (a.change_7d === null ? -999 : a.change_7d) - (b.change_7d === null ? -999 : b.change_7d);
      else d = a.mcap_usd - b.mcap_usd;
      if (d !== 0) return d * dir;
      return (b.mcap_usd - a.mcap_usd) || compareText(a.slug, b.slug);
    });
  }

  function renderHead() {
    var columns = state.live ? LIVE_COLUMNS : BOARD_COLUMNS;
    var active = sortKeyForMode();
    document.getElementById('head').innerHTML = columns.map(function (c) {
      var cls = (c.num ? 'num' : '') + (c.sort !== null && c.sort === active ? ' on' : '');
      var dir = c.sort !== null && c.sort === active ? '<span class="dir">' + (state.desc ? '\u2193' : '\u2191') + '</span>' : '';
      var attr = c.sort !== null ? ' data-sort="' + c.sort + '"' : '';
      return '<th class="' + cls.trim() + '"' + attr + '>' + c.label + dir + '</th>';
    }).join('');
  }

  function compSub(row) {
    if (row.comp_source === 'category') return 'n=' + row.comp_sample;
    if (row.comp_source === 'family') return 'n=' + row.comp_sample + ' \u00b7 ' + row.comp_key.replace('family:', '') + ' family';
    return 'n=' + row.comp_sample + ' \u00b7 whole snapshot';
  }

  function renderBoardRows(list, shown, viewMax) {
    var body = document.getElementById('rows');
    if (list.length === 0) {
      body.innerHTML = '';
      return;
    }
    body.innerHTML = list.map(function (r) {
      var width = Math.max(2, Math.round((r.implied_value_usd / viewMax) * 104));
      var borrowed = r.comp_source !== 'category' ? ' borrow' : '';
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0"' + (r.slug === shown ? ' class="on"' : '') + '>' +
        '<td class="rk">' + r.rank + '</td>' +
        '<td class="who"><div class="nm">' + esc(r.name) + '</div><div class="sub">' + esc(r.category || 'no category') +
        ' \u00b7 ' + esc(chainsLine(r.chains)) + '</div></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + change(r.change_7d) + '</td>' +
        '<td class="num"><span class="cmp">' + mult(r.comp_multiple) + '</span>' +
        '<div class="cmp-sub' + borrowed + '">' + esc(compSub(r)) + '</div></td>' +
        '<td class="num"><div class="impl"><b>' + money(r.implied_value_usd) + '</b>' +
        '<span class="bar" style="width:' + width + 'px"></span></div></td>' +
        '<td class="vd"><span class="vb vb-' + r.verdict.toLowerCase() + '">' + r.verdict + '</span></td>' +
        '</tr>';
    }).join('');
  }

  function renderLiveRows(list, shown) {
    var body = document.getElementById('rows');
    if (list.length === 0) {
      body.innerHTML = '';
      return;
    }
    body.innerHTML = list.slice(0, 400).map(function (r, i) {
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0"' + (r.slug === shown ? ' class="on"' : '') + '>' +
        '<td class="rk">' + (i + 1) + '</td>' +
        '<td class="who"><div class="nm">' + esc(r.name) + '</div><div class="sub">' + esc(r.category || 'no category') +
        ' \u00b7 ' + esc(chainsLine(r.chains)) + '</div></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num"><span class="cmp">' + mult(r.ratio) + '</span></td>' +
        '<td class="num">' + change(r.change_7d) + '</td>' +
        '</tr>';
    }).join('');
  }

  // ---------------------------------------------------------------- rendering: the detail panel

  function compParagraph(row) {
    var cat = row.category || 'no category';
    var own = D.comps[cat];
    var ownN = own ? own.sample : 0;
    var group = D.comps[row.comp_key];
    var note = '';
    if (row.comp_source === 'category') {
      note = 'Measured, not assumed: the median market-cap \u00f7 TVL of the ' +
        plural(ownN, 'token-bearing ' + cat + ' protocol', 'token-bearing ' + cat + ' protocols') +
        ' in this snapshot.';
    } else if (row.comp_source === 'family') {
      note = '<em>Borrowed.</em> ' + cat + ' records only ' + plural(ownN, 'token-bearing protocol', 'token-bearing protocols') +
        ', under the five a median needs, so this row takes the ' + row.comp_key.replace('family:', '') +
        ' family median over ' + plural(row.comp_sample, 'reading', 'readings') + '.';
    } else {
      note = '<em>Borrowed twice.</em> ' + cat + ' and its family each record under five token-bearing protocols, so this row takes the median over all ' +
        plural(row.comp_sample, 'token-bearing protocol', 'token-bearing protocols') + ' in the snapshot.';
    }
    if (group && Math.abs(group.median - row.comp_multiple) > 0.0000005) {
      note += ' The raw median of ' + group.median.toFixed(4) + ' is clamped to the model\u2019s ' +
        row.comp_multiple.toFixed(2) + ' boundary.';
    }
    return note;
  }

  function renderStep(step) {
    var at = step.indexOf(' Cost: ');
    var text = at < 0 ? step : step.slice(0, at);
    var rest = at < 0 ? '' : step.slice(at + 7);
    var timeAt = rest.indexOf('. Time: ');
    var cost = timeAt < 0 ? rest : rest.slice(0, timeAt);
    var time = timeAt < 0 ? '' : rest.slice(timeAt + 8).replace(/\.$/, '');
    return '<li><div class="step-text">' + esc(text) + '</div>' +
      '<div class="step-meta">' + esc(cost) + (time ? ' \u00b7 ' + esc(time) : '') + '</div></li>';
  }

  function renderDetail(row, index, total) {
    var panel = document.getElementById('detail');
    if (!row) {
      panel.innerHTML = '<div class="dhead"><div class="deyebrow">No selection</div><h2>\u2014</h2></div>';
      return;
    }

    if (state.live) {
      var catGroup = D.comps[row.category || 'no category'];
      panel.innerHTML =
        '<div class="dhead"><div class="deyebrow">Token-bearing \u00b7 not ranked</div>' +
        '<h2>' + esc(row.name) + '</h2>' +
        '<div class="dmeta">' + esc(row.category || 'no category') + '<span class="sep">/</span>' + esc(chainsLine(row.chains)) + '</div></div>' +
        '<div class="eq">' +
        '<div class="eqrow"><span>TVL at the snapshot</span><b>' + money(row.tvl_usd) + '</b></div>' +
        '<div class="eqrow"><span>Market cap</span><b>' + money(row.mcap_usd) + '</b></div>' +
        '<div class="eqrow"><span>Market-cap \u00f7 TVL</span><b>' + mult(row.ratio) + '</b></div>' +
        (catGroup ? '<div class="eqrow"><span>' + esc(row.category) + ' median</span><b>' + mult(catGroup.median) + '</b></div>' : '') +
        '<div class="eqrow total"><span>Seven-day TVL change</span><b>' + change(row.change_7d) + '</b></div>' +
        '</div>' +
        '<p class="note">This protocol already records a token, so the market \u2014 not the model \u2014 prices it. ' +
        'Rows like this one are the evidence behind every multiple on the board; they are never ranked.</p>';
      return;
    }

    var borrowed = row.comp_source !== 'category';
    var pctTitle = row.change_7d === null ? 'no seven-day reading' : row.change_7d.toFixed(1) + '% in seven days';
    panel.innerHTML =
      '<div class="dhead">' +
      '<div class="deyebrow">Rank ' + row.rank + ' of ' + total + '\u2003\u00b7\u2003' +
      (row.watchlisted ? 'house watchlist' : 'below the floor, on the radar') + '</div>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<div class="dmeta">' + esc(row.category || 'no category') + '<span class="sep">/</span>' + esc(chainsLine(row.chains)) + '</div>' +
      '</div>' +
      '<div class="eq">' +
      '<div class="eqrow"><span>TVL at the snapshot</span><b>' + money(row.tvl_usd) + '</b></div>' +
      '<div class="eqrow"><span>\u00d7 comparables multiple' + (borrowed ? ' (borrowed)' : '') + '</span><b>' + mult(row.comp_multiple) + '</b></div>' +
      '<div class="eqrow"><span>\u00d7 momentum \u00b7 ' + esc(pctTitle) + '</span><b>' + mult(row.momentum_multiplier) + '</b></div>' +
      '<div class="eqrow"><span>\u00d7 maturity \u00b7 ' + (row.age_days === null ? 'unknown age, scored as ' + D.model.unknown_age_days + ' days' : plural(row.age_days, 'day', 'days') + ' tracked') + '</span><b>' + mult(row.maturity_multiplier) + '</b></div>' +
      '<div class="eqrow total"><span>= implied value</span><b>' + money(row.implied_value_usd) + '</b></div>' +
      '</div>' +
      '<p class="note">' + compParagraph(row) +
      ' A value this board claims for the token a protocol may issue; it is the entry\u2019s own estimate, never make.fun\u2019s.</p>' +
      '<div class="sect"><h3>Farm plan \u00b7 five steps</h3><ol class="steps">' +
      row.farm_steps.map(renderStep).join('') +
      '</ol></div>' +
      comparablesTable(row);
  }

  function comparablesTable(row) {
    var group = D.comps[row.comp_key];
    if (!group) return '';
    var shown = group.readings.slice(0, 8);
    var body = shown.map(function (c) {
      return '<tr><td class="nm2">' + esc(c.name) + '</td>' +
        '<td class="num">' + mult(c.ratio) + '</td>' +
        '<td class="num">' + money(c.mcap_usd) + '</td></tr>';
    }).join('');
    var more = group.sample > shown.length
      ? '<p class="more">Showing the ' + shown.length + ' widest of ' + plural(group.sample, 'reading', 'readings') + '.</p>'
      : '';
    return '<div class="sect"><h3>Comparables \u00b7 ' + esc(group.label) + ' \u00b7 n=' + group.sample + '</h3>' +
      '<table class="comps"><thead><tr><th>Protocol</th><th class="num">MCap \u00f7 TVL</th><th class="num">Market cap</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table>' + more + '</div>';
  }

  // ---------------------------------------------------------------- render

  function render() {
    var list = (state.live ? live : rows).filter(matches);
    var sorted = state.live ? sortLive(list) : sortBoard(list);

    // The detail follows the selection while it stays visible, else the first visible row. The board
    // marks that same row, so the list and the panel never disagree about what is being explained.
    var shown = null;
    for (var i = 0; i < sorted.length; i++) if (sorted[i].slug === state.slug) shown = sorted[i];
    if (!shown) shown = sorted[0] || null;
    var shownSlug = shown === null ? null : shown.slug;

    renderHead();
    // The implied-value bars are drawn against the largest value on screen, so a filtered view still
    // shows its own spread instead of twelve dashes against a global maximum.
    var viewMax = 1;
    for (var m = 0; m < sorted.length; m++) viewMax = Math.max(viewMax, sorted[m].implied_value_usd || 1);
    if (state.live) renderLiveRows(sorted, shownSlug);
    else renderBoardRows(sorted, shownSlug, viewMax);

    document.getElementById('empty').hidden = sorted.length !== 0;
    document.getElementById('banner').hidden = !state.live;
    document.getElementById('banner').textContent = state.live
      ? 'These ' + D.counts.token_bearing + ' protocols already record a token, so the market prices them: they are the evidence behind every multiple on the board, and they are never ranked.'
      : '';

    var count = document.getElementById('count');
    count.innerHTML = '<b>' + sorted.length + '</b> of ' + (state.live ? live.length : rows.length) + ' shown' +
      (state.live ? '' : ' \u00b7 <b>' + D.counts.watchlist + '</b> on the watchlist');

    renderDetail(shown, sorted.indexOf(shown), sorted.length);
    document.getElementById('sort').value = sortKeyForMode();
  }

  function update(patch, rerender) {
    Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
    writeHash();
    if (rerender !== false) render();
  }

  // ---------------------------------------------------------------- wiring

  readHash();

  document.getElementById('q').addEventListener('input', function (e) {
    update({ q: e.target.value.trim() }, false);
    render();
  });

  document.getElementById('cat').addEventListener('change', function (e) { update({ cat: e.target.value }); });
  document.getElementById('chain').addEventListener('change', function (e) { update({ chain: e.target.value }); });

  document.getElementById('verdict').addEventListener('change', function (e) {
    update({ verdict: e.target.value });
  });

  document.getElementById('sort').addEventListener('change', function (e) {
    var key = e.target.value;
    var allowed = state.live ? LIVE_SORT : BOARD_SORT;
    update({ sort: key, desc: allowed[key] === undefined ? true : allowed[key] });
  });

  document.getElementById('wl').addEventListener('click', function () {
    update({ wl: !state.wl });
  });

  document.getElementById('live').addEventListener('click', function () {
    var next = !state.live;
    var allowed = next ? LIVE_SORT : BOARD_SORT;
    var sort = allowed[state.sort] === undefined ? (next ? 'mcap' : 'implied') : state.sort;
    update({ live: next, sort: sort, desc: allowed[sort] === undefined ? true : allowed[sort] });
  });

  document.getElementById('head').addEventListener('click', function (e) {
    var th = e.target.closest('th');
    if (!th || !th.dataset.sort) return;
    var key = th.dataset.sort;
    var same = key === sortKeyForMode();
    update({ sort: key, desc: same ? !state.desc : true });
  });

  document.getElementById('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (!tr || !tr.dataset.slug) return;
    update({ slug: tr.dataset.slug });
  });

  document.getElementById('rows').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var tr = e.target.closest('tr');
    if (!tr || !tr.dataset.slug) return;
    e.preventDefault();
    update({ slug: tr.dataset.slug });
  });

  window.addEventListener('hashchange', function () {
    readHash();
    renderFilters();
    render();
  });

  renderFacts();
  renderStamp();
  renderProof();
  renderFilters();
  render();
})();

