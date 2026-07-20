// Harness LOT 4 — restauration Drive : fusion au lieu de remplacement en bloc, tombstones unis.
// Exécution : node test/lot4-restauration.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

// ---------------------------------------------------------------- app.js dans un contexte VM
function boot(seedTours, seedClients, seedTomb) {
  const store = {};
  const put = (k, v) => { store[k] = JSON.stringify(v); };
  put('ftr.settings', { tvaRate: 21, tvaRegime: 'normal', frais: [], materiel: [], amortissement: {}, articlesCatalogue: [], notesCredit: [] });
  put('ftr.clients', seedClients || []);
  put('ftr.tournees', seedTours || []);
  put('ftr.archive', []);
  put('ftr.syncmeta', { hash: {}, upd: {} });
  put('ftr.tomb', seedTomb || {});

  const noop = () => {};
  const el = new Proxy({}, { get: (t, p) => (p === 'style' || p === 'dataset' || p === 'classList') ? new Proxy({}, { get: () => noop, set: () => true }) : (typeof p === 'string' ? noop : undefined), set: () => true });
  const doc = { addEventListener: noop, removeEventListener: noop, createElement: () => el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: el, documentElement: el, head: el, readyState: 'loading' };
  const sandbox = {
    console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: doc, navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: () => Promise.resolve(), addEventListener: noop } },
    location: { href: '', reload: noop, search: '' }, fetch: () => Promise.reject(new Error('reseau off')),
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    alert: noop, confirm: () => false, prompt: () => null, requestAnimationFrame: noop,
    URL: { createObjectURL: () => '', revokeObjectURL: noop },
    Blob: function () {}, FileReader: function () {}, Image: function () {}, TextEncoder, TextDecoder,
    crypto: { getRandomValues: (a) => a, randomUUID: () => 'x' }, performance: { now: () => 0 },
  };
  sandbox.addEventListener = noop; sandbox.removeEventListener = noop; sandbox.dispatchEvent = noop;
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const EPI = ';globalThis.__api = { allTours: allTours, restoreDriveTournees: restoreDriveTournees,'
    + ' applyRemoteReplace: applyRemoteReplace, reinjectTour: reinjectTour, syncMeta: syncMeta,'
    + ' downloadSnapshot: function () {}, getClients: function () { return clients; } };';
  vm.runInContext(SRC + EPI, sandbox, { filename: 'app.js' });
  // neutralise le téléchargement de sauvegarde (pas de DOM ici)
  sandbox.downloadSnapshot = () => {};
  return { api: sandbox.__api, sandbox, store };
}

const mkTour = (id, over) => Object.assign({
  id, date: '2026-07-15', closed: true, updatedAt: 1000,
  arrets: [{ addr: { rue: 'Rue A', cp: '1234', localite: 'V' }, clients: [{ clientId: 'c1', validatedAt: 500, chevaux: [{ id: 'h1', nom: 'Guiness', parage: true }, { id: 'h2', nom: 'Honey', parage: true }] }] }],
  articles: [{ id: 'a1', libelle: 'Fers', chevalNoms: ['Guiness'] }],
  payments: { c1: { method: 'liquide', rectifie: 120, _ts: 900 } },
  result: { rows: [], parClient: [{ clientId: 'c1', totalTTC: 145.2 }] },
}, over);

console.log('\n── LOT 4 : « Fusionner les tournées » ne détruit plus rien ──');

// 1. une tournée LOCALE absente de la sauvegarde doit SURVIVRE (avant : supprimée en bloc)
{
  const locale = mkTour('t-locale', { date: '2026-08-22', closed: false });
  const amputee = mkTour('t1', { arrets: [{ addr: { rue: 'Rue A', cp: '1234', localite: 'V' }, clients: [{ clientId: 'c1', chevaux: [{ id: 'h1', nom: 'Guiness', parage: true }] }] }], articles: [], payments: {} });
  const { api } = boot([amputee, locale], [{ id: 'c1', nom: 'Dupont', chevaux: [{ id: 'h1', nom: 'Guiness' }, { id: 'h2', nom: 'Honey' }] }]);
  const snapshot = { tours: [mkTour('t1')], clients: [], settings: {} };   // la sauvegarde ne contient QUE t1
  api.restoreDriveTournees(snapshot, null, null);
  const apres = api.allTours();
  ok('1.1 la tournée locale absente de la sauvegarde est CONSERVÉE', !!apres.find((t) => t.id === 't-locale'), apres.map((t) => t.id).join(','));
  const t1 = apres.find((t) => t.id === 't1');
  ok('1.2 la tournée restaurée est bien revenue', !!t1);
  ok('1.3 ses chevaux sont restitués', t1 && t1.arrets[0].clients[0].chevaux.length === 2, t1 && String(t1.arrets[0].clients[0].chevaux.length));
  ok('1.4 son article est restitué', t1 && t1.articles.length === 1);
  ok('1.5 son paiement est restitué', t1 && Object.keys(t1.payments).length === 1);
}

// 2. la clôture ne RÉGRESSE jamais : une sauvegarde plus ancienne (non clôturée) ne dé-clôture pas
{
  const localeClose = mkTour('t1', { closed: true, endedAt: 2000 });
  const { api } = boot([localeClose], [{ id: 'c1', nom: 'D', chevaux: [{ id: 'h1', nom: 'Guiness' }, { id: 'h2', nom: 'Honey' }] }]);
  const snapshot = { tours: [mkTour('t1', { closed: false, endedAt: null, updatedAt: 10 })], clients: [], settings: {} };
  api.restoreDriveTournees(snapshot, null, null);
  const t1 = api.allTours().find((t) => t.id === 't1');
  ok('2.1 une version ANCIENNE non clôturée ne dé-clôture pas', !!(t1 && t1.closed === true), JSON.stringify(t1 && t1.closed));
}

// 3. le paiement présent localement n'est pas écrasé par une sauvegarde qui n'en a pas
{
  const locale = mkTour('t1', { payments: { c1: { method: 'virement', rectifie: 200, _ts: 5000 } } });
  const { api } = boot([locale], [{ id: 'c1', nom: 'D', chevaux: [{ id: 'h1', nom: 'Guiness' }, { id: 'h2', nom: 'Honey' }] }]);
  api.restoreDriveTournees({ tours: [mkTour('t1', { payments: {} })], clients: [], settings: {} }, null, null);
  const t1 = api.allTours().find((t) => t.id === 't1');
  ok('3.1 le paiement local (plus récent) est préservé', !!(t1 && t1.payments.c1 && t1.payments.c1.method === 'virement'), JSON.stringify(t1 && t1.payments));
}

// 4. ré-horodatage CIBLÉ : seules les tournées restaurées sont bumpées
{
  const t1 = mkTour('t1'); const autre = mkTour('t-autre', { date: '2026-08-22', updatedAt: 777 });
  const { api } = boot([t1, autre], [{ id: 'c1', nom: 'D', chevaux: [{ id: 'h1', nom: 'Guiness' }, { id: 'h2', nom: 'Honey' }] }]);
  const avant = api.allTours().find((t) => t.id === 't-autre').updatedAt;
  api.restoreDriveTournees({ tours: [mkTour('t1')], clients: [], settings: {} }, null, null);
  const apres = api.allTours().find((t) => t.id === 't-autre').updatedAt;
  ok('4.1 une tournée NON restaurée n’est pas ré-horodatée', avant === apres, avant + ' -> ' + apres);
}

console.log('\n── LOT 4 : applyRemoteReplace unit les tombstones au lieu de les remplacer ──');
{
  const { api, store } = boot([], [], { clients: { 'cLocal': 9999 } });
  api.applyRemoteReplace({ settings: {}, clients: [], tours: [], tomb: { clients: { 'cDistant': 5555 } } });
  const tomb = JSON.parse(store['ftr.tomb'] || '{}');
  ok('5.1 le tombstone LOCAL survit', !!(tomb.clients && tomb.clients.cLocal === 9999), JSON.stringify(tomb));
  ok('5.2 le tombstone DISTANT est intégré', !!(tomb.clients && tomb.clients.cDistant === 5555));
}
{
  const { api, store } = boot([], [], { clients: { 'cX': 100 } });
  api.applyRemoteReplace({ settings: {}, clients: [], tours: [], tomb: { clients: { 'cX': 900 } } });
  const tomb = JSON.parse(store['ftr.tomb'] || '{}');
  ok('5.3 sur un même id, le tombstone le plus RÉCENT gagne', tomb.clients.cX === 900, JSON.stringify(tomb.clients));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
