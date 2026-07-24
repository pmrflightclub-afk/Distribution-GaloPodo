# SPÉCIFICATION — Modules de correction comptable (GaloPodo)

> Rédigé le 2026-07-22, après les décisions du propriétaire sur les trois questions ouvertes de
> `PROMPT-reprise.md` §6. Complète `SPEC-immutabilite.md` (immutabilité, traçabilité) — ne le remplace pas.
> **Rien de ce qui suit n'est codé.** Les lignes citées sont celles de la branche `migration-identite-v2`.

## Décisions prises (verrouillées)

| # | Question | Décision |
|---|---|---|
| Q1 | Le remboursement en espèces d'une facture liquide annulée est invisible en Compta | **Poste « Remboursements » négatif et VISIBLE** dans la section caisse concernée |
| Q2 | Confirmer le « modèle B » (`p.rembourse` réservé au liquide facturé) | **Question caduque** — l'affirmation de la spec était fausse (voir §0.2). Absorbée par Q1 |
| Q3 | Le montant d'un client doit-il être figé dès SA clôture ? | **Oui — gel du bloc entier du client**, les clients suivants se partagent le déplacement restant |

---

## 0. TROIS CORRECTIONS FACTUELLES AUX DOCUMENTS EXISTANTS

Investigation en lecture de code (2026-07-22). Ces trois points invalident des affirmations écrites dans
`SPEC-immutabilite.md` et `PROMPT-reprise.md`. **À corriger avant de coder quoi que ce soit sur leur base.**

### 0.1 — Le drapeau `documentaire` n'est ÉCRIT NULLE PART

`comptaData` filtre les notes de crédit sur `!n.documentaire` en **deux endroits** : app.js:9657 (extourne du CA)
et app.js:9662 (extourne des bases analytiques). Or **aucun site n'écrit ce champ** : `createClientCreditNote`
(app.js:13906-13913) ne le pose jamais, et la recherche exhaustive ne remonte que ces deux lectures.

Le filtre ne filtre donc rien. Le commentaire app.js:9656 — « les avoirs DOCUMENTAIRES (facture payée en
liquide) ne réduisent PAS le CA … on les exclut de l'extourne comptable » — **décrit un comportement qui
n'existe pas**. C'est un vestige du « modèle B » de la v1.7.41, remplacé par le modèle définitif du 2026-07-17
(tournée figée + NC qui réduit le CA une seule fois, app.js:14209/14213).

**Comportement réel aujourd'hui** : une NC issue d'une facture liquide réduit le CA TTC (9657) **et** les quatre
bases analytiques (9664/9669), exactement comme une NC de virement.

**Danger** : le commentaire invite à réactiver l'écriture du drapeau. Le jour où quelqu'un le fait, toutes les
factures liquides annulées cessent silencieusement de réduire le CA. → **Supprimer le champ et les deux filtres**
(lot L7), corriger le commentaire.

### 0.2 — `p.rembourse` est incrémenté sur DEUX chemins, pas un

`SPEC-immutabilite.md` §9.2 et `PROMPT-reprise.md` §6.2 affirment : *« `p.rembourse` n'est incrémenté que si
`p.method === 'liquide' && p.facture` »*. **Faux.**

| Chemin | Site | Garde réelle | `p.rectifie` |
|---|---|---|---|
| A — liquide **sans** facture (⊘, annulations groupées, ✕) | `applyLiquideRefund` app.js:14254 | app.js:14246 teste **seulement** `p.method !== 'liquide'` — **aucun test sur `.facture`** | **réduit** (14258) → caisse juste |
| B — **facture** payée en liquide | `modalCancelBilling` app.js:14209 | `isFacLiq` (14197) | **inchangé** (délibéré, 14209) → caisse fausse |

Seul le **virement** n'est jamais concerné. Le vrai modèle est donc : *`rembourse` trace les deux chemins ; un
seul des deux réduit aussi la caisse*. C'est le chemin B, et lui seul, qui crée le trou de Q1.

### 0.3 — Les sites d'écriture de `t.payments` sont **30**, pas 18

`SPEC-immutabilite.md` §6.a annonce 18 sites. Le recomptage indépendant en donne **30 instructions d'écriture
réparties sur 12 fonctions** — aucune convention de comptage raisonnable ne donne 18. Sites présents dans le
code et **absents** du tableau §6.a :

| Ligne | Fonction | Nature |
|---|---|---|
| 3734 | `graftClosure` | `to.payments = to.payments \|\| {}` |
| 3736 | `graftClosure` → `foldMono` | `depCredited`, `depCreditNoteNum`, `rembourse` (cumul monotone) |
| 4568 | `replayTour` | `nt.payments = {}` — **remise à zéro totale** |
| 4911 | `migrate()` (boot) | initialisation si absent/non-objet |
| 9578 | `setComptaPayment` | `if (!t.payments) t.payments = {}` |
| 9586 | `setComptaPayment` | `._ts = Date.now()` |
| 14306 | `modalPayment` | `if (!t.payments) t.payments = {}` |
| 14338 | `modalPayment` (✕) | `t.payments = paySnapshot` — **restauration intégrale** |

Le §6.a est donc **incomplet de 8 sites** ; deux d'entre eux (4568, 14338) écrasent des paiements en bloc.
→ Table à remplacer intégralement (lot L1).

---

## 1. MODULE A — Poste « Remboursements » dans la caisse

### 1.1 Le trou, précisément

Pour un client `facliq` (facture pro payée en espèces) dont la facturation est annulée :
- `p.rembourse += montant` (app.js:14209) — le cash **sort physiquement** du tiroir ;
- `p.rectifie` reste au montant plein — **volontairement**, pour que la tournée demeure figée ;
- `comptaData` calcule `factureLiqClients[].ttc = payRecu(m, p)` (app.js:9632) = `rectifie − impayé` ;
- **`comptaData` ne lit `p.rembourse` nulle part** (vérifié sur 9600-9670).

→ La caisse déclarée de la section « 🧾 Facture pro — liquide » est **surévaluée du montant remboursé**.
Le CA, lui, est juste : la note de crédit le réduit une fois (9657).

### 1.2 Contrainte de rendu découverte à l'investigation

**La section `facliq` n'est PAS la section « liquide globalisé ».** Ce sont deux cartes distinctes et deux
mécanismes de rendu différents :

| | `💶 Liquide (globalisé)` app.js:10583 | `🧾 Facture pro — liquide` app.js:10589 |
|---|---|---|
| Source | `liquideClients` (anonymisé) | `factureLiqClients` (nominatif) |
| Rendu | `postTbl(liquidePosts)` — **postes** | `clientTbl(...)` — **clients**, avec `<select data-mode>` et case « Reçu » |
| `addPost` appelé ? | oui (9643-9648) | **non** — la branche facliq (9630-9632) n'appelle ni `addPost` ni `addDetail` |

Le poste doit atterrir dans la carte **facliq**, qui n'a aucun mécanisme de postes. **Ne pas injecter une
pseudo-entrée négative dans `factureLiqClients`** : `clientTbl` (10577) lui collerait un sélecteur de mode et une
case « Reçu », `recuRow` (10579) la compterait dans le « n/N », et `detailPdf` (10637) afficherait le libellé de
repli « Reste impayé » codé en dur.

### 1.3 Conception retenue

**Source de vérité = les notes de crédit, pas `p.rembourse`.** Motif : `p.rembourse` est un cumul **sans date**
et **sans pièce** — il ne peut pas être imputé à un mois. La NC, elle, porte `numero`, `date`, `rembourseAt`
(posé d'emblée pour un facliq, app.js:13911) et le détail par ligne. Le remboursement devient donc une **ligne
justifiée par une pièce numérotée**, ce qui est exactement l'esprit de la règle 8 (contrepassation).

Nouvelles sorties de `comptaData(ym)` :

```
remboursementsCaisse : [ { ncId, numero, clientId, nom, date, ttc } ]   // ttc > 0, signe porté à l'affichage
remboursementsTotal  : { ht, tva, ttc }                                 // négatif
```

Critère de sélection : NC dont le paiement du client est `method === 'liquide' && facture === true`, imputée au
mois de `n.rembourseAt || n.date`. Ventilation HT/TVA par `cashSplit` (app.js:9599), **taux effectif** — même
idiome que le poste « Arrondi caisse » (9648), qui est le précédent de référence et prouve qu'un montant négatif
traverse déjà toute la chaîne d'affichage sans traitement particulier.

**`factureLiqTotal` devient NET** (`Σ payRecu − Σ remboursements`). Conséquence voulue : les graphiques
(app.js:9221), les récapitulatifs de plage (10655, 10764) et le PDF de déclaration deviennent justes
automatiquement, sans les modifier.

Rendu : sous le tableau clients de la carte `facliq`, un bloc à trois lignes —
`Encaissé (brut)` · `↩ Remboursements (n pièces)` en négatif, dépliable au détail par NC · `= Net encaissé`.
Même bloc dans `comptaPrint(ym,'facliq')` (10641) et dans `comptaPrintFull` (10668).

### 1.4 Non-objectif explicite — les bases analytiques ne bougent PAS

Le remboursement est un **mouvement de trésorerie**, pas un fait générateur de chiffre d'affaires. L'extourne
fiscale est **déjà** portée par la note de crédit : `ncMO/ncMat/ncDep/ncTVA` (app.js:9664) réduisent les quatre
bases en 9669.

> ⛔ Si le poste « Remboursements » retranchait aussi des bases HT/TVA, la même prestation serait extournée
> **deux fois** → provisions sociales et TVA **sous-évaluées**. C'est le piège principal de ce lot.

**Test obligatoire** : émettre une NC facliq et vérifier que `baseMainOeuvreHT`, `baseMaterielHT`,
`baseDeplacementHT` et `tvaCollectee` sont **identiques** avec et sans le nouveau poste.

### 1.5 Trois défauts préexistants à corriger dans le même lot

1. **Deux PDF, deux totaux différents pour la même section liquide** : app.js:10639 utilise
   `foot(d.liquideTotal)` (= Σ`liquideClients`) tandis que app.js:10652 utilise `foot(sum(arr))`
   (= Σ`liquidePosts`). L'égalité n'est qu'une propriété implicite, **aucune assertion ne la garde**.
   → Source unique + assertion dans le harnais.
2. **`documentaire`** : supprimer le champ et les deux filtres (§0.1), corriger le commentaire 9656.
3. **`aclasserClients` / `aclasserTotal`** (9627, 9667) sont calculés et **jamais consommés** — le sous-onglet
   « Tournée à venir » (10594) recalcule sa propre liste. Sorties mortes : à retirer ou à brancher.

---

## 2. MODULE B — Contrepassation (règlement rectificatif)

### 2.1 Périmètre — ce que le module corrige, et ce qu'il ne corrige pas

| Nature de l'erreur | Pièce corrective | Existant / neuf |
|---|---|---|
| Montant d'une **facture émise** (prestation en trop, tarif faux) | **Note de crédit** | existant, inchangé |
| **Imputation** d'un règlement (virement ↔ liquide, facture ↔ sans facture) | **Règlement rectificatif** | **neuf — ce module** |
| Montant du **cash réellement compté** (liquide sans facture) | *écart de caisse* | **non tranché — voir §5** |

Cette frontière découle des règles verrouillées : un montant facturé ne se corrige que par avoir (règle 4 et 6) ;
une imputation ne change pas le montant, seulement sa ventilation entre sections — donc elle ne peut pas passer
par un avoir sans détruire du CA qui, lui, est juste.

### 2.2 Le principe — deux jambes, une pièce

Une correction d'imputation est une **contrepassation au sens strict** : la pièce porte deux mouvements de signes
opposés qui, ensemble, ne changent rien au CA et déplacent seulement la ventilation.

```
Pièce C-7 · 2026-08-03 · client Dupont · tournée du 2026-07-12
  ↳ jambe 1 :  − 240,00 €  section « Virements »              (extourne de l'imputation erronée)
  ↳ jambe 2 :  + 240,00 €  section « Liquide (globalisé) »    (imputation correcte)
  motif : « saisi virement, réglé en espèces sur place »
```

`t.payments` **n'est jamais touché**. La pièce d'origine reste lisible telle qu'elle a été actée ; la compta
**somme** les deux (règle D4 : « en plus de », pas « à la place »).

### 2.3 Modèle de données

Nouvelle collection `S.reglements[]`. **Aucune collision** : le nom n'existe nulle part dans app.js (vérifié).

```js
{
  id,                       // uid() — OBLIGATOIRE : mergeCollection (3715) ignore tout enregistrement sans id
  numero,                   // 'C' + ncDevicePfx() + '-' + n, séquence persistée monotone (§2.5)
  date,                     // todayStr() — date de création de la pièce
  ymImpute,                 // FIGÉ à la création (§2.4) — jamais recalculé
  tourId, clientId, clientNom,
  type: 'imputation',
  from: { method, facture },     // imputation erronée (copie, pas une référence)
  to:   { method, facture, rectifie, partiel, impaye, resteMode }, // imputation correcte — voir §2.3bis
  montantTTC, ht, tva,           // montant de la jambe `from` (virement, décimales possibles)
  motif,                         // OBLIGATOIRE, non vide
  note,
  deviceId,
  annuleId: null                 // si cette pièce en contrepasse une autre (§2.7)
}
```

### 2.4 Mois d'imputation — une règle unique, figée à la création

> `ymImpute` = **mois de la tournée corrigée**, sauf si ce mois est déjà déclaré — auquel cas **mois courant**.

Discriminant : `comptaLocked(t, clientId)` (app.js:13810), le même que partout ailleurs dans l'app. Motif : tant
que le mois n'est pas déposé, corriger sur place donne une déclaration juste du premier coup ; une fois déposé,
il ne se rouvre jamais (règle 4) et la correction tombe dans le mois courant, comme en comptabilité classique.

**`ymImpute` est calculé une seule fois, à la création, et persisté.** Il ne doit jamais être re-dérivé : sinon
déclarer un mois plus tard déplacerait rétroactivement des pièces déjà déposées.

### 2.5 Numérotation

`nextReglementNumero()` sur le modèle de `nextFactureNumero` (app.js:13866) — préfixe `'C' + ncDevicePfx()`,
distinct de `''` (NC) et de `'F'` (facture), donc aucune collision inter-appareils.

⚠️ **Ne pas reproduire le défaut existant** : `nextNcNumero` (13863) et `nextFactureNumero` (13866) déduisent la
séquence du **vivant** → un numéro est réemployable si une pièce disparaît. Le nouveau compteur doit être
**persisté et monotone** dès le premier jour : `S.reglementSeq = max(S.reglementSeq, dérivé) + 1`. Le lot L4
appliquera le même traitement rétroactivement aux deux séquences existantes.

### 2.3bis Le montant des deux jambes n'est PAS forcément le même (règle propriétaire, 2026-07-23)

Un **virement** peut porter des **décimales** (240,50 €). Le **liquide** est **arrondi à l'euro** (le client a
donné 240 € en billets) et peut être **partiel** (il a donné 200 €, reste 40 €). La correction virement→liquide
n'est donc **pas** un simple miroir du même montant :

- **jambe `from`** (virement erroné) = le montant viré **exact**, décimales comprises : `montantTTC`.
- **jambe `to`** (liquide réel) = le **cash réellement reçu**, arrondi à l'euro, avec **arrondi caisse** et
  **paiement partiel** possibles — exactement le modèle du paiement liquide normal.

→ La modale `modalCorrigerReglement` réutilise **le module D** (§3bis) pour la saisie de la jambe liquide :
champ « Montant liquide reçu », impayé auto ≥ 1 € d'écart, « paiement partiel » auto-coché. L'écart
virement↔liquide (arrondi + éventuel impayé) est **matérialisé**, jamais absorbé en silence.

### 2.3ter Marquer le virement erroné « reçu » (règle propriétaire, 2026-07-23)

Un virement encodé vit comme une **créance à recevoir** tant que sa case « Reçu » (`S.comptaRecu[tourId:cid]`,
app.js:10612) n'est pas cochée. Mais si la réalité est un **paiement liquide encaissé à la visite**, l'argent
**est** entré — il ne faut pas que le virement erroné traîne comme une créance en attente.

→ La correction virement→liquide **coche `S.comptaRecu[tourId:cid]`** pour le virement d'origine (l'argent a
bien été reçu, en espèces). C'est une écriture **« compléter »** (pose d'un flag jamais renseigné), autorisée.
Sans ça, la page « Impayés / à recevoir » afficherait un virement fantôme jamais encaissé.

### 2.6 Lecture par `comptaData`

Après la boucle sur les tournées, itérer `S.reglements` où `ymImpute === ym` et pousser **deux entrées dérivées** :

- dans la section de `from` : `{ nom: nom + ' — rectif. ' + numero, ttc: −montantTTC, derived: true, piece: numero }`
- dans la section de `to` (liquide) : `{ …, ttc: +cashReçu, derived: true, piece: numero }` où `cashReçu` = la
  jambe liquide (arrondi appliqué, impayé déduit — §2.3bis).

Le drapeau `derived: true` existe déjà (app.js:9631, ligne « reste impayé ») et neutralise le sélecteur de mode et
la case « Reçu » dans `clientTbl` — c'est l'idiome à réutiliser.

**Effets comptables, à verrouiller par test** :

| Grandeur | Effet attendu |
|---|---|
| CA total du mois | **≈ zéro** — les deux jambes se compensent au CENTIME PRÈS de la jambe virement ; l'écart d'arrondi liquide passe en **« Arrondi caisse »** (poste existant, 9648), et un éventuel impayé reste une créance (module D) |
| `baseMainOeuvreHT` / `baseMaterielHT` / `baseDeplacementHT` / `tvaCollectee` | **zéro** (aucune prestation neuve — pure ré-imputation) |
| Total de la section `from` (virements) | −montantTTC (décimales exactes) |
| Total de la section `to` (liquide) | +cash reçu (arrondi, net d'impayé) |
| `S.comptaRecu[tourId:cid]` du virement d'origine | **coché** (§2.3ter) |

### 2.7 Une pièce ne se supprime jamais

Corriger un règlement rectificatif erroné = créer **une nouvelle pièce** de type `'contrepassation'` portant
`annuleId` vers la précédente, avec les jambes inversées. Pas de champ `annule`, pas de suppression : trois pièces
coexistent, leur somme donne la réalité (règle 6).

Conséquences sur les chemins de nettoyage — **même traitement que les NC** :
- `recalcAllTours` (app.js:8478) et `purgeTourData` (app.js:14449) : un règlement dont le `tourId` disparaît est
  **détaché** (`tourDeleted = true`), **jamais supprimé**.
- `reinjectTour` (app.js:4526-4529) : recâblage, sur le modèle existant.

### 2.8 Synchronisation — le motif exact à copier

`S.reglements` doit être ajouté à **`SETTINGS_COLLECTIONS`** (app.js:3418), sinon la collection serait écrasée en
bloc à chaque fusion. **Rien d'autre n'est requis** : les cinq maillons suivants sont tous pilotés par ce tableau —
`PERFIELD_EXCLUDE` (3422), l'horodatage par enregistrement dans `saveSettings` (3444 → `syncStamp` 3590-3615), le
`kindSet` des tombstones (3950), `mergeCollection` (3954-3957 → 3713-3718, union par `id`, `updatedAt` le plus
élevé) et le `rehash` post-fusion (4016).

Contraintes héritées, impératives :
1. **`id` stable via `uid()`** — `mergeCollection` (3715) ignore purement et simplement un enregistrement sans id.
2. **`updatedAt` posé automatiquement** par `syncStamp` (3609) — ne jamais le gérer à la main.
3. **Toute mutation passe par `saveSettings()`** — c'est lui qui déclenche 3444.

Le précédent le plus propre à imiter est `'ecuries'`, ajout le plus récent au tableau (lot 04-A).

### 2.9 Interface

- **`setComptaPayment` (app.js:9576) refuse** dès `paiementActe(t, cid)`. Le `<select data-mode>` de la Compta
  (app.js:10611) devient `disabled` avec un `title` explicite, et une action **« ⇄ Corriger l'imputation »**
  ouvre `modalCorrigerReglement(t, cid)`. C'est la correction du défaut n°4 du mandat, enfin possible parce
  qu'elle offre un recours au lieu d'un mur.
- La modale montre : la pièce d'origine en lecture seule · l'imputation corrigée · un motif obligatoire ·
  **l'aperçu des deux jambes et du mois d'imputation** avant validation.
- Les pièces sont listées dans la Compta à côté des notes de crédit, avec PDF (modèle `creditNotePdf`
  app.js:10504) et envoi par mail (`sendClientDoc` app.js:10563).

> ⚠️ Deux générateurs de PDF de NC sont déjà **incohérents en multi-taux** : `creditNotePdf` (10507) ventile au
> taux effectif par ligne, `ncPdfBlob` (10530) recalcule au taux standard global. Ne pas répliquer l'erreur —
> et la corriger au passage (lot L4).

---

## 3. MODULE C — Gel du montant par client à SA clôture

### 3.1 Pourquoi le montant bouge aujourd'hui

`computeResultMoney` (app.js:8193) répartit le déplacement sur **tous** les clients de la tournée :
`kmRestant = totalKm − Σ kmProches` (8203), puis `kmAttribue` au prorata de `segKm` (8209) ou du nombre de
clients (8210), puis `partHT = montantHT / nbClients` (8225).

`closeClientFully` (app.js:7280) ne fige **rien** : il pose `cl.validatedAt` et synchronise les arrêts. Aucun
montant. Et `priceSnap` (app.js:8411) n'est posé qu'à `t.closed || t.endedAt` — donc **jamais** sur une tournée
en cours — et ne gèle de toute façon **que les tarifs**, ni la géométrie ni la composition des arrêts.

**Résultat : 25 événements peuvent encore modifier le total d'un client clôturé et payé.** Les plus lourds :

| Événement | Chemin | Effet |
|---|---|---|
| Ajout d'un client à un arrêt **existant** | app.js:7751 | `nbClients` 1→2 → **le client clôturé perd ~50 % de son déplacement** (8225) |
| Changement de mode de paiement | `modalPayment` 14377/14401, `setComptaPayment` 9581 | remise liquide `S.reducLiquide` (défaut 20 %) appliquée/retirée → **±20 % sur le total** (8297) |
| Décochage de « lourd » sur la fiche cheval | `rowFromArret` 8345 | ligne retirée (8259) → **baisse du TTC** |
| Ajout / retrait d'arrêt, recalcul d'itinéraire, tri par heure | 7644, 8495, 7022 | redistribution complète du déplacement |
| Changement de `S.repartition` / `S.seuilKm` / `S.forfait` / d'un tarif | `saveSettings` **3454 → `recomputeMoney`** | re-tarification, bascule proche↔loin |

### 3.2 Contrainte de synchronisation — décisive

**Un drapeau de gel posé dans `t.result.parClient[i]` ne survivrait PAS**, pour trois raisons cumulées :

1. `result` ∈ `_HASH_SKIP` (app.js:3570) → poser le gel **ne bumpe pas `updatedAt`** → l'appareil qui gèle ne
   gagne pas la fusion LWW (`mergeTours` 3806).
2. `snapshotHash` supprime `result` (app.js:4305) → **aucun push Drive n'est déclenché** par la pose du gel.
3. `graftClosure` (3722-3765) ne greffe rien de `result` → le `result` du perdant est jeté en entier, et le
   prochain recalcul reconstruit `parClient` **sans** le gel.

→ Le gel doit être un **champ de premier niveau de la tournée**, greffé explicitement.

### 3.3 Modèle

```js
t.frozenClients[clientId] = {
  frozenAt,        // Date.now() — arbitrage de fusion : le PLUS ANCIEN gagne
  deviceId,
  m,               // copie profonde de l'entrée parClient (deplacement[], materiel[], articles[],
                   // htDep/htMat/htArt/tvaArt, reducPct, total*, plein*)
  kmGel            // km de déplacement consommés par ce client, pour le partage du reste (§3.5)
}
```

Greffe dans `graftClosure` : **gap-fill clé par clé**, `frozenAt` le plus ancien gagnant, **monotone** (jamais
de dé-gel) — sur le modèle exact de `priceSnap` app.js:3729 (`if (from.X && !to.X) to.X = deepCopy(from.X)`).
Aucun tombstone n'est nécessaire tant que le gel est monotone.

Ce que ce placement donne gratuitement : `t.frozenClients` n'est pas dans `_HASH_SKIP` → `hashRec` le voit →
`updatedAt` bumpé → la copie qui gèle gagne la fusion ; et `snapshotHash` ne le supprime pas → le push Drive
part. `reinjectTour` (4517) appelle `graftClosure` → le gel survit à une réinjection.

### 3.4 Déclencheur

À la **réussite** de `closeClientFully` (app.js:7280), qui garantit déjà `clientPaiementDone(t, cid)` et
l'absence d'acte manquant.

⚠️ **Point à vérifier au codage** : `commitPayments` écrit le paiement (14401) **puis** appelle
`recomputeTourLocal` (14406) **puis** le callback `onCommit` → `closeClientAt` (7883). Le gel doit être pris
**après** ce recalcul, sinon il photographierait un total sans la remise liquide. À prouver par test avant de
livrer.

⚠️ **Ne pas déclencher sur `clientValidated(cl)` seul** : `closeClientPending` (app.js:7278) pose aussi
`validatedAt` sur les arrêts **intermédiaires** d'un client multi-arrêts, **sans paiement** (règle du dernier
arrêt porteur, v1.7.90). Le prédicat correct est `tous les arrêts validés ET clientPaiementDone`.

### 3.5 Application — le partage du reste

Nouveau `applyFrozenClients(t, R)`, appelé en queue des **quatre** écrivains de `t.result` :
`recomputeMoney` (8376) · `recomputeTourLocal` (8438) · `calcTour` (8538) · `recomputeTourGeo` (8573).

1. `computeResultMoney` reçoit l'ensemble gelé et **retire du pot** les km déjà figés :
   `kmRestant −= Σ kmGel` avant le prorata (8203) → les clients non gelés se partagent **le reste**.
2. Chaque entrée gelée de `R.parClient` est remplacée par sa copie figée.
3. Les totaux de tournée (`totalHT/TVA/TTC`, `htDeplacement`, `margeReelle`) sont **re-dérivés comme Σ des
   parts**, ce qui préserve l'invariant *Σ parts = total* — invariant dont dépend la compta, qui calcule le CA
   en itérant `parClient` (app.js:9611) et non les totaux de tournée.

**Aucun des ~40 lecteurs de `parClient` n'est modifié** : ils continuent de lire `t.result.parClient`.

**Cas limite** : si l'itinéraire rétrécit (arrêt supprimé) au point que `Σ kmGel > totalKm`, le reste devient
négatif. → **Clamper à 0** et écrire une entrée dans `ftr.wlogFrozen`. Pas de bandeau (option écartée par le
propriétaire), mais **pas de silence** non plus : l'anomalie est journalisée et consultable.

### 3.6 Six interactions à traiter explicitement

| # | Interaction | Site | Traitement |
|---|---|---|---|
| 1 | `sanitizeTourStats` réécrit `parClient[].deplacement[].chevaux` | app.js:6849-6853 | **sauter** les entrées gelées |
| 2 | `replayTour` crée une pièce neuve | app.js:4568 | ajouter `delete nt.frozenClients` (à côté de `nt.payments = {}`) |
| 3 | `reconcileTour` purge les paiements orphelins | app.js:6960 (`delete t.payments[cid]`) | **refuser la purge si le client est gelé** — c'est déjà un site de destruction d'argent acté |
| 4 | `reconcileTour` dé-clôture silencieusement | app.js:6936-6938 : clé composite `clientId\|adresse` ; un changement d'adresse casse la clé et `validatedAt` n'est pas restauré | ré-apparier par `clientId` seul lorsque le client est gelé |
| 5 | `healValidatedActe` dé-clôture si l'acte disparaît | app.js:6902 | le gel reste (monotone, conforme aux règles) ; **journaliser** l'incohérence gel/clôture |
| 6 | `sortTourByHeure` peut changer le « dernier arrêt » porteur du paiement | app.js:6997-7003, prédicat 7275 | interdire de déplacer un arrêt d'un client gelé |

### 3.7 Tests attendus (harnais `lot-gel-client.test.js`)

Pour chacun : client A clôturé et payé, tournée **non** close, puis —
1. ajouter un arrêt → `A.totalTTC` **inchangé** ;
2. ajouter un client au **même** arrêt que A → inchangé (le piège `nbClients`) ;
3. recalculer l'itinéraire → inchangé ;
4. changer `S.repartition`, `S.seuilKm`, un tarif → inchangé ;
5. décocher « lourd » sur un cheval de A → inchangé ;
6. changer le mode de paiement de A → **refusé** (module B) ;
7. les clients non gelés se partagent bien le **reste** ; `Σ parts == total tournée` ;
8. fusion entre deux appareils : le gel survit dans les deux sens, `frozenAt` le plus ancien gagne ;
9. `replayTour` d'une tournée gelée → la copie n'a **aucun** gel ;
10. itinéraire rétréci sous `Σ kmGel` → reste clampé à 0 **et** entrée de journal présente.

---

## 3bis. MODULE D — Saisie de l'encaissement liquide : l'impayé au lieu de la « remise »

> Décision du propriétaire, 2026-07-22 : **« si le montant liquide payé rempli par l'utilisateur est plus bas
> que le montant total, c'est un impayé. Il faut l'indiquer sous la case impayée et la case à cocher paiement
> partiel doit s'activer automatiquement. »** Seuil retenu : **≥ 1 €**. Champ reformulé : **« Montant liquide reçu »**.

### 3bis.1 Le défaut actuel

Dans `modalPayment`, saisir 100 € sur un total de 120 € affiche aujourd'hui :
*« Différence (arrondi) : −20,00 € TTC **(remise)** »* (app.js:14367). Rien ne coche « Paiement partiel »,
rien ne parle d'impayé. **Un manque de 20 € est présenté comme un geste commercial volontaire**, et il finit
dans le poste « Arrondi caisse » (9648) — indiscernable d'un vrai cadeau à la relecture.

### 3bis.2 Le piège à ne pas reproduire — `rectifie` n'est pas l'argent en main

`payRecu(m, p) = payRectifie(m, p) − payImpaye(m, p)` (app.js:8644). Donc **`p.rectifie` est le TOTAL de la
transaction arrondi à l'euro**, pas le cash encaissé. Les deux se confondent seulement quand `impaye = 0` —
d'où l'ambiguïté, que l'app entretient elle-même en libellant **le même champ** de deux façons :

| Écran | Ligne | Libellé du champ `p.rectifie` |
|---|---|---|
| `modalPayment` | app.js:14325 | « Montant décimal **rectifié** (TTC, arrondi à l'euro) » |
| `modalAdjustArrondi` | app.js:14229 | « Montant liquide **encaissé** (arrondi à l'euro) » |

⛔ **Implémentation naïve à éviter** : auto-remplir `impaye = 20` en laissant `rectifie = 100` donnerait
`payRecu = 100 − 20 = 80 €`. **Erreur de 20 € dans l'autre sens.** `rectifie` doit être remis au total arrondi.

### 3bis.3 Règle de dérivation

Le champ saisi devient **`reçu`** = l'argent en main. À chaque frappe, l'app dérive :

```
ecart = round(m.totalTTC) − reçu

si ecart < 1 €            →  ARRONDI (comportement actuel, geste volontaire)
                             rectifie = reçu ; partiel = false ; impaye = null
                             (couvre aussi reçu > total : arrondi vers le haut / supplément)

si ecart ≥ 1 €            →  IMPAYÉ
                             rectifie = round(m.totalTTC)
                             impaye   = ecart              ← pré-rempli, MODIFIABLE
                             partiel  = true               ← coché automatiquement
                             .pay-reste révélé, resteMode défaut « Prochaine visite »
```

Par construction `payRecu = rectifie − impaye = reçu` dans les deux branches — l'invariant est préservé.

**Seuil = 1 €, en dur.** Justification : toute la saisie liquide est à l'euro (`step="1"`, normalisation au
blur 14384), donc **aucun arrondi légitime ne peut atteindre 1 €**. Pas de réglage : un paramètre qui déplace
la frontière entre cadeau et créance déplacerait aussi le CA.

### 3bis.4 Interface

- Champ 14325 relibellé **« Montant liquide reçu (TTC, à l'euro) »**. Même relibellé en 14229
  (`modalAdjustArrondi`), qui est l'autre porte d'entrée sur le même champ.
- Le bandeau `[data-diff]` (14366-14367) cesse d'écrire « (remise) » sous 0 dès que l'écart atteint 1 € ;
  il affiche **trois lignes vérifiables d'un coup d'œil** : `Total facturé` · `Reçu` · `Impayé`.
- **L'auto-cochage doit rester visible et réversible** : si le manque est un vrai geste commercial, décocher
  « Paiement partiel » repasse en arrondi (`rectifie = reçu`, `impaye = null`). L'app propose, elle n'impose pas.

> ⚠️ Raison impérative de garder ce contrôle sous la main de l'utilisateur : un impayé enregistré est
> **re-facturé à la visite suivante** (`addClientToTour` app.js:7757). Un impayé posé par erreur va réclamer
> de l'argent déjà encaissé.

### 3bis.5 Points de vigilance

1. **La garde de validation 14345 reste vraie** : `impaye ≤ rectifie` est satisfait par construction
   (`impaye = round(ttc) − reçu ≤ round(ttc) = rectifie` dès que `reçu ≥ 0`). Ne pas la retirer.
2. **`setClientImpaye` (14404)** sera déclenché beaucoup plus souvent (créance portée sur la fiche client dès
   que `resteMode === 'report'`). Comportement voulu, mais à couvrir par test.
3. **Aucune reprise rétroactive.** Les tournées déjà clôturées gardent leur interprétation actuelle (un vieil
   écart reste un « arrondi caisse »). Les re-qualifier violerait l'immutabilité. La règle vaut pour les
   saisies **neuves** uniquement.
4. **Le sens inverse n'est pas couvert** : saisir 200 € pour un total de 120 € reste un « arrondi caisse » de
   +80 €. C'est le seul cas de faute de frappe qui subsiste, et il est très visible (la caisse gonfle).

### 3bis.6 Ce que ce module règle

**Il ferme le point ouvert §5.1 par la prévention.** Une faute de frappe sur un encaissement liquide ne se
corrige plus après coup : elle est **rendue visible au moment de l'encaissement**, sous forme d'un impayé
pré-rempli et d'une case cochée. Aucun troisième type de pièce n'est nécessaire, et le verrouillage de
`p.rectifie` (lots L3 / L8) devient acceptable puisqu'il n'y a plus de saisie muette à rattraper.

---

## 3ter. RÈGLE DU PROPRIÉTAIRE (2026-07-23) — SÉPARER RAPPEL D'IMPAYÉ (débit client) ET AVOIR (crédit client)

> Correction du propriétaire, 2026-07-23. **Le MODULE E « virement jamais reçu → créance » est SUPPRIMÉ.**
> Ma recommandation était fausse. Trois règles nettes la remplacent.

### 3ter.0 Ce qui était faux

J'avais proposé qu'un virement jamais reçu devienne une créance rappelée aux tournées suivantes. **Non.**
Un virement est **indépendant** : il se régularise par un **virement**. S'il n'arrive pas, il reste au statut
**« paiement en attente »**, point. Il n'est **jamais** rappelé comme impayé sur une tournée. Aucun bouton
« Jamais reçu », aucune conversion, `p.virementNonRecu` n'existe pas.

### 3ter.1 RÈGLE 1 — Seul le LIQUIDE est rappelé en impayé (débit client)

Le rappel automatique d'un impayé sur les tournées suivantes du client (`addClientToTour` app.js:7757) ne
concerne **que le liquide** : **paiement liquide** (sans facture) **et facture liquide**, les deux. Jamais le
virement, jamais la facture-virement.

C'est **déjà le cas dans le code** : `p.partiel` / `p.impaye` n'existent que pour `method === 'liquide'`
(app.js:7238-7241), et l'unique autre créateur d'impayé est le **report de RDV** (app.js:14063), qui n'est
ouvert qu'aux clients non payés / liquide (app.js:13946 refuse virement et facture). → **Rien à coder ; à
verrouiller par un test de non-régression** garantissant qu'aucun chemin virement ne pose de `c.impayes`.

### 3ter.2 RÈGLE 2 — Les remboursements liquide deviennent un AVOIR déduit à la visite suivante (crédit client)

Symétrique de l'impayé. Deux sources, un seul mécanisme :

| Source | Aujourd'hui | Règle du propriétaire |
|---|---|---|
| **Annulation d'un paiement liquide** (sans facture) | `p.rembourse` tracé, remboursement « à votre charge » (app.js:14254) | remboursement fait **sur place**, **déduit du montant total à payer de cette visite** |
| **Note de crédit sur facture liquide** | `p.rembourse += montant`, « à votre charge » (app.js:14209) | remboursé **lors des prochaines visites** (crédit reporté) |

→ Nouveau : un **avoir client** `c.avoirs[]`, miroir de `c.impayes[]`. À la tournée suivante du client,
`addClientToTour` y ajoute une ligne **NÉGATIVE** « Avoir du … » qui **réduit le total à payer**.

### 3ter.3 Modèle de l'avoir

```js
c.avoirs = [ { id: uid(), sourceTourId, date, ttc, motif,       // ttc POSITIF, déduit à la collecte
               ncId: null,                                        // si issu d'une NC facture liquide
               collected: false, collectedTourId: null } ]
```

Mêmes garanties de synchro que `c.impayes` : fusion **par id** (motif app.js:3841-3844), tombstone `avoirDel`
sur le modèle de `impayeDel` (app.js:14424), réinjection sur le modèle app.js:4525. `c.avoirs` **suit une fiche
client** — il voyage donc avec `saveClients()`, comme `c.impayes`, **pas** dans `SETTINGS_COLLECTIONS`.

### 3ter.4 Effet comptable de la collecte d'un avoir — SANS impact sur le CA de la visite

À la collecte, l'avoir est **cash-only** : il réduit ce que le client paie, **il ne réduit PAS le CA de la
tournée de collecte**. Exactement le miroir d'un impayé `reporte:false` (§ ci-dessous). Raison : le CA a **déjà**
été corrigé à la source —
- annulation liquide → la tournée a été recalculée, prestations retirées, CA déjà baissé ;
- NC facture liquide → la NC a déjà réduit le CA au mois d'émission (app.js:9657).

Le recompter à la collecte le baisserait **deux fois**. La ligne « Avoir du … » doit donc être **exclue de la
base analytique** de la tournée de collecte — même filtre que les impayés `!reporte` (app.js:9525, 9621-9622),
étendu aux avoirs.

Exemple — NC facture liquide de 30 € émise en juillet, client revu en août (services 100 €) :

| | Juillet | Août |
|---|---|---|
| CA | −30 € (NC) | +100 € (services d'août) — **l'avoir n'y touche pas** |
| Caisse | 0 | **+70 €** (100 encaissés − 30 d'avoir rendu) |

### 3ter.5 Points de vigilance

1. **`p.rembourse` reste tracé** (traçabilité + poste « Remboursements » du module A). L'avoir ne le remplace
   pas : il ajoute le **report** du remboursement à la visite suivante. Les deux coexistent — un est la trace
   comptable, l'autre le geste concret de déduction.
2. **Annulation liquide « sur place » vs NC « prochaines visites »** : même objet `c.avoirs`, seule la mention
   d'origine (`motif`, `ncId`) diffère. Si le client n'a pas de visite prévue, l'avoir attend (il ne se périme
   pas), comme un impayé.
3. **Ne jamais compenser un avoir avec un impayé en silence** : si le client a à la fois un impayé (débit) et un
   avoir (crédit), les deux lignes apparaissent séparément sur la facture de la visite ; le net se lit, mais les
   deux pièces restent distinctes (règle 6, traçabilité).
4. **Avoir supérieur au total de la visite** ✅ **TRANCHÉ (propriétaire, 2026-07-23) : SOLDE TOTAL, jamais de
   report.** Un avoir se rembourse **toujours en entier au premier RDV effectif**. Si la visite coûte moins que
   l'avoir : la visite est **purgée** (le client ne paie rien) **ET** le reliquat est **rendu en cash sur place**,
   tracé comme remboursement complémentaire. `im.collected` passe à `true` en une fois — **aucun reliquat
   reporté**. Exemple : avoir 50 €, visite 30 € → visite à 0 € + 20 € rendus = 50 € soldés.

---

## 3quater. EXTENSION DU MODULE A — Réconciliation du PDF « Facture pro — liquide »

> Décision du propriétaire, 2026-07-22. **Section `facliq` uniquement** ; la section Virements garde son
> comportement actuel.

### Le défaut

`comptaPrint(ym, 'facliq')` (app.js:10641) appelle `detailPdf` (app.js:10636-10637), qui imprime :
- **corps** : `clientInvoiceHtml(e.m, e.payment)` par client = le montant **facturé** ;
- **pied** : `factureLiqTotal` = la somme de `payRecu` = le montant **encaissé** (app.js:9632).

Facture de 300 € dont 100 € impayés → le corps affiche 300 €, le pied affiche 200 €, et **rien n'explique
l'écart**. Le total est juste ; c'est la justification qui manque. Le poste « Remboursements » (§1) creuse
l'écart sans le combler, puisqu'il agit sur le total et non sur le corps.

### Le correctif

Ajouter en fin de document un bloc de réconciliation, avec le détail par client :

```
Total facturé          300,00 €
− Impayés              100,00 €      (paiement partiel)
− Remboursements       120,00 €      (NC #C-4 du 12/08)
= Net encaissé          80,00 €      ← égal au total de la section à l'écran
```

Implémentation : paramétrer `detailPdf` (le bloc est **désactivé par défaut**, activé pour `facliq` seulement).
Le générateur est partagé avec les sections Virements et Facture-virement — l'activer ailleurs plus tard sera un
changement d'un argument.

**Assertion à ajouter au harnais** : `Total facturé − impayés − remboursements === factureLiqTotal.ttc`, et
`factureLiqTotal` identique entre l'écran (10589), le PDF de section (10641) et le PDF complet (10668).
C'est le contrôle de réconciliation qui **n'existe nulle part aujourd'hui** (cf. §1.5-1).

---

## 4. ORDRE DE CODAGE MIS À JOUR

```
L0  Saisie liquide    MODULE D — « Montant liquide reçu » + impayé auto ≥ 1 € + partiel auto-coché.
                      EN PREMIER : ne dépend de rien, et c'est la PRÉVENTION qui rend le verrouillage
                      de p.rectifie (L3/L8) acceptable — plus de saisie muette à rattraper.
L0b Avoir client      MODULE E — c.avoirs[] (miroir de c.impayes) : remboursement liquide (annulation +
                      NC facture liquide) déduit du total à la visite suivante. Exclu du CA de collecte.
                      + test de non-régression : aucun chemin VIREMENT ne pose de c.impayes.
L1  Traçabilité       withOrigin + 2 anneaux + les 30 sites (table §6.a à remplacer, cf. §0.3)
L2  Recalculs gelés   recomputeMoney · calcTour · sanitizeTourStats · rowFromArret (id) · nom client figé
L3  Argent acté       purge d'arrondi · setComptaPayment (partiel/créance orpheline)
L4  Pièces            verrous de mois · NC orphelines → détachement · compteurs monotones ·
                      factureIds (fusion/réinjection/import) · deleteTourById (règle 7) ·
                      cohérence des 2 PDF de NC
L5  Contournements    _review · modalEditPrestations · suppression de cheval · nom obligatoire
L6  Gel par client    MODULE C — après L2 (mêmes 4 points d'accroche)
L7  Poste Remb.       MODULE A — + suppression de `documentaire` + source unique des totaux liquide
L8  Contrepassation   MODULE B — après L4 (compteurs monotones) et L7 (rendu des lignes dérivées)
L9  Contrôle final    checkFrozenWrite aux points de persistance
```

**L1 en premier** : n'interdit rien, rend tout observable. **L9 en dernier** : un contrôle générique posé avant
la correction des défauts connus refuserait en permanence.

---

## 5. CE QUI RESTE À TRANCHER

1. ~~**L'écart de caisse sur du liquide SANS facture.**~~ ✅ **RÉSOLU 2026-07-22 par le MODULE D (§3bis)** —
   et par la **prévention**, pas par une pièce corrective. Un montant reçu inférieur au total n'est pas un écart
   de caisse à rattraper : **c'est un impayé**, constaté immédiatement (case « paiement partiel » cochée
   automatiquement, montant pré-rempli). Aucun troisième type de pièce n'est créé. Seul subsiste le cas
   symétrique — saisir *plus* que le total — qui reste un arrondi caisse et demeure très visible (§3bis.5-4).
2. ~~**Affichage du net dans le PDF facliq**~~ ✅ **TRANCHÉ 2026-07-22 — à corriger**, section `facliq`
   uniquement (bloc de réconciliation `Total facturé − impayés − remboursements = Net encaissé`). Voir §3quater.
   La section Virements garde son comportement actuel.
3. ~~**Décisions D2 et D3**~~ ✅ **TRANCHÉES.** D3 : tolérance de 24 h **refusée**, une facture cochée ne se
   décoche jamais. D2 : le virement jamais reçu reste au statut **« paiement en attente »** — il n'est ni une
   créance, ni un règlement rectificatif ; il se régularise par virement (règle du propriétaire, §3ter.0).
4. ~~**Reliquat d'avoir**~~ ✅ **TRANCHÉ** : jamais de report, solde total au 1ᵉʳ RDV (visite purgée + reliquat
   rendu en cash). Voir §3ter.5-4.
