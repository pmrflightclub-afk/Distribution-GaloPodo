// Harness Lot 02b — affichage du numéro de facture + référence par ligne.
// Exécution : node test/lot02b-numero-facture.test.js
// Principe : la référence de ligne est DÉRIVÉE (numéro + rang) et n'est JAMAIS écrite dans t.result
// (une facture figée ne se modifie pas après coup).
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = path.join(__dirname, '..', 'app.js');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); } };

function boot() {
  const store = {}; const put = (k, v) => store[k] = JSON.stringify(v);
  put('ftr.settings', { tvaRate: 21, tvaRegime: 'normal', frais: [], materiel: [], amortissement: {}, articlesCatalogue: [], ecuries: [] });
  put('ftr.clients', [{ id: 'cA', prenom: 'A', nom: 'Alpha' }]);
  put('ftr.tournees', []); put('ftr.archive', []);
  put('ftr.syncmeta', { hash: {}, upd: {} }); put('ftr.tomb', {});
  const noop = () => {};
  const el = new Proxy({}, { get: (t, p) => (p === 'style' || p === 'dataset' || p === 'classList') ? new Proxy({}, { get: () => noop, set: () => true }) : (typeof p === 'string' ? noop : undefined), set: () => true });
  const doc = { addEventListener: noop, removeEventListener: noop, createElement: () => el, createTextNode: () => el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: el, documentElement: el, head: el, readyState: 'loading' };
  const sb = { console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop }, document: doc, navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: () => Promise.resolve(), addEventListener: noop } }, location: { href: '', reload: noop, search: '' }, fetch: () => Promise.reject(new Error('off')), matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), alert: noop, confirm: () => false, prompt: () => null, requestAnimationFrame: noop, URL: { createObjectURL: () => '', revokeObjectURL: noop }, Blob: function () {}, FileReader: function () {}, Image: function () {}, TextEncoder, TextDecoder, crypto: { getRandomValues: a => a, randomUUID: () => 'x' }, performance: { now: () => 0 } };
  sb.addEventListener = noop; sb.removeEventListener = noop; sb.dispatchEvent = noop; sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  const EPI = ';globalThis.__api={clientInvoiceHtml:clientInvoiceHtml,factureOf:factureOf};';
  vm.runInContext(fs.readFileSync(APP, 'utf8') + EPI, sb, { filename: 'app.js' });
  return sb.__api;
}

// facture type : 2 articles + matériel + déplacement
const M = () => ({
  clientId: 'cA', nom: 'A Alpha',
  articles: [
    { libelle: 'Parage et équilibrage', chevaux: ['Bijou'], qte: 1, prixHT: 55, tvaPct: 21, ht: 55, tva: 11.55, ttc: 66.55 },
    { libelle: 'Visite', chevaux: ['Bijou'], qte: 1, prixHT: 40, tvaPct: 21, ht: 40, tva: 8.4, ttc: 48.4 },
  ],
  materiel: [{ nom: 'Fers' }], htMat: 12,
  deplacement: [{ adresse: 'Rue A', type: 'tournee', partHT: 10, partTTC: 12.1, km: 20, tarifHT: 0.5, chevaux: ['Bijou'] }],
  htDep: 10, htArt: 95, tvaArt: 19.95, totalHT: 117, totalTVA: 24.57, totalTTC: 141.57,
});

console.log('\n── Lot 02b : numéro de facture et référence de ligne ──');
{
  const api = boot();
  const fact = { id: 'f1', numero: 'F-12', frozenAt: Date.parse('2026-07-18T10:00:00Z') };
  const sansFact = api.clientInvoiceHtml(M(), null, null);
  const avecFact = api.clientInvoiceHtml(M(), null, fact);

  ok('1.1 sans facture identifiée : aucun numéro affiché', sansFact.indexOf('inv-num') === -1);
  ok('1.2 sans facture identifiée : aucune référence de ligne', sansFact.indexOf('inv-lref') === -1);
  ok('2.1 avec facture : le numéro est affiché', /inv-num/.test(avecFact) && /F-12/.test(avecFact));
  ok('2.2 la date d\'émission est affichée', /émise le/.test(avecFact), avecFact.slice(avecFact.indexOf('inv-num'), avecFact.indexOf('inv-num') + 160));

  const refs = (avecFact.match(/F-12\/\d+/g) || []);
  ok('3.1 chaque ligne porte une référence', refs.length >= 4, JSON.stringify(refs));
  ok('3.2 les références sont numérotées sans trou', refs.every((r, i) => r === 'F-12/' + (i + 1)), JSON.stringify(refs));
  ok('3.3 aucune référence en double', new Set(refs).size === refs.length);

  // les totaux ne sont pas des lignes facturées
  const foot = avecFact.slice(avecFact.indexOf('<tfoot>'));
  ok('4.1 « Sous-total » ne consomme pas de référence', !/Sous-total[^<]*<span class="inv-lref"/.test(foot), foot.slice(0, 200));
  ok('4.2 « Tarif plein » non plus', !/Tarif plein[^<]*<span class="inv-lref"/.test(foot));

  // invariant central : rien n'est écrit dans le résultat figé
  const m = M(); const avant = JSON.stringify(m);
  api.clientInvoiceHtml(m, null, fact);
  ok('5.1 INVARIANT : la facture figée n\'est PAS modifiée par l\'affichage', JSON.stringify(m) === avant);
  ok('5.2 aucun id n\'est ajouté aux lignes', m.articles.every(a => a.id === undefined));
}

// 6. factureOf lit bien la pièce persistée par le Lot 02
{
  const api = boot();
  const t = { id: 't1', factureIds: { cA: { id: 'f9', numero: 'F-7', frozenAt: 1 } } };
  ok('6.1 factureOf retrouve la facture du client', api.factureOf(t, 'cA').numero === 'F-7');
  ok('6.2 et renvoie null pour un client sans facture', api.factureOf(t, 'cZ') === null);
  const html = api.clientInvoiceHtml(M(), null, api.factureOf(t, 'cA'));
  ok('6.3 le numéro persisté est bien celui affiché', /F-7/.test(html) && /F-7\/1/.test(html));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
