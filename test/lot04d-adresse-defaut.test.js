// Harness Lot 04-D — le bug « adresse par défaut via l'arrêt qui revient à l'ancienne ».
// Exécution : node test/lot04d-adresse-defaut.test.js
//
// Cause : modalClientAddr (branche « ⭐ Par défaut ») appelait setChevalDefaultAddr (change addrSource/adresses)
// SANS relinkChevalEcurie. Or chevalAddr résout par h.ecurieId EN PRIORITÉ (Lot 04-D-1) → ecurieId périmé →
// chevalAddr renvoie l'ANCIENNE adresse → le cheval « revient » à son adresse d'origine.
// Ce test reproduit le mécanisme exact sur données réelles (Henri/Mélanie) et prouve que le relink corrige.
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = path.join(__dirname, '..', 'app.js');
const REF = path.join(__dirname, '..', '..', '00 Developpement', 'GaloPodo', '_SAUVEGARDES-PROTEGEES', 'galopodo-19-07-2026_REFERENCE-NE-PAS-SUPPRIMER.json');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); } };

function boot(clients, tours) {
  const store = {}; const put = (k, v) => store[k] = JSON.stringify(v);
  put('ftr.settings', { tvaRate: 21, tvaRegime: 'normal', frais: [], materiel: [], amortissement: {}, articlesCatalogue: [], ecuries: [] });
  put('ftr.clients', clients); put('ftr.tournees', tours); put('ftr.archive', []);
  put('ftr.syncmeta', { hash: {}, upd: {} }); put('ftr.tomb', {});
  const noop = () => {};
  const el = new Proxy({}, { get: (t, p) => (p === 'style' || p === 'dataset' || p === 'classList') ? new Proxy({}, { get: () => noop, set: () => true }) : (typeof p === 'string' ? noop : undefined), set: () => true });
  const doc = { addEventListener: noop, removeEventListener: noop, createElement: () => el, createTextNode: () => el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: el, documentElement: el, head: el, readyState: 'loading' };
  const sb = { console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop }, document: doc, navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: () => Promise.resolve(), addEventListener: noop } }, location: { href: '', reload: noop, search: '' }, fetch: () => Promise.reject(new Error('off')), matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), alert: noop, confirm: () => false, prompt: () => null, requestAnimationFrame: noop, URL: { createObjectURL: () => '', revokeObjectURL: noop }, Blob: function () {}, FileReader: function () {}, Image: function () {}, TextEncoder, TextDecoder, crypto: { getRandomValues: a => a, randomUUID: () => 'x' }, performance: { now: () => 0 } };
  sb.addEventListener = noop; sb.removeEventListener = noop; sb.dispatchEvent = noop; sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  const EPI = ';globalThis.__api={reconcileActiveTours:reconcileActiveTours,allTours:function(){return allTours()},clients:function(){return clients},setChevalDefaultAddr:setChevalDefaultAddr,relinkChevalEcurie:relinkChevalEcurie,migrateEcuries:migrateEcuries,chevalAddr:chevalAddr,norm:norm,addrStr:addrStr};';
  vm.runInContext(fs.readFileSync(APP, 'utf8') + EPI, sb, { filename: 'app.js' });
  return sb.__api;
}

const T = { rue: 'Place de la Gare', numero: '3', cp: '4031', localite: 'Angleur' };

console.log('\n── Lot 04-D : « adresse par défaut » applique bien la nouvelle adresse ──');

// 1. Mécanisme isolé : setChevalDefaultAddr SEUL laisse chevalAddr périmé (le bug) ; + relink corrige.
{
  const C = [{ id: 'cH', nom: 'Henri', prenom: 'H', addr: { rue: 'Rue des Roches', cp: '5644', localite: 'Mettet' }, chevaux: [{ id: 'h1', nom: 'Mirabelle', addrSource: 'client' }] }];
  const api = boot(C, []);
  api.migrateEcuries();
  const c = api.clients()[0], h = c.chevaux[0];
  const avant = api.addrStr(api.chevalAddr(c, h));
  ok('1.0 état initial : Mirabelle résout chez Henri (Rue des Roches)', /Roches/.test(avant), avant);

  // reproduit le BUG : setChevalDefaultAddr sans relink
  api.setChevalDefaultAddr(h, T);
  const sansRelink = api.addrStr(api.chevalAddr(c, h));
  ok('1.1 BUG confirmé : sans relink, chevalAddr renvoie l\'ANCIENNE adresse', /Roches/.test(sansRelink), 'obtenu: ' + sansRelink);

  // le FIX : relink après
  api.relinkChevalEcurie(c, h);
  const avecRelink = api.addrStr(api.chevalAddr(c, h));
  ok('1.2 FIX : avec relink, chevalAddr renvoie la NOUVELLE adresse', /Gare/.test(avecRelink), 'obtenu: ' + avecRelink);
}

// 2. Sur données réelles + tournée : le cheval MIGRE vraiment d'arrêt (ce que fait la modale corrigée + reconcile).
if (fs.existsSync(REF)) {
  const bk = JSON.parse(fs.readFileSync(REF, 'utf8'));
  const henri = (bk.clients || []).find(c => /Vandendreisch/i.test(c.nom));
  const tours = [{ id: 'trepro', date: '2026-09-15', arrets: [{ addr: JSON.parse(JSON.stringify(henri.addr)), clients: [{ clientId: henri.id, chevaux: [{ id: henri.chevaux[0].id, nom: henri.chevaux[0].nom, parage: true }, { id: henri.chevaux[1].id, nom: henri.chevaux[1].nom, parage: true }] }] }] }];
  const api = boot(JSON.parse(JSON.stringify(bk.clients)), tours);
  api.migrateEcuries();
  const c = api.clients().find(x => x.id === henri.id), f = c.chevaux[0];
  // simule modalClientAddr « Par défaut » CORRIGÉ : setChevalDefaultAddr + relink, puis reconcile
  api.setChevalDefaultAddr(f, T); api.relinkChevalEcurie(c, f); api.reconcileActiveTours();
  const t = api.allTours()[0];
  const arretDe = (nom) => (t.arrets || []).filter(a => (a.clients || []).some(cl => (cl.chevaux || []).some(cv => api.norm(cv.nom) === api.norm(nom)))).map(a => api.addrStr(a.addr));
  const ou = arretDe(f.nom);
  ok('2.1 le cheval déplacé n\'est plus qu\'à UN seul arrêt', ou.length === 1, JSON.stringify(ou));
  ok('2.2 et c\'est bien la NOUVELLE adresse (Place de la Gare)', ou.length === 1 && /Gare/.test(ou[0]), JSON.stringify(ou));
  ok('2.3 l\'autre cheval de Henri reste à l\'adresse d\'origine', arretDe(c.chevaux[1].nom).some(x => /Roches/.test(x)), JSON.stringify(arretDe(c.chevaux[1].nom)));
} else {
  console.log('  ⏭  sauvegarde de référence absente — test 2 sauté');
}

// 3. DÉDUP : la config réelle à 5 entrées (2× Rue des Roches, Rue de Fer, vide, active) se réduit + tombstones posés.
console.log('\n── Lot 04-D : dédup des adresses (avec tombstones anti-résurrection) ──');
{
  const C = [{ id: 'cM', nom: 'VanOch', prenom: 'M', addr: { rue: 'Hambeau', cp: '5580', localite: 'Belvaux' }, chevaux: [{ id: 'hT', nom: 'Test', addrSource: 'specifique', addrPrivee: true, adresses: [
    { id: 'a1', nom: '', actif: false, addr: { rue: 'Rue des Roches', numero: '58c', cp: '5644', localite: 'Mettet' } },
    { id: 'a2', nom: '', actif: false, addr: { rue: 'Rue des Roches', numero: '58c', cp: '5644', localite: 'Mettet' } },
    { id: 'a3', nom: '', actif: false, addr: { rue: 'Rue de Fer', cp: '5000', localite: 'Namur' } },
    { id: 'a4', nom: '', actif: false, addr: { rue: '', cp: '', localite: '' } },
    { id: 'a5', nom: '', actif: true, addr: { rue: 'Rue Tienne Stassin', numero: '5', cp: '5020', localite: 'Namur' } }
  ] }] }];
  const api = boot(C, []);
  const c = api.clients()[0], h = c.chevaux[0];
  api.setChevalDefaultAddr(h, { rue: 'Rue Tienne Stassin', numero: '5', cp: '5020', localite: 'Namur' });
  const keys = h.adresses.map(e => api.norm(api.addrStr(e.addr)));
  const uniq = new Set(keys.filter(Boolean));
  ok('3.1 plus aucun doublon d\'adresse', keys.filter(Boolean).length === uniq.size, JSON.stringify(keys));
  ok('3.2 plus d\'entrée vide', keys.every(Boolean), JSON.stringify(keys));
  ok('3.3 les 3 adresses distinctes conservées', uniq.size === 3, JSON.stringify([...uniq]));
  ok('3.4 une seule entrée active', h.adresses.filter(e => e.actif).length === 1);
  ok('3.5 tombstones adrDel posés sur les retirées (a2 doublon + a4 vide)', !!(h.adrDel && h.adrDel.a2 && h.adrDel.a4), JSON.stringify(h.adrDel));
  ok('3.6 l\'adresse active reste résolvable', /Stassin/.test(api.addrStr(api.chevalAddr(c, h))), api.addrStr(api.chevalAddr(c, h)));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
