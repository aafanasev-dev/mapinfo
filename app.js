(() => {
  'use strict';

  // ---------- State & URL ----------
  const DEFAULTS = { u: '', a: 'ffffcc', b: 'bd0026', n: 'd3d3d3' };
  const HEX = /^[0-9a-f]{6}$/i;

  const state = { ...DEFAULTS, data: new Map() }; // data: key -> number

  function parseHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    state.u = (params.get('u') || DEFAULTS.u).slice(0, 20);
    for (const k of ['a', 'b', 'n']) {
      const v = params.get(k);
      state[k] = v && HEX.test(v) ? v.toLowerCase() : DEFAULTS[k];
    }
    state.data = new Map();
    const d = params.get('d');
    if (d) {
      for (const pair of d.split(',')) {
        const i = pair.lastIndexOf(':');
        if (i <= 0) continue;
        const key = pair.slice(0, i);
        const val = Number(pair.slice(i + 1));
        if (Number.isFinite(val)) state.data.set(key, val);
      }
    }
  }

  function buildHash() {
    const parts = [];
    if (state.u !== DEFAULTS.u) parts.push('u=' + encodeURIComponent(state.u));
    for (const k of ['a', 'b', 'n']) {
      if (state[k] !== DEFAULTS[k]) parts.push(k + '=' + state[k]);
    }
    if (state.data.size) {
      const d = [...state.data].map(([k, v]) => k + ':' + v).join(',');
      parts.push('d=' + d);
    }
    return parts.join('&');
  }

  function saveHash() {
    const h = buildHash();
    const url = location.pathname + location.search + (h ? '#' + h : '');
    history.replaceState(null, '', url);
  }

  // ---------- Formatting ----------
  const numFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
  const fmt = v => numFmt.format(v) + (state.u ? ' ' + state.u : '');
  const shortFmt = v => {
    const s = Math.abs(v) >= 1e4
      ? d3.format('.3~s')(v).replace('G', 'B')
      : numFmt.format(+v.toPrecision(4));
    return s + (state.u ? ' ' + state.u : '');
  };

  // ---------- Map setup ----------
  const svg = d3.select('#map');
  const root = svg.append('g');
  const sphereG = root.append('path').attr('class', 'sphere');
  const countriesG = root.append('g');
  const labelsG = root.append('g');

  const projection = d3.geoEqualEarth();
  const path = d3.geoPath(projection);
  let features = [];
  let transform = d3.zoomIdentity;
  let editing = false;
  let selectedKey = null;

  const keyOf = f => f.id != null
    ? String(parseInt(f.id, 10))
    : f.properties.name.toLowerCase().replace(/[^a-z]/g, '');

  const zoom = d3.zoom()
    .scaleExtent([1, 12])
    .on('zoom', ev => {
      transform = ev.transform;
      root.attr('transform', transform);
      updateLabels();
    });
  svg.call(zoom).on('dblclick.zoom', null);

  // Largest polygon of a (multi)polygon feature: used for label placement.
  function mainPart(f) {
    const g = f.geometry;
    if (g.type !== 'MultiPolygon') return f;
    let best = null, bestArea = -1;
    for (const coords of g.coordinates) {
      const part = { type: 'Polygon', coordinates: coords };
      const a = path.area(part);
      if (a > bestArea) { bestArea = a; best = part; }
    }
    return best;
  }

  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    svg.attr('viewBox', [0, 0, w, h]);
    projection.fitExtent([[10, 10], [w - 10, h - 10]], { type: 'FeatureCollection', features });
    sphereG.attr('d', path({ type: 'Sphere' }));
    countriesG.selectAll('path').attr('d', path);
    for (const f of features) {
      const part = mainPart(f);
      f._centroid = path.centroid(part);
      const [[x0], [x1]] = path.bounds(part);
      f._width = x1 - x0;
    }
    zoom.extent([[0, 0], [w, h]]).translateExtent([[0, 0], [w, h]]);
    render();
  }

  // ---------- Rendering ----------
  function colorScale() {
    const vals = [...state.data.values()];
    const min = d3.min(vals), max = d3.max(vals);
    const interp = d3.interpolateRgb('#' + state.a, '#' + state.b);
    const fn = v => interp(max === min ? 0.5 : (v - min) / (max - min));
    return { min, max, fn };
  }

  function textColor(fill) {
    const c = d3.rgb(fill);
    const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return lum > 0.55 ? '#111827' : '#ffffff';
  }

  function render() {
    const { min, max, fn } = colorScale();
    const noData = '#' + state.n;

    countriesG.selectAll('path')
      .attr('fill', f => state.data.has(f._key) ? fn(state.data.get(f._key)) : noData)
      .classed('selected', f => f._key === selectedKey);

    const withData = features.filter(f => state.data.has(f._key));
    labelsG.selectAll('text')
      .data(withData, f => f._key)
      .join('text')
      .attr('class', 'label')
      .attr('x', f => f._centroid[0])
      .attr('y', f => f._centroid[1])
      .text(f => shortFmt(state.data.get(f._key)))
      .each(function (f) {
        const fill = fn(state.data.get(f._key));
        const tc = textColor(fill);
        d3.select(this)
          .attr('fill', tc)
          .attr('stroke', tc === '#ffffff' ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.6)');
      });
    updateLabels();

    // Legend
    const legend = document.getElementById('legend');
    legend.hidden = state.data.size === 0;
    const grad = `linear-gradient(to right, #${state.a}, #${state.b})`;
    document.getElementById('legend-bar').style.background = grad;
    document.getElementById('panel-gradient').style.background = grad;
    if (state.data.size) {
      document.getElementById('legend-min').textContent = fmt(min);
      document.getElementById('legend-max').textContent = fmt(max);
    }
    document.getElementById('legend-nodata-swatch').style.background = noData;
  }

  function updateLabels() {
    const k = transform.k;
    const fontPx = 11;
    labelsG.selectAll('text')
      .attr('font-size', fontPx / k)
      .attr('stroke-width', 2.5 / k)
      .attr('display', function (f) {
        const textW = this.textContent.length * fontPx * 0.62;
        return f._width * k >= textW ? null : 'none';
      });
  }

  // ---------- Tooltip ----------
  const tooltip = document.getElementById('tooltip');
  function showTooltip(ev, f) {
    const v = state.data.get(f._key);
    tooltip.textContent = f.properties.name + ': ' + (v === undefined ? 'no data' : fmt(v));
    tooltip.hidden = false;
    const x = Math.min(ev.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8);
    const y = Math.min(ev.clientY + 14, window.innerHeight - tooltip.offsetHeight - 8);
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  // ---------- Edit panel ----------
  const editBtn = document.getElementById('edit-btn');
  const panel = document.getElementById('panel');
  const unitsInput = document.getElementById('units');
  const colorInputs = { a: 'color-a', b: 'color-b', n: 'color-n' };

  function syncPanel() {
    unitsInput.value = state.u;
    for (const [k, id] of Object.entries(colorInputs)) {
      document.getElementById(id).value = '#' + state[k];
    }
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    panel.hidden = !on;
    editBtn.textContent = on ? 'Done' : 'Edit';
    if (!on) closePopup();
    else syncPanel();
  }

  editBtn.addEventListener('click', () => setEditing(!editing));

  unitsInput.addEventListener('input', () => {
    state.u = unitsInput.value.trim();
    saveHash();
    render();
  });

  for (const [k, id] of Object.entries(colorInputs)) {
    document.getElementById(id).addEventListener('input', ev => {
      state[k] = ev.target.value.slice(1).toLowerCase();
      saveHash();
      render();
    });
  }

  document.getElementById('reset-colors-btn').addEventListener('click', () => {
    state.a = DEFAULTS.a; state.b = DEFAULTS.b; state.n = DEFAULTS.n;
    syncPanel(); saveHash(); render();
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    if (!state.data.size) return;
    state.data.clear();
    closePopup(); saveHash(); render();
    toast('All data cleared');
  });

  document.getElementById('copy-btn').addEventListener('click', async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Link copied');
  });

  // ---------- Value popup ----------
  const popup = document.getElementById('popup');
  const popupInput = document.getElementById('popup-input');

  function openPopup(ev, f) {
    selectedKey = f._key;
    document.getElementById('popup-name').textContent = f.properties.name;
    document.getElementById('popup-unit').textContent = state.u;
    const v = state.data.get(f._key);
    popupInput.value = v === undefined ? '' : String(v);
    popupInput.classList.remove('invalid');
    popup.hidden = false;
    const x = Math.min(ev.clientX + 10, window.innerWidth - popup.offsetWidth - 8);
    const y = Math.min(ev.clientY + 10, window.innerHeight - popup.offsetHeight - 8);
    popup.style.left = Math.max(8, x) + 'px';
    popup.style.top = Math.max(8, y) + 'px';
    popupInput.focus();
    popupInput.select();
    render();
  }

  function closePopup() {
    if (popup.hidden) return;
    popup.hidden = true;
    selectedKey = null;
    render();
  }

  function setValue(key, raw) {
    const s = raw.trim().replace(/\s/g, '').replace(',', '.');
    if (s === '') {
      state.data.delete(key);
    } else {
      const v = Number(s);
      if (!Number.isFinite(v)) return false;
      state.data.set(key, v);
    }
    saveHash();
    return true;
  }

  document.getElementById('popup-form').addEventListener('submit', ev => {
    ev.preventDefault();
    if (!setValue(selectedKey, popupInput.value)) {
      popupInput.classList.add('invalid');
      return;
    }
    closePopup();
  });

  document.getElementById('popup-remove').addEventListener('click', () => {
    setValue(selectedKey, '');
    closePopup();
  });

  popupInput.addEventListener('input', () => popupInput.classList.remove('invalid'));

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') closePopup();
  });

  // Click on empty map area closes the popup.
  svg.on('click', ev => {
    if (ev.target.tagName !== 'path' || !ev.target.classList.contains('country')) closePopup();
  });

  // ---------- Init ----------
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 1500);
  }

  parseHash();

  d3.json('vendor/countries-110m.json').then(topo => {
    features = topojson.feature(topo, topo.objects.countries).features
      .filter(f => f.properties.name !== 'Antarctica');
    for (const f of features) f._key = keyOf(f);

    countriesG.selectAll('path')
      .data(features)
      .join('path')
      .attr('class', 'country')
      .on('mousemove', showTooltip)
      .on('mouseleave', () => { tooltip.hidden = true; })
      .on('click', (ev, f) => {
        if (!editing) return;
        ev.stopPropagation();
        tooltip.hidden = true;
        openPopup(ev, f);
      });

    layout();
  });

  window.addEventListener('resize', () => { if (features.length) layout(); });
  window.addEventListener('hashchange', () => {
    parseHash();
    if (editing) syncPanel();
    render();
  });
})();
