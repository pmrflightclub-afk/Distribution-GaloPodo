// Harness T1 — comparaison « ce qui a DISPARU » entre une révision du coffre et l'état local.
// Exécution : node test/t1-diff.test.js
// La fonction testée est PURE (aucun DOM, aucun réseau) : on l'extrait d'app.js et on l'instancie stubée.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n, from = 0) => { const i = LINES.findIndex((l, k) => k >= from && l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };
const block = LINES.slice(at('function _dvAddrKey('), at('function renderVaultDiff(')).join('\n');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

const ctx = {
  norm: (s) => String(s == null ? '' : s).trim().toLowerCase(),
  addrStr: (a) => (a ? [a.rue, a.numero, a.cp, a.localite || a.ville].filter(Boolean).join(' ').trim() : ''),
  allTours: () => [],
  clients: [],
};
const keys = Object.keys(ctx);
const { diffVaultVsLocal } = new Function(...keys, block + '\n; return { diffVaultVsLocal };')(...keys.map((k) => ctx[k]));

// ---------------------------------------------------------------- fixtures
const addr = (rue) => ({ rue, cp: '1234', localite: 'Ville' });
const mkTour = (over = {}) => Object.assign({
  id: 't1', date: '2026-07-15', nom: 'Hannut', closed: true,
  arrets: [{ addr: addr('Rue A'), clients: [{ clientId: 'c1', chevaux: [{ id: 'h1', nom: 'Guiness' }, { id: 'h2', nom: 'Honey' }] }] }],
  articles: [{ id: 'a1', libelle: 'Fers', chevalNoms: ['Guiness'], ht: 40 }],
  payments: { c1: { method: 'liquide', rectifie: 120, _ts: 1 } },
  result: { parClient: [{ clientId: 'c1', totalTTC: 145.2 }] },
}, over);
const mkSnap = (tours, clis) => ({ tours, clients: clis || [{ id: 'c1', nom: 'Dupont', chevaux: [{ id: 'h1', nom: 'Guiness' }, { id: 'h2', nom: 'Honey' }] }] });
const localOf = (t) => [t];

console.log('\n── T1 : détection des retraits ──');

// A. rien n'a changé
{
  const s = mkSnap([mkTour()]);
  const d = diffVaultVsLocal(s, localOf(mkTour()), s.clients);
  ok('A. état identique → aucun retrait', d.tours.length === 0 && d.clients.length === 0, JSON.stringify(d.totals));
}

// B. tournée entièrement absente
{
  const s = mkSnap([mkTour()]);
  const d = diffVaultVsLocal(s, [], s.clients);
  ok('B. tournée disparue détectée', d.totals.tours === 1 && d.tours[0].missing === true);
}

// C. cheval retiré du corps d'une tournée clôturée
{
  const s = mkSnap([mkTour()]);
  const loc = mkTour(); loc.arrets[0].clients[0].chevaux = [{ id: 'h1', nom: 'Guiness' }];
  const d = diffVaultVsLocal(s, localOf(loc), s.clients);
  ok('C. cheval disparu détecté', d.totals.chevaux === 1, JSON.stringify(d.totals));
  ok('C2. le bon cheval est nommé', d.tours[0].arrets[0].clients[0].chevaux[0] === 'Honey');
}

// D. article disparu
{
  const s = mkSnap([mkTour()]);
  const loc = mkTour(); loc.articles = [];
  const d = diffVaultVsLocal(s, localOf(loc), s.clients);
  ok('D. article disparu détecté', d.totals.articles === 1 && d.tours[0].articles[0].libelle === 'Fers');
}

// E. paiement effacé (le cas 07-14 / 07-15 : 451,04 € hors compta)
{
  const s = mkSnap([mkTour()]);
  const loc = mkTour(); loc.payments = {};
  const d = diffVaultVsLocal(s, localOf(loc), s.clients);
  ok('E. paiement disparu détecté', d.totals.paiements === 1 && d.tours[0].paiements[0].missing === true);
  ok('E2. montant du paiement restitué', d.tours[0].paiements[0].montant === 120);
}

// F. facture recalculée A LA BAISSE (le cas 133,07 au lieu de 160+)
{
  const s = mkSnap([mkTour()]);
  const loc = mkTour(); loc.result.parClient = [{ clientId: 'c1', totalTTC: 133.07 }];
  const d = diffVaultVsLocal(s, localOf(loc), s.clients);
  ok('F. baisse de facture détectée', d.totals.lignes === 1 && d.tours[0].lignes[0].missing === false);
  ok('F2. montant perdu chiffré', Math.abs(d.totals.montantPerdu - 12.13) < 0.01, 'perdu=' + d.totals.montantPerdu);
}

// G. une facture qui MONTE n'est pas signalée (asymétrie voulue)
{
  const s = mkSnap([mkTour()]);
  const loc = mkTour(); loc.result.parClient = [{ clientId: 'c1', totalTTC: 200 }];
  const d = diffVaultVsLocal(s, localOf(loc), s.clients);
  ok('G. hausse de facture ignorée', d.tours.length === 0, JSON.stringify(d.totals));
}

// H. ajout local (nouveau cheval) non signalé
{
  const s = mkSnap([mkTour()]);
  const loc = mkTour(); loc.arrets[0].clients[0].chevaux.push({ id: 'h3', nom: 'Nouveau' });
  const d = diffVaultVsLocal(s, localOf(loc), s.clients);
  ok('H. ajout local ignoré', d.tours.length === 0);
}

// I. nom de cheval VIDÉ dans la fiche (anomalie A2 réelle : Bottger, Mollet, Collard)
{
  const s = mkSnap([mkTour()]);
  const curClients = [{ id: 'c1', nom: 'Dupont', chevaux: [{ id: 'h1', nom: 'Guiness' }, { id: 'h2', nom: '' }] }];
  const d = diffVaultVsLocal(s, localOf(mkTour()), curClients);
  ok('I. nom de cheval vidé détecté', d.totals.chevauxFiche === 1 && /NOM VID/.test(d.clients[0].chevaux[0].raison), JSON.stringify(d.clients));
}

// J. arrêt entier disparu
{
  const s = mkSnap([mkTour()]);
  const loc = mkTour(); loc.arrets = [];
  const d = diffVaultVsLocal(s, localOf(loc), s.clients);
  ok('J. arrêt disparu détecté', d.totals.arrets === 1 && d.tours[0].arrets[0].missing === true);
}

// ---------------------------------------------------------------- données RÉELLES
console.log('\n── T1 : sur la sauvegarde réelle du 19/07 ──');
{
  const REF = path.join(__dirname, '..', '..', '00 Developpement', 'GaloPodo', '_SAUVEGARDES-PROTEGEES', 'galopodo-19-07-2026_REFERENCE-NE-PAS-SUPPRIMER.json');
  if (!fs.existsSync(REF)) { console.log('  ⏭  sauvegarde de référence absente — test sauté'); }
  else {
    const snap = JSON.parse(fs.readFileSync(REF, 'utf8'));
    const d0 = diffVaultVsLocal(snap, snap.tours, snap.clients);
    ok('K. identité sur données réelles (15 tournées, 24 clients) → 0 retrait',
      d0.tours.length === 0 && d0.clients.length === 0,
      JSON.stringify(d0.totals));
    // amputation simulée sur la vraie tournée du 18/07
    const loc = JSON.parse(JSON.stringify(snap.tours));
    const t18 = loc.find((t) => t.date === '2026-07-18');
    if (t18) {
      t18.payments = {}; t18.articles = [];
      t18.arrets[0].clients[0].chevaux = [];
      const d1 = diffVaultVsLocal(snap, loc, snap.clients);
      ok('L. amputation réelle du 18/07 détectée intégralement',
        d1.totals.paiements === 5 && d1.totals.articles === 2 && d1.totals.chevaux >= 1,
        JSON.stringify(d1.totals));
    }
  }
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
