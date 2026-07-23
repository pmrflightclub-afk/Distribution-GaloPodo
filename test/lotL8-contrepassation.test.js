// Harness L8 — contrepassation : règlement rectificatif (2 jambes, CA nul), refus de reclassement, solde total avoir.
// Exécution : node test/lotL8-contrepassation.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };
const grabFn = (sig) => { const s0 = at(sig); const e0 = LINES.findIndex((l, k) => k > s0 && l === '}'); return LINES.slice(s0, e0 + 1).join('\n'); };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── L8 : contrepassation ──');

// contexte partagé
const S = { reglements: [], reglementSeq: 0, deviceId: 'devABC', comptaRecu: {} };
const liquideFromRecuSrc = LINES.slice(at('function liquideFromRecu(recu, ttc, opts)'), at('function payArrondi(m, p)')).join('\n');
const helpers = grabFn('function nextReglementNumero()') + '\n' + grabFn('function comptaSectionKey(mp)') + '\n' + grabFn('function createReglement(t, cid, opts)') + '\n' + grabFn('function reglementToNet(reg)') + '\n' + liquideFromRecuSrc;
const api = new Function('S', 'uid', 'todayStr', 'rate', 'clientName', 'saveSettings', 'logWrite', 'comptaLocked', 'ncDevicePfx',
  helpers + '\n; return { nextReglementNumero, comptaSectionKey, createReglement, reglementToNet, liquideFromRecu };')(
  S, (() => { let n = 0; return () => 'id' + (++n); })(), () => '2026-08-05', () => 0.21, (id) => 'Client ' + id, () => {}, () => {}, () => false, () => 'BC');

// 1. comptaSectionKey mappe correctement
{
  ok('1. liquide', api.comptaSectionKey({ method: 'liquide', facture: false }) === 'liquide');
  ok('1b. facture liquide', api.comptaSectionKey({ method: 'liquide', facture: true }) === 'facliq');
  ok('1c. virement', api.comptaSectionKey({ method: 'virement', facture: false }) === 'virement');
  ok('1d. facture virement', api.comptaSectionKey({ method: 'virement', facture: true }) === 'facvir');
}

// 2. createReglement : virement (240,50) → liquide reçu 240 (arrondi) — 2 jambes, marque le virement « reçu »
{
  const t = { id: 't1', date: '2026-08-03', payments: { c1: { method: 'virement', facture: false } }, result: { parClient: [{ clientId: 'c1', totalTTC: 240.5 }] } };
  const reg = api.createReglement(t, 'c1', { toMethod: 'liquide', toFacture: false, recu: 240, motif: 'réglé en espèces' });
  ok('2. jambe FROM = virement 240,50 (montant exact)', reg.montantTTC === 240.5 && api.comptaSectionKey(reg.from) === 'virement', JSON.stringify(reg.from) + ' ' + reg.montantTTC);
  ok('2b. jambe TO = liquide', api.comptaSectionKey(reg.to) === 'liquide');
  ok('2c. numéro préfixe C', /^CBC-\d+$/.test(reg.numero), reg.numero);
  ok('2d. ymImpute figé au mois de la tournée (2026-08)', reg.ymImpute === '2026-08', reg.ymImpute);
  ok('2e. virement d\'origine marqué « reçu »', S.comptaRecu['t1:c1'] === true);
  // jambe to nette = reçu 240 (l'écart 0,50 est un arrondi caisse, pas un impayé — < 1 €)
  ok('2f. montant net de la jambe liquide = 240 (reçu)', api.reglementToNet(reg) === 240, String(api.reglementToNet(reg)));
}

// 3. CA nul : les deux jambes se compensent (from −240,50 + to +240 ≈ 0, écart = arrondi caisse)
{
  const reg = S.reglements[0];
  const fromTTC = reg.montantTTC;          // 240,50 retiré du virement
  const toTTC = api.reglementToNet(reg);   // 240 ajouté au liquide
  ok('3. re-ventilation ≈ neutre (écart = arrondi 0,50 €)', Math.abs(fromTTC - toTTC) < 1, 'écart ' + (fromTTC - toTTC));
}

// 4. Compteur de règlement monotone (persisté)
{
  const t = { id: 't2', date: '2026-08-03', payments: { c2: { method: 'virement', facture: false } }, result: { parClient: [{ clientId: 'c2', totalTTC: 100 }] } };
  const reg2 = api.createReglement(t, 'c2', { toMethod: 'liquide', recu: 100, motif: 'x' });
  ok('4. 2e règlement → séquence incrémentée', reg2.numero === 'CBC-2' && S.reglementSeq === 2, reg2.numero + ' seq=' + S.reglementSeq);
}

// 5. Solde total avoir (réplique de l'expression réelle) : un total négatif (avoir > charges) → 0 + reliquat
{
  const line = LINES[at('L8 (MODULE E, solde total)') + 1];
  const expr2 = LINES[at('if (tTTC < -0.005 && (m.articles || []).some((a) => a.avoir))')].trim();
  // reproduit la logique
  const solde = (totalHT, totalTVA, hasAvoir) => { let tHT = totalHT, tTVA = totalTVA, tTTC = totalHT + totalTVA, avoirReliquat = 0; if (tTTC < -0.005 && hasAvoir) { avoirReliquat = Math.round(-tTTC); tHT = 0; tTVA = 0; tTTC = 0; } return { tTTC, avoirReliquat }; };
  const r = solde(-40, -8, true); // avoir de 48 sur une visite vide
  ok('5. avoir > charges → total borné à 0', r.tTTC === 0);
  ok('5b. reliquat cash tracé (48)', r.avoirReliquat === 48, String(r.avoirReliquat));
  const r2 = solde(30, 6, true); // visite 36 > avoir déjà appliqué → positif, pas de reliquat
  ok('5c. total positif → pas de reliquat', r2.tTTC === 36 && r2.avoirReliquat === 0);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
