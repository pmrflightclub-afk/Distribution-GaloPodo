// Harness — la page Sauvegarde ne gèle plus : le textarea n'est plus pré-rempli avec l'instantané complet.
// Exécution : node test/lot-sauvegarde.test.js
// On charge app.js en VM avec un GROS contactMails, on ouvre la modale, et on vérifie que le HTML injecté
// ne contient PAS les mégaoctets de données (donc pas de esc()+innerHTML géant), tout en gardant export/import.
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = path.join(__dirname, '..', 'app.js');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); } };

// gros jeu de données : contactMails volumineux (simule les 2,6 Mo réels)
const bigMail = 'x'.repeat(50000);
const store = {};
const put = (k, v) => store[k] = JSON.stringify(v);
put('ftr.settings', { tvaRate: 21, tvaRegime: 'normal', frais: [], materiel: [], amortissement: {}, articlesCatalogue: [], contactMails: Array.from({ length: 40 }, (_, i) => ({ id: 'm' + i, body: bigMail })) });
put('ftr.clients', [{ id: 'c1', nom: 'Test', chevaux: [] }]);
put('ftr.tournees', []); put('ftr.archive', []);
put('ftr.syncmeta', { hash: {}, upd: {} }); put('ftr.tomb', {});

let lastModalHtml = '';
const noop = () => {};
const mkEl = () => { const e = { _html: '', style: new Proxy({}, { get: () => noop, set: () => true }), dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, addEventListener: (ev, fn) => { e['on:' + ev] = fn; }, appendChild: noop, querySelector: () => null, querySelectorAll: () => [], remove: noop, click: noop, focus: noop, select: noop, insertAdjacentHTML: noop }; Object.defineProperty(e, 'innerHTML', { get() { return e._html; }, set(v) { e._html = String(v); lastModalHtml = String(v); } }); Object.defineProperty(e, 'value', { get() { return e._value || ''; }, set(v) { e._value = v; } }); Object.defineProperty(e, 'textContent', { get() { return e._tc || ''; }, set(v) { e._tc = v; } }); return e; };
const els = {};
const $ = (id) => (els[id] || (els[id] = mkEl()));
const doc = { addEventListener: noop, removeEventListener: noop, createElement: () => mkEl(), createTextNode: () => mkEl(), getElementById: (id) => $(id), querySelector: () => null, querySelectorAll: () => [], body: mkEl(), documentElement: mkEl(), head: mkEl(), readyState: 'loading' };
let clipboard = null;
const sb = { console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
  localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop }, document: doc,
  navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: () => Promise.resolve(), addEventListener: noop }, clipboard: { writeText: (t) => { clipboard = t; return Promise.resolve(); } } },
  location: { href: '', reload: noop, search: '' }, fetch: () => Promise.reject(new Error('off')), matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
  alert: noop, confirm: () => true, prompt: () => null, requestAnimationFrame: noop, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: noop },
  Blob: function (parts) { this.size = (parts || []).reduce((s, p) => s + String(p).length, 0); }, FileReader: function () {}, Image: function () {}, TextEncoder, TextDecoder, crypto: { getRandomValues: a => a, randomUUID: () => 'x' }, performance: { now: () => 0 } };
sb.addEventListener = noop; sb.removeEventListener = noop; sb.dispatchEvent = noop; sb.window = sb; sb.globalThis = sb; sb.self = sb;
sb.document.getElementById = (id) => $(id);
vm.createContext(sb);
const EPI = ';globalThis.__api={modalBackup:modalBackup, exportSnapshot:exportSnapshot, humanSize:humanSize, getStore:function(){return this;}};';
vm.runInContext(fs.readFileSync(APP, 'utf8') + EPI, sb, { filename: 'app.js' });
const api = sb.__api;

console.log('\n── Page Sauvegarde : plus de gel (textarea non pré-rempli) ──');

// taille réelle de l'instantané (doit être volumineuse — c'est le point)
const snapSize = JSON.stringify(api.exportSnapshot()).length;
ok('0. le jeu de données est bien volumineux (> 1,5 Mo)', snapSize > 1500000, api.humanSize(snapSize));

api.modalBackup();
ok('1. la modale s\'est ouverte (HTML injecté)', lastModalHtml.length > 0);
ok('2. le HTML injecté est PETIT (< 5000 car.) — pas les Mo de données', lastModalHtml.length < 5000, 'taille HTML modale: ' + lastModalHtml.length);
ok('3. le contactMails volumineux n\'est PAS dans le HTML', lastModalHtml.indexOf(bigMail.slice(0, 200)) === -1);
ok('4. le textarea a un placeholder d\'import (vide au départ)', /placeholder=/.test(lastModalHtml) && /id="bkText"/.test(lastModalHtml));
ok('5. l\'info de taille de sauvegarde est affichée', /Mo|Ko/.test(lastModalHtml));

// export « Copier » : génère à la demande et remplit le presse-papier avec l'instantané complet
if (els.bkCopy && els.bkCopy['on:click']) { els.bkCopy['on:click'](); }
ok('6. « Copier » place l\'instantané COMPLET dans le presse-papier', clipboard && clipboard.length > 1500000, clipboard ? api.humanSize(clipboard.length) : 'rien copié');

// import sur textarea vide → message clair, pas de crash
$('bkText').value = '';
if (els.bkMerge && els.bkMerge['on:click']) els.bkMerge['on:click']();
ok('7. import à vide → message « collez d\'abord » (pas de JSON invalide)', /Collez d/.test($('bkStatus').textContent), 'statut: ' + $('bkStatus').textContent);

// import d'un contenu collé valide → accepté (on ne recharge pas en test, mais pas d'erreur de format)
$('bkText').value = JSON.stringify({ settings: {}, clients: [{ id: 'c9' }], tours: [] });
if (els.bkMerge && els.bkMerge['on:click']) els.bkMerge['on:click']();
ok('8. import d\'un JSON collé valide → pas d\'erreur de format', !/invalide|non reconnu/.test($('bkStatus').textContent), 'statut: ' + $('bkStatus').textContent);

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
