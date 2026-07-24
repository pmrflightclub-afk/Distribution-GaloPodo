# PROMPT DE REPRISE — GaloPodo (à coller en début de nouvelle conversation)

CONTEXTE — GaloPodo, PWA de maréchalerie/pareur (BE/FR/LU), mono-fichier `app.js` (~16 000 lignes, tout est dedans).
Dépôt app (repo **live** `Distribution-GaloPodo`, push sur `main` = déploiement en production) :
`d:\0 - DEVscripts\HOT-SacreSabot\GaloPodo\`.
Repo **parent** (docs miroir + suivi) : `d:\0 - DEVscripts\HOT-SacreSabot\` (branche `feat/lot-pre-tests`).

**Lis d'abord ta mémoire** : `galopodo-finalisation-mandat.md` (LE fichier de référence, à jour), puis
`galopodo-app.md`, `galopodo-chantier-migration-identite.md`, `galopodo-perte-donnees-synchro.md`.
Puis dans le dépôt : **`SPEC-modules-correction.md`**, **`SPEC-documents-independants.md`**, `SPEC-immutabilite.md`,
`PLAN-finalisation.md`, et **`RESET-base-propre.md`** (procédure de remise à zéro).

---

## 1. ÉTAT EXACT (vérifié au 2026-07-23)

- **Version : `2.0.0`** (`APP_VERSION` app.js:14 ; `CACHE = 'galopodo-v2-0-0'` sw.js:3).
- **Branche de travail : `migration-identite-v2`** — **55 commits d'avance sur `origin/main`, NON POUSSÉE.** Arbre propre.
- `main` = **v1.8.0 en production** (correctifs perte de données de juillet). La branche contient v1.8.1 (Phase 1) +
  Phase 2 (migration) + **Phase 3 complète** (v2.0.0) + audits + correctifs.
- **Tests : `npm test`** (`test/run-all.js`, auto-découvre `test/*.test.js`) → **26 harnais, 360 assertions, tout vert.**
  À relancer après chaque modif. `node --check app.js` après chaque édition.
- **Smoke-test fait** : l'app **boote proprement** dans Chrome headless (0 erreur console). Les MODALES n'ont
  PAS été cliquées en vrai → **la recette utilisateur reste indispensable** (voir §5).

## 2. CE QUI EST FAIT (ne pas refaire)

**Phase 3 — fiabilité comptable (lots L0→L10), intégralement codée + testée + auditée 2×.**
- **L0 module D** : champ paiement liquide « Montant liquide reçu » ; manque ≥ 1 € → impayé auto + « partiel »
  coché (`liquideFromRecu`, invariant `payRecu = rectifie − impaye = reçu`).
- **L0b/E — avoir client** `c.avoirs[]` (miroir `c.impayes`) : crédit déduit au prochain RDV, exclu du CA de
  collecte ; **solde total** (avoir > visite → total borné à 0, avoir plafonné aux charges, `avoirReliquat`
  affiché sur facture/ticket, hors caisse).
- **L1 traçabilité** : `withOrigin` + 2 anneaux bornés `ftr.wlog`/`ftr.wlogFrozen` (locaux, non synchronisés,
  purgés en 1er sous quota).
- **L2 recalculs gelés** : `tourFrozenEdit` garde `recomputeMoney`/`calcTour`/`sanitizeTourStats` ;
  `rowFromArret` joint par id (repli nom).
- **L3 argent acté** : la purge d'arrondi ne supprime plus `p.rectifie`/`p.montantPaye` (SIGNALE) ;
  `setComptaPayment` purge la créance liée à une bascule.
- **L4 pièces** : mois déclaré jamais rouvert ; NC jamais supprimée (`tourDeleted`) ; `deleteTourById` refuse une
  tournée/arrêt figé (règle 7) ; `factureIds`/`frozenClients`/avoirs greffés dans `graftClosure` ; compteurs
  **persistés monotones** `S.ncSeq`/`factureSeq`/`reglementSeq`/`documentSeq`.
- **L5 contournements** : `markToursReview` n'ouvre pas une clôturée ; `chevalInFrozenTour` (cheval figé non
  supprimable) ; nom de cheval obligatoire.
- **L6 module C — gel par client (D1)** : `t.frozenClients[cid]`, `freezeClientBlock` à `closeClientFully`,
  `applyFrozenClients` après les 4 écritures de `t.result` ; **partage du déplacement RESTANT aux non-figés**
  (kmGel) ; ré-injection d'un figé disparu ; greffe fusion.
- **L7 module A — poste « Remboursements »** : caisse facture-liquide nette (`remboursementsCaisse`,
  `facliqNC` exige `n.rembourse`), réconciliation écran + PDF ; champ mort `documentaire` retiré.
- **L8 module B — contrepassation** : `paiementActe` ; `setComptaPayment` refuse le reclassement d'un paiement
  acté (mais AUTORISE l'émission d'une facture false→true) → `modalCorrigerReglement` crée un règlement
  rectificatif `S.reglements[]` (2 jambes, CA inchangé, jambe liquide via module D + créance si impayé, virement
  erroné marqué « reçu », `ymImpute` figé) ; lignes dérivées visibles (réconciliation).
- **L9 checkFrozenWrite** : filet d'observation à `persistCurrentTour` ET `persistTourAnywhere` (détecte aussi la
  disparition d'un client figé).
- **L10 documents indépendants COMPLETS** : `S.documents[]` ; `modalDeclarerDoc` = **éditeur de lignes** (facture
  de vente « comme un arrêt » : catalogue parage/patho/articles + ligne libre + déplacement km) et **NC par
  cochage** des prestations d'une tournée de référence ; `modalDocuments` (registre + statut + **PDF + email**) ;
  attachement hybride (liquide fondu via impayé/avoir · virement = paiement propre bloquant `tourFinalizeBlock`).

**Audits + correctifs (2026-07-23)** : 4 agents (Phase 3) + 2 agents (Phases 1/2 + complaisance). **~15 bugs
corrigés** (surtout avoir/gel/règlement : double baisse de caisse, CA surévalué, reliquat perdu, impayé règlement
perdu, revenu figé disparu, avoir perdu/dédoublé en synchro, orphelins, PDF NC multi-taux, **bug A-1** relink
écurie sur page Gestion). Audit de complaisance : **RIEN d'oublié ni d'édulcoré**.

**Phases 1/2 (antérieures)** : page Sauvegarde (gel corrigé), migration (écuries réifiées, carnet d'adresses,
page Gestion 2 vues, revue clients, période compta par client, n° de facture) — **auditées, cœur sain**.

**Outil de remise à zéro** : `outils/clean-snapshot.js` + `test/reset-clean.test.js` (17 assertions) +
`RESET-base-propre.md`.

## 3. RÈGLES MÉTIER VERROUILLÉES — NE JAMAIS CONTOURNER

1. **Un paiement fait est FAIT.** Aucun reclassement virement ↔ liquide, jamais. Un virement acté est à recevoir,
   même s'il n'arrive jamais (il reste « en attente », JAMAIS rappelé en impayé).
2. **Arrêt clôturé / tournée figée / mois déclaré = immuables.** Corrections par **pièces neuves**, jamais réécriture.
3. **Montant d'un client figé dès SA clôture (D1).** Les clients suivants se partagent le déplacement **restant**.
4. **Facture cochée jamais décochée.** Erreur → note de crédit. **Émettre** une facture (cocher) sur un paiement
   acté reste autorisé ; changer la méthode ou décocher = refusé.
5. **Seul le liquide SANS facture** est rattachable à un mois antérieur ; les factures restent au mois de la prestation.
6. **Pièce actée (facture, NC) jamais supprimée** → détachée (`tourDeleted`).
7. **Suppression de tournée** : possible UNIQUEMENT si non clôturée ET aucun arrêt clôturé.
8. **Impayé rappelé aux tournées suivantes UNIQUEMENT sur liquide** (paiement liquide + facture liquide).
9. **Remboursements** : annulation liquide sans facture = sur place (inchangé) ; NC facture liquide = au choix
   virement (NC conservée) ou liquide (avoir déduit prochaine visite) ; reliquat d'avoir rendu cash, hors caisse.
10. **Correction d'imputation** = règlement rectificatif à 2 jambes (contrepassation), `t.payments` intact.

## 4. CONVENTIONS OBLIGATOIRES (à chaque version)

1. `const APP_VERSION = 'X.Y.Z'` (app.js:14) + entrée en tête du tableau `CHANGELOG` (français, `ajouts`/`corrections`).
2. `const CACHE = 'galopodo-vX-Y-Z'` (sw.js) — même numéro, tirets.
3. `cd GaloPodo && node --check app.js && npm test` avant de committer.
4. Un lot = un commit (+ idéalement un harnais `test/lot*.test.js`). Fin de message de commit :
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
5. **Répercuter la doc miroir** dans le repo PARENT (`00 Developpement/GaloPodo/GaloPodo_DOCUMENTATION.md` +
   `SYNTHESE_DEMANDES.md`), commit scopé `docs(galopodo): … — local uniquement` sur `feat/lot-pre-tests`.
6. **NE JAMAIS pousser sur `main` sans demande explicite.** **NE PAS toucher aux données prod du user.**
7. Pièges techniques : `currentTour` = COPIE → toute mutation appelle `persistCurrentTour()` ;
   `saveSettings()` = S + refresh + recompute ; images de planche jamais persistées (métadonnées seulement).

## 5. CE QUI RESTE — DANS L'ORDRE

1. **RECETTE UTILISATEUR (bloquant avant tout déploiement/reset).** Le user teste en vrai les nouveaux écrans :
   champ « Montant liquide reçu » (impayé auto), poste « Remboursements » (Compta), « ⇄ Corriger l'imputation »,
   registre **Documents** (déclarer une facture de vente avec lignes, une NC par cochage, PDF, email), le gel par
   client. Les tests couvrent la logique + le boot ; les CLICS non.
2. **Déploiement** (quand le user valide) : merge `migration-identite-v2` → `main`, push, **publier la Release
   GitHub** (c'est elle qui déclenche la MàJ des téléphones). Procédure : `DEPLOIEMENT-v1.8.0.md`. Envisager un
   `0_STANDBY_INSTALLEUR` si recompilation.
3. **Remise à zéro des données** (APRÈS déploiement, quand le user fournit sa sauvegarde prod) : suivre
   **`RESET-base-propre.md`**. ⚠️ **3 PIÈGES CRITIQUES** :
   - **(E-1) La synchro Drive RESSUSCITE les anciennes tournées** (union additive) → **NOUVEAU coffre Drive
     OBLIGATOIRE après l'import**, jamais resynchroniser sur l'ancien.
   - **(E-2) Seul « ⚠ Remplace tout »** convient (« Données seules » / « Fusion » corrompent : compteurs/compta/
     écuries non nettoyés).
   - **(E-3)** Tombstones locaux périmés → nouveau coffre là aussi.
   Flux : export prod → le user donne le fichier → `node outils/clean-snapshot.js entrée.json sortie.json` →
   « Remplace tout » → nouveau coffre Drive → ré-encoder les tournées à la main. `contactMails` GARDÉS (choix user).

## 6. DÉCISIONS TRANCHÉES (ne pas rediscuter) & OUVERTES

**Tranché** : kmGel (partage du reste) OUI · L10 complet OUI · reliquat affiché hors caisse · émission de facture
autorisée sur pièce actée · `contactMails` gardés au reset · numérotation `V`/`N`/`C`/`F` par appareil.
**Ouvert** : cadence/timing de déploiement (v2.0.0 prête, non poussée) · un audit frais de l'app **antérieure**
(pré-1.8 : synchro Drive, planches, Google) n'a PAS été refait cette session (les audits datent).

## 7. NOTE DE MAINTENANCE

Pas de garde centrale unique `writePayment` (la spec la proposait) — les gardes sont **inline** dans
`setComptaPayment` + `paiementActe` + `checkFrozenWrite` + `tourFrozenEdit`. L'immuabilité est intégralement
atteinte, MAIS toute **future écriture de `t.payments`** doit rappeler la garde manuellement.

## 8. PREMIÈRE ACTION ATTENDUE

Confirmer que tu as le contexte, puis demander au user **où en est sa recette** (ou l'aider à la faire / préparer
un guide de recette ciblé). Ne rien pousser, ne pas toucher aux données prod, tant qu'il ne l'a pas validé.
