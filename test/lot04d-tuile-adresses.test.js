// Harness — la tuile « Adresses » (Stats → Clientèle) compte AUSSI les adresses abandonnées.
// Exécution : node test/lot04d-tuile-adresses.test.js
// Avant : seule l'adresse ACTIVE résolue de chaque cheval était comptée → les anciennes adresses
// (déménagement, h.addrHistory) et les autres adresses propres non actives étaient invisibles.
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = path.join(__dirname, '..', 'app.js');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); } };

function boot(settings, clients) {
  const store = {}; const put = (k, v) => store[k] = JSON.stringify(v);
  put('ftr.settings', settings); put('ftr.clients', clients);
  put('ftr.tournees', []); put('ftr.archive', []);
  put('ftr.syncmeta', { hash: {}, upd: {} }); put('ftr.tomb', {});
  const noop = () => {};
  const el = new Proxy({}, { get: (t, p) => (p === 'style' || p === 'dataset' || p === 'classList') ? new Proxy({}, { get: () => noop, set: () => true }) : (typeof p === 'string' ? noop : undefined), set: () => true });
  const doc = { addEventListener: noop, removeEventListener: noop, createElement: () => el, createTextNode: () => el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: el, documentElement: el, head: el, readyState: 'loading' };
  const sb = { console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop }, document: doc, navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: () => Promise.resolve(), addEventListener: noop } }, location: { href: '', reload: noop, search: '' }, fetch: () => Promise.reject(new Error('off')), matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), alert: noop, confirm: () => false, prompt: () => null, requestAnimationFrame: noop, URL: { createObjectURL: () => '', revokeObjectURL: noop }, Blob: function () {}, FileReader: function () {}, Image: function () {}, TextEncoder, TextDecoder, crypto: { getRandomValues: a => a, randomUUID: () => 'x' }, performance: { now: () => 0 } };
  sb.addEventListener = noop; sb.removeEventListener = noop; sb.dispatchEvent = noop; sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  const EPI = ';globalThis.__api={chevalAddresses:chevalAddresses,addrKey:addrKey,addrStr:addrStr,addrStatusOf:addrStatusOf,S:function(){return S}};';
  vm.runInContext(fs.readFileSync(APP, 'utf8') + EPI, sb, { filename: 'app.js' });
  return sb.__api;
}

const A_ACT = { rue: 'Rue Actuelle', numero: '1', cp: '5000', localite: 'Namur' };
const A_AUTRE = { rue: 'Rue Secondaire', numero: '2', cp: '5000', localite: 'Namur' };
const A_ANCIENNE = { rue: 'Rue Ancienne', numero: '3', cp: '4000', localite: 'Liege' };

console.log('\n── Tuile « Adresses » : les adresses abandonnées sont comptées ──');
{
  const cli = [{ id: 'c1', prenom: 'Alice', nom: 'Martin', addr: { rue: 'Rue Client', cp: '1000', localite: 'Ville' }, chevaux: [{
    id: 'h1', nom: 'Bijou', addrSource: 'specifique',
    adresses: [{ id: 'a1', nom: '', actif: true, addr: A_ACT }, { id: 'a2', nom: '', actif: false, addr: A_AUTRE }],
    addrHistory: [A_ANCIENNE]
  }] }];
  const api = boot({ tvaRate: 21, tvaRegime: 'normal', frais: [], materiel: [], amortissement: {}, articlesCatalogue: [], ecuries: [] }, cli);
  const addrs = api.chevalAddresses();
  const keys = addrs.map(e => api.norm ? '' : api.addrStr(e.addr));
  ok('1.1 les 3 adresses sont répertoriées (active + autre + ancienne)', addrs.length === 3, JSON.stringify(addrs.map(e => api.addrStr(e.addr))));
  const act = addrs.filter(e => e.active);
  ok('1.2 une seule est marquée EN USAGE', act.length === 1, JSON.stringify(act.map(e => api.addrStr(e.addr))));
  ok('1.3 et c\'est bien l\'adresse actuelle', act.length === 1 && /Actuelle/.test(api.addrStr(act[0].addr)));
  ok('1.4 l\'ancienne adresse est présente mais NON en usage', addrs.some(e => /Ancienne/.test(api.addrStr(e.addr)) && !e.active));
  ok('1.5 l\'autre adresse propre est présente mais NON en usage', addrs.some(e => /Secondaire/.test(api.addrStr(e.addr)) && !e.active));

  // Comptage de la tuile (même règle que renderClienteleStats)
  const stA = (e) => api.addrStatusOf(e.addr);
  const aNoir = addrs.filter(e => stA(e) === 'noir').length;
  const aInact = addrs.filter(e => stA(e) !== 'noir' && (stA(e) === 'inactif' || !e.active)).length;
  const aAct = addrs.filter(e => stA(e) === 'actif' && e.active).length;
  ok('2.1 Actives = 1 (seule celle en usage)', aAct === 1, String(aAct));
  ok('2.2 Inactives = 2 (abandonnées, sans avoir été marquées)', aInact === 2, String(aInact));
  ok('2.3 Liste noire = 0', aNoir === 0);
  ok('2.4 le total est cohérent (actives + inactives + noires = répertoriées)', aAct + aInact + aNoir === addrs.length);

  // Une adresse abandonnée passée en liste noire bascule bien dans « Liste noire »
  const S = api.S(); S.addrStatus = S.addrStatus || {}; S.addrStatus[api.addrKey(A_ANCIENNE)] = 'noir';
  const addrs2 = api.chevalAddresses();
  const n2 = addrs2.filter(e => api.addrStatusOf(e.addr) === 'noir').length;
  const i2 = addrs2.filter(e => api.addrStatusOf(e.addr) !== 'noir' && (api.addrStatusOf(e.addr) === 'inactif' || !e.active)).length;
  ok('3.1 une ancienne adresse en liste noire est désormais VISIBLE et comptée', n2 === 1, String(n2));
  ok('3.2 et elle sort du compte des inactives', i2 === 1, String(i2));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
