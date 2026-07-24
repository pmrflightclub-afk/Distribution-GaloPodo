// Outil de préparation d'une BASE PROPRE pour la remise à zéro de GaloPodo.
// Prend une sauvegarde (export « Télécharger ») et produit un snapshot NETTOYÉ :
//   PRÉSERVÉ : réglages (tarifs/TVA/véhicule/catalogue/matériel/compta analytique/comptes/provisions/planche/
//              identité pro/domicile), écuries, adresses, clients (fiches + chevaux), thème, contactMails (option).
//   REMIS À ZÉRO : tournées, paiements, frozenClients, notes de crédit, règlements, documents, impayés/avoirs
//              des clients, statut comptable (comptaStatus/declarations/comptaRecu/comptaDemarche),
//              compteurs de pièces (ncSeq/factureSeq/reglementSeq/documentSeq), historiques planche, tombstones.
//
// Usage :  node outils/clean-snapshot.js  <entrée.json>  <sortie.json>  [--drop-mails]
// Réimport : page Réglages → Sauvegarde → « ⚠ Remplace tout » avec le fichier de SORTIE.
//   ⚠ PUIS démarrer un NOUVEAU coffre Drive AVANT toute synchro (sinon l'ancien coffre ressuscite les tournées).

'use strict';

// Réglages/collections à VIDER dans settings (financier + compta + historiques + compteurs).
const SETTINGS_RESET_ARRAYS = ['notesCredit', 'reglements', 'documents', 'plancheDone', 'plancheTodo'];
const SETTINGS_RESET_OBJECTS = ['comptaStatus', 'declarations', 'comptaRecu', 'comptaDemarche', 'agendaImported', 'agendaInactive', 'agendaPrive', 'agendaPriveVus', 'agendaTrajetVus', 'calPushed', 'calPendingDelete'];
const SETTINGS_RESET_COUNTERS = ['ncSeq', 'factureSeq', 'reglementSeq', 'documentSeq'];

function cleanSnapshotForReset(snap, opts) {
  opts = opts || {};
  const out = JSON.parse(JSON.stringify(snap || {}));
  // 1) Tournées + tombstones globaux : base neuve, aucune tournée, aucune suppression à propager.
  out.tours = [];
  out.tomb = {};
  // 2) Clients : garder la fiche + chevaux ; retirer créances/crédits et leurs tombstones (liés aux anciennes tournées).
  (out.clients || []).forEach((c) => { c.impayes = []; c.avoirs = []; delete c.impayeDel; delete c.avoirDel; delete c.prets; });
  // (prets = prêts de matériel en cours : liés aux tournées → repartir à zéro. Retirer la clé plutôt que []).
  // 3) Réglages : vider financier/compta/historiques + compteurs, GARDER le reste (tarifs, écuries, adresses, catalogue, identité, thème…).
  const S = out.settings || (out.settings = {});
  SETTINGS_RESET_ARRAYS.forEach((k) => { S[k] = []; });
  SETTINGS_RESET_OBJECTS.forEach((k) => { if (S[k] !== undefined) S[k] = {}; });
  SETTINGS_RESET_COUNTERS.forEach((k) => { S[k] = 0; });
  if (opts.dropMails) S.contactMails = [];
  return out;
}

// Rapport de contrôle (avant/après) pour vérifier visuellement le nettoyage.
function reportDiff(before, after) {
  const S0 = before.settings || {}, S1 = after.settings || {};
  const nImp = (arr) => (arr || []).reduce((s, c) => s + (c.impayes || []).length + (c.avoirs || []).length, 0);
  return {
    tournees: [(before.tours || []).length, (after.tours || []).length],
    clients: [(before.clients || []).length, (after.clients || []).length],
    ecuries: [((S0.ecuries || []).length), ((S1.ecuries || []).length)],
    adresses: [((S0.adresses || []).length), ((S1.adresses || []).length)],
    articlesCatalogue: [((S0.articlesCatalogue || []).length), ((S1.articlesCatalogue || []).length)],
    creancesClients: [nImp(before.clients), nImp(after.clients)],
    notesCredit: [((S0.notesCredit || []).length), ((S1.notesCredit || []).length)],
    reglements: [((S0.reglements || []).length), ((S1.reglements || []).length)],
    documents: [((S0.documents || []).length), ((S1.documents || []).length)],
    compteurs: [[S0.ncSeq || 0, S0.factureSeq || 0, S0.reglementSeq || 0, S0.documentSeq || 0], [S1.ncSeq || 0, S1.factureSeq || 0, S1.reglementSeq || 0, S1.documentSeq || 0]],
    contactMails: [((S0.contactMails || []).length), ((S1.contactMails || []).length)],
    comptaStatusMois: [Object.keys(S0.comptaStatus || {}).length, Object.keys(S1.comptaStatus || {}).length],
  };
}

module.exports = { cleanSnapshotForReset, reportDiff };

// --- CLI ---
if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);
  const inFile = args[0], outFile = args[1], dropMails = args.includes('--drop-mails');
  if (!inFile || !outFile) { console.error('Usage: node outils/clean-snapshot.js <entrée.json> <sortie.json> [--drop-mails]'); process.exit(1); }
  const snap = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const cleaned = cleanSnapshotForReset(snap, { dropMails });
  fs.writeFileSync(outFile, JSON.stringify(cleaned));
  console.log('\n✅ Base propre écrite : ' + outFile + '\n');
  console.log('Contrôle (avant → après) :');
  const d = reportDiff(snap, cleaned);
  Object.keys(d).forEach((k) => console.log('  ' + k.padEnd(18) + ' : ' + JSON.stringify(d[k][0]) + '  →  ' + JSON.stringify(d[k][1])));
  console.log('\n⚠ Réimport : Réglages → Sauvegarde → « ⚠ Remplace tout » avec ce fichier, PUIS nouveau coffre Drive avant toute synchro.\n');
}
