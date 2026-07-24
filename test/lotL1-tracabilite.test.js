// Harness L1 — journal de traçabilité (withOrigin, anneaux bornés, routage figé).
// Exécution : node test/lotL1-tracabilite.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };
const bloc = LINES.slice(at('let _originStack = [];'), at('  if (rec && (rec.frozen || rec.violation)) journalRing') + 2).join('\n');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

// contexte : localStorage simulé
const store = {};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const APP_VERSION = '2.0.0-test';
const api = new Function('localStorage', 'APP_VERSION', bloc + '\n; return { withOrigin, currentOrigin, journalRing, logWrite };')(localStorage, APP_VERSION);

console.log('\n── L1 : traçabilité ──');

// 1. origine par défaut = user
ok('1. origine par défaut = user', api.currentOrigin() === 'user');
// 2. withOrigin étiquette le bloc, restaure après
{
  let inside = null;
  api.withOrigin('fusion', () => { inside = api.currentOrigin(); });
  ok('2. withOrigin(fusion) → origine dans le bloc', inside === 'fusion');
  ok('2b. origine restaurée après le bloc', api.currentOrigin() === 'user');
}
// 3. imbrication correcte (pile)
{
  const seen = [];
  api.withOrigin('gc', () => { seen.push(api.currentOrigin()); api.withOrigin('import', () => seen.push(api.currentOrigin())); seen.push(api.currentOrigin()); });
  ok('3. imbrication gc>import>gc', seen.join(',') === 'gc,import,gc', seen.join(','));
  ok('3b. retour à user', api.currentOrigin() === 'user');
}
// 4. restauration même si le bloc lève
{
  let leve = false;
  try { api.withOrigin('restore', () => { throw new Error('boom'); }); } catch (e) { leve = true; }
  ok('4. exception propagée', leve);
  ok('4b. origine restaurée après exception', api.currentOrigin() === 'user');
}
// 5. logWrite écrit dans ftr.wlog
{
  delete store['ftr.wlog']; delete store['ftr.wlogFrozen'];
  api.logWrite({ f: 'test', entity: 'payment', id: 'c1' });
  const w = JSON.parse(store['ftr.wlog']);
  ok('5. écrit dans ftr.wlog avec at/o/v', w.length === 1 && w[0].o === 'user' && w[0].v === '2.0.0-test' && typeof w[0].at === 'number');
  ok('5b. PAS dans l\'anneau figé (écriture ordinaire)', !store['ftr.wlogFrozen']);
}
// 6. une écriture « frozen » va AUSSI dans l'anneau figé
{
  api.logWrite({ f: 'writePayment', frozen: true, violation: 'reclassement refusé' });
  ok('6. écriture figée routée vers ftr.wlogFrozen', !!store['ftr.wlogFrozen'] && JSON.parse(store['ftr.wlogFrozen']).length === 1);
}
// 7. l'origine courante est capturée dans l'entrée
{
  delete store['ftr.wlog'];
  api.withOrigin('gc', () => api.logWrite({ f: 'recalc' }));
  ok('7. entrée porte l\'origine du bloc (gc)', JSON.parse(store['ftr.wlog'])[0].o === 'gc');
}
// 8. anneau borné en octets (FIFO) — on force un petit cap
{
  delete store['ftr.small'];
  for (let i = 0; i < 200; i++) api.journalRing('ftr.small', 512, { i, pad: 'xxxxxxxxxx' });
  const arr = JSON.parse(store['ftr.small']);
  ok('8. anneau borné (< 512 o) → FIFO, garde les plus récents', JSON.stringify(arr).length <= 512 && arr[arr.length - 1].i === 199, JSON.stringify(arr).length + ' octets, ' + arr.length + ' entrées');
}
// 9. journalRing ne lève jamais (JSON corrompu en place)
{
  store['ftr.bad'] = '{{{ pas du json';
  let threw = false;
  try { api.journalRing('ftr.bad', 1024, { ok: 1 }); } catch (e) { threw = true; }
  ok('9. tolère un contenu corrompu sans lever', threw === false && JSON.parse(store['ftr.bad']).length === 1);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
