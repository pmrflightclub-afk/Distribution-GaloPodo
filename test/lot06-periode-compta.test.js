// Harness Lot 06 — période comptable PAR CLIENT (mois + état) et synthèse par tournée.
// Exécution : node test/lot06-periode-compta.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = path.join(__dirname, '..', 'app.js');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); } };

function boot(settings, tours) {
  const store = {}; const put = (k, v) => store[k] = JSON.stringify(v);
  put('ftr.settings', Object.assign({ tvaRate: 21, tvaRegime: 'normal', frais: [], materiel: [], amortissement: {}, articlesCatalogue: [], ecuries: [] }, settings));
  put('ftr.clients', [{ id: 'cA', prenom: 'A', nom: 'Alpha' }, { id: 'cB', prenom: 'B', nom: 'Beta' }]);
  put('ftr.tournees', tours); put('ftr.archive', []);
  put('ftr.syncmeta', { hash: {}, upd: {} }); put('ftr.tomb', {});
  const noop = () => {};
  const el = new Proxy({}, { get: (t, p) => (p === 'style' || p === 'dataset' || p === 'classList') ? new Proxy({}, { get: () => noop, set: () => true }) : (typeof p === 'string' ? noop : undefined), set: () => true });
  const doc = { addEventListener: noop, removeEventListener: noop, createElement: () => el, createTextNode: () => el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: el, documentElement: el, head: el, readyState: 'loading' };
  const sb = { console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop }, document: doc, navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: () => Promise.resolve(), addEventListener: noop } }, location: { href: '', reload: noop, search: '' }, fetch: () => Promise.reject(new Error('off')), matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), alert: noop, confirm: () => false, prompt: () => null, requestAnimationFrame: noop, URL: { createObjectURL: () => '', revokeObjectURL: noop }, Blob: function () {}, FileReader: function () {}, Image: function () {}, TextEncoder, TextDecoder, crypto: { getRandomValues: a => a, randomUUID: () => 'x' }, performance: { now: () => 0 } };
  sb.addEventListener = noop; sb.removeEventListener = noop; sb.dispatchEvent = noop; sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  const EPI = ';globalThis.__api={clientComptaPeriod:clientComptaPeriod,tourComptaPeriodSummary:tourComptaPeriodSummary,comptaPeriodBanner:comptaPeriodBanner,comptaLocked:comptaLocked,todayStr:todayStr,allTours:function(){return allTours()}};';
  vm.runInContext(fs.readFileSync(APP, 'utf8') + EPI, sb, { filename: 'app.js' });
  return sb.__api;
}

// tournée du mois PASSÉ (pour tester « à déclarer ») et du mois COURANT (pour « en cours »)
const d = new Date(); const curYm = d.toISOString().slice(0, 7);
const prev = new Date(d.getFullYear(), d.getMonth() - 1, 15); const prevYm = prev.toISOString().slice(0, 7);
const mkTour = (id, date, payments) => ({ id, date, closed: true, payments: payments || {}, arrets: [{ addr: { rue: 'R' }, clients: [{ clientId: 'cA', chevaux: [] }, { clientId: 'cB', chevaux: [] }] }] });

console.log('\n── Lot 06 : période comptable par client ──');

// 1. États de base
{
  const api = boot({}, [mkTour('t1', prevYm + '-15'), mkTour('t2', curYm + '-05')]);
  const p1 = api.clientComptaPeriod(api.allTours().find(t => t.id === 't1'), 'cA');
  ok('1.1 mois passé non encodé → « à déclarer »', p1.etat === 'a-declarer', JSON.stringify(p1));
  ok('1.2 le mois est celui de la tournée', p1.ym === prevYm && !p1.rattache);
  const p2 = api.clientComptaPeriod(api.allTours().find(t => t.id === 't2'), 'cA');
  ok('1.3 mois courant → « en cours »', p2.etat === 'en-cours', JSON.stringify(p2));
}

// 2. Mois encodé → déclarée (figée)
{
  const st = {}; st[prevYm] = { liquide: 'encode' };
  const api = boot({ comptaStatus: st }, [mkTour('t1', prevYm + '-15')]);
  const p = api.clientComptaPeriod(api.allTours()[0], 'cA');
  ok('2.1 mois encodé → « déclarée »', p.etat === 'declaree', JSON.stringify(p));
  ok('2.2 cohérent avec comptaLocked', api.comptaLocked(api.allTours()[0], 'cA') === true);
}

// 3. Démarche validée pour UN client seulement → lui seul est déclaré
{
  const dem = {}; dem['t1:cA'] = true;
  const api = boot({ comptaDemarche: dem }, [mkTour('t1', prevYm + '-15')]);
  const t = api.allTours()[0];
  ok('3.1 le client avec démarche est « déclarée »', api.clientComptaPeriod(t, 'cA').etat === 'declaree');
  ok('3.2 l\'autre client reste « à déclarer »', api.clientComptaPeriod(t, 'cB').etat === 'a-declarer');
}

// 4. RATTACHEMENT liquide : le client suit son mois de rattachement, pas celui de la tournée
{
  const api = boot({}, [mkTour('t1', curYm + '-05', { cA: { method: 'liquide', facture: false, comptaPeriod: prevYm } })]);
  const t = api.allTours()[0];
  const pa = api.clientComptaPeriod(t, 'cA');
  ok('4.1 le client rattaché suit son mois de rattachement', pa.ym === prevYm, JSON.stringify(pa));
  ok('4.2 il est signalé comme rattaché', pa.rattache === true);
  ok('4.3 et son état suit ce mois-là (passé → à déclarer)', pa.etat === 'a-declarer');
  ok('4.4 le mois de la tournée reste connu', pa.tourYm === curYm);
  ok('4.5 l\'autre client suit le mois de la tournée', api.clientComptaPeriod(t, 'cB').ym === curYm);
}

// 5. Le rattachement ne vaut QUE pour le liquide SANS facture
{
  const api = boot({}, [mkTour('t1', curYm + '-05', {
    cA: { method: 'liquide', facture: true, comptaPeriod: prevYm },   // facture pro → pas de rattachement
    cB: { method: 'virement', comptaPeriod: prevYm },                  // virement → pas de rattachement
  })]);
  const t = api.allTours()[0];
  ok('5.1 une facture pro liquide n\'est PAS rattachable', api.clientComptaPeriod(t, 'cA').ym === curYm && !api.clientComptaPeriod(t, 'cA').rattache);
  ok('5.2 un virement n\'est PAS rattachable', api.clientComptaPeriod(t, 'cB').ym === curYm && !api.clientComptaPeriod(t, 'cB').rattache);
}

// 6. Synthèse par tournée (pastille de la liste « Clôturées »)
{
  const dem = {}; dem['t1:cA'] = true;
  const api = boot({ comptaDemarche: dem }, [mkTour('t1', prevYm + '-15', { cB: { method: 'liquide', facture: false, comptaPeriod: curYm } })]);
  const s = api.tourComptaPeriodSummary(api.allTours()[0]);
  ok('6.1 le total compte chaque client une fois', s.total === 2, JSON.stringify(s));
  ok('6.2 un client déclaré est compté', s.declaree === 1);
  ok('6.3 le client rattaché au mois courant est « en cours »', s['en-cours'] === 1);
  ok('6.4 le rattachement est signalé', s.rattaches === 1);
}

// 7. Le bandeau produit bien du texte exploitable
{
  const api = boot({}, [mkTour('t1', prevYm + '-15')]);
  const html = api.comptaPeriodBanner(api.allTours()[0], 'cA');
  ok('7.1 le bandeau mentionne la période', /Période/.test(html), html);
  ok('7.2 et son état', /à déclarer/.test(html));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
