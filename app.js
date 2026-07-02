/* Frais de tournée — mini-app PWA autonome (clients + chevaux + tournées Réglage/Rapport)
 * Modèle repris de Servos/SerMob (packages/shared/clientele.ts) + TVA :
 *   - km réels routiers via API (Geoapify OU Nominatim+OSRM public) + autocomplétion par champ
 *   - carburant à la pompe = TVAC ; tarifs par type = HTVA : véhicule HT + carburant HT (pompe ÷ (1+TVA))
 *   - sur la tournée on applique la TVA (taux réglable) -> HT + TVA + TTC ; marge = total HT − carburant HT
 *   - seuil = "client proche" (auto, distance routière) -> forfait ; boucle complète (retour inclus)
 *   - répartition parts égales | prorata | par client ; écurie partagée -> frais / nb clients ; /cheval
 * Stockage local (localStorage), aucun serveur.
 */
'use strict';

// ---------- Version & mise à jour ----------
const APP_VERSION = '1.0.0';
const UPDATE_REPO = 'pmrflightclub-afk/Distribution-GaloPodo'; // dépôt GitHub des releases (vérif MAJ au lancement)
function isNewerVersion(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x > y) return true; if (x < y) return false; }
  return false;
}
// Au lancement : vérifie la dernière release GitHub. Si plus récente → purge + recharge (MAJ). Sinon → ouverture normale.
async function checkForUpdate() {
  if (!UPDATE_REPO) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    const latest = String(j.tag_name || '').replace(/^v/i, '');
    if (latest && isNewerVersion(latest, APP_VERSION) && sessionStorage.getItem('ftr.updated') !== latest) {
      sessionStorage.setItem('ftr.updated', latest); // anti-boucle
      if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((x) => x.unregister())); }
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
      location.reload();
    }
  } catch { /* hors-ligne / API indisponible → ouverture normale */ }
}

// ---------- Persistance ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
const uid = () => 'id' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

// ---------- Adresses structurées ----------
const emptyAddr = () => ({ rue: '', numero: '', cp: '', localite: '', lat: null, lon: null });
function toAddr(x) { if (!x) return emptyAddr(); if (typeof x === 'string') return Object.assign(emptyAddr(), { rue: x }); return Object.assign(emptyAddr(), x); }
function addrStr(a) { a = toAddr(a); const l1 = [a.rue, a.numero].filter(Boolean).join(' '); const l2 = [a.cp, a.localite].filter(Boolean).join(' '); return [l1, l2].filter(Boolean).join(', '); }

const DEFAULTS = {
  provider: 'osm', geoapifyKey: '',
  home: emptyAddr(),
  consoL100: 9, prixPleinL: 2.0, tvaRate: 21,
  vehicule: { tournee: 0.228, visite: 0.298, urgence: 0.458 },
  seuilKm: 20, forfait: 15,
  repartition: 'egal', rayonMemeEcurieKm: 1, roadFactor: 1.30, vitesseKmh: 50,
};
let S = Object.assign({}, DEFAULTS, LS.get('ftr.settings', {}));
S.vehicule = Object.assign({}, DEFAULTS.vehicule, S.vehicule || {});
S.home = toAddr(S.home && S.home.adresse !== undefined ? { rue: S.home.adresse, lat: S.home.lat, lon: S.home.lon } : S.home);
if (typeof S.tvaRate !== 'number') S.tvaRate = 21;
function saveSettings() { LS.set('ftr.settings', S); refreshEverywhere(); recomputeMoney(); }

let clients = LS.get('ftr.clients', []);
let tournees = LS.get('ftr.tournees', []);
function saveClients() { LS.set('ftr.clients', clients); }
function saveTournees() { LS.set('ftr.tournees', tournees); }

(function migrate() {
  clients.forEach((c) => {
    if (c.adresse !== undefined) { c.addr = toAddr(c.adresse); delete c.adresse; }
    c.addr = toAddr(c.addr);
    (c.chevaux || []).forEach((h) => { if (h.adresse !== undefined) { h.addr = toAddr(h.adresse); delete h.adresse; } h.addr = toAddr(h.addr); if (h.memeAdresse === undefined) h.memeAdresse = true; });
  });
  tournees.forEach((t) => (t.arrets || []).forEach((a) => {
    if (!a.addr) { a.addr = toAddr(a.adresse); a.addr.lat = a.lat || null; a.addr.lon = a.lon || null; }
    if (!a.clients) a.clients = (a.clientIds || []).map((id, i) => ({ clientId: id, chevalNoms: i === 0 ? (a.chevalNoms || []) : [] }));
  }));
  saveClients(); saveTournees();
})();

let currentTour = null;

// ---------- Utilitaires ----------
const $ = (id) => document.getElementById(id);
const eur = (n) => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const eurkm = (n) => (Math.round(n * 1000) / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €';
const km = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km';
const TYPES = { tournee: 'Tournée', visite: 'Visite', urgence: 'Urgence' };
const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const todayStr = () => new Date().toISOString().slice(0, 10);
function tourStatus(date) { const t = todayStr(); if (!date) return 'avenir'; if (date < t) return 'cloturee'; if (date === t) return 'active'; return 'avenir'; }
const STATUS_LBL = { cloturee: 'Clôturée', active: "Aujourd'hui", avenir: 'À venir' };

function haversineKm(a, b) {
  const R = 6371, r = (d) => d * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const rate = () => (S.tvaRate || 0) / 100;
const fuelPerKmHT = () => (S.consoL100 / 100) * S.prixPleinL / (1 + rate());
const tarifHT = (type) => (S.vehicule[type] ?? 0) + fuelPerKmHT();
const ttc = (ht) => ht * (1 + rate());
const clientName = (id) => { const c = clients.find((x) => x.id === id); return c ? c.nom : '?'; };
const arretNbClients = (a) => (a.clients || []).length;
const homeXY = () => ({ lat: S.home.lat, lon: S.home.lon });

// ---------- Cartographie ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function suggestAddress(text, kind) {
  if (S.provider === 'geoapify') {
    if (!S.geoapifyKey) throw new Error('Clé Geoapify manquante');
    const typeParam = kind ? `&type=${kind}` : '';
    const r = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&limit=6&lang=fr&filter=countrycode:be,fr,lu${typeParam}&apiKey=${S.geoapifyKey}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return (j.features || []).map((f) => { const p = f.properties; return { rue: p.street || p.name || '', numero: p.housenumber || '', cp: p.postcode || '', localite: p.city || p.town || p.village || '', lat: p.lat, lon: p.lon, label: p.formatted }; });
  }
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=be,fr,lu&q=${encodeURIComponent(text)}`, { headers: { 'Accept-Language': 'fr' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return j.map((x) => { const a = x.address || {}; return { rue: a.road || a.pedestrian || a.hamlet || '', numero: a.house_number || '', cp: a.postcode || '', localite: a.city || a.town || a.village || a.municipality || '', lat: parseFloat(x.lat), lon: parseFloat(x.lon), label: x.display_name }; });
}
async function geocode(addr) { const text = addrStr(addr); if (!text.trim()) throw new Error('Adresse vide'); const res = await suggestAddress(text); if (!res.length) throw new Error('Adresse introuvable : ' + text); return { lat: res[0].lat, lon: res[0].lon }; }

// Distances domicile → chaque arrêt EN UN SEUL APPEL (matrix). Renvoie un tableau de km (null si indisponible).
async function directMatrix(home, stops) {
  if (S.provider === 'geoapify') {
    const body = { mode: 'drive', sources: [{ location: [home.lon, home.lat] }], targets: stops.map((s) => ({ location: [s.lon, s.lat] })) };
    const r = await fetch(`https://api.geoapify.com/v1/routematrix?apiKey=${S.geoapifyKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Matrix HTTP ' + r.status);
    const j = await r.json(); const row = (j.sources_to_targets && j.sources_to_targets[0]) || [];
    return stops.map((_, i) => { const c = row.find((x) => x.target_index === i) || row[i]; return c && c.distance != null ? c.distance / 1000 : null; });
  }
  const coords = [home, ...stops].map((p) => `${p.lon},${p.lat}`).join(';');
  const r = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`);
  if (!r.ok) throw new Error('Matrix HTTP ' + r.status);
  const j = await r.json(); const d = j.distances && j.distances[0];
  if (!d) throw new Error('distances indisponibles');
  return stops.map((_, i) => (d[i + 1] != null ? d[i + 1] / 1000 : null));
}
async function route(points) {
  if (S.provider === 'geoapify') {
    const wp = points.map((p) => `${p.lat},${p.lon}`).join('|');
    const r = await fetch(`https://api.geoapify.com/v1/routing?waypoints=${encodeURIComponent(wp)}&mode=drive&apiKey=${S.geoapifyKey}`);
    if (!r.ok) throw new Error('Itinéraire HTTP ' + r.status);
    const j = await r.json(); const p = j.features && j.features[0] && j.features[0].properties;
    if (!p) throw new Error('Itinéraire indisponible');
    return { totalKm: p.distance / 1000, totalMin: p.time / 60, legsKm: (p.legs || []).map((l) => l.distance / 1000) };
  }
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`);
  if (!r.ok) throw new Error('Itinéraire HTTP ' + r.status);
  const j = await r.json(); const rt = j.routes && j.routes[0];
  if (!rt) throw new Error('Itinéraire indisponible');
  return { totalKm: rt.distance / 1000, totalMin: rt.duration / 60, legsKm: (rt.legs || []).map((l) => l.distance / 1000) };
}

// ---------- Widget d'adresse (suggestion PAR champ) ----------
function attachAuto(input, kind, addr, onPick, onEdit) {
  let deb, box;
  const close = () => { if (box) { box.remove(); box = null; } };
  const run = async () => {
    const v = input.value.trim(); if (v.length < 2) { close(); return; }
    const text = kind === 'street' ? [v, addr.cp, addr.localite].filter(Boolean).join(' ') : kind === 'postcode' ? [v, addr.localite].filter(Boolean).join(' ') : v;
    close(); box = document.createElement('div'); box.className = 'aw-sugg'; input.parentElement.appendChild(box); box.innerHTML = '<div class="aw-item">Recherche…</div>';
    try {
      const res = await suggestAddress(text, kind); if (!box) return; box.innerHTML = '';
      if (!res.length) { box.innerHTML = '<div class="aw-item">Aucun résultat</div>'; return; }
      res.forEach((s) => { const d = document.createElement('div'); d.className = 'aw-item'; d.textContent = s.label; d.addEventListener('mousedown', (e) => { e.preventDefault(); onPick(s); close(); }); box.appendChild(d); });
    } catch (e) { if (box) box.innerHTML = '<div class="aw-item">Erreur : ' + e.message + '</div>'; }
  };
  input.addEventListener('input', () => { addr.lat = null; addr.lon = null; onEdit && onEdit(); clearTimeout(deb); deb = setTimeout(run, S.provider === 'geoapify' ? 350 : 1100); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
function mountAddress(container, addr, onChange) {
  addr = toAddr(addr); container.classList.add('addr-widget');
  container.innerHTML = `
    <div class="row"><label class="grow af" style="flex:3">Rue<input class="aw-rue" value="${esc(addr.rue)}" autocomplete="off"/></label><label style="flex:1">N°<input class="aw-num" value="${esc(addr.numero)}" autocomplete="off"/></label></div>
    <div class="row"><label class="af" style="flex:1">Code postal<input class="aw-cp" value="${esc(addr.cp)}" autocomplete="off"/></label><label class="grow af" style="flex:2">Localité<input class="aw-loc" value="${esc(addr.localite)}" autocomplete="off"/></label></div>`;
  const el = { rue: container.querySelector('.aw-rue'), numero: container.querySelector('.aw-num'), cp: container.querySelector('.aw-cp'), localite: container.querySelector('.aw-loc') };
  const emit = () => { addr.rue = el.rue.value; addr.numero = el.numero.value; addr.cp = el.cp.value; addr.localite = el.localite.value; onChange && onChange(addr); };
  const fill = (s) => { if (s.rue) addr.rue = s.rue; if (s.numero) addr.numero = s.numero; if (s.cp) addr.cp = s.cp; if (s.localite) addr.localite = s.localite; addr.lat = s.lat; addr.lon = s.lon; el.rue.value = addr.rue; el.numero.value = addr.numero; el.cp.value = addr.cp; el.localite.value = addr.localite; onChange && onChange(addr); };
  el.numero.addEventListener('input', () => { addr.lat = null; addr.lon = null; emit(); });
  attachAuto(el.rue, 'street', addr, fill, emit); attachAuto(el.cp, 'postcode', addr, fill, emit); attachAuto(el.localite, 'city', addr, fill, emit);
  return addr;
}

// ---------- Carte (Leaflet, marqueurs numérotés) ----------
let _map = null, _mapLayer = null;
function renderMap(rows, home) {
  const hint = $('edMapHint');
  if (typeof L === 'undefined') { if (hint) hint.textContent = 'Carte indisponible (hors-ligne).'; return; }
  if (!_map) { _map = L.map('edMap'); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(_map); }
  if (_mapLayer) _mapLayer.remove();
  _mapLayer = L.layerGroup().addTo(_map);
  const pts = [];
  const h = home && home.lat ? [home.lat, home.lon] : null;
  if (h) { pts.push(h); L.marker(h, { icon: L.divIcon({ className: '', html: '<div class="map-home">🏠</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(_mapLayer).bindPopup('Départ / retour'); }
  rows.forEach((r, i) => { if (r.lat) { const p = [r.lat, r.lon]; pts.push(p); L.marker(p, { icon: L.divIcon({ className: '', html: `<div class="map-num"><span>${i + 1}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 26] }) }).addTo(_mapLayer).bindPopup(`${i + 1}. ${esc(r.label)}`); } });
  if (h) pts.push(h);
  if (pts.length > 1) { L.polyline(pts, { color: '#1f6f54', weight: 3 }).addTo(_mapLayer); _map.fitBounds(pts, { padding: [30, 30] }); }
  else if (pts.length === 1) _map.setView(pts[0], 13);
  setTimeout(() => _map.invalidateSize(), 150);
}
async function showMapOnly() {
  const hint = $('edMapHint');
  if (!currentTour.arrets.length) { hint.textContent = 'Ajoutez d\'abord des arrêts.'; return; }
  hint.textContent = 'Localisation…';
  try {
    for (const a of currentTour.arrets) { if (!a.addr.lat) { const g = await geocode(a.addr); a.addr.lat = g.lat; a.addr.lon = g.lon; if (S.provider === 'osm') await sleep(1100); } }
    renderMap(currentTour.arrets.map((a) => ({ lat: a.addr.lat, lon: a.addr.lon, label: labelFor(a) })), homeXY()); hint.textContent = '';
  } catch (e) { hint.textContent = 'Erreur : ' + e.message; }
}
// Force la re-géolocalisation (efface le cache de positions) : domicile + tous les arrêts.
async function forceRelocate() {
  const hint = $('edMapHint'); hint.textContent = 'Re-localisation du domicile…';
  try {
    if (addrStr(S.home).trim()) { const g = await geocode(S.home); S.home.lat = g.lat; S.home.lon = g.lon; saveSettings(); if (S.provider === 'osm') await sleep(1100); }
    for (const a of currentTour.arrets) { a.addr.lat = null; a.addr.lon = null; }
    for (const a of currentTour.arrets) { hint.textContent = 'Re-localisation des arrêts…'; const g = await geocode(a.addr); a.addr.lat = g.lat; a.addr.lon = g.lon; if (S.provider === 'osm') await sleep(1100); }
    renderMap(currentTour.arrets.map((a) => ({ lat: a.addr.lat, lon: a.addr.lon, label: labelFor(a) })), homeXY());
    hint.textContent = 'Positions actualisées. Vérifiez le 🏠 puis relancez « Calculer les frais ».';
  } catch (e) { hint.textContent = 'Erreur : ' + e.message; }
}

// ---------- Modal ----------
function openModal(html) { $('modalBox').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); $('modalBox').innerHTML = ''; }

// ---------- Navigation ----------
function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  $('tab-' + name).classList.add('active'); window.scrollTo(0, 0);
  if (name === 'accueil') renderHome();
  if (name === 'clients') renderClients();
  if (name === 'tournees') renderTours();
  if (name === 'calcul') renderCalcul();
}

// ================= CLIENTS =================
function renderClients() {
  const list = $('clientsList'); list.innerHTML = '';
  $('clientsEmpty').style.display = clients.length ? 'none' : 'block';
  clients.forEach((c) => {
    const nAdr = new Set((c.chevaux || []).map((h) => norm(addrStr(h.memeAdresse !== false ? c.addr : (addrStr(h.addr) ? h.addr : c.addr))))).size || 1;
    const el = document.createElement('div'); el.className = 'list-item';
    el.innerHTML = `<div class="li-main"><b>${esc(c.nom)}</b><span class="li-sub">${esc(addrStr(c.addr)) || '<i>adresse ?</i>'} · ${(c.chevaux || []).length} cheval(aux)${nAdr > 1 ? ' · ' + nAdr + ' adresses' : ''}</span></div><div class="li-act"><button class="btn small" data-edit>Éditer</button></div>`;
    el.querySelector('[data-edit]').addEventListener('click', () => editClient(c));
    list.appendChild(el);
  });
}
function editClient(existing, onSaved) {
  const w = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), nom: '', addr: emptyAddr(), chevaux: [] };
  w.addr = toAddr(w.addr);
  openModal(`
    <div class="modal-head"><b>${existing ? 'Éditer' : 'Nouveau'} client</b><button class="x" id="mX">✕</button></div>
    <label>Nom<input type="text" id="cNom" value="${esc(w.nom)}" /></label>
    <h2 style="font-size:.9rem">Adresse du client</h2><div id="cAddr"></div>
    <div class="card-head"><h2 style="font-size:.9rem">Chevaux</h2><button class="btn small" id="cAddCheval">+ Cheval</button></div>
    <div id="cChevaux"></div>
    ${existing ? '<button class="btn small danger" id="cDel">Supprimer ce client</button>' : ''}
    <div class="actions"><button class="btn primary block" id="cSave">Enregistrer</button></div>
    <p class="status err" id="cErr"></p>`);
  mountAddress($('cAddr'), w.addr, (a) => { w.addr = a; });
  const renderCh = () => {
    const box = $('cChevaux'); box.innerHTML = '';
    if (!w.chevaux.length) box.innerHTML = '<p class="empty">Aucun cheval.</p>';
    w.chevaux.forEach((h, i) => {
      h.addr = toAddr(h.addr); if (h.memeAdresse === undefined) h.memeAdresse = true;
      const row = document.createElement('div'); row.className = 'cheval';
      row.innerHTML = `<div class="a-top"><input type="text" class="grow" placeholder="Nom du cheval" value="${esc(h.nom)}" data-nom /><button class="a-del" data-del>✕</button></div>
        <label class="chk"><input type="checkbox" data-meme ${h.memeAdresse !== false ? 'checked' : ''}/> Même adresse que le client</label>
        <div data-addrmount ${h.memeAdresse !== false ? 'style="display:none"' : ''}></div>`;
      row.querySelector('[data-nom]').addEventListener('input', (e) => { h.nom = e.target.value; });
      row.querySelector('[data-del]').addEventListener('click', () => { w.chevaux.splice(i, 1); renderCh(); });
      row.querySelector('[data-meme]').addEventListener('change', (e) => { h.memeAdresse = e.target.checked; renderCh(); });
      if (h.memeAdresse === false) mountAddress(row.querySelector('[data-addrmount]'), h.addr, (a) => { h.addr = a; });
      box.appendChild(row);
    });
  };
  renderCh();
  $('mX').addEventListener('click', closeModal);
  $('cNom').addEventListener('input', (e) => { w.nom = e.target.value; });
  $('cAddCheval').addEventListener('click', () => { w.chevaux.push({ nom: '', memeAdresse: true, addr: emptyAddr() }); renderCh(); });
  if (existing) $('cDel').addEventListener('click', () => { if (confirm('Supprimer ce client ?')) { clients = clients.filter((x) => x.id !== w.id); saveClients(); closeModal(); renderClients(); } });
  $('cSave').addEventListener('click', () => {
    if (!w.nom.trim()) { $('cErr').textContent = 'Le nom est obligatoire.'; return; }
    if (!addrStr(w.addr).trim()) { $('cErr').textContent = 'L\'adresse du client est obligatoire.'; return; }
    const i = clients.findIndex((x) => x.id === w.id); if (i >= 0) clients[i] = w; else clients.push(w);
    saveClients(); closeModal();
    if (onSaved) onSaved(w); else renderClients();
  });
}

// ================= TOURNÉES =================
function tourListItem(t, showBadge) {
  const st = tourStatus(t.date);
  const el = document.createElement('div'); el.className = 'list-item';
  el.innerHTML = `<div class="li-main"><b>${esc(t.date)}${showBadge ? ' · ' + STATUS_LBL[st] : ''}</b><span class="li-sub">${t.arrets.length} arrêt(s) · ${t.result ? km(t.result.totalKm) + ' · ' + eur(t.result.totalTTC) + ' TTC' : 'non calculée'}</span></div><div class="li-act"><button class="btn small" data-open>Ouvrir</button></div>`;
  el.querySelector('[data-open]').addEventListener('click', () => openTour(t));
  return el;
}
function renderTours() {
  const list = $('toursList'); list.innerHTML = '';
  const items = [...tournees].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('toursEmpty').style.display = items.length ? 'none' : 'block';
  items.forEach((t) => list.appendChild(tourListItem(t, true)));
}
function newTour() { currentTour = { id: uid(), date: todayStr(), arrets: [], result: null, createdAt: Date.now() }; openEditor(); }
function openTour(t) { currentTour = JSON.parse(JSON.stringify(t)); openEditor(); }

function openEditor() {
  const st = tourStatus(currentTour.date); const locked = st === 'cloturee';
  $('edTitle').textContent = currentTour.result ? 'Tournée du ' + currentTour.date : 'Nouvelle tournée';
  $('edStatusBadge').textContent = STATUS_LBL[st];
  $('edDate').value = currentTour.date; $('edDate').disabled = locked;
  $('edHome').textContent = S.home.lat ? ('Départ / retour : ' + addrStr(S.home)) : 'Départ non défini — allez dans Réglages.';
  $('edLockBanner').classList.toggle('hidden', !locked);
  $('edAddArret').style.display = locked ? 'none' : '';
  $('edCalc').style.display = 'none'; // recalcul automatique — bouton masqué mais fonctionnel
  $('edDelete').style.display = '';
  renderEditorArrets(locked);
  renderResultUI(currentTour.result);
  $('edStatus').textContent = '';
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  $('tab-editeur').classList.add('active'); window.scrollTo(0, 0);
  if (currentTour.result) renderMap(currentTour.result.rows.map((r) => ({ lat: r.lat, lon: r.lon, label: r.label })), homeXY());
  else if (_mapLayer) { _mapLayer.remove(); _mapLayer = null; }
}

function labelFor(a) { return (a.clients || []).map((cl) => clientName(cl.clientId) + (cl.chevalNoms && cl.chevalNoms.length ? ' (' + cl.chevalNoms.join(', ') + ')' : '')).join(' + '); }

// ----- Ajout d'arrêt : client -> (choix chevaux si multi-adresses) -----
function pickClientForArret(highlightId) {
  openModal(`<div class="modal-head"><b>Ajouter un arrêt</b><button class="x" id="mX">✕</button></div>
    <div class="actions"><button class="btn block" id="pNew">➕ Créer un nouveau client</button></div>
    <p class="hint">${clients.length ? 'Ou choisissez un client existant :' : 'Aucun client encore — créez-en un ci-dessus.'}</p>
    <div class="list" id="pickList"></div>`);
  $('mX').addEventListener('click', closeModal);
  $('pNew').addEventListener('click', () => editClient(null, (nc) => pickClientForArret(nc.id)));
  const ordered = highlightId ? [...clients].sort((a, b) => (a.id === highlightId ? -1 : b.id === highlightId ? 1 : 0)) : clients;
  ordered.forEach((c) => { const b = document.createElement('button'); b.className = 'btn block' + (c.id === highlightId ? ' primary' : ''); b.style.textAlign = 'left'; b.innerHTML = `<b>${esc(c.nom)}</b> <span class="li-sub">${esc(addrStr(c.addr))} · ${(c.chevaux || []).length} cheval(aux)${c.id === highlightId ? ' · ✔ nouveau' : ''}</span>`; b.addEventListener('click', () => chooseClientTargets(c)); $('pickList').appendChild(b); });
}
const chevalAddr = (c, h) => (h.memeAdresse !== false || !addrStr(h.addr)) ? c.addr : h.addr;
function chooseClientTargets(c) {
  const chs = c.chevaux || [];
  const distinct = new Set(chs.map((h) => norm(addrStr(chevalAddr(c, h)))));
  if (!chs.length || distinct.size <= 1) { addClientToTour(c, chs); closeModal(); renderEditorArrets(); scheduleGeoRecalc(); return; }
  const picked = new Set(chs.map((_, i) => i));
  openModal(`<div class="modal-head"><b>Chevaux — ${esc(c.nom)}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Ce client a des chevaux à des adresses différentes. Cochez ceux à visiter (un arrêt par adresse).</p>
    <div id="chList"></div><div class="actions"><button class="btn primary block" id="addSel">Ajouter la sélection</button></div>`);
  $('mX').addEventListener('click', closeModal);
  const box = $('chList');
  chs.forEach((h, i) => { const row = document.createElement('label'); row.className = 'chk'; row.style.marginBottom = '8px'; row.innerHTML = `<input type="checkbox" checked/> <b>${esc(h.nom || 'cheval')}</b> — ${esc(addrStr(chevalAddr(c, h)))}`; row.querySelector('input').addEventListener('change', (e) => { e.target.checked ? picked.add(i) : picked.delete(i); }); box.appendChild(row); });
  $('addSel').addEventListener('click', () => { addClientToTour(c, chs.filter((_, i) => picked.has(i))); closeModal(); renderEditorArrets(); scheduleGeoRecalc(); });
}
function addClientToTour(c, chevaux) {
  const groups = {};
  const push = (addr, nom) => { const k = norm(addrStr(addr)); if (!groups[k]) groups[k] = { addr: toAddr(addr), chevalNoms: [] }; if (nom) groups[k].chevalNoms.push(nom); };
  if (!chevaux.length) push(c.addr, null);
  else chevaux.forEach((h) => push(chevalAddr(c, h), h.nom || 'cheval'));
  Object.values(groups).forEach((g) => {
    const ex = currentTour.arrets.find((a) => norm(addrStr(a.addr)) === norm(addrStr(g.addr)));
    if (ex) { let cl = ex.clients.find((x) => x.clientId === c.id); if (!cl) { cl = { clientId: c.id, chevalNoms: [] }; ex.clients.push(cl); } g.chevalNoms.forEach((n) => cl.chevalNoms.push(n)); }
    else currentTour.arrets.push({ addr: JSON.parse(JSON.stringify(g.addr)), type: 'tournee', clients: [{ clientId: c.id, chevalNoms: g.chevalNoms.slice() }] });
  });
}

function renderEditorArrets(locked) {
  if (locked === undefined) locked = tourStatus(currentTour.date) === 'cloturee';
  const box = $('edArrets'); box.innerHTML = '';
  $('edArretsEmpty').style.display = currentTour.arrets.length ? 'none' : 'block';
  currentTour.arrets.forEach((a, i) => {
    const nb = arretNbClients(a);
    const el = document.createElement('div'); el.className = 'arret'; el.dataset.idx = i;
    el.innerHTML = `
      <div class="a-top">
        ${locked ? '' : '<div class="a-drag" title="Glisser pour réordonner">⠿</div>'}
        <span class="a-num">${i + 1}</span>
        <div class="grow"><b>${esc(labelFor(a))}</b><div class="li-sub">${esc(addrStr(a.addr))}${nb > 1 ? ' · <span class="badge">' + nb + ' clients ici</span>' : ''}</div></div>
        ${locked ? '' : '<button class="a-del" data-del title="Retirer">✕</button>'}
      </div>
      <div class="a-grid"><label class="grow">Tarif appliqué<select data-type ${locked ? 'disabled' : ''}><option value="tournee">Tournée</option><option value="visite">Visite</option><option value="urgence">Urgence</option></select></label></div>`;
    el.querySelector('[data-type]').value = a.type || 'tournee';
    if (!locked) {
      el.querySelector('[data-type]').addEventListener('change', (e) => { a.type = e.target.value; recomputeMoney(); });
      el.querySelector('[data-del]').addEventListener('click', () => { currentTour.arrets.splice(i, 1); renderEditorArrets(locked); scheduleGeoRecalc(); });
    }
    box.appendChild(el);
  });
  if (!locked) enableDrag(box);
}

function enableDrag(listEl) {
  listEl.querySelectorAll('.a-drag').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const dragEl = handle.closest('.arret'); dragEl.classList.add('dragging');
      const move = (ev) => {
        const after = [...listEl.querySelectorAll('.arret:not(.dragging)')].find((sib) => { const r = sib.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
        if (after) listEl.insertBefore(dragEl, after); else listEl.appendChild(dragEl);
      };
      const up = () => {
        dragEl.classList.remove('dragging');
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
        const order = [...listEl.querySelectorAll('.arret')].map((x) => +x.dataset.idx);
        currentTour.arrets = order.map((i) => currentTour.arrets[i]);
        renderEditorArrets(false); scheduleGeoRecalc();
      };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
  });
}

// ----- Calcul : ARGENT (pur, instantané, sans API) à partir de la géométrie -----
function computeResultMoney(rows, geom) {
  const useSeuil = S.repartition === 'parclient'; // seuil/forfait « client proche » actifs seulement dans ce mode
  rows.forEach((r) => (r.proche = useSeuil && r.directKm < S.seuilKm));
  const loin = rows.filter((r) => !r.proche);
  // Clients au seuil : on retire leur distance ALLER SIMPLE domicile→client (sommée si plusieurs) du km total.
  const kmProches = rows.filter((r) => r.proche).reduce((s, r) => s + r.directKm, 0);
  const kmRestant = Math.max(0, geom.totalKm - kmProches);
  const sumSegLoin = loin.reduce((s, r) => s + r.segKm, 0);
  const totClientsLoin = loin.reduce((s, r) => s + r.nbClients, 0);
  rows.forEach((r) => {
    if (r.proche) { r.kmAttribue = 0; r.tarifHT = 0; r.montantHT = S.forfait; }
    else {
      if (S.repartition === 'prorata' && sumSegLoin > 0) r.kmAttribue = kmRestant * r.segKm / sumSegLoin;
      else if (S.repartition === 'parclient' && totClientsLoin > 0) r.kmAttribue = kmRestant * r.nbClients / totClientsLoin;
      else r.kmAttribue = loin.length ? kmRestant / loin.length : 0;
      r.tarifHT = tarifHT(r.type); r.montantHT = r.kmAttribue * r.tarifHT;
    }
    r.montantTTC = ttc(r.montantHT);
  });
  const cmap = {};
  rows.forEach((r) => {
    const partHT = r.montantHT / r.nbClients, partTTC = r.montantTTC / r.nbClients;
    r.clients.forEach((cl) => {
      const m = cmap[cl.clientId] || (cmap[cl.clientId] = { clientId: cl.clientId, nom: cl.nom, totalHT: 0, totalTTC: 0, lignes: [] });
      m.totalHT += partHT; m.totalTTC += partTTC;
      m.lignes.push({ adresse: r.adresse, type: r.type, partTTC, chevalNoms: cl.chevalNoms });
    });
  });
  const totalHT = rows.reduce((s, r) => s + r.montantHT, 0);
  const totalTVA = totalHT * rate(); const totalTTC = totalHT + totalTVA;
  const fuelReel = geom.totalKm * (S.consoL100 / 100) * S.prixPleinL; // TVAC (pompe)
  const fuelHT = fuelReel / (1 + rate()); const marge = totalHT - fuelHT;
  return { rows, parClient: Object.values(cmap), totalKm: geom.totalKm, totalMin: geom.totalMin, kmHomeFirst: geom.kmHomeFirst, kmLastHome: geom.kmLastHome, totalHT, totalTVA, totalTTC, fuelReel, fuelHT, marge, tvaRate: S.tvaRate, repartition: S.repartition, computedAt: Date.now() };
}

function rowFromArret(a, geo) {
  return { label: labelFor(a), adresse: addrStr(a.addr), lat: a.addr.lat, lon: a.addr.lon, type: a.type || 'tournee',
    nbClients: Math.max(1, arretNbClients(a)),
    clients: (a.clients || []).map((cl) => ({ clientId: cl.clientId, nom: clientName(cl.clientId), chevalNoms: (cl.chevalNoms || []).slice() })),
    segKm: geo.segKm, directKm: geo.directKm };
}

// Recalcul ARGENT uniquement (types/tarifs/TVA/seuil/répartition) — instantané, réutilise la géométrie.
function recomputeMoney() {
  const R = currentTour && currentTour.result;
  if (!R || !R.rows || R.rows.length !== currentTour.arrets.length) return; // géométrie absente/périmée
  const rows = currentTour.arrets.map((a, i) => rowFromArret(a, R.rows[i]));
  const geom = { totalKm: R.totalKm, totalMin: R.totalMin, kmHomeFirst: R.kmHomeFirst, kmLastHome: R.kmLastHome };
  currentTour.result = computeResultMoney(rows, geom);
  const i = tournees.findIndex((t) => t.id === currentTour.id); if (i >= 0) tournees[i] = currentTour; else tournees.push(currentTour);
  saveTournees();
  renderResultUI(currentTour.result);
}

// Recalcul complet GÉOMÉTRIE + argent (API). silent = ne change pas d'onglet, statut discret.
let _geoTimer = null;
function scheduleGeoRecalc() { clearTimeout(_geoTimer); _geoTimer = setTimeout(() => { if (currentTour && currentTour.arrets.length && S.home.lat) calcTour(true); }, 700); }

async function calcTour(silent) {
  const st = $('edStatus'); st.className = 'status';
  currentTour.date = $('edDate').value;
  if (!S.home.lat) { if (!silent) { st.className = 'status err'; st.textContent = 'Définissez l\'adresse de départ (Réglages).'; } return; }
  if (!currentTour.arrets.length) { if (!silent) { st.className = 'status err'; st.textContent = 'Ajoutez au moins un arrêt.'; } return; }
  try {
    st.textContent = silent ? 'Recalcul…' : 'Localisation des adresses…';
    for (const a of currentTour.arrets) { if (!a.addr.lat) { const g = await geocode(a.addr); a.addr.lat = g.lat; a.addr.lon = g.lon; if (S.provider === 'osm') await sleep(1100); } }
    const home = homeXY();
    if (!silent) st.textContent = 'Distances directes (seuil client proche)…';
    const stops = currentTour.arrets.map((a) => ({ lat: a.addr.lat, lon: a.addr.lon }));
    const fallbackDirect = (s) => haversineKm(home, s) * (S.roadFactor || 1.3);
    let directs;
    try { directs = await directMatrix(home, stops); directs = directs.map((d, i) => (d != null ? d : fallbackDirect(stops[i]))); }
    catch { directs = []; for (const s of stops) { try { const dr = await route([home, s]); directs.push(dr.totalKm); if (S.provider === 'osm') await sleep(1100); } catch { directs.push(fallbackDirect(s)); } } }
    if (!silent) st.textContent = 'Itinéraire de la tournée…';
    const points = [home, ...stops, home];
    const rt = await route(points); const legs = rt.legsKm;

    const rows = currentTour.arrets.map((a, i) => rowFromArret(a, { segKm: legs[i] != null ? legs[i] : 0, directKm: directs[i] }));
    const geom = { totalKm: rt.totalKm, kmHomeFirst: legs.length ? legs[0] : 0, kmLastHome: legs.length ? legs[legs.length - 1] : 0, totalMin: rt.totalMin || (rt.totalKm * 60 / (S.vitesseKmh || 50)) };
    currentTour.result = computeResultMoney(rows, geom);
    const i = tournees.findIndex((t) => t.id === currentTour.id); if (i >= 0) tournees[i] = currentTour; else tournees.push(currentTour);
    saveTournees();
    renderResultUI(currentTour.result);
    renderMap(rows.map((r) => ({ lat: r.lat, lon: r.lon, label: r.label })), home);
    st.className = 'status ok'; st.textContent = silent ? 'À jour ✔' : 'Frais calculés et enregistrés.';
  } catch (e) { st.className = 'status err'; st.textContent = 'Erreur : ' + e.message; }
}

// Rendu unique : tuiles (haut) + facture (répartition par client > cheval + HT/TVA/TTC).
function renderResultUI(R) {
  if (R) {
    $('rKm').textContent = km(R.totalKm); $('rMin').textContent = Math.round(R.totalMin) + ' min';
    $('rHT').textContent = eur(R.totalHT); $('rTVA').textContent = eur(R.totalTVA);
    $('rTTC').textContent = eur(R.totalTTC); $('rMarge').textContent = eur(R.marge);
  } else { ['rKm', 'rMin', 'rHT', 'rTVA', 'rTTC', 'rMarge'].forEach((id) => { $(id).textContent = '—'; }); }
  const box = $('edInvoice'); box.innerHTML = '';
  if (!R || !R.parClient || !R.parClient.length) { $('edInvoiceEmpty').style.display = 'block'; box.style.display = 'none'; return; }
  $('edInvoiceEmpty').style.display = 'none'; box.style.display = '';
  R.parClient.forEach((m) => {
    const el = document.createElement('div'); el.className = 'inv-client';
    let html = `<div class="inv-head"><span>${esc(m.nom)}</span><span class="inv-amt">${eur(m.totalTTC)} TTC</span></div>`;
    m.lignes.forEach((l) => {
      html += `<div class="inv-line"><span>📍 ${esc(l.adresse)} — ${TYPES[l.type]}</span><span>${eur(l.partTTC)}</span></div>`;
      if (l.chevalNoms.length) { const pc = l.partTTC / l.chevalNoms.length; l.chevalNoms.forEach((n) => { html += `<div class="inv-cheval"><span>🐴 ${esc(n)}</span><span>${eur(pc)}</span></div>`; }); }
      else html += `<div class="inv-cheval"><i>aucun cheval précisé</i></div>`;
    });
    el.innerHTML = html; box.appendChild(el);
  });
  const f = document.createElement('div'); f.className = 'inv-footer';
  f.innerHTML = `<div class="inv-line"><span>Total HT</span><span>${eur(R.totalHT)}</span></div>
    <div class="inv-line"><span>TVA (${R.tvaRate}%)</span><span>${eur(R.totalTVA)}</span></div>
    <div class="inv-line inv-total"><span>Total TTC</span><span>${eur(R.totalTTC)}</span></div>`;
  box.appendChild(f);
}

// Récap ANONYMISÉ (texte) : ni noms, ni adresses, ni chevaux — juste la répartition.
function recapText(R) {
  if (!R) return '';
  let s = `Frais de déplacement — ${currentTour.date}\n`;
  s += `Distance : ${km(R.totalKm)} · Durée : ${Math.round(R.totalMin)} min\n`;
  s += `Total HT ${eur(R.totalHT)} · TVA (${R.tvaRate}%) ${eur(R.totalTVA)} · Total TTC ${eur(R.totalTTC)}\n\n`;
  s += `Répartition (anonymisée) :\n`;
  (R.parClient || []).forEach((m, i) => {
    s += `• Client ${i + 1} : ${eur(m.totalTTC)} TTC\n`;
    let cn = 1;
    m.lignes.forEach((l) => { if (l.chevalNoms.length) { const pc = l.partTTC / l.chevalNoms.length; l.chevalNoms.forEach(() => { s += `   – Cheval ${cn++} : ${eur(pc)}\n`; }); } });
  });
  return s;
}

// ----- Facture détaillée : le calcul expliqué, étape par étape, avec les vraies valeurs -----
function factureDetailHtml(R) {
  const f = fuelPerKmHT(); const rows = R.rows;
  let legs = `<div class="inv-line"><span>🏠 Domicile → ${esc(rows[0] ? rows[0].label : '')}</span><span>${km(rows[0] ? rows[0].segKm : 0)}</span></div>`;
  for (let i = 1; i < rows.length; i++) legs += `<div class="inv-line"><span>${esc(rows[i - 1].label)} → ${esc(rows[i].label)}</span><span>${km(rows[i].segKm)}</span></div>`;
  legs += `<div class="inv-line"><span>${esc(rows.length ? rows[rows.length - 1].label : '')} → 🏠 Domicile</span><span>${km(R.kmLastHome)}</span></div>`;
  legs += `<div class="inv-line inv-total"><span>Km total de la boucle</span><span>${km(R.totalKm)}</span></div>`;

  const proches = rows.filter((r) => r.proche), loin = rows.filter((r) => !r.proche);
  const kmRetires = proches.reduce((s, r) => s + r.directKm, 0);
  let seuil = rows.map((r) => `<div class="inv-line"><span>${esc(r.label)} — domicile→arrêt ${km(r.directKm)} vs seuil ${S.seuilKm} km</span><span>${r.proche ? 'PROCHE → forfait' : '≥ seuil'}</span></div>`).join('');
  seuil += `<div class="inv-line inv-total"><span>Km retirés (aller simple des clients proches)</span><span>${km(kmRetires)}</span></div>`;

  const kmRestant = Math.max(0, R.totalKm - kmRetires);
  let rep = `<div class="inv-line"><span>Km restant = ${km(R.totalKm)} − ${km(kmRetires)}</span><span>${km(kmRestant)}</span></div>`;
  rep += loin.length ? loin.map((r) => `<div class="inv-line"><span>${esc(r.label)} — part « ${R.repartition} »</span><span>${km(r.kmAttribue)}</span></div>`).join('') : '<div class="inv-line"><i>tous les arrêts sont proches (forfait)</i></div>';

  const tar = rows.map((r) => r.proche
    ? `<div class="inv-line"><span>${esc(r.label)} — forfait client proche</span><span>${eur(r.montantHT)} HT → ${eur(r.montantTTC)} TTC</span></div>`
    : `<div class="inv-line"><span>${esc(r.label)} — ${km(r.kmAttribue)} × ${eurkm(r.tarifHT)} (${TYPES[r.type]})</span><span>${eur(r.montantHT)} HT → ${eur(r.montantTTC)} TTC</span></div>`).join('');

  const cli = R.parClient.map((m) => {
    let h = `<div class="inv-head"><span>${esc(m.nom)}</span><span class="inv-amt">${eur(m.totalTTC)} TTC</span></div>`;
    m.lignes.forEach((l) => {
      h += `<div class="inv-line"><span>📍 ${esc(l.adresse)} — ${TYPES[l.type]}</span><span>${eur(l.partTTC)}</span></div>`;
      if (l.chevalNoms.length) { const pc = l.partTTC / l.chevalNoms.length; l.chevalNoms.forEach((n) => { h += `<div class="inv-cheval"><span>🐴 ${esc(n)}</span><span>${eur(pc)} (÷${l.chevalNoms.length})</span></div>`; }); }
      else h += `<div class="inv-cheval"><i>aucun cheval précisé</i></div>`;
    });
    return `<div class="inv-client">${h}</div>`;
  }).join('');

  return `
    <div class="modal-head"><b>📄 Facture détaillée — exemple</b><button class="x" id="mX">✕</button></div>
    <p class="banner">Données fictives (clients, adresses, chevaux). Seuls vos tarifs, TVA et mode de répartition réels sont appliqués.</p>
    <p class="hint">Comment le total et la répartition sont obtenus, dans l'ordre du calcul.</p>
    <div class="fd-step"><h4>① Contexte &amp; tarifs</h4><div class="fd-zone">
      Carburant HT/km = (${S.consoL100} ÷ 100) × ${eur(S.prixPleinL)} ÷ (1 + ${S.tvaRate}%) = <b>${eurkm(f)}</b><br>
      Tarifs HT : ${Object.keys(TYPES).map((t) => `${TYPES[t]} <b>${eurkm(tarifHT(t))}</b>`).join(' · ')}<br>
      Seuil « client proche » : ${S.seuilKm} km · Forfait : ${eur(S.forfait)} HT · TVA : ${S.tvaRate}% · Répartition : « ${R.repartition} »
    </div></div>
    <div class="fd-step"><h4>② Mesure de la boucle (km réels, domicile → arrêts → domicile)</h4><div class="fd-zone">${legs}</div></div>
    <div class="fd-step"><h4>③ Détection des clients proches (seuil)</h4><div class="fd-zone">${seuil}</div></div>
    <div class="fd-step"><h4>④ Répartition du km restant (${R.repartition})</h4><div class="fd-zone">${rep}</div></div>
    <div class="fd-step"><h4>⑤ Application des tarifs par type + TVA</h4><div class="fd-zone">${tar}</div></div>
    <div class="fd-step"><h4>⑥ Répartition par client › adresse › cheval</h4>${cli}</div>
    <div class="fd-step"><h4>⑦ Totaux de la tournée</h4><div class="fd-zone">
      <div class="inv-line"><span>Total HT</span><span>${eur(R.totalHT)}</span></div>
      <div class="inv-line"><span>TVA (${R.tvaRate}%)</span><span>${eur(R.totalTVA)}</span></div>
      <div class="inv-line inv-total"><span>Total TTC</span><span>${eur(R.totalTTC)}</span></div>
      <div class="inv-line"><span>Carburant réel payé (TVAC)</span><span>${eur(R.fuelReel)}</span></div>
      <div class="inv-line"><span>Marge (total HT − carburant HT)</span><span>${eur(R.marge)}</span></div>
    </div></div>`;
}
// Jeu de données FICTIF pour la facture détaillée (illustration) — calculé avec vos tarifs réels.
function exampleResult() {
  const mk = (adresse, type, clients, segKm, directKm) => ({
    label: clients.map((c) => c.nom + (c.chevalNoms.length ? ' (' + c.chevalNoms.join(', ') + ')' : '')).join(' + '),
    adresse, lat: null, lon: null, type, nbClients: clients.length, clients, segKm, directKm,
  });
  const rows = [
    mk('Rue de l\'Exemple 1, 5000 Ville-A', 'tournee', [{ clientId: 'd', nom: 'Client Dupont (ex.)', chevalNoms: ['Bella'] }], 15, 35),
    mk('Chemin Fictif 2, 5100 Ville-B', 'tournee', [{ clientId: 'd', nom: 'Client Dupont (ex.)', chevalNoms: ['Filou'] }], 12, 30),
    mk('Route Modèle 3, 5200 Ville-C', 'visite', [{ clientId: 'm', nom: 'Client Martin (ex.)', chevalNoms: ['Rex'] }, { clientId: 'l', nom: 'Client Leroy (ex.)', chevalNoms: ['Nala', 'Étoile'] }], 20, 40),
  ];
  const kmLastHome = 28;
  const totalKm = rows.reduce((s, r) => s + r.segKm, 0) + kmLastHome;
  return computeResultMoney(rows, { totalKm, kmHomeFirst: rows[0].segKm, kmLastHome, totalMin: Math.round(totalKm * 60 / (S.vitesseKmh || 50)) });
}
function openFactureDetail() {
  openModal(factureDetailHtml(exampleResult()));
  $('mX').addEventListener('click', closeModal);
}

// ================= ACCUEIL =================
function renderHome() {
  const list = $('homeTours'); list.innerHTML = '';
  const items = [...tournees].filter((t) => tourStatus(t.date) !== 'cloturee').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  $('homeToursEmpty').style.display = items.length ? 'none' : 'block';
  items.forEach((t) => list.appendChild(tourListItem(t, true)));
}
function modalVehicule() {
  openModal(`<div class="modal-head"><b>🚗 Véhicule</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Que voulez-vous corriger ?</p>
    <div class="actions"><button class="btn block" id="vPlein">⛽ Valider un plein (prix du carburant)</button></div>
    <div class="actions"><button class="btn block" id="vConso">🚗 Corriger la consommation</button></div>`);
  $('mX').addEventListener('click', closeModal);
  $('vPlein').addEventListener('click', modalPlein);
  $('vConso').addEventListener('click', modalConso);
}
function modalPlein() {
  openModal(`<div class="modal-head"><b>⛽ Valider un plein</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Prix TVAC (à la pompe). Corrige le carburant de tous les tarifs.</p>
    <label>Prix au litre (€/L, TVAC)<input type="number" id="pL" step="0.01" min="0" value="${S.prixPleinL}" /></label>
    <p class="hint" id="pBreak"></p>
    <details class="assistant"><summary>Je n'ai que le montant total</summary><div class="row"><label class="grow">Montant (€)<input type="number" id="pM" step="0.01" min="0"/></label><label class="grow">Litres<input type="number" id="pLi" step="0.01" min="0"/></label></div><button class="btn small" id="pCalc">Déduire le €/L</button></details>
    <div class="actions"><button class="btn primary block" id="pOk">Valider le plein</button></div>`);
  $('mX').addEventListener('click', closeModal);
  const upd = () => { const v = parseFloat($('pL').value) || 0; const r = rate(); const ht = v / (1 + r), tva = v - ht; $('pBreak').innerHTML = v > 0 ? `HT : <b>${eur(ht)}</b>/L · TVA (${S.tvaRate}%) : <b>${eur(tva)}</b>/L` : ''; };
  upd(); $('pL').addEventListener('input', upd);
  $('pCalc').addEventListener('click', () => { const m = parseFloat($('pM').value), li = parseFloat($('pLi').value); if (m > 0 && li > 0) $('pL').value = Math.round((m / li) * 1000) / 1000; upd(); });
  $('pOk').addEventListener('click', () => { const v = parseFloat($('pL').value); if (v > 0) { S.prixPleinL = v; saveSettings(); } closeModal(); });
}
function modalConso() {
  openModal(`<div class="modal-head"><b>🚗 Corriger la consommation</b><button class="x" id="mX">✕</button></div>
    <label>Consommation (L / 100 km)<input type="number" id="cV" step="0.1" min="0" value="${S.consoL100}" /></label>
    <div class="actions"><button class="btn primary block" id="cOk">Valider</button></div>`);
  $('mX').addEventListener('click', closeModal);
  $('cOk').addEventListener('click', () => { const v = parseFloat($('cV').value); if (v > 0) { S.consoL100 = v; saveSettings(); } closeModal(); });
}

// ================= PAGE CALCUL =================
function calculExample() {
  const arr = [
    { nom: 'A — client proche', type: 'tournee', seg: 12, direct: Math.max(1, Math.round(S.seuilKm * 0.4)), clients: 1, chevaux: 1 },
    { nom: 'B — écurie partagée', type: 'tournee', seg: 20, direct: S.seuilKm + 12, clients: 2, chevaux: 2 },
    { nom: 'C — urgence', type: 'urgence', seg: 13, direct: S.seuilKm + 25, clients: 1, chevaux: 1 },
  ];
  const kmRetour = 15; const total = arr.reduce((s, a) => s + a.seg, 0) + kmRetour;
  arr.forEach((a) => (a.proche = (S.repartition === 'parclient') && a.direct < S.seuilKm));
  const loin = arr.filter((a) => !a.proche);
  const kmProches = arr.filter((a) => a.proche).reduce((s, a) => s + a.direct, 0);
  const kmRestant = Math.max(0, total - kmProches);
  const sumSeg = loin.reduce((s, a) => s + a.seg, 0), sumCli = loin.reduce((s, a) => s + a.clients, 0);
  arr.forEach((a) => {
    if (a.proche) { a.km = 0; a.montant = ttc(S.forfait); }
    else { a.km = S.repartition === 'prorata' && sumSeg ? kmRestant * a.seg / sumSeg : S.repartition === 'parclient' && sumCli ? kmRestant * a.clients / sumCli : kmRestant / loin.length; a.montant = ttc(a.km * tarifHT(a.type)); }
  });
  return { arr, total, kmRetour, kmProches, kmRestant };
}
function renderCalcul() {
  const f = fuelPerKmHT();
  const modes = [
    ['egal', 'Parts égales (équitable)', 'Le km total est divisé en parts identiques entre TOUS les arrêts. Chacun paie la même distance. Le seuil/forfait « client proche » ne s\'applique pas.'],
    ['prorata', 'Au prorata du segment', 'Chaque arrêt paie proportionnellement à la longueur de son segment : les plus éloignés paient davantage. Le seuil/forfait « client proche » ne s\'applique pas.'],
    ['parclient', 'Par client + client proche', 'Les clients sous le seuil sont facturés au forfait et sortis du partage ; le reste est réparti selon le nombre de clients à chaque arrêt.'],
  ];
  const modesHtml = modes.map(([k, t, d]) => `<div class="cr-line">${k === S.repartition ? '▶' : '•'} <b>${t}</b>${k === S.repartition ? ' — <span class="badge">actif</span>' : ''} — ${d}</div>`).join('');
  const tarifRows = Object.keys(TYPES).map((t) => `<tr><td>${TYPES[t]}</td><td>${eurkm(S.vehicule[t] || 0)}</td><td>${eurkm(f)}</td><td>${eurkm(tarifHT(t))}</td><td class="strong">${eurkm(ttc(tarifHT(t)))}</td></tr>`).join('');
  const ex = calculExample();
  const exRows = ex.arr.map((a, i) => `<tr><td>${i + 1}. ${a.nom}</td><td>${a.proche ? 'oui' : '—'}</td><td>${a.proche ? 'forfait' : km(a.km)}</td><td>${eur(a.montant)}</td></tr>`).join('');
  const totEx = ex.arr.reduce((s, a) => s + a.montant, 0);
  $('calculBody').innerHTML = `
    <section class="card"><h2>Comment sont calculés les frais</h2><p>On mesure les vrais km de la boucle, on met à part les « clients proches » (forfait), on partage le reste sur les autres arrêts, puis on divise par client et par cheval. La TVA est ajoutée à la fin. Les valeurs sont <b>vos réglages actuels</b>.</p></section>
    <section class="card"><h2><span class="step-n">1</span>Le coût du kilomètre (HT)</h2><p>Tarif au km = <b>part véhicule</b> (fixe, HT) + <b>carburant HT</b>. Le carburant à la pompe est TVAC, on le ramène en HT :</p>
      <div class="formula">carburant HT/km = (${S.consoL100} ÷ 100) × ${eur(S.prixPleinL)} ÷ (1 + ${S.tvaRate}%) = <b>${eurkm(f)}</b></div>
      <div class="table-wrap"><table><thead><tr><th>Type</th><th>Véhicule HT</th><th>Carburant HT</th><th>Tarif HT</th><th>TTC</th></tr></thead><tbody>${tarifRows}</tbody></table></div></section>
    <section class="card"><h2><span class="step-n">2</span>Le kilométrage total</h2><p>La boucle complète est mesurée par l'API : <b>domicile → 1ᵉʳ arrêt → … → dernier arrêt → domicile</b>. L'aller vers le 1ᵉʳ arrêt <u>et</u> le retour sont <b>tous deux inclus</b> dans le total réparti.</p></section>
    <section class="card"><h2><span class="step-n">3</span>Les clients proches (forfait) — mode « par client » uniquement</h2><p><b>Uniquement</b> quand la répartition est « par client » : si la distance routière domicile→arrêt &lt; <b>seuil (${S.seuilKm} km)</b>, le client est « proche », facturé au <b>forfait (${eur(S.forfait)} HT)</b> et <b>sorti du partage</b>. On retire alors du km total sa <b>distance aller simple domicile→client</b> (additionnée s'il y a plusieurs clients proches). En modes « parts égales » et « prorata », cette étape ne s'applique pas.</p><div class="formula">km restant = km total de la boucle − Σ (aller domicile→client de chaque client proche)</div></section>
    <section class="card"><h2><span class="step-n">4</span>La répartition du kilométrage</h2>
      <p>Le <b>km restant</b> (retour compris) est réparti entre les arrêts <b>non proches</b>, puis multiplié par le €/km HT du type de chaque arrêt. Trois méthodes, réglables dans Réglages :</p>
      ${modesHtml}
      <p class="hint">Méthode active : « <b>${S.repartition}</b> ». La règle « parts égales » est le partage <b>équitable</b> d'une tournée commune : chaque client restant paie la même part du chemin, quel que soit son éloignement, une fois les clients proches sortis.</p></section>
    <section class="card"><h2><span class="step-n">5</span>Par client, par cheval, + TVA</h2><p>Frais d'un arrêt ÷ nombre de clients = part de chaque client. La part est ensuite ÷ nombre de chevaux de ce client à cet endroit = coût par cheval. La <b>TVA (${S.tvaRate}%)</b> est appliquée pour obtenir le TTC.</p></section>
    <section class="card"><h2>Exemple chiffré (TTC, avec vos tarifs)</h2><p class="hint">3 arrêts, boucle de ${km(ex.total)} (dont ${km(ex.kmRetour)} de retour). A proche → forfait ; B partagé par 2 clients ; C urgence.</p>
      <div class="table-wrap"><table><thead><tr><th>Arrêt</th><th>Proche</th><th>Km attribué</th><th>Frais TTC</th></tr></thead><tbody>${exRows}</tbody></table></div>
      <div class="formula">Km partagé = ${km(ex.total)} − ${km(ex.kmProches)} = <b>${km(ex.kmRestant)}</b> · Total TTC = <b>${eur(totEx)}</b></div></section>
    <section class="card"><h2>Facture détaillée (exemple)</h2><p class="hint">Un exemple complet, étape par étape, avec des <b>données fictives</b> (clients, adresses, chevaux) et vos tarifs réels.</p><div class="actions"><button class="btn block" id="calcFactureBtn">📄 Voir la facture détaillée (exemple)</button></div></section>`;
  const fb = $('calcFactureBtn'); if (fb) fb.addEventListener('click', openFactureDetail);
}

// ================= RÉGLAGES =================
function bindSettings() {
  const set = (id, val) => { if ($(id)) $(id).value = val; };
  mountAddress($('homeAddr'), S.home, (a) => { S.home = a; saveSettings(); });
  set('setConso', S.consoL100); set('setPrixPlein', S.prixPleinL); set('setTva', S.tvaRate);
  set('vehTournee', S.vehicule.tournee); set('vehVisite', S.vehicule.visite); set('vehUrgence', S.vehicule.urgence);
  set('setSeuil', S.seuilKm); set('setForfait', S.forfait); set('setRepartition', S.repartition);
  set('setRayon', S.rayonMemeEcurieKm); set('setProvider', S.provider); set('setKey', S.geoapifyKey);
  toggleKeyRow(); refreshTarifTable();
  const num = (id, key) => { const e = $(id); if (e) e.addEventListener('input', (ev) => { S[key] = parseFloat(ev.target.value) || 0; saveSettings(); }); };
  num('setConso', 'consoL100'); num('setPrixPlein', 'prixPleinL'); num('setTva', 'tvaRate'); num('setSeuil', 'seuilKm'); num('setForfait', 'forfait'); num('setRayon', 'rayonMemeEcurieKm');
  const veh = (id, key) => $(id).addEventListener('input', (e) => { S.vehicule[key] = parseFloat(e.target.value) || 0; saveSettings(); });
  veh('vehTournee', 'tournee'); veh('vehVisite', 'visite'); veh('vehUrgence', 'urgence');
  $('setRepartition').addEventListener('change', (e) => { S.repartition = e.target.value; saveSettings(); });
  $('setProvider').addEventListener('change', (e) => { S.provider = e.target.value; saveSettings(); toggleKeyRow(); });
  $('setKey').addEventListener('input', (e) => { S.geoapifyKey = e.target.value.trim(); saveSettings(); });
  $('geocodeHome').addEventListener('click', async () => { const h = $('homeGeoHint'); h.textContent = 'Localisation…'; try { const g = await geocode(S.home); S.home.lat = g.lat; S.home.lon = g.lon; saveSettings(); h.textContent = 'Localisé ✔ (' + addrStr(S.home) + ')'; scheduleGeoRecalc(); } catch (e) { h.textContent = 'Erreur : ' + e.message; } });
}
function toggleKeyRow() { $('keyRow').style.display = S.provider === 'geoapify' ? 'block' : 'none'; }
function refreshTarifTable() {
  const f = fuelPerKmHT();
  if ($('fuelPerKm')) $('fuelPerKm').textContent = eurkm(f) + '/km';
  ['tournee', 'visite', 'urgence'].forEach((t) => { const cap = t[0].toUpperCase() + t.slice(1); if ($('fuel' + cap)) $('fuel' + cap).textContent = eurkm(f); if ($('tot' + cap)) $('tot' + cap).textContent = eurkm(tarifHT(t)); if ($('ttc' + cap)) $('ttc' + cap).textContent = eurkm(ttc(tarifHT(t))); });
}
function updateReglagesUI() {
  const r = rate(); const ht = S.prixPleinL / (1 + r), tva = S.prixPleinL - ht;
  if ($('pleinBreakdown')) $('pleinBreakdown').innerHTML = `Prix au litre — HT : <b>${eur(ht)}</b> · TVA : <b>${eur(tva)}</b> (TVAC ${eur(S.prixPleinL)}).`;
  const seuilActive = S.repartition === 'parclient';
  ['setSeuil', 'setForfait'].forEach((id) => { if ($(id)) $(id).disabled = !seuilActive; });
  ['lblSeuil', 'lblForfait'].forEach((id) => { if ($(id)) $(id).style.opacity = seuilActive ? '1' : '.45'; });
  if ($('forfaitBreakdown')) $('forfaitBreakdown').innerHTML = seuilActive ? `Forfait TTC : <b>${eur(ttc(S.forfait))}</b> (HT ${eur(S.forfait)}).` : '';
  if ($('seuilNote')) $('seuilNote').textContent = seuilActive
    ? '« Client proche » : distance domicile→arrêt < seuil → forfait, sorti du partage.'
    : 'Seuil et forfait inactifs pour ce mode : tous les arrêts partagent le kilométrage.';
}
function refreshEverywhere() {
  $('fuelChip').textContent = '⛽ ' + eur(S.prixPleinL) + '/L';
  $('consoChip').textContent = '🚗 ' + (S.consoL100 || 0) + ' L/100';
  refreshTarifTable(); updateReglagesUI();
  if ($('tab-accueil').classList.contains('active')) renderHome();
  if ($('tab-calcul').classList.contains('active')) renderCalcul();
}

// ================= BOOT =================
window.addEventListener('DOMContentLoaded', () => {
  checkForUpdate(); // vérifie une nouvelle version au lancement (ne bloque pas l'ouverture)
  const av = $('appVersion'); if (av) av.textContent = 'v' + APP_VERSION;
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.goto)));
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  bindSettings(); refreshEverywhere(); renderHome();

  $('btnVehicule').addEventListener('click', modalVehicule);
  $('btnNewTour').addEventListener('click', newTour);
  $('btnNewTour2').addEventListener('click', newTour);
  $('btnNewClient').addEventListener('click', () => editClient(null));
  $('edBack').addEventListener('click', () => showTab('tournees'));
  $('edAddArret').addEventListener('click', pickClientForArret);
  $('edMapBtn').addEventListener('click', showMapOnly);
  $('edReloc').addEventListener('click', forceRelocate);
  $('edDate').addEventListener('change', (e) => { currentTour.date = e.target.value; });
  $('edCalc').addEventListener('click', calcTour);
  $('edDelete').addEventListener('click', () => { if (confirm('Supprimer définitivement cette tournée ?')) { tournees = tournees.filter((t) => t.id !== currentTour.id); saveTournees(); showTab('tournees'); } });
  $('copyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(recapText(currentTour.result)); $('edStatus').className = 'status ok'; $('edStatus').textContent = 'Récap copié.'; } catch { $('edStatus').textContent = 'Copie impossible.'; } });
  $('smsBtn').addEventListener('click', () => { const t = recapText(currentTour.result); if (navigator.share) navigator.share({ text: t }).catch(() => {}); else location.href = 'sms:?body=' + encodeURIComponent(t); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});
