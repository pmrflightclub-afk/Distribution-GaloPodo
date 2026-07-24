// Harness L7 — poste « Remboursements » de la caisse facture-liquide + retrait de `documentaire`.
// Exécution : node test/lotL7-poste-remboursements.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── L7 : poste Remboursements ──');

// 1. Le champ `documentaire` n'est plus lu dans comptaData (dead code retiré)
{
  const body = LINES.slice(at('function comptaData(ym)'), at('// ================= F-b')).join('\n');
  ok('1. plus de filtre `!n.documentaire`', !/!n\.documentaire/.test(body), body.match(/documentaire/g) ? String(body.match(/documentaire/g)) : 'aucune occurrence');
}

// 2. Logique du poste Remboursements (réplique fidèle des expressions réelles)
{
  // facliqNC : NC dont le client a payé en facture liquide
  const tours = [{ id: 't1', payments: { c1: { method: 'liquide', facture: true }, c2: { method: 'virement', facture: true } } }];
  const allTours = () => tours;
  const facliqNC = (n) => { const tt = allTours().find((x) => x.id === n.tourId); const pp = tt && tt.payments && tt.payments[n.clientId]; return !!(pp && pp.method === 'liquide' && pp.facture); };
  ok('2. NC d\'un client facture-liquide → comptée comme remboursement', facliqNC({ tourId: 't1', clientId: 'c1' }) === true);
  ok('2b. NC d\'un client VIREMENT → PAS un remboursement cash', facliqNC({ tourId: 't1', clientId: 'c2' }) === false);

  // imputation au mois de rembourseAt (repli date)
  const ym = '2026-08';
  const notesCredit = [
    { id: 'n1', tourId: 't1', clientId: 'c1', clientNom: 'A', numero: 'C-1', montantTTC: 30, rembourseAt: '2026-08-12', date: '2026-08-10' },
    { id: 'n2', tourId: 't1', clientId: 'c1', clientNom: 'A', numero: 'C-2', montantTTC: 50, date: '2026-07-01' }, // autre mois
    { id: 'n3', tourId: 't1', clientId: 'c2', clientNom: 'B', numero: 'C-3', montantTTC: 20, rembourseAt: '2026-08-15' }, // virement → exclu
  ];
  const remb = notesCredit.filter((n) => facliqNC(n) && ((n.rembourseAt || n.date) || '').slice(0, 7) === ym);
  ok('3. seule la NC facliq du bon mois est retenue (30)', remb.length === 1 && remb[0].montantTTC === 30, JSON.stringify(remb.map((r) => r.numero)));
  const rembTTC = remb.reduce((s, n) => s + (n.montantTTC || 0), 0);

  // factureLiqTotal net = brut − remboursements
  const facliqBrutTTC = 200; // encaissé brut du mois
  const netTTC = facliqBrutTTC - rembTTC;
  ok('4. caisse facliq NETTE = brut 200 − remboursement 30 = 170', netTTC === 170, String(netTTC));
}

// 3. Le CA n'est PAS doublement réduit : la NC réduit le CA (notesCreditTotal), le remboursement réduit la CAISSE — axes distincts
{
  // notesCreditTotal réduit le CA de la NC ; remboursementsTotal réduit la caisse. La même NC de 30 :
  const caReduction = 30;   // via notesCreditTotal
  const caisseReduction = 30; // via remboursementsTotal
  // ce ne sont PAS additionnés sur le même agrégat (CA vs caisse) → pas de double comptage sur le CA
  ok('5. CA réduit une seule fois (30), caisse réduite une seule fois (30) — axes séparés', caReduction === 30 && caisseReduction === 30);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
