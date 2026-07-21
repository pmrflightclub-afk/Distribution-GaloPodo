# Plan de finalisation GaloPodo — immutabilité, traçabilité, contrepassation

> État au 2026-07-21. Document de travail : il consolide l'analyse et sert de base au **codage en une seule fois**,
> quand tous les lots seront clarifiés. **Rien de ce qui suit n'est codé.**

## Où on en est

| Phase | État |
|---|---|
| 1 — socle de test + page Sauvegarde | ✅ fait (v1.8.1, local) |
| 2 — chantier migration (04-D, 05, 06, 02b) | ✅ fait — 12 harnais, 206 assertions |
| 3 — immutabilité + traçabilité + contrepassation | 🔬 **analysé, à coder** |
| 4 — audit exhaustif final | ⬜ après la phase 3 |

Analyse conduite par deux passes multi-agents (110 agents, 45 classements confirmés après réfutation
adversariale). **7 agents restent coupés par la limite de session**, dont la synthèse finale — les zones
concernées sont signalées « ⚠ à compléter » ci-dessous.

---

## 1. La règle — et pourquoi la formulation naïve est fausse

La formulation intuitive « **le corps d'une tournée clôturée est figé** » est **fausse** : l'analyse a trouvé
**cinq écritures légitimes** sur du figé qu'elle aurait bloquées, dont certaines en plein usage terrain.

### Les cinq faux positifs à ne surtout pas bloquer

| # | Chemin | Écrit sur du figé | Pourquoi c'est légitime |
|---|---|---|---|
| FP1 | `modalRecoverStats` (12953) | `cl.heure`, `a.realMin`, `cv.consultMin`, `t.returnRealMin` | complète les **temps** d'une tournée récupérée — sans ça, plus de temps de travail ni de trajet |
| FP2 | `addClientToTour` (7754) | `im.collected`, `im.collectedTourId` sur la créance d'une tournée **source** figée | c'est la **collecte** d'un impayé à la visite suivante — le cœur du report de créance |
| FP3 | `modalCancelBilling` + `createClientCreditNote` (14132, 13906) | `cv.cancel.*`, `p.rembourse`, `p.depCredited` + nouvelle pièce | **seul moyen conforme** de corriger une facture émise. Le bloquer contredirait la règle elle-même |
| FP4 | `ensureFacturesForClosedTours` (13888) · `ensurePriceSnap` (8409) | `t.factureIds`, `t.priceSnap` sur clôturées, au démarrage | **complètent** une pièce jamais renseignée ; les bloquer laisserait des factures sans numéro |
| FP5 | `modalRebaseLiquide` (10686) | `p.comptaPeriod` | rattache un dépôt de caisse décalé au bon mois — sans lui, la déclaration est fausse |

### La règle correcte

> Sur une pièce figée, une écriture n'est autorisée que si elle **complète un champ jamais renseigné**
> ou **crée une pièce nouvelle**. Toute écriture qui **modifie ou supprime une valeur déjà actée** est refusée.

C'est la distinction **compléter / créer** contre **modifier / effacer**. Elle laisse passer les cinq faux
positifs (tous complètent ou créent) et refuse la totalité des dégâts de juillet (tous modifiaient ou effaçaient).

---

## 2. Les défauts confirmés à corriger

### 2.1 — Recalculs non gelés (réécrivent une facture émise)

| Défaut | Lignes | Effet | Correctif |
|---|---|---|---|
| `recomputeMoney` sans garde, appelé par `saveSettings` | 8368, appel 3454 | tournée clôturée ouverte + changement de **n'importe quel réglage** → facture re-tarifée aux prix du jour, **en silence** (`result` hors hash) | ne rien recalculer si clôturée |
| `calcTour` aucune garde | 8497 (date 8502, result 8538) | recalcul complet géométrie + argent sur clôturée ; réécrit même `t.date` | refuser si `t.closed` |
| `recalcAllTours` → `sanitizeTourStats` | 8485 | contourne la garde posée en 6864 ; retire des chevaux de `t.result` figé | même garde de clôture |
| `rowFromArret` — jointure par **nom seul** | 8343 | un **renommage** fait disparaître la ligne « lourd » et **baisser le total** d'une facture émise. Annule le gel du lot 3 | jointure par id, repli nom (idiome de 8403) |
| `rowFromArret` — nom du client relu en direct | 8339 | le destinataire d'une facture émise change si on renomme le client | figer `{nom, addr}` dans `t.factureIds` à l'émission |

### 2.2 — Destruction d'argent acté

| Défaut | Lignes | Effet | Correctif |
|---|---|---|---|
| `recalcAllTours` — purge d'« arrondi aberrant » | 8487 | **efface `p.rectifie` / `p.montantPaye`** — le mécanisme des 500 € perdus. Gardé seulement par le mois déclaré | signaler l'écart, **ne jamais effacer** |
| `setComptaPayment` — reclassement | 9576-9592 | change la méthode d'un paiement acté (interdit par la règle comptable) | voir §3 — nécessite le module de contrepassation |
| `setComptaPayment` — branches virement/facvir | 9583-9584 | efface `partiel`/`impaye`/`resteMode` **sans appeler `setClientImpaye`** → créance orpheline + **double comptage** (encaisse 100 % ET refacture la créance) | purger la créance liée, ou refuser |

> Nuance issue de la réfutation : ce dernier défaut n'est atteignable que par le chemin **facture pro liquide
> partielle** → virement (le liquide nu n'a pas de menu « Mode »). Le double comptage reste réel.

### 2.3 — Pièces comptables non protégées

| Défaut | Lignes | Effet | Correctif |
|---|---|---|---|
| `recalcAllTours` — GC des verrous de mois | 8477 | **supprime `S.comptaStatus[ym]` d'un mois DÉCLARÉ** dès qu'il n'a plus de tournée → rouvre une période fermée | ne jamais supprimer un verrou `encode` |
| `recalcAllTours` — NC orphelines | 8478 | supprime une **note de crédit émise** non remboursée | la conserver, marquée `tourDeleted` (déjà fait pour les remboursées) |
| `nextFactureNumero` | 13866 | séquence recalculée sur le **vivant** → un numéro peut être **réemployé** après suppression | compteur persisté **monotone** (`S.factureSeq`) |
| `graftClosure` / `mergeTours` | 3722, 3804 | `factureIds` **non fusionné** → perdu selon le gagnant LWW | union, jamais d'écrasement, plus ancien `frozenAt` gagnant |
| `reinjectTour` / `restoreDriveTournees` | 4501, 4512 | `factureIds` local **perdu** à la restauration | union avec le snapshot |
| Import « Données seules » | 15284, 15287 | **remplace** `S.notesCredit` en bloc ; `comptaStatus` peut **abaisser** un verrou | import = union seulement ; `encode` monotone |
| `deleteTourById` | 13312 | supprime une tournée clôturée **sans aucun contrôle de pièce** | refuser si facture émise ou période déclarée |
| `comptaWire` — dé-déclaration | 10609 | un simple `<select>` lève un verrou de mois | confirmation explicite + conserver l'objet déclaration |

### 2.4 — Contournements du gel

| Défaut | Lignes | Effet | Correctif |
|---|---|---|---|
| `markToursReview` / `_review` | 15245, verrou 7301 | **tout import** pose `_review` sur les clôturées → éditeur pleinement déverrouillé | ne poser `_review` que sur les non clôturées ; la revalidation ne doit jamais recalculer |
| `modalEditPrestations` | 14069 | « Corriger les prestations » réécrit les actes d'une clôturée puis recalcule | à cadrer : réservé aux tournées récupérées, et via pièce corrective sinon |
| Suppression d'un cheval | 6198 | **aucune garde** d'intégrité (contrairement au client, 6271) → le cheval disparaît des tournées | refuser si référencé par une pièce figée |
| Deux chevaux au **nom vide** s'apparient | 6268, `norm('')===norm('')` | jointures faussées | rendre le nom obligatoire à l'enregistrement |

---

## 3. Le module de contrepassation ⚠ à concevoir

**Décision du propriétaire** : une écriture ne se corrige pas, elle se **compense** par un document correctif
qui lui fait face. Les deux pièces subsistent ; leur somme donne la réalité comptable.

Le défaut « reclassement de paiement » (§2.2) **ne sera pas corrigé sans ce module** : interdire le reclassement
sans offrir de moyen de compenser laisserait sans recours face à une faute de frappe.

### Questions à trancher avant de coder

1. **Types de pièce** : avoir (annulation de prestation) et contrepassation (erreur de saisie) — une seule
   pièce polyvalente ou deux distinctes ?
2. **Numérotation** : séquence propre, ou celle des NC (`nextNcNumero`) ? Doit être **monotone et persistée**
   (cf. défaut `nextFactureNumero`).
3. **Rattachement** : lien vers la pièce d'origine, et navigation dans les deux sens.
4. **Mois d'imputation** : celui de l'erreur ou celui de la correction ? (impact TVA et déclaration)
5. **Périmètre compensable** : méthode de paiement · montant encaissé · arrondi · prestation · déplacement.
6. **Effet comptable** : caisse, TVA, CA — et articulation avec l'extourne existante (`ncBreakdown`).
7. **Affichage** : la facture d'origine **inchangée**, la pièce corrective à côté, et le net qui en résulte.

**Existant réutilisable** : `createClientCreditNote` (13906), `modalCancelBilling` (14132), `ncBreakdown`,
`S.notesCredit` — le mécanisme d'avoir existe déjà et fonctionne. Le module est probablement une **extension**
de cet existant, pas une construction neuve.

---

## 4. Traçabilité

### Recensement des origines (fait)

| Origine | Sites à instrumenter | Exemples |
|---|---|---|
| `migration` | **21** | passes de niveau module + boot (3085, 3174, 3285…, 9475, 13898) |
| `gc` | **4** | `recalcAllTours` 8489, `purgeTourData` 14441-14453, 4544 |
| `restore` | **2** | `reinjectTour` 4512, `restoreDriveTournees` 4501 |
| `fusion` | **2** | `applyMerged` 4018, 4345 |
| `import` | 3 | `bkDataOnly` 15274, `bkImport` 15312, `modalImportTour` |
| `user` | — | **par défaut** : tout ce qui n'est pas marqué |

Soit **~32 sites** à instrumenter — volume tout à fait tenable.

### Mécanisme

`withOrigin(origine, fn)` — **portée synchrone uniquement**, restauration en `finally`, compteur de profondeur
pour les imbrications.

> ⚠ **Risque identifié** : une fusion Drive est **asynchrone**. Un contexte global pourrait fuiter sur une action
> utilisateur concurrente. La portée strictement synchrone est la parade : on n'englobe que le bloc d'écriture,
> jamais l'`await`. **À vérifier site par site au moment du codage.**

### Journal — contraintes de sécurité

**Deux anneaux séparés**, plafonnés en **octets** :
- `ftr.wlog` — toutes origines, FIFO, **128 Ko / 1500 entrées**
- `ftr.wlogFrozen` — uniquement les écritures touchant du figé, **64 Ko** (rétention plus longue)

**Interdictions formelles** (à inscrire en commentaire au-dessus de la déclaration) :
- ❌ jamais dans `S`
- ❌ jamais une `SETTINGS_COLLECTION`
- ❌ jamais écrit via `LS.set`

> Motif : un journal synchronisé ou passant par `LS.set` **reproduirait le débordement de quota** qui a causé
> la perte de juillet. Le journal ne doit jamais pouvoir provoquer ce qu'il documente.

**Local, non synchronisé** — un journal par appareil, consulté sur l'appareil concerné.

Contenu par entrée : horodatage · origine · entité · id · champs modifiés · valeurs avant/après · version d'app.

---

## 5. Plan de codage (en une fois, quand tout sera validé)

```
L1  Traçabilité      withOrigin + les 2 anneaux + les ~32 sites          (socle, ne bloque rien)
L2  Recalculs gelés  recomputeMoney · calcTour · sanitizeTourStats
                     rowFromArret (id) · nom du client figé
L3  Argent acté      purge d'arrondi · setComptaPayment (partiel/créance)
L4  Pièces           verrous de mois · NC orphelines · numérotation monotone
                     factureIds (fusion, réinjection, import) · deleteTourById
L5  Contournements   _review · modalEditPrestations · suppression de cheval · nom obligatoire
L6  Contrepassation  le module (après conception §3)
L7  Contrôle final   checkFrozenWrite dans les 4 points de persistance
```

**L1 en premier** : il ne bloque rien mais rend tout le reste observable. **L7 en dernier** : le contrôle
générique n'a de sens qu'une fois les défauts connus corrigés, sinon il refuserait en permanence.

### Tests attendus

- chacun des **cinq faux positifs** passe sans être refusé
- chacun des **dégâts historiques** est refusé (cheval disparu, article supprimé, paiement effacé, re-tarification)
- le journal reste **borné** sous pression
- aucune régression sur les 206 assertions existantes

---

## 6. Reste à trancher

1. **Le module de contrepassation** — les 7 questions du §3.
2. **`modalEditPrestations`** : le supprime-t-on sur les clôturées, ou le réserve-t-on aux tournées récupérées ?
3. **Stratégie de refus** : annuler la modification en mémoire, ou refuser le lot ? ⚠ *agent coupé, à compléter*
4. **Coût du contrôle** à chaque enregistrement. ⚠ *agent coupé, à compléter*
5. **Formulation finale de la règle** de blocage. ⚠ *agent coupé, à compléter*

Les points 3 à 5 relèvent des 7 agents coupés par la limite de session (réinitialisation à 19 h) — à relancer
avant de coder.
