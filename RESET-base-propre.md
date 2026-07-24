# Remise à zéro GaloPodo — procédure sûre (base propre)

> Objectif : repartir sur une base **propre** en préservant clients / écuries / adresses / réglages, et en
> effaçant toutes les données comptables et de tournées, pour ré-encoder les tournées à la main.
> **Établi après l'audit du 2026-07-23.** Trois pièges CRITIQUES ont été identifiés — les ignorer détruit la base propre.

---

# ★ PROCÉDURE ACTUELLE (2026-07-24) — déploiement v2.0.1 + base consolidée

> **C'est CELLE-CI à suivre.** La méthode `clean-snapshot.js` plus bas est conservée pour référence, mais on ne
> l'utilise plus : la base est déjà consolidée ET corrigée dans **`_SAUVEGARDES-PROTEGEES/SainSabot BDconsolidee.json`**
> (32 clients · 45 chevaux · 23 tournées dont 13 closes — **les tournées sont GARDÉES avec leurs données**, aucun
> ré-encodage à la main). Toutes les corrections (noms, écuries, géocodage, temps, impayés, dates, champ Note) y sont.

## PHASE 1 — Déploiement du code (v2.0.1)

1. **✅ FAIT** : merge `migration-identite-v2` → `main` + `git push origin main` (commit `025b048`). Le **site** est en v2.0.1.
   Les **apps installées ne bougent pas encore** (seule la Release les met à jour — voulu, pour tester d'abord).
2. **RECETTE sur PC** — pas besoin de Release : ouvrir `https://pmrflightclub-afk.github.io/Distribution-GaloPodo/`
   dans un **onglet navigateur** (pas la PWA installée) → **Ctrl+Shift+R**. Vérifier `APP_VERSION` = `2.0.1` (console F12).
   Tester : **champ « Note » fiche client**, Compta → Documents / Remboursements / ⇄ Corriger l'imputation, gel par client.
3. **PUBLIER LA RELEASE `v2.0.1`** (déclenche la MàJ des téléphones) : GitHub → `Distribution-GaloPodo` → Releases →
   Draft a new release → tag `v2.0.1` → Publish. (ou `gh release create v2.0.1`.) Le téléphone se met à jour au lancement suivant.

## PHASE 2 — Remise à zéro des données (APRÈS que PC + téléphone soient en v2.0.1)

> 🔑 **Règle d'or** : un appareil ne doit JAMAIS synchroniser tant qu'il a l'ancienne base. On le rend propre, puis on ne le reconnecte qu'après.

**4. PC — créer le coffre propre** (enchaîner sans traîner) :
   - a. Ouvrir l'app PC (elle synchronise avec l'ancien coffre — sans danger).
   - b. **Vider le coffre Drive** : drive.google.com → ⚙️ Paramètres → **Gérer les applications** → GaloPodo → **Supprimer les données d'application masquées**.
   - c. 💾 Sauvegarde → coller **`SainSabot BDconsolidee.json`** → **« ⚠ Remplace tout »**.
   - d. **Resynchroniser** → le coffre neuf reçoit la base propre. ✅

**5. Téléphone — le rendre propre sans contaminer** :
   - a. **📴 Mode avion** → ouvrir l'app.
   - b. 💾 **Export de sécurité** (marche hors ligne).
   - c. **« ⚠ Remplace tout »** avec `SainSabot BDconsolidee.json`.
   - d. **Rallumer le réseau** → il synchronise avec le coffre neuf (propre). ✅

**6. Vérifier sur les deux** : **32 clients · 45 chevaux · 23 tournées (13 closes)** · Sedan au **01/08** · tournées du 24/07 closes.

## ⚠️ Les 3 pièges de cette procédure
1. **Mode avion sur le téléphone** (étape 5) — non négociable : sinon il repart avec l'ancienne base et recontamine le coffre neuf.
2. **Ne pas ouvrir le téléphone EN LIGNE** entre la Release (3) et son reset (5) — le laisser fermé, ou passer direct en mode avion.
3. Étape 4 : enchaîner **vider le coffre → Remplace tout → resync** promptement (pour que le PC ne re-pousse pas l'ancienne base entre-temps).

---

# (Référence — ancienne méthode clean-snapshot, NON utilisée pour ce reset)

## ⚠️ Les 3 pièges à ne PAS oublier

### 1. Le coffre Drive ressuscite les anciennes données (CRITIQUE)
La synchro Drive est une **union additive** : une tournée présente seulement dans l'ancien coffre est **ré-injectée**
(il n'y a pas de tombstone, car les tournées n'ont pas été « supprimées » mais remplacées par un import). Donc,
même après un import parfait, **à la première synchro l'app ré-aspire toutes les anciennes tournées / impayés /
frozenClients** depuis l'ancien fichier Drive → la base propre est écrasée.
→ **APRÈS l'import, il faut DÉMARRER UN NOUVEAU COFFRE DRIVE** (nouveau fichier / nouvelle liaison) **AVANT toute
synchro.** Ne jamais laisser l'app se resynchroniser sur l'ancien coffre.

### 2. Seul « ⚠ Remplace tout » convient — pas « Données seules » ni « Fusion »
- **« ⚠ Remplace tout » (`bkImport`)** : remplace intégralement réglages + clients + tournées par le fichier. ✅
  C'est le SEUL mode qui applique exactement un fichier hand-nettoyé (réglages inclus, compteurs à 0, tournées vides).
- **« 📥 Données seules »** : ❌ garde les réglages LOCAUX (donc un retour usine perdrait tarifs/catalogue/écuries),
  ne réinitialise pas les compteurs, et un `comptaStatus` vide dans le fichier **ne vide pas** l'ancien local
  (`Object.assign`). À ne PAS utiliser ici.
- **« 🔀 Fusion »** : ❌ union additive, ne nettoie jamais. À ne PAS utiliser ici.

### 3. Tombstones locaux périmés
Après un « Remplace tout », les anciens **tombstones locaux** (suppressions passées) survivent et peuvent, au
premier merge, re-supprimer un cheval/adresse fraîchement réimporté si son `updatedAt` est plus ancien. Combiné au
point 1, raison de plus pour **repartir sur un coffre Drive neuf** (et idéalement un appareil « propre »).

## Procédure pas à pas

1. **Exporter la prod** : Réglages → Sauvegarde → **⬇️ Télécharger** (fichier daté). C'est la sauvegarde de sécurité
   ET la source du nettoyage. (L'export capture TOUT : réglages, écuries, adresses, clients, tournées, compta,
   compteurs, tombstones — vérifié.)
2. **Me transmettre ce fichier.** Je le nettoie avec l'outil `outils/clean-snapshot.js` :
   ```
   node outils/clean-snapshot.js  sauvegarde-prod.json  base-propre.json
   ```
   (option `--drop-mails` si tu veux aussi vider l'historique `contactMails` ; par défaut il est GARDÉ.)
   L'outil affiche un contrôle avant→après (tournées 42→0, créances 7→0, compteurs →0, écuries 12→12, etc.).
   On peut aussi corriger d'autres éléments dans le fichier à ce moment-là.
3. **Réimporter la base propre** : Réglages → Sauvegarde → **⚠ Remplace tout** avec `base-propre.json`.
4. **Démarrer un NOUVEAU coffre Drive** (point 1) AVANT toute synchro. Sur les autres appareils : réinstaller /
   vider le stockage et se lier au **nouveau** coffre uniquement.
5. **Ré-encoder les tournées** à la main.

## Ce qui est PRÉSERVÉ vs REMIS À ZÉRO (résumé de l'outil)

| Préservé | Remis à zéro |
|---|---|
| Réglages tarifaires (parage, TVA, véhicule, seuil/forfait, remise liquide) | Tournées + archive (paiements, frozenClients) |
| Catalogue d'articles, matériel, pathologies | Notes de crédit, règlements, documents |
| Compta analytique (comptes/sous-comptes, provisions, params fiscaux) | Statut comptable (comptaStatus, declarations, comptaRecu/Demarche) |
| Écuries, adresses de référence, statuts d'adresse | Créances/crédits clients (impayes, avoirs) + leurs tombstones |
| Clients (fiches + chevaux) | Compteurs de pièces (ncSeq/factureSeq/reglementSeq/documentSeq → 0) |
| Identité pro, domicile/départ, deviceId, thème, planche | Historiques planche (plancheDone/Todo), agenda, tombstones globaux |
| contactMails (par défaut ; `--drop-mails` pour vider) | |

## Tests
`test/reset-clean.test.js` (17 assertions) verrouille la transformation (préservation + remise à zéro + immutabilité de l'entrée).
