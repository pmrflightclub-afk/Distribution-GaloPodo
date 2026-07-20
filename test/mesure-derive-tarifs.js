// MESURE (lecture seule) — de combien les factures des tournées CLÔTURÉES bougeraient
// si elles étaient recalculées avec la configuration enregistrée dans la sauvegarde du 19/07.
//
// Aucune écriture : on charge une COPIE de la sauvegarde en mémoire, on exécute la VRAIE chaîne
// de calcul d'app.js (pas une réimplémentation), et on compare au montant STOCKÉ dans t.result.
// L'écart mesuré = ce qu'un simple encaissement ou une annulation aurait fait bouger, avant le Lot 3.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REF = path.join(__dirname, '..', '..', '00 Developpement', 'GaloPodo', '_SAUVEGARDES-PROTEGEES', 'galopodo-19-07-2026_REFERENCE-NE-PAS-SUPPRIMER.json');
if (!fs.existsSync(REF)) { console.error('Sauvegarde de référence introuvable.'); process.exit(1); }
const snap = JSON.parse(fs.readFileSync(REF, 'utf8'));

// ---------- environnement navigateur minimal ----------
const store = {};
const seed = (k, v) => { store[k] = JSON.stringify(v); };
seed('ftr.settings', snap.settings || {});
seed('ftr.clients', snap.clients || []);
seed('ftr.tournees', snap.tours || []);
seed('ftr.archive', []);
seed('ftr.syncmeta', { hash: {}, upd: {} });
seed('ftr.tomb', {});

const noop = () => {};
const el = new Proxy({}, { get: (t, p) => {
  if (p === 'style' || p === 'dataset' || p === 'classList') return new Proxy({}, { get: () => noop, set: () => true });
  if (p === 'value' || p === 'textContent' || p === 'innerHTML') return '';
  if (p === 'children' || p === 'childNodes') return [];
  return typeof p === 'string' ? noop : undefined;
}, set: () => true });
const doc = {
  addEventListener: noop, removeEventListener: noop, createElement: () => el, createTextNode: () => el,
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  body: el, documentElement: el, head: el, readyState: 'loading',
};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  document: doc,
  navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: () => Promise.resolve(), addEventListener: noop } },
  location: { href: '', reload: noop, search: '' },
  fetch: () => Promise.reject(new Error('reseau desactive')),
  matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
  alert: noop, confirm: () => false, prompt: () => null,
  requestAnimationFrame: noop, URL: { createObjectURL: () => '', revokeObjectURL: noop },
  Blob: function () {}, FileReader: function () {}, Image: function () {}, TextEncoder, TextDecoder,
  CompressionStream: undefined, DecompressionStream: undefined,
  crypto: { getRandomValues: (a) => a, randomUUID: () => 'x' },
  performance: { now: () => 0 },
};
sandbox.addEventListener = noop; sandbox.removeEventListener = noop; sandbox.dispatchEvent = noop;
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
// Les `const` de niveau script ne deviennent pas des propriétés du global dans un contexte VM :
// on ré-exporte explicitement ce dont la mesure a besoin.
const EPILOGUE = ';globalThis.__api = { allTours: allTours, tarifHT: tarifHT, baseVehiculeHT: baseVehiculeHT,'
  + ' fuelPerKmHT: fuelPerKmHT, baseMateriel: baseMateriel, rate: rate, clientName: clientName,'
  + ' recomputeTourLocal: recomputeTourLocal, buildPriceSnap: buildPriceSnap,'
  + ' computeResultMoney: computeResultMoney, rowFromArret: rowFromArret, getS: function () { return S; } };';
try { vm.runInContext(SRC + EPILOGUE, sandbox, { filename: 'app.js' }); }
catch (e) { console.error('Chargement d\'app.js impossible : ' + e.message); process.exit(1); }

const API = sandbox.__api || {};
const need = ['computeResultMoney', 'rowFromArret', 'recomputeTourLocal', 'buildPriceSnap', 'allTours', 'tarifHT', 'baseVehiculeHT'];
const missing = need.filter((n) => typeof API[n] !== 'function');
if (missing.length) { console.error('Fonctions absentes : ' + missing.join(', ')); process.exit(1); }
Object.keys(API).forEach((k) => { sandbox[k] = API[k]; });

// ---------- mesure ----------
const eur = (n) => (Math.round((+n || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €';
const tours = sandbox.allTours().filter((t) => (t.closed || t.endedAt) && t.result && t.result.parClient);

console.log('\n=== Configuration de la sauvegarde du 19/07 ===');
console.log('  base véhicule : ' + sandbox.baseVehiculeHT().toFixed(4) + ' €/km   ·   tarif tournée : ' + sandbox.tarifHT('tournee').toFixed(4) + ' €/km');
console.log('\n=== Recalcul des ' + tours.length + ' tournées clôturées (LECTURE SEULE) ===\n');

let totalAvant = 0, totalApres = 0, nBouge = 0;
const lignes = [];
tours.forEach((t) => {
  const avantParClient = {};
  (t.result.parClient || []).forEach((p) => { avantParClient[p.clientId] = +p.totalTTC || 0; });
  const avant = Object.values(avantParClient).reduce((s, v) => s + v, 0);

  const copie = JSON.parse(JSON.stringify(t));   // COPIE : l'original n'est jamais touché
  delete copie.priceSnap;                         // on mesure le comportement AVANT le Lot 3
  let ok = false;
  try { ok = sandbox.recomputeTourLocal(copie); } catch (e) { lignes.push(['ERR', t.date, e.message]); return; }
  if (!ok) { lignes.push(['SKIP', t.date, 'géométrie absente/périmée — recalcul refusé']); return; }

  const apres = (copie.result.parClient || []).reduce((s, p) => s + (+p.totalTTC || 0), 0);
  totalAvant += avant; totalApres += apres;
  const d = apres - avant;
  if (Math.abs(d) > 0.005) nBouge++;
  const detail = (copie.result.parClient || []).map((p) => {
    const a = avantParClient[p.clientId]; const b = +p.totalTTC || 0;
    return (a == null) ? null : (Math.abs(b - a) > 0.005 ? '      ' + (sandbox.clientName ? sandbox.clientName(p.clientId) : p.clientId) + ' : ' + eur(a) + ' -> ' + eur(b) + '  (' + (b > a ? '+' : '') + eur(b - a) + ')' : null);
  }).filter(Boolean);
  lignes.push([Math.abs(d) > 0.005 ? 'DIFF' : 'OK', t.date, (t.nom || '').trim(), avant, apres, d, detail]);
});

lignes.forEach((L) => {
  if (L[0] === 'ERR') { console.log('  ⛔ ' + L[1] + ' — erreur : ' + L[2]); return; }
  if (L[0] === 'SKIP') { console.log('  ⏭  ' + L[1] + ' — ' + L[2]); return; }
  const [st, date, nom, avant, apres, d, detail] = L;
  if (st === 'OK') { console.log('  ✅ ' + date + (nom ? ' « ' + nom + ' »' : '') + ' — inchangé (' + eur(avant) + ')'); return; }
  console.log('  ⚠️  ' + date + (nom ? ' « ' + nom + ' »' : '') + ' — ' + eur(avant) + ' -> ' + eur(apres) + '   ÉCART ' + (d > 0 ? '+' : '') + eur(d));
  detail.forEach((x) => console.log(x));
});

console.log('\n=== Bilan ===');
console.log('  Tournées clôturées recalculées : ' + tours.length + '   ·   dont le montant BOUGE : ' + nBouge);
console.log('  Total facturé stocké   : ' + eur(totalAvant));
console.log('  Total après recalcul   : ' + eur(totalApres));
console.log('  ÉCART TOTAL            : ' + (totalApres - totalAvant > 0 ? '+' : '') + eur(totalApres - totalAvant));
console.log('\n  (Lecture seule : aucune donnée n\'a été modifiée. Écart = ce qu\'un encaissement');
console.log('   ou une annulation aurait fait bouger sur une facture close, avant le Lot 3.)\n');
