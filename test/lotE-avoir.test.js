// Harness MODULE E (L0b) — avoir client (crédit) + exclusion du CA à la collecte.
// Exécution : node test/lotE-avoir.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── MODULE E : avoir client (crédit) ──');

// ---- setClientAvoir (extrait réel) ----
{
  const bloc = LINES.slice(at('function setClientAvoir(t, cid, ttc, opts)'), at('// Remet un impayé « à percevoir »')).join('\n');
  const ctx = { clients: [{ id: 'c1', nom: 'Dupont', avoirs: [] }], _saved: 0 };
  const build = new Function('clients', 'uid', 'todayStr', 'saveClients', bloc + '\n; return setClientAvoir;');
  let n = 0;
  const setClientAvoir = build(ctx.clients, () => 'av' + (++n), () => '2026-08-01', () => { ctx._saved++; });
  const t = { id: 't9', date: '2026-08-03' };
  const av = setClientAvoir(t, 'c1', 30, { motif: 'NC #C-4', ncId: 'nc1' });
  ok('1. avoir créé, ttc positif', av && av.ttc === 30 && av.collected === false, JSON.stringify(av));
  ok('2. rattaché à la tournée source + motif/ncId', av.sourceTourId === 't9' && av.ncId === 'nc1' && av.motif === 'NC #C-4', JSON.stringify(av));
  ok('3. poussé dans c.avoirs + saveClients appelé', ctx.clients[0].avoirs.length === 1 && ctx._saved === 1);
  const av0 = setClientAvoir(t, 'c1', 0, {});
  ok('4. montant nul → aucun avoir', av0 === null && ctx.clients[0].avoirs.length === 1);
  const avX = setClientAvoir(t, 'inconnu', 30, {});
  ok('5. client inconnu → null', avX === null);
}

// ---- Exclusion du CA à la collecte : la ligne avoir (ht négatif) est retirée de la base ----
// On reproduit l'EXACTE expression d'app.js (comptaData) pour garantir qu'elle exclut bien l'avoir.
{
  const line = LINES[at('MODULE E : l\'AVOIR (ht négatif) est exclu du CA de collecte')];
  const expr = line.trim().replace(/^const impHT = /, '').replace(/;.*$/, '');
  const impHT = new Function('m', 'return ' + expr + ';');
  const m = { articles: [
    { libelle: 'Parage', ht: 100, tva: 21 },                 // vente réelle
    { libelle: 'Impayé du 01/07', ht: 20, tva: 4.2, impaye: true, reporte: false }, // partiel → exclu
    { libelle: 'Avoir du 12/08', ht: -25, tva: -5.25, avoir: true },                 // avoir → exclu (négatif)
  ] };
  const excl = impHT(m);
  ok('6. impHT exclut impayé partiel (20) ET avoir (−25) → −5', Math.abs(excl - (-5)) < 1e-9, String(excl));
  // baseMO = totalHT − mat − dep − impHT. Ici totalHT = 100+20−25 = 95 ; base = 95 − 0 − 0 − (−5) = 100 (le CA réel, avoir NEUTRALISÉ)
  const totalHT = 100 + 20 - 25;
  const baseMO = totalHT - 0 - 0 - excl;
  ok('7. baseMO = CA réel 100 (avoir neutralisé, ni double-compté ni soustrait)', Math.abs(baseMO - 100) < 1e-9, String(baseMO));
}

// ---- financeStats : même exclusion ----
{
  const line = LINES[at('MODULE E : exclut aussi l\'AVOIR (crédit déjà acté à la source)')];
  const expr = line.trim().replace(/^const art = /, '').replace(/;.*$/, '');
  const artSum = new Function('m', 'return ' + expr + ';');
  const m = { articles: [ { ttc: 121, impaye: false }, { ttc: -30, avoir: true }, { ttc: 24, impaye: true, reporte: false } ] };
  ok('8. financeStats « art » exclut avoir et impayé partiel → 121', Math.abs(artSum(m) - 121) < 1e-9, String(artSum(m)));
}

// ---- Fusion : avoirs fusionnés par id, « collecté » gagne, tombstone anti-résurrection ----
{
  const bloc = LINES.slice(at('MODULE E (L0b) : AVOIRS (crédits client) fusionnés par id'), at('base.avoirs = Object.values(byId)') + 2).join('\n');
  const run = new Function('a', 'b', 'base', 'mergeTomb', bloc + '\n; return base;');
  const mergeTomb = (x, y) => Object.assign({}, x, y);
  // même avoir sur 2 appareils, un l'a « collecté » → collecté gagne
  const a = { avoirs: [{ id: 'x1', ttc: 30, collected: true, collectedTourId: 't2' }] };
  const b = { avoirs: [{ id: 'x1', ttc: 30, collected: false }] };
  const base = run(a, b, {}, mergeTomb);
  ok('9. avoir fusionné par id, version COLLECTÉE gagne', base.avoirs.length === 1 && base.avoirs[0].collected === true, JSON.stringify(base.avoirs));
  // tombstone → l'avoir ne ressuscite pas
  const base2 = run({ avoirs: [{ id: 'x2', ttc: 15, collected: false }], avoirDel: { x2: Date.now() } }, { avoirs: [] }, {}, mergeTomb);
  ok('10. avoir tombstoné ne réapparaît pas', base2.avoirs.length === 0, JSON.stringify(base2.avoirs));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
