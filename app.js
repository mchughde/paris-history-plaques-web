// ============================================================
// Paris History Plaques — Wiki (adapted from Philosophy Wiki)
// Shows the English text and background note of each approved panel.
// The French is kept in panels.js for checking, but never shown (decided
// 25 November 2026). Reference notes are shown, folded, because the
// wiki is only for its author; the book never prints them.
// ============================================================

import { syncPanels, getPanel, getAllPanels, searchPanels } from './db.js';

// ── Loading panels ───────────────────────────────────────────
// On the Mac's own server, panels.js sits beside the app. On the website the
// panels live in a private GitHub repo and are read with a read-only access key
// kept in this browser only (stored under a "plaques." name, because every
// mchughde.github.io app shares the same browser storage).

const DATA_REPO = 'mchughde/paris-history-plaques';
const KEY_NAME  = 'plaques.accessKey';
const IS_LOCAL  = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);

function readKey()  { try { return localStorage.getItem(KEY_NAME) || ''; } catch { return ''; } }
function saveKey(k) { try { localStorage.setItem(KEY_NAME, k); } catch { /* private mode */ } }

function parsePanelsJs(text) {
  return JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
}

async function loadPanels() {
  if (IS_LOCAL) {
    const res = await fetch('./panels.js', { cache: 'no-store' });
    return { panels: parsePanelsJs(await res.text()) };
  }
  const key = readKey();
  if (!key) return { needKey: true };
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${DATA_REPO}/contents/panels.js`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/vnd.github.raw',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
  } catch {
    return { offline: true };
  }
  if (res.status === 401 || res.status === 404) {
    return { needKey: true, problem: "That access key didn't work, or it has expired. Please enter a new one." };
  }
  if (!res.ok) return { offline: true };
  return { panels: parsePanelsJs(await res.text()) };
}

function renderKeyScreen(problem) {
  document.getElementById('content').innerHTML = `
    <div class="key-screen">
      <h1>Paris History Plaques</h1>
      <p>${problem || 'The panels are private. Enter your access key to read them on this device.'}</p>
      <form id="key-form">
        <input id="key-input" type="password" autocomplete="off" spellcheck="false"
               placeholder="Access key" aria-label="Access key" required />
        <button type="submit">Open the wiki</button>
      </form>
      <p class="key-note">The key is kept in this browser only. You need to enter it once on each device.</p>
    </div>`;
  document.getElementById('key-form').addEventListener('submit', e => {
    e.preventDefault();
    saveKey(document.getElementById('key-input').value.trim());
    location.reload();
  });
}

// ── The series ───────────────────────────────────────────────
// Panels per arrondissement, counted from data/database.json on 25 November 2026
// (679 in all; no 8th arrondissement in the data). Includes the two unnumbered
// panels (4th: Libération de Paris; 9th: La Maison Dorée).

const VOLUMES = [
  { n: 1, arrs: [1, 2, 3, 4] },
  { n: 2, arrs: [5, 6, 7, 9] },
  { n: 3, arrs: [10, 11, 12, 13, 14, 15] },
  { n: 4, arrs: [16, 17, 18, 19, 20] },
];
const TOTALS = { 1: 39, 2: 55, 3: 39, 4: 33, 5: 62, 6: 40, 7: 36, 9: 35, 10: 33, 11: 33,
                 12: 10, 13: 58, 14: 19, 15: 20, 16: 36, 17: 30, 18: 39, 19: 23, 20: 39 };

const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
const arrName = n => `${ordinal(n)} arrondissement`;

// ── Helpers ───────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "(see Panel 9)" and "[see Panel 9]" link to that panel in the same
// arrondissement, if it has been written.
function linkCrossRefs(markdown, arr, slugs) {
  return markdown.replace(/see Panel (\d+)/g, (m, n) => {
    const slug = slugs.get(`${arr}-${n}`);
    return slug ? `[${m}](#panel:${slug})` : m;
  });
}

const md = text => marked.parse(text || '');

// ── Panel pictures ───────────────────────────────────────────
// On the Mac they're beside the app (photos/). On the website they live in the
// private repo with the panels, so they're fetched with the access key and kept on
// the device (Cache Storage) for offline reading. A replaced picture needs a new
// file name, or devices keep showing the old one.

const PHOTO_CACHE = 'plaques-photos';

async function photoUrl(file) {
  if (file.startsWith('http')) return file;
  if (IS_LOCAL) return `./photos/${file}`;
  const cacheKey = new Request(`./private-photos/${encodeURIComponent(file)}`);
  try {
    const cache = await caches.open(PHOTO_CACHE);
    let res = await cache.match(cacheKey);
    if (!res) {
      res = await fetch(`https://api.github.com/repos/${DATA_REPO}/contents/photos/${encodeURIComponent(file)}`, {
        headers: { Authorization: `Bearer ${readKey()}`, Accept: 'application/vnd.github.raw',
                   'X-GitHub-Api-Version': '2022-11-28' },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      await cache.put(cacheKey, res.clone());
    }
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;   // offline and not yet stored on this device
  }
}

// ── Where the panels stand (data/places.json) ────────────────
// Every panel's position, written or not, taken from the author's own Google My Maps
// (scripts/build_places.py). Private like the panels: read with the key on the website
// and kept on the device for offline use.

let PLACES = null;

async function loadPlaces() {
  if (PLACES) return PLACES;
  const cacheKey = new Request('./private-data/places.json');
  let res = null;
  try {
    res = IS_LOCAL
      ? await fetch('./data/places.json', { cache: 'no-store' })
      : await fetch(`https://api.github.com/repos/${DATA_REPO}/contents/data/places.json`, {
          headers: { Authorization: `Bearer ${readKey()}`, Accept: 'application/vnd.github.raw',
                     'X-GitHub-Api-Version': '2022-11-28' },
          cache: 'no-store',
        });
    if (res.ok && !IS_LOCAL) (await caches.open(PHOTO_CACHE)).put(cacheKey, res.clone());
  } catch { res = null; }
  if (!res || !res.ok) {
    try { res = await (await caches.open(PHOTO_CACHE)).match(cacheKey); } catch { res = null; }
  }
  PLACES = res ? await res.json() : [];
  return PLACES;
}

// Maps use the same engine and map style as Maperati (MapLibre, OpenFreeMap tiles from
// OpenStreetMap data). They need an internet connection; the text doesn't.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

function pinElement(label, written, size = 26) {
  const el = document.createElement('div');
  el.className = 'map-pin' + (written ? ' written' : '');
  el.style.width = el.style.height = `${size}px`;
  el.textContent = label;
  return el;
}

// Draw a map in `container` with numbered pins. pins: [{lat, lng, label, written, title, href}]
function drawMap(container, pins, { zoom = 16 } = {}) {
  if (typeof maplibregl === 'undefined') {
    container.innerHTML = '<p class="map-offline">The map needs an internet connection.</p>';
    return null;
  }
  const map = new maplibregl.Map({
    container, style: MAP_STYLE, attributionControl: false,
    center: [pins[0].lng, pins[0].lat], zoom, cooperativeGestures: PHONE,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }));   // the map style supplies its own credit
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  for (const p of pins) {
    const el = pinElement(p.label, p.written);
    el.title = p.title;
    if (p.href) { el.classList.add('link'); el.addEventListener('click', () => { location.hash = p.href; }); }
    const marker = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]);
    if (!p.href) marker.setPopup(new maplibregl.Popup({ offset: 14, closeButton: false })
      .setHTML(`<b>${escapeHtml(p.label)}. ${escapeHtml(p.title)}</b><br><span>Not yet written</span>`));
    marker.addTo(map);
  }
  if (pins.length > 1) {
    const b = new maplibregl.LngLatBounds();
    pins.forEach(p => b.extend([p.lng, p.lat]));
    map.fitBounds(b, { padding: 40, maxZoom: 17, duration: 0 });
  }
  return map;
}

// The arrondissement's panels as a Maperati map (its read-only view, as the
// Paris Parks walks guide uses), encoded the way Maperati's share.js does.
function maperatiLink(arr, places) {
  const stops = places.filter(p => p.lat != null).map(p =>
    [+p.lat.toFixed(5), +p.lng.toFixed(5), 0, 'monument', `${p.number ?? '–'}. ${p.title}`]);
  const payload = { v: 1, n: `Paris History Plaques — ${arrName(arr)}`, m: 'walking', t: '', r: '', s: stops };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `https://mchughde.github.io/maperati/v3/embed.html#${b64}`;
}

// The same pins as a GeoJSON file, which Maperati's Import can load for planning a walk.
function geojsonDownload(arr, places) {
  const fc = { type: 'FeatureCollection', features: places.filter(p => p.lat != null).map(p => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    properties: { name: `${p.number ?? '–'}. ${p.title}`, category: 'monument' } })) };
  return URL.createObjectURL(new Blob([JSON.stringify(fc, null, 1)], { type: 'application/geo+json' }));
}

// ── Render: one arrondissement (map + every panel) ────────────

async function renderArrondissement(arr) {
  const [places, panels] = await Promise.all([loadPlaces(), getAllPanels()]);
  const written = new Map(panels.filter(p => p.arrondissement === arr).map(p => [p.number, p]));
  const mine = places.filter(p => p.arrondissement === arr)
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  const vol = VOLUMES.find(v => v.arrs.includes(arr));
  const pinned = mine.filter(p => p.lat != null);

  const list = mine.map(p => {
    const w = p.number != null && written.get(p.number);
    const num = p.number ?? '–';
    const flag = p.lat == null ? ' <span class="no-pin">no map position yet</span>'
      : (p.check ? ' <span class="no-pin">position to check</span>' : '');
    return w
      ? `<li class="written"><a href="#panel:${w.slug}"><span class="panel-num">${num}.</span>${escapeHtml(w.title)}</a>${flag}</li>`
      : `<li><span class="panel-num">${num}.</span>${escapeHtml(p.title)} <span class="not-yet">not yet written</span>${flag}</li>`;
  }).join('');

  document.getElementById('content').innerHTML = `
    <div id="arr-page">
      <p class="panel-number-label">Volume ${vol.n}</p>
      <h1 class="entry-title">${arrName(arr).replace(/^./, c => c.toUpperCase())}</h1>
      <p class="entry-location">${written.size} of ${mine.length} panels written</p>
      <div id="arr-map" class="arr-map"></div>
      <p class="map-actions">
        <a href="${maperatiLink(arr, mine)}" target="_blank" rel="noopener">Open in Maperati</a>
        <a href="${geojsonDownload(arr, mine)}" download="paris-history-plaques-${ordinal(arr)}.geojson">Save the pins for Maperati</a>
        <span class="legend"><span class="map-pin written small"></span> written <span class="map-pin small"></span> not yet written</span>
      </p>
      <ul class="arr-panel-list">${list}</ul>
    </div>`;

  if (pinned.length) drawMap(document.getElementById('arr-map'), pinned.map(p => {
    const w = p.number != null && written.get(p.number);
    return { lat: p.lat, lng: p.lng, label: String(p.number ?? '–'), written: !!w,
             title: w ? w.title : p.title, href: w ? `#panel:${w.slug}` : null };
  }));
  else document.getElementById('arr-map').outerHTML = '<p class="map-offline">No map positions for this arrondissement yet.</p>';

  document.querySelectorAll('#entry-list a').forEach(a => a.classList.remove('active'));
  document.title = `${arrName(arr)} — Paris History Plaques`;
}

// ── Render: one panel ─────────────────────────────────────────

async function renderPanel(p) {
  const all = await getAllPanels();
  const slugs = new Map(all.map(x => [`${x.arrondissement}-${x.number}`, x.slug]));
  const i = all.findIndex(x => x.slug === p.slug);
  const prev = all[i - 1], next = all[i + 1];   // reading order: arrondissement, then number
  const photoSrc = p.photo ? await photoUrl(p.photo) : null;

  const plaque = p.textUnavailable
    ? `<p class="unavailable-notice">This plaque has been removed, and its text is not available. However, please refer to the background notes for some historical facts, which shed light on what may have been featured on the plaque.</p>`
    : `<h2>The plaque</h2>${md(linkCrossRefs(p.english, p.arrondissement, slugs))}`;

  const notes = p.notes
    ? `<div class="entry-body">${md(p.notes)}</div>`
    : `<p class="ref-notes-empty">No reference notes for this panel yet.</p>`;

  document.getElementById('content').innerHTML = `
    <article>
      <header class="entry-header">
        <p class="panel-number-label">${arrName(p.arrondissement)} · Panel ${p.number}</p>
        <h1 class="entry-title">${escapeHtml(p.title)}</h1>
        <p class="entry-location">${escapeHtml(p.location)}${p.removed
          ? ` <span class="entry-removed">(${escapeHtml(p.removed)})</span>` : ''}</p>
      </header>
      ${photoSrc ? `<figure class="panel-photo">
        <img src="${escapeHtml(photoSrc)}" alt="${escapeHtml(p.title)}" />
        ${p.photoCredit ? `<figcaption>${p.photoLicenceUrl
          ? escapeHtml(p.photoCredit).replace(/(CC [A-Z-]+ [\d.]+)/, `<a href="${escapeHtml(p.photoLicenceUrl)}" target="_blank" rel="noopener">$1</a>`)
          : escapeHtml(p.photoCredit)}</figcaption>` : ''}
      </figure>` : ''}
      <div class="entry-body">
        ${plaque}
        <h2>Background</h2>
        ${md(linkCrossRefs(p.background, p.arrondissement, slugs))}
      </div>
      <div class="panel-map-wrap">
        <div id="panel-map" class="panel-map"></div>
        <p class="map-actions"><a href="#arr:${p.arrondissement}">See it on the ${arrName(p.arrondissement)} map</a></p>
      </div>
      <details class="ref-notes">
        <summary>Reference notes (not in the book)</summary>
        ${notes}
      </details>
      <nav class="prev-next">
        ${prev ? `<a href="#panel:${prev.slug}">← ${prev.number}. ${escapeHtml(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a href="#panel:${next.slug}">${next.number}. ${escapeHtml(next.title)} →</a>` : '<span></span>'}
      </nav>
    </article>`;

  const place = (await loadPlaces()).find(x => x.arrondissement === p.arrondissement && x.number === p.number);
  if (place && place.lat != null) drawMap(document.getElementById('panel-map'),
    [{ lat: place.lat, lng: place.lng, label: String(p.number), written: true, title: p.title }], { zoom: 16 });
  else document.querySelector('.panel-map-wrap').innerHTML =
    `<p class="map-actions"><a href="#arr:${p.arrondissement}">See the ${arrName(p.arrondissement)} map</a> (no position for this panel yet)</p>`;

  document.querySelectorAll('#entry-list a').forEach(a => {
    const on = a.dataset.slug === p.slug;
    a.classList.toggle('active', on);
    if (on && !PHONE) { const g = a.closest('details.sidebar-group'); if (g) g.open = true; }
  });
  document.title = `${p.title} — Paris History Plaques`;
}

// ── Render: home page ─────────────────────────────────────────
// The intro paragraphs below are also the book's Introduction (as in Philosophy
// Wiki; scripts/generate.js reads them from this file), so change them here to
// change both.

// The home page's photo of a panel: CC BY-SA 4.0, so it must always carry this credit
// (the book prints the same credit, from scripts/generate.js).
const PANEL_PHOTO = {
  author: 'Mbzt',
  licence: 'CC BY-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  source: 'https://commons.wikimedia.org/wiki/File:Pelle_Starck_en_entier.jpg',
};

async function renderIndex() {
  const panels = await getAllPanels();
  const done = {};
  panels.forEach(p => { done[p.arrondissement] = (done[p.arrondissement] || 0) + 1; });
  const total = Object.values(TOTALS).reduce((a, b) => a + b, 0);

  const bar = (d, t) => `<span class="bar"><span style="width:${t ? Math.max(d ? 2 : 0, Math.round(100 * d / t)) : 0}%"></span></span>`;
  const volumes = VOLUMES.map(v => {
    const vDone = v.arrs.reduce((s, a) => s + (done[a] || 0), 0);
    const vTotal = v.arrs.reduce((s, a) => s + TOTALS[a], 0);
    const range = `${ordinal(v.arrs[0])}–${ordinal(v.arrs[v.arrs.length - 1])}`;
    return `
        <div class="vol-row">
          <div class="vol-head"><span class="vol-name">Volume ${v.n}</span><span class="vol-range">${range}</span>
            ${bar(vDone, vTotal)}<span class="count">${vDone} of ${vTotal}</span></div>
          <div class="arr-list">${v.arrs.map(a => `<a href="#arr:${a}" class="arr${done[a] ? ' started' : ''}">${ordinal(a)} <b>${done[a] || 0}/${TOTALS[a]}</b></a>`).join('')}</div>
        </div>`;
  }).join('');

  document.getElementById('content').innerHTML = `
    <div id="index-page">
      <h1>Paris History Plaques</h1>
      <p class="subtitle"><em>A personal catalogue of the Panneaux Histoire de Paris.</em></p>
      <div class="home-intro">
        <figure class="home-photo">
          <img src="./images/pelle-starck.jpg" alt="A Histoire de Paris panel, standing on a Paris pavement" />
          <figcaption>Photo: <a href="${PANEL_PHOTO.source}" target="_blank" rel="noopener">${PANEL_PHOTO.author}</a>,
            <a href="${PANEL_PHOTO.licenceUrl}" target="_blank" rel="noopener">${PANEL_PHOTO.licence}</a>, via Wikimedia Commons</figcaption>
        </figure>
        <p class="intro">The “History of Paris” panels were installed from 1992 under the mandate of Jacques Chirac, then mayor of Paris. They are sometimes called Starck shovels or lollipops after the name of their designer, Philippe Starck. You will find the panels in front of various monuments and significant sites throughout Paris, including some where there is only a few or no remains left behind such as fortifications, convents, and prisons. Others are linked to a specific place (a street, a square, a bridge) or famous or influential people who had a connection with the place where the panel is located. The panels also cover various facets of the history of Paris, including historical facts and events, economic issues and technical innovations.</p>
        <p class="intro">Each sign takes the form of a cast iron oar painted in dark grey, in reference to the coat of arms of Paris, which depicts a sailboat sailing on the waves and whose motto is <em>Fluctuat nec mergitur</em>: “It is beaten by the waves, but does not sink”. The handle of the oar or shovel is pushed into the ground; the shovel, at roughly eye height, has in its upper third, in red lines, a stylised version of the ship which appears in Paris’s coat of arms, the heading <em>Histoire de Paris</em> (History of Paris) and a short descriptive title. The lower two thirds have an explanatory text, as well as usually an illustration, in red.</p>
        <p class="intro">Although not agreed, the total number of panels originally installed throughout Paris may have been up to 767. The city of Paris does not have a complete inventory to verify this, and over time a number of the panels have disappeared. The purpose of this catalogue is to include an English translation of the panels, by arrondissement, as well as to provide background notes as added context.</p>
        <h3 class="ack-heading">Acknowledgements</h3>
        <p class="intro">This catalogue is based on the list of Paris plaques and panels included in the French Wikipedia page <a href="https://fr.wikipedia.org/wiki/Panneau_Histoire_de_Paris" target="_blank" rel="noopener">Panneau Histoire de Paris</a>, and on map data generated as part of an <a href="https://geocatalogue.apur.org/catalogue/srv/api/records/9adaacd7-1955-448d-9463-60963720d2e6" target="_blank" rel="noopener">APUR project</a> (see the <a href="https://osm4wiki.toolforge.org/cgi-bin/wiki/wiki-osm.pl?project=fr&amp;article=Panneau_Histoire_de_Paris" target="_blank" rel="noopener">OSM visualisation of all the plaques throughout Paris</a>), licensed under <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>.</p>
      </div>
      <section class="progress">
        <h2>Progress <span class="count">${panels.length} of ${total} panels written</span></h2>
        ${volumes}
      </section>
    </div>`;
  document.querySelectorAll('#entry-list a').forEach(a => a.classList.remove('active'));
  document.title = 'Paris History Plaques';
}

// ── Sidebar: volume, then arrondissement, then panel ──────────
// On a phone the list sits above the page, so arrondissements start folded
// (tap one to open it) and the panel's text stays near the top.

const PHONE = matchMedia('(max-width: 700px)').matches;

async function buildSidebar() {
  const panels = await getAllPanels();
  const active = location.hash.startsWith('#panel:') ? location.hash.slice(7) : null;
  const byArr = {};
  panels.forEach(p => (byArr[p.arrondissement] ||= []).push(p));

  document.getElementById('entry-list').innerHTML = VOLUMES
    .filter(v => v.arrs.some(a => byArr[a]))
    .map(v => `
      <h2 class="volume-heading">Volume ${v.n}</h2>
      ${v.arrs.filter(a => byArr[a]).map(a => `
        <details class="sidebar-group" ${PHONE ? '' : 'open'}>
          <summary class="sidebar-group-header"><a href="#arr:${a}" class="arr-link">${arrName(a)}</a> <span class="sidebar-count">${byArr[a].length}/${TOTALS[a]}</span></summary>
          <ul class="sidebar-group-list">${byArr[a].map(p => `
            <li><a href="#panel:${p.slug}" data-slug="${p.slug}" class="${p.slug === active ? 'active' : ''}"><span class="panel-num">${p.number}.</span>${escapeHtml(p.title)}</a></li>`).join('')}
          </ul>
        </details>`).join('')}`).join('');
}

// ── Router ────────────────────────────────────────────────────

async function route() {
  const hash = location.hash;
  if (hash.startsWith('#panel:')) {
    const p = await getPanel(decodeURIComponent(hash.slice(7)));
    if (p) await renderPanel(p);
    else document.getElementById('content').innerHTML = '<p class="state-msg">That panel isn\'t in the wiki.</p>';
  } else if (hash.startsWith('#arr:')) {
    const arr = Number(hash.slice(5));
    if (TOTALS[arr]) await renderArrondissement(arr);
    else await renderIndex();
  } else {
    await renderIndex();
  }
  window.scrollTo(0, 0);
}

// ── Search ────────────────────────────────────────────────────

let searchTimeout = null;

function excerptFor(p, ql) {
  for (const text of [p.english, p.background, p.location]) {
    const i = (text || '').toLowerCase().indexOf(ql);
    if (i !== -1) {
      const start = Math.max(0, i - 30);
      return (start > 0 ? '…' : '') + escapeHtml(text.slice(start, i + ql.length + 60).replace(/\n/g, ' ').replace(/\*/g, '')) + '…';
    }
  }
  return '';
}

function initSearch() {
  const input = document.getElementById('search');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (!q) { results.innerHTML = ''; results.classList.remove('visible'); return; }
    searchTimeout = setTimeout(async () => {
      const hits = await searchPanels(q);
      const ql = q.toLowerCase();
      results.innerHTML = hits.length
        ? hits.slice(0, 10).map(p => `
            <div class="search-result" data-slug="${p.slug}">
              <div class="search-result-title">${escapeHtml(p.title)} <span class="search-result-count">· ${arrName(p.arrondissement)}, Panel ${p.number}</span></div>
              <div class="search-result-excerpt">${excerptFor(p, ql)}</div>
            </div>`).join('')
        : '<div class="search-result"><span class="search-result-title">No results</span></div>';
      results.classList.add('visible');
    }, 180);
  });

  results.addEventListener('click', e => {
    const item = e.target.closest('[data-slug]');
    if (!item) return;
    location.hash = `#panel:${item.dataset.slug}`;
    input.value = '';
    results.innerHTML = '';
    results.classList.remove('visible');
  });
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !results.contains(e.target)) results.classList.remove('visible');
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; results.classList.remove('visible'); }
  });
}

// ── Boot ──────────────────────────────────────────────────────

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }
}

async function boot() {
  const loaded = await loadPanels().catch(() => ({ offline: true }));
  if (loaded.panels) {
    try { await syncPanels(loaded.panels); } catch (err) { console.error('Storing panels failed:', err); }
  }
  if (loaded.needKey) { renderKeyScreen(loaded.problem); registerSW(); return; }

  if (!(await getAllPanels().catch(() => [])).length) {
    document.getElementById('content').innerHTML =
      '<p class="state-msg">The wiki couldn\'t reach GitHub. Connect to the internet once on this device to load the panels.</p>';
    registerSW();
    return;
  }

  await buildSidebar();
  // An arrondissement's name in the menu opens its map page (rather than folding the list).
  document.getElementById('entry-list').addEventListener('click', e => {
    const a = e.target.closest('.arr-link');
    if (!a) return;
    e.preventDefault();
    location.hash = a.getAttribute('href');
    const g = a.closest('details'); if (g && !PHONE) g.open = true;
  });
  initSearch();
  document.getElementById('site-title').addEventListener('click', () => { location.hash = ''; });
  window.addEventListener('hashchange', route);
  await route();
  registerSW();
}

boot();
