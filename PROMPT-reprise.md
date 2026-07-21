# PROMPT DE REPRISE — GaloPodo (à coller en début de nouvelle conversation)

CONTEXTE — GaloPodo, PWA de maréchalerie, mono-fichier `app.js` (~15 500 lignes).
Dépôt : `d:\0 - DEVscripts\HOT-SacreSabot\GaloPodo` (push sur `main` = déploiement en production).

Lis d'abord ta mémoire : `galopodo-finalisation-mandat.md`, `galopodo-perte-donnees-synchro.md`,
`galopodo-chantier-migration-identite.md`, `galopodo-app.md`.
Puis lis dans le dépôt : **`PLAN-finalisation.md`**, **`SPEC-immutabilite.md`** (432 lignes, spécification
complète issue de 110 agents d'audit), `PLAN-repartir-propre.md`, `DEPLOIEMENT-v1.8.0.md`.

---

## 1. ÉTAT DU DÉPÔT

- `main` = **v1.8.0 déployée en production** (correctifs de la perte de données de juillet).
- **`migration-identite-v2`** = branche de travail active, **NON poussée**. Contient v1.8.1 + tout le chantier.
- Filets : branche `feat/migration-identite` (pré-rebase) + tags `backup/*`.
- **Suite de tests : `npm test`** (`test/run-all.js`, auto-découvre `test/*.test.js`) →
  **12 harnais, 206 assertions, toutes vertes.** À relancer après chaque modification.

### Fait et testé (ne pas refaire)
- **Phase 1** : runner de test unique · correction du gel de la page Sauvegarde (le textarea ne contient plus
  l'instantané ; export via Télécharger/Copier ; import par collage).
- **Phase 2** : chantier migration/identité **entièrement clos** — Lot 04-D (2 bugs d'adresse, carnet
  d'adresses, page Gestion à deux vues client/écurie, tuile adresses, import mail), Lot 05 (modale de revue :
  fusion champ par champ des fiches importées), Lot 06 (période comptable par client + pastille), Lot 02b
  (numéro de facture + référence de ligne dérivée).

---

## 2. RÈGLES MÉTIER VERROUILLÉES PAR LE PROPRIÉTAIRE — NE JAMAIS LES CONTOURNER

1. **Un paiement fait est FAIT.** Aucun reclassement virement ↔ liquide, jamais, sous aucune condition.
   Motifs : le liquide porte une réduction de 20 % que le virement n'a pas ; les arrondis diffèrent ; ce que le
   client a payé est acté. **Un virement acté est un virement à recevoir**, même s'il n'arrive jamais.
2. **Un arrêt clôturé, une tournée figée : immuables.** C'est comptable.
3. **Le montant de chaque client est figé dès SA clôture** — pas à la clôture de la tournée. Un client clôturé
   ne doit plus bouger même si la tournée continue (aujourd'hui le déplacement est réparti au prorata et fait
   varier son total : **à corriger**).
4. **Une facture cochée ne se décoche jamais.** Erreur → note de crédit. Pas de tolérance, pas de délai.
5. **Seul le liquide SANS facture** peut être rattaché à un mois antérieur (démarche caisse).
   **Les factures restent toujours au mois de la prestation.** (Le code respecte déjà cette règle.)
6. **Une pièce créée est actée : elle n'est pas supprimable.** Ni facture de vente, ni note de crédit.
7. **SUPPRESSION DE TOURNÉE — règle neuve** : une tournée n'est supprimable que si elle **n'est pas clôturée**
   ET qu'**aucun de ses arrêts n'est clôturé**. Dès qu'un arrêt est clôturé → suppression impossible.
   Une tournée figée ne doit **jamais** disparaître. Si des factures ou des virements ont été faits sur des
   arrêts, ils doivent être **sauvegardés et immuables**. ⚠️ **Ne pas toucher aux règles d'annulation et de
   report existantes** : elles restent telles qu'elles sont codées et prévues.
8. **Correction = contrepassation.** Une écriture ne se corrige pas, elle se **compense** par un document
   correctif qui lui fait face. Les deux pièces subsistent ; leur somme donne la réalité. **C'est une exigence
   de l'app, pas une option** — vérifier la cohérence de tout le module avec ce principe.

---

## 3. MÉTHODE DE TRAVAIL IMPOSÉE

- **NE RIEN CODER tant que tous les lots ne sont pas clarifiés, solides et fiables.** Le code se fera
  **EN UNE SEULE FOIS**, à la fin.
- Phase actuelle = **analyser, investiguer, compléter le plan**.
- Si des agents d'audit sont coupés par une limite de session → **les relancer** (`resumeFromRunId`, les
  agents aboutis rejouent depuis le cache). **On n'occulte aucune information.**
- Prudence maximale : s'arrêter à la moindre suspicion. Tout lot touchant l'argent ou la compta = **plan
  présenté et validé AVANT de coder**.
- Un lot = un commit + un harnais Node. **Ne jamais pousser sur `main` sans demande explicite.**
- Les données personnelles ne seront **PAS** re-saisies tant que l'app n'est pas fiable à 100 %.

---

## 4. CE QUI RESTE À CODER — PHASE 3 (immutabilité + traçabilité + contrepassation)

Tout est spécifié dans **`SPEC-immutabilite.md`**. Points structurants :

### 4.1 Le déclencheur du gel n'est PAS la clôture
`paiementActe(t, cid)` = méthode choisie **ET** (client clôturé **OU** tournée figée **OU** mois déclaré).
Motif : `recoverTour` clôture une tournée **sans aucune méthode de paiement** — une garde sur `t.closed`
empêcherait la première classification d'une tournée récupérée.

### 4.2 Les cinq faux positifs à NE PAS bloquer
`modalRecoverStats` (complétion des temps) · `addClientToTour` (collecte d'un impayé) · `modalCancelBilling`
(note de crédit) · `ensureFacturesForClosedTours` / `ensurePriceSnap` (pose au boot) · `modalRebaseLiquide`
(rattachement de caisse). **Règle : compléter/créer = autorisé ; modifier/effacer = refusé.**

### 4.3 Défauts confirmés à corriger (lignes = `migration-identite-v2`)

**Recalculs non gelés**
- `recomputeMoney` (8368) sans garde, appelé **inconditionnellement** par `saveSettings` (3454) → une tournée
  clôturée ouverte est re-tarifée aux prix du jour au moindre changement de réglage, **en silence**
  (`result` ∈ `_HASH_SKIP`). **Le lot 3 a gelé `recomputeTourLocal` et manqué celui-ci.**
- `calcTour` (8497) aucune garde ; réécrit même `t.date`.
- `recalcAllTours` → `sanitizeTourStats` (8485) sur toutes les tournées : **contourne** la garde posée en 6864.
- `rowFromArret` (8343) joint la fiche cheval **par le nom seul** alors que le gel indexe **par id** (8403) →
  un renommage fait disparaître la ligne « lourd » et **baisser une facture émise**. Annule le gel du lot 3.
- `rowFromArret` (8339) relit le **nom du client** en direct → le destinataire d'une facture émise change.

**Destruction d'argent acté**
- `recalcAllTours` (8487) : `p.rectifie = null; p.montantPaye = null` — **efface l'encaissement**
  (mécanisme des 500 € perdus). Gardé seulement par le mois déclaré.
- `setComptaPayment` (9576-9592) : aucune garde de gel (seul le *recalcul* est gardé en 9590, **l'écriture
  passe toujours**, y compris sur un mois déclaré) ; permet le reclassement ; branches virement/facvir
  effacent `partiel`/`impaye`/`resteMode` **sans appeler `setClientImpaye`** → créance orpheline +
  **double comptage** ; et **omettent `comptaPeriod`** → rattachement de caisse détruit.
- **En pleine tournée** : `commitPayments()` est appelé **AVANT** l'ouverture des sous-modales
  `[data-pactes]` / `[data-rdv]` / `[data-carte]` **sans** le contrôle `payOk.disabled` qui protège le bouton
  nominal → **un simple clic de navigation réécrit et persiste le paiement.** Le bouton 💶 n'est grisé que
  pour une tournée future : un client encaissé et clôturé à 9 h peut basculer à 17 h.

**Pièces comptables**
- `recalcAllTours` (8477) **supprime `S.comptaStatus[ym]` d'un mois DÉCLARÉ** dès qu'il n'a plus de tournée →
  rouvre une période fermée.
- `recalcAllTours` (8478) et `purgeTourData` (14449) **SUPPRIMENT des notes de crédit** non remboursées.
  ⚠️ **Interdit par la règle 6** : une NC est actée. → détachement (`tourDeleted = true`), jamais suppression.
- `nextFactureNumero` (13866) et `nextNcNumero` (13863) déduisent la séquence de la **liste vivante** → un
  numéro peut être **réemployé** si une pièce disparaît (suppression ou perte à la fusion).
  → compteurs **persistés et monotones**, un par type de document. (Les factures d'achat `S.chargesAchat`
  n'ont pas de numérotation propre : on enregistre le numéro du fournisseur — normal, ne rien changer.)
- `factureIds` **absent de `graftClosure`** (3722-3765) et **non conservé par `reinjectTour`** (4515-4522) →
  renumérotation d'une facture émise. → union, jamais d'écrasement, `frozenAt` le plus ancien gagne.
- `deleteTourById` (13312) supprime une tournée clôturée **sans aucun contrôle** → appliquer la règle 7.
- Import « Données seules » (15284, 15287) **remplace** `S.notesCredit` en bloc et peut **abaisser** un verrou
  de mois → import = union seulement ; `encode` monotone.
- `comptaWire` (10609) : un simple `<select>` lève un verrou de mois → confirmation explicite, et
  `syncDeclaration` doit poser `revokedAt` au lieu de `delete`.

**Contournements du gel**
- `markToursReview` (15245) pose `_review` sur **toutes** les tournées importées, clôturées comprises →
  déverrouille l'éditeur (7301). `edRevalider` (15515) appelle `calcTour` **hors gel**.
- Suppression d'un cheval (6198) : **aucune garde** d'intégrité (contrairement au client, 6271) → interdire si
  référencé par une pièce figée ; message « rendez-le inactif ».
- Chevaux au **nom vide** : `norm('') === norm('')` → appariement à tort. Rendre le nom obligatoire.

### 4.4 Mécanisme retenu
- **Ne PAS accrocher sur `saveTournees`** : elle porte tout le tableau (un refus global perdrait
  l'encaissement en cours) et est contournée par 8 écritures directes.
- **Écrivain unique** `writePayment(t, cid, next, ctx)` + `paiementViolation(...)` (code dans la spec §1 et §5).
- **Refus EN AMONT, jamais de rollback silencieux** : `syncStamp` s'exécute *avant* `LS.set` ; un rollback
  laisserait l'empreinte désalignée — c'est exactement la panne de juillet.
- Trois couches : (1) refus + désactivation des contrôles UI ; (2) `writePayment` en filet + gel de `calcTour`
  et `recomputeTourGeo` ; (3) fusion — conserver le local en cas de conflit de méthode, journaliser.

### 4.5 Traçabilité
- **18 sites** d'écriture de paiement à instrumenter (liste exhaustive dans la spec §6.a), plus les sites
  F2/F3/comptaStatus. Origines : `user` (défaut) · `migration` · `fusion` · `gc` · `import` · `restore`.
- `withOrigin(o, f, fn)` à portée **strictement synchrone** (compteur de profondeur, restauration en `finally`).
  Les sites qui franchissent une frontière asynchrone sont listés dans la spec §6.e → étiquetage **explicite
  par paramètre**, jamais par portée. ⚠️ `restoreDriveSnapshot` et `restoreDriveTournees` écrivent **avant**
  leur premier `await`.
- Journal : deux anneaux, `ftr.wlog` (128 Ko) et `ftr.wlogFrozen` (64 Ko), plafond en **octets réels**.
  **Interdictions formelles** : jamais dans `S`, jamais une `SETTINGS_COLLECTION`, jamais via `LS.set`
  (écriture `localStorage.setItem` directe). **Et ajouter les deux clés à la liste de purge de `LS.set`
  AVANT `ftr.syncmeta`, jamais avant `ftr.tomb`** — sans quoi la traçabilité redeviendrait la cause de la
  perte qu'elle documente. Corriger au passage `ftr.stampGuard` (3604) qui utilise encore `LS.set`.
- Chaînage inter-appareils : `wlogFrozen` en champ de premier niveau d'`exportSnapshot`, **jamais fusionné**.

---

## 5. LE MODULE DE CONTREPASSATION — À CONCEVOIR AVANT DE CODER

Le propriétaire l'exige : *« un document correctif qui fait face, qui compense une écriture »*.
**C'est une exigence de l'app** — vérifier la cohérence de l'ensemble avec ce principe.

Geste recommandé (spec §4) : `modalCorrigerReglement(t, cid)` qui **n'écrit jamais dans `t.payments`** et
produit **deux pièces** : (1) une note de crédit intégrale de la facture erronée ; (2) un **règlement
rectificatif** dans une collection `S.reglements[]`, lue par `comptaData` **en plus** de `t.payments`.
Pourquoi « en plus » : `t.payments` est la pièce actée, elle ne se touche pas ; la compta doit **sommer**
l'origine et la correction.

**Existant réutilisable** : `createClientCreditNote` (13906), `modalCancelBilling` (14131), `ncBreakdown`,
`S.notesCredit`. Le module est vraisemblablement une **extension** de cet existant.

**À trancher avec le propriétaire** : type(s) de pièce · ce qu'elle compense exactement (l'écart, ou
annulation + ré-enregistrement) · son mois d'imputation (si le mois d'origine est déclaré, elle tombe dans le
mois courant) · effet sur caisse/TVA/CA · affichage.

⚠️ **À NE PAS FAIRE** : corriger un mode de paiement via `modalEditPrestations`.
*(Correction d'une erreur d'analyse : `modalEditPrestations` ne marque RIEN comme annulé — il refuse si le mois
est déclaré et ignore les chevaux déjà annulés. C'est `modalCancelBilling` qui pose `cv.cancel.status='annule'`,
et c'est son rôle légitime.)*

---

## 6. QUESTIONS OUVERTES — ✅ LES TROIS SONT TRANCHÉES (2026-07-22)

Conception complète dans **`SPEC-modules-correction.md`**. Résumé :

1. **Le remboursement en espèces ne figure pas dans Compta.** ✅ **Décision : poste « Remboursements » négatif
   et VISIBLE** (module A). Précision issue de l'investigation : le trou ne concerne **que** la branche
   `facliq` — le liquide **sans** facture réduit déjà `p.rectifie` (app.js:14258), donc sa caisse est juste.
   Source de la ligne = les **notes de crédit** (datées, numérotées), pas `p.rembourse` (cumul sans date).
   ⛔ Ne **pas** toucher aux 4 bases analytiques : la NC les extourne déjà (9664/9669) → double comptage.
2. ~~`p.rembourse` n'est incrémenté que si `p.method === 'liquide' && p.facture`.~~
   ❌ **AFFIRMATION FAUSSE** — `applyLiquideRefund` (app.js:14246) ne teste **que** `p.method !== 'liquide'`,
   sans aucun test sur `.facture` : le liquide **sans** facture incrémente `p.rembourse` lui aussi. Seul le
   virement n'est jamais concerné. Question caduque, absorbée par le point 1. Détail : `SPEC-modules-correction.md` §0.2.
3. **Gel du montant par client dès sa clôture.** ✅ **Décision : le bloc entier du client est photographié**
   (module C) ; les clients suivants se partagent le déplacement restant. 25 événements recensés qui le font
   bouger aujourd'hui. ⚠️ Le gel ne peut pas vivre dans `t.result` (il ne survivrait pas à une synchro).

> ⚠️ **Autre correction factuelle** : `SPEC-immutabilite.md` §6.a annonce **18** sites d'écriture de
> `t.payments` ; il y en a **30**, et 8 manquent à la table — dont `replayTour` (4568) et `modalPayment` (14338),
> qui écrasent des paiements en bloc. À remplacer au lot L1.

---

## 7. AUDITS FINAUX EXIGÉS — APRÈS que tous les lots soient codés

Le propriétaire les a demandés explicitement, **à faire une fois les corrections terminées** :

1. **Audit profond, détaillé, complet, précis et exhaustif de TOUT le code** : tous les bugs, frictions et
   conflits.
2. **Audit de complaisance** : reprendre **toutes les demandes des dernières conversations** et vérifier
   qu'aucune n'a été oubliée ou édulcorée.
3. **Documentation** : vérifier que `GaloPodo_DOCUMENTATION.md` et `SYNTHESE_DEMANDES.md` (dépôt parent,
   `00 Developpement/GaloPodo/`) sont **à jour**.
4. **Fiabilité des données à 100 %** : persistance, sauvegarde, synchro, centralisation — pour les données
   **en cours**, **mémorisées** ET **figées** (tournées clôturées, compta). Solide, robuste, consolidé.
5. **Sécurité de l'app** : jetons Google/OAuth, `localStorage`, XSS (usage massif d'`innerHTML` + `esc()`),
   exposition de données.

---

## 8. APRÈS LES LOTS ET LES AUDITS

- **Déploiement** : cadence choisie = incrémental par phase. v1.8.1 est prête localement (non poussée) et sera
  groupée avec la Phase 2 → viser **v2.0.0**. Procédure dans `DEPLOIEMENT-v1.8.0.md` (merge → push `main` →
  **publier la Release GitHub**, c'est elle qui déclenche la mise à jour du téléphone).
- **Puis seulement** : remise à zéro des tournées et re-saisie des données par le propriétaire, en suivant
  `PLAN-repartir-propre.md` (préserve clients/réglages, tombstones, synchro dirigée un appareil à la fois).
- Données de référence disponibles : `00 Developpement/GaloPodo/_SAUVEGARDES-PROTEGEES/` (sauvegarde du 19/07
  + 2 tournées de récupération) et `00 Developpement/GaloPodo/imports/diag-onglet-*.json` (dump du PC).

---

## 9. PREMIÈRE ACTION ATTENDUE

Reprendre à la **conception du module de contrepassation** (§5) et compléter le plan, **sans coder**.
Puis, une fois le propriétaire d'accord sur l'ensemble, **coder tous les lots en une seule fois**.
