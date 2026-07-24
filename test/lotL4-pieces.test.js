// Harness L4 — pièces comptables : verrou de mois déclaré conservé, NC jamais supprimée (détachée),
// deleteTourById refuse une tournée figée, factureIds fusionné sans écrasement, compteurs monotones.
// Exécution : node test/lotL4-pieces.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── L4 : pièces comptables ──');

// 1. deleteTourById (extrait réel) refuse une tournée figée / arrêt clôturé, autorise une tournée ouverte
{
  const s0 = at('function deleteTourById(id) {');
  const e0 = LINES.findIndex((l, k) => k > s0 && l.trim() === 'return true;');
  const src = LINES.slice(s0, e0 + 2).join('\n');
  const mk = (over) => {
    let purged = false;
    const ctx = {
      allTours: () => [tour],
      downloadSnapshot: () => {}, purgeTourData: () => { purged = true; },
      tournees: [], archive: [], saveTournees: () => {}, saveArchive: () => {},
      logWrite: () => {}, alert: () => {},
      _purged: () => purged,
    };
    var tour = Object.assign({ id: 't1', arrets: [] }, over);
    const keys = Object.keys(ctx);
    const fn = new Function(...keys, 'tour', src + '\n; return deleteTourById;')(...keys.map((k) => ctx[k]), tour);
    return { fn, ctx };
  };
  { const { fn, ctx } = mk({ closed: true }); const r = fn('t1'); ok('1. tournée CLÔTURÉE → suppression refusée', r === false && ctx._purged() === false); }
  { const { fn, ctx } = mk({ arrets: [{ validatedAt: 123 }] }); const r = fn('t1'); ok('1b. arrêt CLÔTURÉ (validatedAt) → refusée', r === false && ctx._purged() === false); }
  { const { fn, ctx } = mk({ closed: false, arrets: [{}] }); const r = fn('t1'); ok('1c. tournée OUVERTE → suppression autorisée', r === true && ctx._purged() === true); }
}

// 2. graftClosure : factureIds fusionné par client, le frozenAt le PLUS ANCIEN gagne, jamais d'écrasement
{
  const code = LINES[at('L4 : factureIds (identité des factures émises) fusionné par client') + 1].trim(); // la ligne de CODE suit le commentaire
  const run = (to, from) => { new Function('to', 'from', code)(to, from); return to; };
  // 'to' n'a pas la facture de c1 → greffée
  ok('2. facture greffée si absente côté « to »', JSON.stringify(run({ factureIds: {} }, { factureIds: { c1: { numero: 'F-1', frozenAt: 100 } } }).factureIds.c1.numero) === '"F-1"');
  // conflit : 'from' a un frozenAt plus ANCIEN → il gagne
  const r2 = run({ factureIds: { c1: { numero: 'F-9', frozenAt: 200 } } }, { factureIds: { c1: { numero: 'F-1', frozenAt: 100 } } });
  ok('2b. frozenAt le plus ANCIEN gagne (1er numéro émis fait foi)', r2.factureIds.c1.numero === 'F-1', JSON.stringify(r2.factureIds.c1));
  // 'from' plus récent → 'to' conservé (pas d'écrasement d'une facture déjà émise)
  const r3 = run({ factureIds: { c1: { numero: 'F-9', frozenAt: 100 } } }, { factureIds: { c1: { numero: 'F-1', frozenAt: 200 } } });
  ok('2c. facture existante NON écrasée par une plus récente', r3.factureIds.c1.numero === 'F-9', JSON.stringify(r3.factureIds.c1));
}

// 3. nextNcNumero : compteur monotone max(vivant, mémorisé)+1
{
  const src = LINES.slice(at('function ncDevicePfx()'), at('function nextNcNumero()') + 1).join('\n');
  const S = { deviceId: 'devABC', notesCredit: [{ numero: 'ABC-3' }], ncSeq: 0 };
  const fn = new Function('S', src + '\n; return { nextNcNumero, ncDevicePfx };')(S);
  const n1 = fn.nextNcNumero();
  ok('3. suit le max VIVANT (3) → ABC-4', n1 === 'ABC-4', n1);
  ok('3b. S.ncSeq persiste (4)', S.ncSeq === 4);
  // la pièce ABC-4 disparaît de la liste (fusion) mais le compteur ne recule pas
  S.notesCredit = [];
  const n2 = fn.nextNcNumero();
  ok('3c. pièce absente de la liste → numéro NON réemployé (ABC-5)', n2 === 'ABC-5', n2);
}

// 4. Logique « verrou de mois déclaré conservé » (réplique de l'expression réelle)
{
  const decl = (st) => st && Object.keys(st).some((k) => st[k] === 'encode');
  const monthsLive = new Set(['2026-08']);
  const comptaStatus = { '2026-07': { liquide: 'encode' }, '2026-06': { liquide: 'brouillon' } };
  const kept = {};
  Object.keys(comptaStatus).forEach((ym) => { const st = comptaStatus[ym]; if (!monthsLive.has(ym) && !decl(st)) { /* supprimé */ } else kept[ym] = st; });
  ok('4. mois DÉCLARÉ sans tournée → verrou CONSERVÉ', !!kept['2026-07']);
  ok('4b. mois non déclaré sans tournée → nettoyé', !kept['2026-06']);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
