// Harness Lot 04-D — Carnet d'adresses (écuries réifiées) : liste, dédup, recherche.
// Exécution : node test/lot04d-carnet.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = path.join(__dirname, '..', 'app.js');
const REF = path.join(__dirname, '..', '..', '00 Developpement', 'GaloPodo', '_SAUVEGARDES-PROTEGEES', 'galopodo-19-07-2026_REFERENCE-NE-PAS-SUPPRIMER.json');

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
  const EPI = ';globalThis.__api={ecurieCarnet:ecurieCarnet,ecurieAddrOf:ecurieAddrOf,ecurieNomOf:ecurieNomOf,migrateEcuries:migrateEcuries,addrKey:addrKey,addrStr:addrStr,norm:norm,setAddrStatus:setAddrStatus,S:function(){return S},clients:function(){return clients}};';
  vm.runInContext(fs.readFileSync(APP, 'utf8') + EPI, sb, { filename: 'app.js' });
  return sb.__api;
}

console.log('\n── Lot 04-D : carnet d\'adresses ──');

// 1. Construction : privée (chez le client) + publique nommée + partagée par 2 clients → dédup par adresse.
{
  const ecurieAddr = { rue: 'Rue du Nord', numero: '10', cp: '5000', localite: 'Namur' };
  const cli = [
    { id: 'c1', prenom: 'Alice', nom: 'Martin', addr: { rue: 'Rue A', cp: '1000', localite: 'Ville' }, chevaux: [{ id: 'h1', nom: 'Bijou', addrSource: 'client' }] },
    { id: 'c2', prenom: 'Bob', nom: 'Durand', addr: { rue: 'Rue B', cp: '2000', localite: 'Bourg' }, chevaux: [{ id: 'h2', nom: 'Caramel', addrSource: 'specifique', adresses: [{ id: 'a2', nom: 'Écurie du Nord', actif: true, addr: ecurieAddr }] }] },
    { id: 'c3', prenom: 'Chloe', nom: 'Petit', addr: { rue: 'Rue C', cp: '3000', localite: 'Cité' }, chevaux: [{ id: 'h3', nom: 'Dune', addrSource: 'specifique', adresses: [{ id: 'a3', nom: 'Écurie du Nord', actif: true, addr: ecurieAddr }] }] },
  ];
  const api = boot({ tvaRate: 21, tvaRegime: 'normal', frais: [], materiel: [], amortissement: {}, articlesCatalogue: [], ecuries: [] }, cli);
  api.migrateEcuries();
  const carnet = api.ecurieCarnet();
  const noms = carnet.map(x => x.nom);
  // Attendu = 2 entrées : le domicile d'Alice (son cheval y vit) + l'Écurie du Nord (partagée).
  // Les domiciles de Bob et Chloé n'apparaissent PAS : leurs chevaux sont à l'écurie, donc aucun cheval chez eux
  // → pas d'écurie (règle verrouillée « domicile client SANS cheval → aucune écurie »).
  ok('1.1 le carnet ne liste que les adresses où vit un cheval', carnet.length === 2, JSON.stringify(noms));
  const nord = carnet.filter(x => api.norm(api.addrStr(x.addr)).indexOf('rue du nord') >= 0);
  ok('1.2 l\'écurie partagée par 2 clients n\'apparaît QU\'UNE fois (dédup)', nord.length === 1, 'occurrences: ' + nord.length);
  ok('1.3 elle porte son nom PUBLIC', nord.length === 1 && /Nord/.test(nord[0].nom), nord.length ? nord[0].nom : '—');
  ok('1.4 elle liste ses 2 occupants (chevaux + clients)', nord.length === 1 && nord[0].occupants.length === 2, nord.length ? JSON.stringify(nord[0].occupants) : '—');
  const priv = carnet.find(x => api.norm(api.addrStr(x.addr)).indexOf('rue a') >= 0);
  ok('1.5 l\'écurie privée est nommée d\'après le client', !!priv && /Martin/.test(priv.nom), priv ? priv.nom : '—');
  ok('1.6 et marquée privée', !!priv && priv.privee === true);

  // 2. Recherche (même filtre que la modale) : par cheval, par client, par rue.
  const search = (q) => { const nq = api.norm(q); return carnet.filter(x => api.norm(x.nom).indexOf(nq) >= 0 || api.norm(api.addrStr(x.addr)).indexOf(nq) >= 0 || x.occupants.some(p => api.norm(p.client).indexOf(nq) >= 0 || api.norm(p.cheval).indexOf(nq) >= 0)); };
  ok('2.1 recherche par CHEVAL trouve son écurie', search('caramel').length === 1 && /Nord/.test(search('caramel')[0].nom));
  ok('2.2 recherche par CLIENT trouve son écurie', search('petit').length === 1 && /Nord/.test(search('petit')[0].nom));
  ok('2.3 recherche par RUE fonctionne', search('rue du nord').length === 1);
  ok('2.4 recherche sans résultat renvoie vide', search('zzzz').length === 0);

  // 3. Liste noire : une adresse en liste noire sort du carnet (actives uniquement).
  const S = api.S(); S.addrStatus = S.addrStatus || {}; S.addrStatus[api.addrKey(ecurieAddr)] = 'noir'; // (on pose le statut directement : setAddrStatus déclenche un refresh d'UI)
  const apres = api.ecurieCarnet().filter(x => api.norm(api.addrStr(x.addr)).indexOf('rue du nord') >= 0);
  ok('3.1 une adresse en LISTE NOIRE disparaît du carnet', apres.length === 0, 'restant: ' + apres.length);
}

// 4. Sur données réelles : le carnet se construit sans erreur et reste cohérent.
if (fs.existsSync(REF)) {
  const bk = JSON.parse(fs.readFileSync(REF, 'utf8'));
  const api = boot(bk.settings || {}, bk.clients || []);
  api.migrateEcuries();
  const carnet = api.ecurieCarnet();
  ok('4.1 carnet construit sur données réelles', carnet.length > 0, carnet.length + ' entrées');
  ok('4.2 aucune entrée sans adresse', carnet.every(x => api.addrStr(x.addr).trim().length > 0));
  ok('4.3 aucune adresse en double', new Set(carnet.map(x => x.key)).size === carnet.length);
  ok('4.4 toutes les entrées ont un nom', carnet.every(x => (x.nom || '').trim().length > 0));
} else {
  console.log('  ⏭  sauvegarde de référence absente — test 4 sauté');
}

// 5. Le carnet remplace le champ « Reprendre une adresse connue » : il doit proposer AUSSI les lieux connus.
{
  const api = boot({ tvaRate: 21, tvaRegime: 'normal', frais: [], materiel: [], amortissement: {}, articlesCatalogue: [], ecuries: [],
    home: { rue: 'Rue du Depot', numero: '1', cp: '5000', localite: 'Namur' },
    adresses: [{ id: 'ad1', nom: 'Forge centrale', addr: { rue: 'Rue de la Forge', numero: '9', cp: '4000', localite: 'Liege' } }] },
    [{ id: 'c1', prenom: 'Alice', nom: 'Martin', addr: { rue: 'Rue A', cp: '1000', localite: 'Ville' }, chevaux: [{ id: 'h1', nom: 'Bijou', addrSource: 'client' }] }]);
  api.migrateEcuries();
  const carnet = api.ecurieCarnet();
  const has = (frag) => carnet.some(x => api.norm(api.addrStr(x.addr)).indexOf(api.norm(frag)) >= 0);
  ok('5.1 le DOMICILE figure dans le carnet', has('rue du depot'), JSON.stringify(carnet.map(x => x.nom)));
  ok('5.2 « Mes adresses » figurent dans le carnet', has('rue de la forge'));
  ok('5.3 ces lieux sont marqués comme tels (badge « lieu »)', carnet.filter(x => x.lieu).length === 2);
  ok('5.4 l\'écurie du client reste présente', has('rue a'));
}

// 6. Le champ « Reprendre une adresse connue » ne doit PLUS exister dans la fiche (déplacé dans la modale).
{
  const src = fs.readFileSync(APP, 'utf8');
  ok('6.1 plus de champ data-afind dans la fiche', src.indexOf('data-afind') === -1);
  ok('6.2 le bouton « Carnet d\'adresses » est bien présent', src.indexOf('data-acarnet') > 0);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
