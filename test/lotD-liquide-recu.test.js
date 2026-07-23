// Harness MODULE D (L0) — saisie liquide « montant reçu » → impayé automatique ≥ 1 €.
// Exécution : node test/lotD-liquide-recu.test.js
//
// On extrait le helper pur `liquideFromRecu` d'app.js et on vérifie l'invariant central :
// payRecu = rectifie − impaye = reçu (le champ saisi est le cash en main), et le seuil de 1 €.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };

// bloc réel : la fonction liquideFromRecu, du début jusqu'à (exclu) la fonction suivante
const bloc = LINES.slice(at('function liquideFromRecu(recu, ttc, opts)'), at('function payArrondi(m, p)')).join('\n');
const liquideFromRecu = new Function(bloc + '\n; return liquideFromRecu;')();

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── MODULE D : montant liquide reçu → impayé auto ──');

// 1. Reçu = total exact → pas d'impayé, rectifie = reçu
{
  const d = liquideFromRecu(120, 120, { auto: true });
  ok('1. reçu = total → arrondi (pas de partiel)', d.partiel === false && d.rectifie === 120 && d.impaye === null, JSON.stringify(d));
}
// 2. Reçu à 0,50 € sous le total → ARRONDI (cadeau), pas d'impayé
{
  const d = liquideFromRecu(118, 118.5, { auto: true });
  ok('2. écart 0,50 € → arrondi (< 1 €), pas de partiel', d.partiel === false && d.rectifie === 118 && d.impaye === null, JSON.stringify(d));
}
// 3. Reçu 100 sur 120 → IMPAYÉ auto de 20, partiel coché, rectifie = 120
{
  const d = liquideFromRecu(100, 120, { auto: true });
  ok('3. manque 20 € → impayé auto', d.partiel === true && d.impaye === 20 && d.rectifie === 120, JSON.stringify(d));
  ok('3b. INVARIANT payRecu = rectifie − impaye = reçu', d.rectifie - d.impaye === 100, JSON.stringify(d));
}
// 4. Le PIÈGE : ne PAS laisser rectifie = reçu (sinon payRecu = 80, erreur de 20 €)
{
  const d = liquideFromRecu(100, 120, { auto: true });
  ok('4. rectifie n\'est PAS le reçu (piège des 20 € évité)', d.rectifie === 120 && d.rectifie !== 100, JSON.stringify(d));
}
// 5. Sans `auto`, un simple reçu bas ne déclenche rien (mode validation sans partiel coché)
{
  const d = liquideFromRecu(100, 120, {});
  ok('5. hors auto & sans partiel → arrondi (cadeau assumé)', d.partiel === false && d.rectifie === 100 && d.impaye === null, JSON.stringify(d));
}
// 6. Partiel explicite avec impayé manuel → rectifie = reçu + impayé manuel
{
  const d = liquideFromRecu(100, 120, { partiel: true, impaye: 15 });
  ok('6. partiel + impayé manuel 15 → rectifie 115, payRecu 100', d.rectifie === 115 && d.impaye === 15 && (d.rectifie - d.impaye) === 100, JSON.stringify(d));
}
// 7. Reçu > total (supplément) → arrondi, rectifie = reçu, pas d'impayé
{
  const d = liquideFromRecu(125, 120, { auto: true });
  ok('7. reçu > total → supplément (arrondi), pas d\'impayé', d.partiel === false && d.rectifie === 125 && d.impaye === null, JSON.stringify(d));
}
// 8. Total décimal 120,50, reçu 100 → impayé = round(120,5) − 100 = 21, rectifie 121
{
  const d = liquideFromRecu(100, 120.5, { auto: true });
  ok('8. total décimal → impayé à l\'euro, payRecu = reçu', d.impaye === 21 && d.rectifie === 121 && (d.rectifie - d.impaye) === 100, JSON.stringify(d));
}
// 9. Écart exactement 1 € → impayé (seuil inclusif)
{
  const d = liquideFromRecu(119, 120, { auto: true });
  ok('9. écart de 1 € pile → impayé', d.partiel === true && d.impaye === 1, JSON.stringify(d));
}
// 10. Reçu négatif/vide borné à 0
{
  const d = liquideFromRecu(-5, 120, { auto: true });
  ok('10. reçu borné ≥ 0', d.rectifie >= 0 && d.impaye === 120, JSON.stringify(d));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
