// Harness AUDIT — correctifs post-audit (bugs argent avoir/gel/règlement).
// Exécution : node test/lotAUDIT-fixes.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };
const grabFn = (sig) => { const s0 = at(sig); const e0 = LINES.findIndex((l, k) => k > s0 && l === '}'); return LINES.slice(s0, e0 + 1).join('\n'); };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── AUDIT : correctifs post-audit ──');

// 1. facliqNC exige n.rembourse (une NC-avoir ne baisse pas la caisse)
{
  const line = LINES[at('const facliqNC = (n) =>')];
  const expr = line.slice(line.indexOf('(n) =>'), line.lastIndexOf('}') + 1); // l'arrow complète
  const tours = [{ id: 't1', payments: { c1: { method: 'liquide', facture: true } } }];
  const facliqNC = new Function('allTours', 'return ' + expr)(() => tours);
  ok('1. NC facliq REMBOURSÉE cash → comptée', facliqNC({ tourId: 't1', clientId: 'c1', rembourse: true }) === true);
  ok('1b. NC facliq en AVOIR (rembourse:false) → PAS comptée en caisse', facliqNC({ tourId: 't1', clientId: 'c1', rembourse: false }) === false);
}

// 2. graftClosure greffe les lignes d'AVOIR
{
  const line = LINES[at('AUDIT-fix : greffer AUSSI les lignes d\'AVOIR')];
  ok('2. graftClosure traite a.avoir/a.avoirId', /a\.avoir && a\.avoirId/.test(line));
}

// 3. deepMergeTourBody exclut les avoirs de l'union par id
{
  const line = LINES[at('Impayés ET AVOIRS EXCLUS')];
  ok('3. deepMergeTourBody exclut !a.avoir', /!a\.impaye && !a\.avoir/.test(line));
}

// 4. applyFrozenClients RÉ-INJECTE un client figé disparu
{
  const api = new Function('logWrite', grabFn('function applyFrozenClients(t, R)') + '\n; return applyFrozenClients;')(() => {});
  const t = { id: 't1', frozenClients: { c1: { m: { clientId: 'c1', totalTTC: 150, totalHT: 124, totalTVA: 26 } } } };
  const R = { parClient: [{ clientId: 'c2', totalTTC: 60, totalHT: 50, totalTVA: 10 }] }; // c1 a DISPARU
  api(t, R);
  const c1 = R.parClient.find((m) => m.clientId === 'c1');
  ok('4. client figé disparu → RÉ-INJECTÉ (revenu protégé)', !!c1 && c1.totalTTC === 150, JSON.stringify(R.parClient.map((m) => m.clientId)));
  ok('4b. total re-dérivé inclut le figé (150 + 60 = 210)', R.totalTTC === 210, String(R.totalTTC));
}

// 5. checkFrozenWrite détecte la DISPARITION
{
  let logs = [];
  const cfw = new Function('logWrite', grabFn('function checkFrozenWrite(t)') + '\n; return checkFrozenWrite;')((r) => logs.push(r));
  cfw({ id: 't1', frozenClients: { c1: { m: { totalTTC: 150 } } }, result: { parClient: [] } });
  ok('5. client figé absent → violation journalisée', logs.length === 1 && /ABSENT/.test(logs[0].violation), JSON.stringify(logs));
}

// 6. createReglement pose une CRÉANCE quand la jambe liquide a un impayé
{
  const line = LINES[at('AUDIT-fix : un impayé sur la jambe LIQUIDE')];
  ok('6. createReglement appelle setClientImpaye si liq.partiel && liq.impaye>0', /setClientImpaye\(t, cid, liq\.impaye\)/.test(line) && /liq\.partiel && liq\.impaye > 0/.test(line));
}

// 7. Clamp avoir : la ligne d'avoir est PLAFONNÉE (CA cohérent) et le reliquat tracé
{
  // réplique de la logique de plafonnement
  const solde = (chargesTTC, avoirTTC) => {
    let tTTC = chargesTTC + avoirTTC; let avoirReliquat = 0; let cappedAv = avoirTTC;
    if (tTTC < -0.005) { avoirReliquat = Math.round(-tTTC); const factor = Math.max(0, chargesTTC) / Math.abs(avoirTTC); cappedAv = avoirTTC * factor; tTTC = chargesTTC + cappedAv; }
    return { tTTC: Math.abs(tTTC) < 0.5 ? 0 : tTTC, avoirReliquat, cappedAv };
  };
  const r = solde(30, -50); // avoir 50 > charges 30
  ok('7. total borné à 0', r.tTTC === 0);
  ok('7b. reliquat = 20 (à rendre cash)', r.avoirReliquat === 20, String(r.avoirReliquat));
  ok('7c. avoir PLAFONNÉ à −30 (= −charges) → CA cohérent', Math.abs(r.cappedAv - (-30)) < 0.01, String(r.cappedAv));
  const r2 = solde(100, -40); // avoir < charges → pas de plafond
  ok('7d. avoir ≤ charges → pas de reliquat, total = 60', r2.avoirReliquat === 0 && r2.tTTC === 60);
}

// 8. applyClientRevue unit aussi les avoirs
{
  const line = LINES[at('AUDIT-fix : \'avoirs\' ajouté')];
  ok('8. applyClientRevue → union(\'avoirs\')', /union\('avoirs'\)/.test(line));
}

// 9. GC : règlements/documents orphelins détachés (jamais supprimés)
{
  const line = LINES[at('AUDIT-fix : règlements/documents dont la tournée de référence a disparu') + 1];
  ok('9. tourId disparu → tourDeleted (pas de suppression)', /p\.tourDeleted = true/.test(line) && !/splice|filter/.test(line));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
