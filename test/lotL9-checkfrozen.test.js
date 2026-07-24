// Harness L9 — filet final d'observation checkFrozenWrite : journalise une dérive d'un bloc figé.
// Exécution : node test/lotL9-checkfrozen.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };
const s0 = at('function checkFrozenWrite(t) {');
const e0 = LINES.findIndex((l, k) => k > s0 && l === '}');
const src = LINES.slice(s0, e0 + 1).join('\n');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

let logs = [];
const checkFrozenWrite = new Function('logWrite', src + '\n; return checkFrozenWrite;')((r) => logs.push(r));

console.log('\n── L9 : checkFrozenWrite (observation) ──');

// 1. bloc figé conforme → aucune alerte
{
  logs = [];
  const t = { id: 't1', frozenClients: { c1: { m: { totalTTC: 150 } } }, result: { parClient: [{ clientId: 'c1', totalTTC: 150 }] } };
  checkFrozenWrite(t);
  ok('1. bloc conforme → aucun log de violation', logs.length === 0);
}
// 2. bloc figé qui a dérivé → violation journalisée
{
  logs = [];
  const t = { id: 't1', frozenClients: { c1: { m: { totalTTC: 150 } } }, result: { parClient: [{ clientId: 'c1', totalTTC: 90 }] } };
  checkFrozenWrite(t);
  ok('2. dérive détectée → 1 violation', logs.length === 1 && logs[0].violation && logs[0].frozen === true, JSON.stringify(logs));
  ok('2b. l\'écart est tracé (snap 150 vs live 90)', logs[0].snap === 150 && logs[0].live === 90);
}
// 3. pas de frozenClients → rien
{
  logs = [];
  checkFrozenWrite({ id: 't1', result: { parClient: [{ clientId: 'c1', totalTTC: 90 }] } });
  ok('3. aucun gel → aucun log', logs.length === 0);
}
// 4. écart < 0,005 € (arrondi) → toléré
{
  logs = [];
  checkFrozenWrite({ id: 't1', frozenClients: { c1: { m: { totalTTC: 150 } } }, result: { parClient: [{ clientId: 'c1', totalTTC: 150.002 }] } });
  ok('4. écart infime toléré (pas de faux positif)', logs.length === 0);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
