// Harness L3 — argent acté : la purge d'arrondi n'efface plus l'encaissement ;
// setComptaPayment purge la créance liée à la bascule (anti double-comptage).
// Exécution : node test/lotL3-argent-acte.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── L3 : argent acté ──');

// 1. La purge d'arrondi aberrant ne contient PLUS d'effacement de p.rectifie/p.montantPaye
{
  const line = LINES[at('L3 : on SIGNALE l\'écart aberrant')];
  ok('1. plus de « p.rectifie = null » dans la purge d\'arrondi', !/p\.rectifie = null/.test(line) && !/p\.montantPaye = null/.test(line), line.trim().slice(0, 80));
  ok('1b. l\'écart est journalisé (frozen)', /logWrite\(/.test(line) && /frozen: true/.test(line));
}

// 2. setComptaPayment (extrait réel) purge la créance quand la bascule efface le « partiel »
{
  const src = LINES.slice(at('function setComptaPayment(tourId, clientId, method)'), at('  const i = tournees.findIndex((x) => x.id === t.id); if (i >= 0) { tournees[i] = t;') + 2).join('\n');
  const calls = [];
  const ctx = {
    tourById: (id) => ({ id, payments: { c1: { method: 'liquide', facture: true, rectifie: 120, partiel: true, impaye: 20, resteMode: 'report', rembourse: 0 } } }),
    setClientImpaye: (t, cid, v) => calls.push(['setClientImpaye', cid, v]),
    saveClients: () => {},
    recomputeTourLocal: () => {},
    tourComptaLocked: () => false,
    logWrite: () => {}, comptaSectionKey: (mp) => mp && mp.method ? (mp.method === 'liquide' ? (mp.facture ? 'facliq' : 'liquide') : (mp.facture ? 'facvir' : 'virement')) : null, paiementActe: () => false,
    tournees: [], archive: [],
    saveTournees: () => {}, saveArchive: () => {},
  };
  const keys = Object.keys(ctx);
  const setComptaPayment = new Function(...keys, src + '\n; return setComptaPayment;')(...keys.map((k) => ctx[k]));
  // récupère le tour muté : on capture via tourById
  let capt = null; ctx.tourById = (id) => (capt = { id, payments: { c1: { method: 'liquide', facture: true, rectifie: 120, partiel: true, impaye: 20, resteMode: 'report', rembourse: 0 } } });
  const fn2 = new Function(...keys, src + '\n; return setComptaPayment;')(...keys.map((k) => ctx[k]));
  fn2('t1', 'c1', 'virement'); // facture liquide partielle → virement
  ok('2. bascule liquide-partiel → virement : le « partiel » est effacé', capt.payments.c1.partiel === false && capt.payments.c1.impaye === null, JSON.stringify(capt.payments.c1));
  ok('2b. setClientImpaye(…, 0) APPELÉ → créance purgée (pas de double-comptage)', calls.some((c) => c[0] === 'setClientImpaye' && c[1] === 'c1' && c[2] === 0), JSON.stringify(calls));
}

// 3. Une bascule qui NE touche PAS un partiel (client déjà non-partiel) ne purge rien à tort
{
  const src = LINES.slice(at('function setComptaPayment(tourId, clientId, method)'), at('  const i = tournees.findIndex((x) => x.id === t.id); if (i >= 0) { tournees[i] = t;') + 2).join('\n');
  const calls = [];
  let capt = null;
  const ctx = {
    tourById: (id) => (capt = { id, payments: { c1: { method: 'liquide', facture: false, rectifie: 100, partiel: false, impaye: null, resteMode: null, rembourse: 0 } } }),
    setClientImpaye: (t, cid, v) => calls.push(v), saveClients: () => {}, recomputeTourLocal: () => {}, tourComptaLocked: () => false, logWrite: () => {}, tournees: [], archive: [], saveTournees: () => {}, saveArchive: () => {}, comptaSectionKey: (mp) => mp && mp.method ? (mp.method === 'liquide' ? (mp.facture ? 'facliq' : 'liquide') : (mp.facture ? 'facvir' : 'virement')) : null, paiementActe: () => false,
  };
  const keys = Object.keys(ctx);
  const setComptaPayment = new Function(...keys, src + '\n; return setComptaPayment;')(...keys.map((k) => ctx[k]));
  setComptaPayment('t1', 'c1', 'virement');
  ok('3. client non-partiel → aucun appel de purge (setClientImpaye non appelé)', calls.length === 0, JSON.stringify(calls));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
