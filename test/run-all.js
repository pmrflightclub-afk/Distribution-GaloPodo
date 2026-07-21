// Runner unique — lance TOUS les harness de non-régression et rend un verdict global.
// Usage : node test/run-all.js   (ou : npm test)
//
// Convention : tout fichier test/*.test.js est un harness autonome qui sort avec le code 0
// s'il passe, non-zéro sinon, et affiche « ✅ N réussis, M échoués » en dernière ligne.
// Les fichiers utilitaires (mesure-*, run-all) ne sont PAS des tests → exclus.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

if (!files.length) { console.error('Aucun fichier *.test.js trouvé dans test/.'); process.exit(1); }

let okCount = 0, koCount = 0;
const results = [];
console.log('\n═══ GaloPodo — suite de non-régression (' + files.length + ' harness) ═══\n');

for (const f of files) {
  const started = process.hrtime.bigint();
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
  } catch (e) {
    code = e.status == null ? 1 : e.status;
    out = (e.stdout || '') + (e.stderr || '');
  }
  const ms = Number((process.hrtime.bigint() - started) / 1000000n);
  // extrait la ligne de bilan « ✅ N réussis, M échoués »
  const m = out.match(/([0-9]+)\s+réussis,\s+([0-9]+)\s+échoués/);
  const pass = m ? +m[1] : null, fail = m ? +m[2] : null;
  const ok = code === 0 && (fail === null || fail === 0);
  if (ok) okCount++; else koCount++;
  results.push({ f, ok, pass, fail, code, ms, out });
  const badge = ok ? '✅' : '❌';
  const detail = m ? (pass + ' assertions' + (fail ? ', ' + fail + ' ÉCHOUÉES' : '')) : (code === 0 ? 'OK' : 'ERREUR (code ' + code + ')');
  console.log('  ' + badge + '  ' + f.padEnd(30) + ' ' + detail + '  (' + ms + ' ms)');
  if (!ok) { console.log('\n──── sortie de ' + f + ' ────'); console.log(out.trim().split('\n').slice(-25).join('\n')); console.log('────────────────────────\n'); }
}

const totalAssert = results.reduce((s, r) => s + (r.pass || 0), 0);
const totalFail = results.reduce((s, r) => s + (r.fail || 0), 0);
console.log('\n═══ Bilan : ' + okCount + '/' + files.length + ' harness verts · ' + totalAssert + ' assertions' + (totalFail ? ' · ' + totalFail + ' ÉCHOUÉES' : '') + ' ═══\n');
process.exit(koCount === 0 ? 0 : 1);
