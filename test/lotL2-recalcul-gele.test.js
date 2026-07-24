// Harness L2 — recalculs gelés : une tournée figée n'est jamais re-tarifée / re-dérivée.
// Exécution : node test/lotL2-recalcul-gele.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── L2 : recalculs gelés ──');

// 1. Prédicat tourFrozenEdit (réel)
{
  const line = LINES[at('const tourFrozenEdit = (t) =>')];
  const expr = line.trim().replace('const tourFrozenEdit = ', '').replace(/;.*/, '');
  const tourFrozenEdit = new Function('return ' + expr)();
  ok('1. clôturée → figée', tourFrozenEdit({ closed: true }) === true);
  ok('1b. terminée (endedAt) → figée', tourFrozenEdit({ endedAt: 123 }) === true);
  ok('1c. « à revalider » (_review) → PAS figée (revalidation permise)', tourFrozenEdit({ closed: true, _review: true }) === false);
  ok('1d. ouverte → pas figée (falsy)', !tourFrozenEdit({}));
  ok('1e. null → pas figée', !tourFrozenEdit(null));
}

// 2. sanitizeTourStats : garde de gel PORTÉE PAR LA FONCTION (couvre recalcAllTours)
{
  // borne : jusqu'au premier « return changed; » (fin de sanitizeTourStats)
  const end = LINES.findIndex((l, k) => k > at('function sanitizeTourStats(t) {') && l.trim() === 'return changed;');
  const src = LINES.slice(at('function sanitizeTourStats(t) {'), end + 2).join('\n');
  let saw = false;
  const ctx = { statusOf: (t) => (t.closed ? 'cloturee' : 'avenir'), chevalKeptInResult: () => true, logWrite: () => { saw = true; } };
  const fn = new Function('statusOf', 'chevalKeptInResult', 'logWrite', src + '\n; return sanitizeTourStats;')(ctx.statusOf, ctx.chevalKeptInResult, ctx.logWrite);
  const closed = { closed: true, result: { rows: [{ clients: [{ clientId: 'c1', chevaux: [{ nom: 'A' }, { nom: 'B' }] }] }], parClient: [] } };
  const before = JSON.stringify(closed.result);
  const r = fn(closed);
  ok('2. clôturée → sanitize REFUSÉ (false)', r === false);
  ok('2b. result de la clôturée INCHANGÉ', JSON.stringify(closed.result) === before);
  ok('2c. refus journalisé', saw === true);
  // une tournée ouverte, elle, est bien nettoyée
  saw = false;
  const open = { closed: false, result: { rows: [{ clients: [{ clientId: 'c1', chevaux: [{ nom: 'A' }] }] }], parClient: [] } };
  ok('2d. ouverte → sanitize s\'exécute (pas de refus)', typeof fn(open) === 'boolean' && saw === false);
}

// 3. rowFromArret : jointure par ID d'abord (un renommage ne casse plus l'appariement fiche)
{
  const line = LINES[at('L2 : jointure par ID d\'abord')];
  // reconstruit l'expression de recherche de fiche
  const m = line.match(/\.find\(\(h\) => (.+?)\) : null/);
  const pred = new Function('h', 'c', 'norm', 'return ' + m[1]);
  const norm = (s) => String(s || '').trim().toLowerCase();
  const fiches = [{ id: 'h1', nom: 'Guiness', lourd: true }, { id: 'h2', nom: 'Bella' }];
  // cheval renommé dans la fiche (id stable h1, nom devenu « Guinness »), mais l'arrêt garde l'ancien nom + l'id
  const renamed = [{ id: 'h1', nom: 'Guinness', lourd: true }, { id: 'h2', nom: 'Bella' }];
  const arretCheval = { id: 'h1', nom: 'Guiness' };
  const trouve = renamed.find((h) => pred(h, arretCheval, norm));
  ok('3. jointure par id → fiche retrouvée malgré le renommage', trouve && trouve.id === 'h1' && trouve.lourd === true, JSON.stringify(trouve));
  // repli sur le nom quand pas d'id
  const trouve2 = fiches.find((h) => pred(h, { id: null, nom: 'Bella' }, norm));
  ok('3b. repli sur le nom si pas d\'id', trouve2 && trouve2.id === 'h2');
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
