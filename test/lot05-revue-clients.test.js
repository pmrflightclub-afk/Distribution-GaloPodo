// Harness Lot 05 — modale de revue : fusion CHAMP PAR CHAMP d'un client importé.
// Exécution : node test/lot05-revue-clients.test.js
// Invariants testés : id LOCAL conservé · prêts et impayés JAMAIS écrasés (union) · aucun cheval retiré.
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = path.join(__dirname, '..', 'app.js');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); } };

function boot(clients) {
  const store = {}; const put = (k, v) => store[k] = JSON.stringify(v);
  put('ftr.settings', { tvaRate: 21, tvaRegime: 'normal', frais: [], materiel: [], amortissement: {}, articlesCatalogue: [], ecuries: [] });
  put('ftr.clients', clients); put('ftr.tournees', []); put('ftr.archive', []);
  put('ftr.syncmeta', { hash: {}, upd: {} }); put('ftr.tomb', {});
  const noop = () => {};
  const el = new Proxy({}, { get: (t, p) => (p === 'style' || p === 'dataset' || p === 'classList') ? new Proxy({}, { get: () => noop, set: () => true }) : (typeof p === 'string' ? noop : undefined), set: () => true });
  const doc = { addEventListener: noop, removeEventListener: noop, createElement: () => el, createTextNode: () => el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: el, documentElement: el, head: el, readyState: 'loading' };
  const sb = { console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop }, document: doc, navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: () => Promise.resolve(), addEventListener: noop } }, location: { href: '', reload: noop, search: '' }, fetch: () => Promise.reject(new Error('off')), matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), alert: noop, confirm: () => false, prompt: () => null, requestAnimationFrame: noop, URL: { createObjectURL: () => '', revokeObjectURL: noop }, Blob: function () {}, FileReader: function () {}, Image: function () {}, TextEncoder, TextDecoder, crypto: { getRandomValues: a => a, randomUUID: () => 'x' }, performance: { now: () => 0 } };
  sb.addEventListener = noop; sb.removeEventListener = noop; sb.dispatchEvent = noop; sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  const EPI = ';globalThis.__api={clientRevueDiff:clientRevueDiff,clientRevueNewChevaux:clientRevueNewChevaux,applyClientRevue:applyClientRevue,addrStr:addrStr,clients:function(){return clients}};';
  vm.runInContext(fs.readFileSync(APP, 'utf8') + EPI, sb, { filename: 'app.js' });
  return sb.__api;
}

const LOCAL = () => ({
  id: 'c1', prenom: 'Alice', nom: 'Martin', societe: '', email: 'ancien@mail.be', tel: '0470',
  addr: { rue: 'Rue A', numero: '1', cp: '1000', localite: 'Ville' },
  chevaux: [{ id: 'h1', nom: 'Bijou' }],
  prets: [{ id: 'p1', libelle: 'Cloche' }],
  impayes: [{ id: 'i1', montant: 120 }],
});
const IMPORTE = () => ({
  id: 'c1', prenom: 'Alice', nom: 'Martin-Dupont', societe: 'Écurie SA', email: 'nouveau@mail.be', tel: '0470',
  addr: { rue: 'Rue B', numero: '2', cp: '2000', localite: 'Bourg' },
  chevaux: [{ id: 'h1', nom: 'Bijou' }, { id: 'h2', nom: 'Caramel' }],
  prets: [{ id: 'p2', libelle: 'Guêtre' }],
  impayes: [{ id: 'i2', montant: 50 }],
});

console.log('\n── Lot 05 : revue champ par champ d\'un client importé ──');
{
  const api = boot([LOCAL()]);
  const local = api.clients()[0], imp = IMPORTE();
  const diff = api.clientRevueDiff(local, imp);
  const ks = diff.map(d => d.k);
  ok('1.1 seuls les champs DIVERGENTS sont listés', ks.indexOf('prenom') < 0 && ks.indexOf('tel') < 0, JSON.stringify(ks));
  ok('1.2 le nom divergent est détecté', ks.indexOf('nom') >= 0);
  ok('1.3 la société ajoutée est détectée', ks.indexOf('societe') >= 0);
  ok('1.4 l\'adresse divergente est détectée', ks.indexOf('addr') >= 0);
  ok('1.5 les deux valeurs sont proposées', diff.find(d => d.k === 'nom').local === 'Martin' && diff.find(d => d.k === 'nom').imported === 'Martin-Dupont');
  const neufs = api.clientRevueNewChevaux(local, imp);
  ok('1.6 le cheval seulement présent dans l\'import est proposé', neufs.length === 1 && neufs[0].nom === 'Caramel', JSON.stringify(neufs.map(h => h.nom)));
}

// 2. Application : on prend le nom importé, on garde l'adresse locale, on ajoute le cheval.
{
  const api = boot([LOCAL()]);
  const local = api.clients()[0], imp = IMPORTE();
  api.applyClientRevue(local, imp, { nom: 'imp', societe: 'imp' }, ['h2']);
  ok('2.1 le champ choisi « importé » est appliqué', local.nom === 'Martin-Dupont', local.nom);
  ok('2.2 la société importée est appliquée', local.societe === 'Écurie SA');
  ok('2.3 le champ NON choisi garde la valeur locale', /Rue A/.test(api.addrStr(local.addr)), api.addrStr(local.addr));
  ok('2.4 l\'email non choisi reste local', local.email === 'ancien@mail.be');
  ok('2.5 le cheval coché est ajouté', local.chevaux.some(h => h.nom === 'Caramel'));
  ok('2.6 le cheval existant n\'est pas dupliqué', local.chevaux.filter(h => h.nom === 'Bijou').length === 1, JSON.stringify(local.chevaux.map(h => h.nom)));
}

// 3. INVARIANTS de sécurité — c'est le cœur du lot.
{
  const api = boot([LOCAL()]);
  const local = api.clients()[0], imp = IMPORTE();
  api.applyClientRevue(local, imp, { nom: 'imp', addr: 'imp', societe: 'imp', email: 'imp' }, ['h2']);
  ok('3.1 l\'id LOCAL est conservé', local.id === 'c1');
  ok('3.2 le prêt LOCAL est préservé', local.prets.some(p => p.id === 'p1'), JSON.stringify(local.prets));
  ok('3.3 le prêt importé est ajouté (union, rien perdu)', local.prets.some(p => p.id === 'p2'));
  ok('3.4 l\'impayé LOCAL est préservé', local.impayes.some(i => i.id === 'i1'), JSON.stringify(local.impayes));
  ok('3.5 l\'impayé importé est ajouté', local.impayes.some(i => i.id === 'i2'));
  ok('3.6 aucun cheval local n\'est retiré', local.chevaux.some(h => h.id === 'h1'));
}

// 4. Cheval NON coché → pas ajouté (l'utilisateur décide).
{
  const api = boot([LOCAL()]);
  const local = api.clients()[0];
  api.applyClientRevue(local, IMPORTE(), {}, []);
  ok('4.1 un cheval non coché n\'est PAS ajouté', !local.chevaux.some(h => h.nom === 'Caramel'), JSON.stringify(local.chevaux.map(h => h.nom)));
  ok('4.2 mais prêts/impayés sont tout de même unis (jamais perdus)', local.prets.length === 2 && local.impayes.length === 2);
}

// 5. Aucune divergence → rien à arbitrer.
{
  const api = boot([LOCAL()]);
  const local = api.clients()[0];
  ok('5.1 deux fiches identiques ne produisent aucun conflit', api.clientRevueDiff(local, LOCAL()).length === 0);
  ok('5.2 ni aucun cheval à ajouter', api.clientRevueNewChevaux(local, LOCAL()).length === 0);
}

// 6. Un import PLUS PAUVRE ne doit pas pouvoir vider un champ si on garde le local.
{
  const api = boot([LOCAL()]);
  const local = api.clients()[0];
  const pauvre = { id: 'c1', prenom: '', nom: '', email: '', addr: { rue: '', cp: '', localite: '' }, chevaux: [] };
  const diff = api.clientRevueDiff(local, pauvre);
  ok('6.1 les champs vidés par l\'import sont signalés comme divergents', diff.length > 0);
  api.applyClientRevue(local, pauvre, {}, []); // on garde tout en local
  ok('6.2 en gardant le local, rien n\'est vidé', local.nom === 'Martin' && local.email === 'ancien@mail.be' && /Rue A/.test(api.addrStr(local.addr)));
  ok('6.3 les chevaux sont intacts', local.chevaux.length === 1);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
