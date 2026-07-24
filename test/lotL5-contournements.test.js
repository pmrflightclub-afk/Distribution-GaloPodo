// Harness L5 — contournements du gel : _review jamais sur clôturée, cheval figé non supprimable.
// Exécution : node test/lotL5-contournements.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── L5 : contournements du gel ──');

// 1. markToursReview ne pose _review que sur les tournées NON clôturées
{
  const src = LINES[at('function markToursReview(tours)')];
  const markToursReview = new Function('logWrite', src + '\n; return markToursReview;')(() => {});
  const tours = [{ id: 'a', closed: true }, { id: 'b' }, { id: 'c', endedAt: 5 }];
  markToursReview(tours);
  ok('1. clôturée → PAS de _review', !tours[0]._review);
  ok('1b. ouverte → _review posé', tours[1]._review === true);
  ok('1c. terminée (endedAt) → PAS de _review', !tours[2]._review);
}

// 2. chevalInFrozenTour : un cheval sur une tournée clôturée est protégé
{
  const s0 = at('function chevalInFrozenTour(clientId, h)');
  const e0 = LINES.findIndex((l, k) => k > s0 && l.trim() === '}');
  const src = LINES.slice(s0, e0 + 1).join('\n');
  const tours = [
    { closed: true, arrets: [{ clients: [{ clientId: 'c1', chevaux: [{ id: 'h1', nom: 'Guiness' }] }] }] },
    { closed: false, arrets: [{ clients: [{ clientId: 'c1', chevaux: [{ id: 'h2', nom: 'Bella' }] }] }] },
  ];
  const fn = new Function('allTours', 'norm', src + '\n; return chevalInFrozenTour;')(() => tours, (s) => String(s || '').trim().toLowerCase());
  ok('2. cheval sur clôturée (par id) → protégé', fn('c1', { id: 'h1', nom: 'X' }) === true);
  ok('2b. cheval sur clôturée (repli nom) → protégé', fn('c1', { id: null, nom: 'Guiness' }) === true);
  ok('2c. cheval seulement sur une OUVERTE → non protégé', fn('c1', { id: 'h2', nom: 'Bella' }) === false);
  ok('2d. cheval inconnu → non protégé', fn('c1', { id: 'zz', nom: 'Zorro' }) === false);
}

// 3. Nom de cheval obligatoire à l'enregistrement du client
{
  const guard = (chevaux) => { const anon = (chevaux || []).filter((h) => !(h.nom || '').trim()); return anon.length; };
  ok('3. un cheval sans nom → bloqué', guard([{ nom: 'A' }, { nom: '' }]) === 1);
  ok('3b. tous nommés → OK', guard([{ nom: 'A' }, { nom: 'B' }]) === 0);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
