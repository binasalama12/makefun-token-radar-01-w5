// Momentum Radar dashboard: renders window.RADAR (written by main.ts).
// Views from the URL: ?view=board (default), ?view=detail&slug=<slug>,
// ?view=filtered&f=<text>. No network: all data is local.
(function () {
  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.getElementById('meta').textContent = 'No radar data loaded.';
    return;
  }
  var rows = R.rows.slice();
  var params = new URLSearchParams(location.search);
  var view = params.get('view') || 'board';
  var slugParam = params.get('slug') || '';
  var filterParam = params.get('f') || '';

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function arrow(g) {
    if (g == null) return '—';
    if (g > 0) return '▲ +' + g.toFixed(1) + '%';
    if (g < 0) return '▼ ' + g.toFixed(1) + '%';
    return '— 0.0%';
  }
  function momClass(g) {
    if (g == null || g === 0) return 'mom flat';
    return g > 0 ? 'mom up' : 'mom down';
  }

  var meta = document.getElementById('meta');
  meta.textContent = 'Snapshot ' + R.as_of + ' · ' + R.board_size + ' rows · watchlist ' +
    R.watchlist_size + ' · early pre-token rows ' + R.early_size + ' · floor ' + money(R.floor_usd);
  document.getElementById('modelLine').textContent =
    'Growth-first model ' + R.model_version + ': implied = TVL × 0.25 × (1 + 7d change × 1.2) × age weight. ' +
    'The momentum column decides the order more than size does.';

  var cats = [];
  rows.forEach(function (r) {
    var c = r.category || 'Uncategorised';
    if (cats.indexOf(c) < 0) cats.push(c);
  });
  cats.sort();
  var catSel = document.getElementById('cat');
  cats.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c; catSel.appendChild(o);
  });

  var q = document.getElementById('q');
  var sortSel = document.getElementById('sort');
  var toggle = document.getElementById('growthToggle');
  var growthOn = false;

  if (view === 'filtered' && filterParam) {
    var low = filterParam.toLowerCase();
    var hitCat = cats.filter(function (c) { return c.toLowerCase() === low; })[0];
    if (hitCat) { catSel.value = hitCat; } else { q.value = filterParam; }
  }

  function sortRows(list) {
    var k = growthOn ? 'growth' : sortSel.value;
    var copy = list.slice();
    if (k === 'growth') copy.sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); });
    else if (k === 'tvl') copy.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (k === 'age') copy.sort(function (a, b) { return (b.age_days || 0) - (a.age_days || 0); });
    else copy.sort(function (a, b) { return a.rank - b.rank; });
    return copy;
  }

  function renderBoard() {
    var text = q.value.trim().toLowerCase();
    var cat = catSel.value;
    var list = rows.filter(function (r) {
      if (cat && (r.category || 'Uncategorised') !== cat) return false;
      if (!text) return true;
      var hay = (r.name + ' ' + (r.category || '') + ' ' + r.slug + ' ' + r.chains.join(' ')).toLowerCase();
      return hay.indexOf(text) >= 0;
    });
    list = sortRows(list);
    var tb = document.getElementById('rows');
    tb.innerHTML = '';
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="num">' + r.rank + '</td><td><strong>' + esc(r.name) + '</strong><br><span class="pill">pre-token</span></td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 3).join(', ')) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="' + momClass(r.change_7d) + '">' + arrow(r.change_7d) + '</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td>';
      tr.addEventListener('click', function () {
        location.search = '?view=detail&slug=' + encodeURIComponent(r.slug);
      });
      tb.appendChild(tr);
    });
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' protocols shown.';
  }

  function renderDetail() {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slugParam) r = x; });
    document.getElementById('boardView').hidden = true;
    document.getElementById('controls').style.display = 'none';
    var dv = document.getElementById('detailView');
    dv.hidden = false;
    var box = document.getElementById('detail');
    if (!r) {
      box.innerHTML = '<div class="card"><h2>Protocol not found</h2><p>No board row has slug ' + esc(slugParam) + '.</p></div>';
      return;
    }
    var steps = (r.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    box.innerHTML =
      '<div class="card"><h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p><span class="tag">pre-token</span><span class="tag">' + esc(r.category || 'Uncategorised') + '</span>' +
      '<span class="tag">' + esc(r.chains.join(', ')) + '</span></p>' +
      '<div class="facts">' +
      '<div><span>Implied value</span><b>' + money(r.implied_value_usd) + '</b></div>' +
      '<div><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div>' +
      '<div><span>Momentum (7d)</span><b>' + arrow(r.change_7d) + '</b></div>' +
      '<div><span>Growth multiplier</span><b>×' + (r.model ? r.model.growth_multiplier : '—') + '</b></div>' +
      '<div><span>Age</span><b>' + (r.age_days == null ? 'unknown' : r.age_days + ' days') + '</b></div>' +
      '<div><span>Listed</span><b>' + esc(r.listed_at || '—') + '</b></div>' +
      '</div>' +
      '<p>Implied value = TVL × 0.25 × growth multiplier × maturity multiplier. Growth dominates: a fast-growing protocol outranks a larger flat one. The snapshot records no token for this protocol; that is a record, not proof it has none.</p>' +
      '<h3>How to farm it — one qualifying action every week</h3><ol>' + steps + '</ol></div>';
  }

  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (k === 'growth') { growthOn = true; }
      sortSel.value = k === 'growth' ? 'growth' : (k === 'tvl' ? 'tvl' : (k === 'name' ? 'rank' : 'rank'));
      if (k === 'rank' || k === 'name') growthOn = false;
      toggle.setAttribute('aria-pressed', String(growthOn));
      toggle.textContent = 'Growth-sorted: ' + (growthOn ? 'on' : 'off');
      renderBoard();
    });
  });
  toggle.addEventListener('click', function () {
    growthOn = !growthOn;
    if (growthOn) sortSel.value = 'growth';
    toggle.setAttribute('aria-pressed', String(growthOn));
    toggle.textContent = 'Growth-sorted: ' + (growthOn ? 'on' : 'off');
    renderBoard();
  });
  sortSel.addEventListener('change', function () { growthOn = sortSel.value === 'growth'; toggle.setAttribute('aria-pressed', String(growthOn)); toggle.textContent = 'Growth-sorted: ' + (growthOn ? 'on' : 'off'); renderBoard(); });
  q.addEventListener('input', renderBoard);
  catSel.addEventListener('change', renderBoard);

  if (view === 'detail') renderDetail();
  else renderBoard();
})();
