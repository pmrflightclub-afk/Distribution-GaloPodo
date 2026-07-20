// Harness LOT 3 — gel des tarifs d'une tournée clôturée.
// Exécution : node test/lot3-gel-tarifs.test.js
//
// Principe : on instancie la VRAIE chaîne tarifaire d'app.js (helpers dérivés + buildPriceSnap +
// withFrozenPrices) dans un contexte stubé, puis on fait varier la configuration APRÈS clôture et
// on vérifie que le calcul gelé ne bouge pas — alors que le calcul vivant, lui, bouge.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n, from = 0) => { const i = LINES.findIndex((l, k) => k >= from && l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };
const grab = (a, b) => LINES.slice(at(a), at(b)).join('\n');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

// Blocs réels extraits d'app.js
const blocHelpers = [
  LINES[at('var _fp = null;')],
  LINES[at('const baseMateriel =')],
  LINES[at('const fraisActif =')],
  LINES[at('const fraisContribHT =')],
  LINES[at('const amortContribHT =')],
  LINES[at('const baseVehiculeHT =')],
  LINES[at('const tempsPerKm =')],
  LINES[at('const rate = () =>')],
  LINES[at('const fuelPerKmHT =')],
  LINES[at('const tarifHT = (type)')],
].join('\n');
const blocGel = grab('const PRICE_KEYS =', 'function recomputeTourLocal(t)');

function build(S0, clients0) {
  const ctx = {
    S: JSON.parse(JSON.stringify(S0)),
    clients: JSON.parse(JSON.stringify(clients0 || [])),
    APP_VERSION: '1.7.97-test',
    norm: (s) => String(s == null ? '' : s).trim().toLowerCase(),
  };
  const keys = Object.keys(ctx);
  const code = blocHelpers + '\n' + blocGel +
    '\n; return { buildPriceSnap, withFrozenPrices, ensurePriceSnap, tarifHT, baseVehiculeHT, fuelPerKmHT, tempsPerKm, baseMateriel, rate,' +
    ' setS: (o) => { S = Object.assign(S, o); }, getS: () => S, setClients: (c) => { clients = c; }, tarifNow: () => tarifHT("tournee"), matNow: () => baseMateriel(), lourdOf: (cid, nom) => { const c = clients.find((x) => x.id === cid); const h = c && (c.chevaux || []).find((y) => y.nom === nom); return h ? { lourd: !!h.lourd, lourdHT: h.lourdHT } : null; } };';
  return new Function(...keys, code)(...keys.map((k) => ctx[k]));
}

const S0 = {
  amortissement: { achatHT: 30000, dureeVieKm: 300000 },   // 0,10 €/km
  frais: [
    { id: 'f1', montantHT: 800, kmPrevus: 40000, statut: 'actif' },  // 0,02 €/km — pneus
    { id: 'f2', montantHT: 600, kmPrevus: 30000, statut: 'actif' },  // 0,02 €/km — entretien
  ],
  consoL100: 8, prixPleinL: 1.70,
  kmHeure: 60, prixHeure: 45,
  tvaRate: 21, tvaRegime: 'normal',
  materiel: [{ montantHT: 12, nbChevaux: 1 }],
  parage: { prixHT: 55, tvaPct: 21 },
  seuilKm: 10, forfait: 15, repartition: 'prorata', reducLiquide: 0, urgenceSuppKm: 0.5,
  fourbureHT: 20, npasHT: 10, infectionHT: 15, difficileHT: 25, lourdHT: 18,
  articlesCatalogue: [{ id: 'av1', libelle: 'Visite', prixHT: 40, tvaPct: 21 }, { id: 'av2', libelle: 'Autre', prixHT: 99, tvaPct: 21 }],
};
const C0 = [{ id: 'c1', nom: 'Dupont', chevaux: [{ id: 'h1', nom: 'Guiness', lourd: true, lourdHT: 18, lourdRemise: 0 }] }];
const TOUR = { id: 't1', closed: true, arrets: [{ addr: { rue: 'A' }, clients: [{ clientId: 'c1', chevaux: [{ id: 'h1', nom: 'Guiness', parage: true, visite: true, visiteArtId: 'av1' }] }] }] };

console.log('\n── LOT 3 : le gel tient face aux évolutions de configuration ──');

// 0. sanity : la base véhicule NE dépend PAS des km parcourus (correction d'une affirmation erronée)
{
  const app = build(S0, C0);
  const base1 = app.baseVehiculeHT();
  app.setS({ odoReleves: [{ km: 999999 }] });            // rouler beaucoup
  ok('0. la base véhicule ne bouge PAS quand on roule', Math.abs(app.baseVehiculeHT() - base1) < 1e-12,
    base1 + ' -> ' + app.baseVehiculeHT());
  ok('0b. base = amortissement + Σ frais (0,10 + 0,02 + 0,02)', Math.abs(base1 - 0.14) < 1e-9, String(base1));
}

// 1. un frais passé à « remplacé » FAIT baisser la base (cycle normal de l'activité)
{
  const app = build(S0, C0);
  const avant = app.tarifNow();
  const s = app.getS(); s.frais[0].statut = 'remplace';
  ok('1. frais remplacé → tarif vivant BAISSE', app.tarifNow() < avant, avant + ' -> ' + app.tarifNow());
}

// 2. LE TEST CENTRAL : la même évolution ne doit PAS bouger une tournée clôturée gelée
{
  const app = build(S0, C0);
  const snap = app.buildPriceSnap(TOUR);
  const t = Object.assign({}, TOUR, { priceSnap: snap });
  const gelAvant = app.withFrozenPrices(t, () => app.tarifNow());
  const s = app.getS();
  s.frais[0].statut = 'remplace';            // pneus remplacés
  s.prixPleinL = 2.20;                       // carburant en hausse
  s.parage.prixHT = 70;                      // tarif de parage revu
  s.materiel = [{ montantHT: 30, nbChevaux: 1 }];
  s.articlesCatalogue[0].prixHT = 65;        // article du catalogue re-tarifé
  const gelApres = app.withFrozenPrices(t, () => app.tarifNow());
  ok('2. tarif de déplacement GELÉ inchangé', Math.abs(gelAvant - gelApres) < 1e-12, gelAvant + ' -> ' + gelApres);
  ok('2b. le tarif VIVANT, lui, a bien changé', Math.abs(app.tarifNow() - gelApres) > 1e-9);
  ok('2c. base matériel gelée', Math.abs(app.withFrozenPrices(t, () => app.matNow()) - 12) < 1e-9);
  ok('2d. tarif parage gelé', app.withFrozenPrices(t, () => app.getS().parage.prixHT) === 55, String(app.withFrozenPrices(t, () => app.getS().parage.prixHT)));
  ok('2e. article catalogue gelé', app.withFrozenPrices(t, () => app.getS().articlesCatalogue.find((x) => x.id === 'av1').prixHT) === 40);
}

// 3. option « lourd » décochée dans la fiche APRÈS clôture → la facture gelée la conserve
{
  const app = build(S0, C0);
  const t = Object.assign({}, TOUR, { priceSnap: app.buildPriceSnap(TOUR) });
  const cs = JSON.parse(JSON.stringify(C0)); cs[0].chevaux[0].lourd = false; cs[0].chevaux[0].lourdHT = null;
  app.setClients(cs);
  const gel = app.withFrozenPrices(t, () => app.lourdOf('c1', 'Guiness'));
  ok('3. option « lourd » figée malgré le décochage', gel && gel.lourd === true && gel.lourdHT === 18, JSON.stringify(gel));
  ok('3b. hors gel, la fiche vivante fait foi', app.lourdOf('c1', 'Guiness').lourd === false);
}

// 4. restauration du contexte — aucun état résiduel, même si le calcul lève
{
  const app = build(S0, C0);
  const t = Object.assign({}, TOUR, { priceSnap: app.buildPriceSnap(TOUR) });
  const vivant = app.tarifNow();
  app.withFrozenPrices(t, () => 1);
  ok('4. contexte restauré après un calcul gelé', Math.abs(app.tarifNow() - vivant) < 1e-12);
  let leve = false;
  try { app.withFrozenPrices(t, () => { throw new Error('boom'); }); } catch (e) { leve = true; }
  ok('4b. exception propagée', leve);
  ok('4c. contexte restauré MÊME après exception', Math.abs(app.tarifNow() - vivant) < 1e-12, 'residu: ' + app.tarifNow());
}

// 5. une tournée NON clôturée n'est pas gelée (tarifs vivants — comportement inchangé)
{
  const app = build(S0, C0);
  const t = Object.assign({}, TOUR, { closed: false });
  ok('5. pas de gel posé sur une tournée non clôturée', app.ensurePriceSnap(t) === false && !t.priceSnap);
  const s = app.getS(); s.prixPleinL = 3;
  ok('5b. une tournée non clôturée suit bien les tarifs vivants', Math.abs(app.withFrozenPrices(t, () => app.tarifNow()) - app.tarifNow()) < 1e-12);
}

// 6. gel rétroactif : tournée clôturée sans priceSnap → posé, et les montants stockés ne bougent pas
{
  const app = build(S0, C0);
  const t = JSON.parse(JSON.stringify(TOUR)); t.result = { parClient: [{ clientId: 'c1', totalTTC: 145.2 }] };
  const avant = JSON.stringify(t.result);
  ok('6. gel rétroactif posé sur une clôturée', app.ensurePriceSnap(t) === true && !!t.priceSnap);
  ok('6b. marqué « derived » (config du jour du gel, pas de la clôture)', t.priceSnap.derived === true);
  ok('6c. AUCUN montant stocké modifié', JSON.stringify(t.result) === avant);
  ok('6d. idempotent (pas de re-pose)', app.ensurePriceSnap(t) === false);
}

// 7. compacité : le gel ne doit pas gonfler le coffre
{
  const app = build(S0, C0);
  const octets = JSON.stringify(app.buildPriceSnap(TOUR)).length;
  ok('7. gel compact (< 1500 octets, catalogue limité aux articles utilisés)', octets < 1500, octets + ' octets');
  ok('7b. seuls les articles UTILISÉS sont copiés', app.buildPriceSnap(TOUR).S.articlesCatalogue.length === 1);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
