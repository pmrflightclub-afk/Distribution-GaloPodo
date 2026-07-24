// Harness — outil de base propre (clean-snapshot) : préserve les réglages/clients, remet à zéro le financier.
// Exécution : node test/reset-clean.test.js
const { cleanSnapshotForReset, reportDiff } = require('../outils/clean-snapshot.js');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── RESET : préparation d\'une base propre ──');

// snapshot réaliste : réglages + écuries + clients avec créances + tournées + compta
const snap = {
  app: 'GaloPodo', version: '2.0.0',
  settings: {
    parage: { prixHT: 55 }, tvaRate: 21, seuilKm: 10, forfait: 15,
    articlesCatalogue: [{ id: 'a1', libelle: 'Visite' }],
    materiel: [{ montantHT: 12 }],
    ecuries: [{ id: 'e1', nom: 'Écurie du Pré', addr: { rue: 'X' } }],
    adresses: [{ rue: 'Ref 1' }],
    comptes: [{ id: 'c1' }], provisions: [{ type: 'tva' }],
    contactMails: [{ from: 'a@b.c' }, { from: 'd@e.f' }],
    home: { rue: 'Domicile' }, deviceId: 'devABC', deviceName: 'iPad',
    notesCredit: [{ id: 'nc1', montantTTC: 30 }],
    reglements: [{ id: 'r1' }], documents: [{ id: 'd1' }],
    comptaStatus: { '2026-07': { liquide: 'encode' } }, declarations: { '2026-07': {} },
    comptaRecu: { 't1:cli1': true }, comptaDemarche: {},
    plancheDone: [{ id: 'pd1' }], plancheTodo: [{ id: 'pt1' }],
    ncSeq: 12, factureSeq: 8, reglementSeq: 3, documentSeq: 5,
    agendaImported: { 'x': 1 }, calPushed: { 't1': 1 },
  },
  clients: [
    { id: 'cli1', nom: 'Dupont', chevaux: [{ id: 'h1', nom: 'Guiness' }], impayes: [{ id: 'im1', ttc: 20 }], avoirs: [{ id: 'av1', ttc: 10 }], prets: [{ id: 'p1' }], impayeDel: { old: 1 } },
    { id: 'cli2', nom: 'Martin', chevaux: [{ id: 'h2', nom: 'Bella' }], impayes: [], avoirs: [] },
  ],
  tours: [{ id: 't1', closed: true, payments: {}, frozenClients: {} }, { id: 't2' }],
  tomb: { 'tournees': { 'tx': 123 } },
};

const cleaned = cleanSnapshotForReset(snap, { dropMails: false });

// PRÉSERVÉ
ok('1. réglages tarifaires préservés (parage, TVA, seuil)', cleaned.settings.parage.prixHT === 55 && cleaned.settings.tvaRate === 21 && cleaned.settings.seuilKm === 10);
ok('2. catalogue / matériel / comptes / provisions préservés', cleaned.settings.articlesCatalogue.length === 1 && cleaned.settings.materiel.length === 1 && cleaned.settings.comptes.length === 1 && cleaned.settings.provisions.length === 1);
ok('3. écuries préservées', cleaned.settings.ecuries.length === 1 && cleaned.settings.ecuries[0].nom === 'Écurie du Pré');
ok('4. adresses de référence préservées', cleaned.settings.adresses.length === 1);
ok('5. identité (domicile, deviceId) préservée', cleaned.settings.home.rue === 'Domicile' && cleaned.settings.deviceId === 'devABC');
ok('6. clients préservés (fiche + chevaux)', cleaned.clients.length === 2 && cleaned.clients[0].nom === 'Dupont' && cleaned.clients[0].chevaux[0].nom === 'Guiness');
ok('7. contactMails GARDÉS par défaut', cleaned.settings.contactMails.length === 2);

// REMIS À ZÉRO
ok('8. tournées vidées', cleaned.tours.length === 0);
ok('9. tombstones globaux vidés', Object.keys(cleaned.tomb).length === 0);
ok('10. créances/crédits clients retirés', (cleaned.clients[0].impayes || []).length === 0 && (cleaned.clients[0].avoirs || []).length === 0);
ok('11. tombstones de créances retirés + prêts retirés', cleaned.clients[0].impayeDel === undefined && cleaned.clients[0].prets === undefined);
ok('12. notes de crédit / règlements / documents vidés', cleaned.settings.notesCredit.length === 0 && cleaned.settings.reglements.length === 0 && cleaned.settings.documents.length === 0);
ok('13. statut comptable vidé (comptaStatus/declarations/recu)', Object.keys(cleaned.settings.comptaStatus).length === 0 && Object.keys(cleaned.settings.declarations).length === 0 && Object.keys(cleaned.settings.comptaRecu).length === 0);
ok('14. COMPTEURS de pièces remis à 0', cleaned.settings.ncSeq === 0 && cleaned.settings.factureSeq === 0 && cleaned.settings.reglementSeq === 0 && cleaned.settings.documentSeq === 0);
ok('15. historiques planche + agenda vidés', cleaned.settings.plancheDone.length === 0 && cleaned.settings.plancheTodo.length === 0 && Object.keys(cleaned.settings.agendaImported).length === 0);

// option --drop-mails
{
  const c2 = cleanSnapshotForReset(snap, { dropMails: true });
  ok('16. option --drop-mails vide contactMails', c2.settings.contactMails.length === 0);
}

// immutabilité de l'entrée (copie profonde)
ok('17. le snapshot d\'ORIGINE n\'est pas muté', snap.tours.length === 2 && snap.settings.ncSeq === 12 && snap.clients[0].impayes.length === 1);

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
