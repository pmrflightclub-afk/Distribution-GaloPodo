# SPÉCIFICATION D'IMPLÉMENTATION — IMMUABILITÉ PAIEMENT / PIÈCE FIGÉE (GaloPodo)

## 0. VÉRIFICATIONS FAITES DANS LE CODE (3 points les plus critiques)

**V1 — Le `<select> « Mode »` n'existe que pour 3 sections, et il n'est PAS coupé par le mois déclaré.**
`clientTbl` (app.js:10577) est le seul émetteur du `<select data-mode>` ; il est appelé uniquement en 10588/10589/10590 (`d.virementClients`, `d.factureLiqClients`, `d.factureVirClients`). La section 💶 Liquide est `postTbl(d.liquidePosts)` (10583) — postes anonymes, **aucun contrôle par client**. Les clients « à classer » sont rendus par `renderComptaAvenir` (10602-10606) **sans aucun select**.
Le select n'est retiré que si `e.derived` ou `dem` (`S.comptaDemarche`). `liqDem` (10581) ne grise **que** le tableau des postes liquides. Donc **sur un mois `liquide === 'encode'` (déclaré), un client virement/facliq/facvir garde son select actif**, et `setComptaPayment` écrit `t.payments[clientId]` en 9581-9586 **inconditionnellement** : seul le recalcul est sauté (9590 `if (!tourComptaLocked(t)) recomputeTourLocal(t)`). **Trou confirmé.**

**V2 — « une tournée clôturée a forcément une méthode de paiement » est FAUX.**
`recoverTour` (12944-12950) fait `t.recovered = true; t.closed = true;` **sans aucun appel à `tourFinalizeBlock`**. Pire : son alimentation `blockingTours()` (12933) sélectionne exactement `tourFinalizeBlock(t).length > 0`, ce qui inclut `'mode de paiement non choisi'` (`clientPaiementIssue`, 7237). `graftClosure` (3728) propage aussi `closed` sans revérifier les paiements.
**Conséquence directe : une garde `if (t.closed) refuser` dans `setComptaPayment` casserait la première classification d'une tournée récupérée.** Le déclencheur du gel doit être `p.method != null`, **pas** `t.closed`.

**V3 — L'éditeur rouvre `modalPayment` sur un client déjà payé ET clôturé.**
`renderEditorArrets` (7782) : `payDoneC` (7857) n'ajoute qu'une classe `' done'` et un `✓` (7865) ; le seul `disabled` est `futureTour`. `aFinal` (7793) n'est utilisé qu'en 7796-7802 (drag, n° d'ordre, badge, croix). Le listener 7883 est posé dès `!locked` (`locked` = tournée clôturée, 7783). Donc **sur la tournée du jour, un client encaissé et clôturé à 9 h peut passer liquide→virement à 17 h** : `commitPayments` (14388-14405) réécrit intégralement `t.payments[cid]` (14401) puis `recomputeTourLocal(t)` (14405) — et `computeResultMoney` couple la remise à la **méthode seule** (8297 `const liq = ((payments[m.clientId]||{}).method === 'liquide') ? (S.reducLiquide||0) : 0`, défaut 20 %). **Second trou confirmé, atteignable en pleine tournée.**
Aggravant vérifié : `commitPayments()` est appelé **avant** l'ouverture des sous-modales par `[data-pactes]` (14412), `[data-rdv]` (14413), `[data-carte]` (14414) — **sans le contrôle `if ($('payOk').disabled) return;` qui protège 14415**. Un simple clic de navigation réécrit et persiste le paiement.

---

## 1. VERDICT NET ET RÈGLE EXACTE

**OUI, blocage immédiat possible.** Mais **pas** sous la forme « tournée clôturée = lecture seule » : cette formulation est réfutée par V2 (tournées récupérées), par `modalRecoverStats` (12953-12984, stats sur clôturée), par `applyLiquideRefund` (14245-14258, réécrit `p.rectifie` légitimement), par `modalCancelBilling` (14198-14213, écrit dans la tournée figée) et par `ensureFacturesForClosedTours` (13888-13902, pose l'identité facture au boot).

### Règle : gel PAR CHAMP, déclenché par l'ACTE, pas par la clôture

```js
// ── Prédicat central (à poser près de clientPaiementDone, ~7245) ────────────────
// Un paiement est ACTÉ dès qu'une méthode a été choisie ET que la fenêtre de saisie
// est close : client clôturé, tournée figée, ou période comptable déclarée.
function paiementActe(t, cid) {
  const p = ((t && t.payments) || {})[cid];
  if (!p || (p.method !== 'liquide' && p.method !== 'virement')) return false; // jamais classé → 1ʳᵉ saisie LIBRE (couvre recoverTour)
  if (comptaLocked(t, cid)) return true;                                        // 13810-13818
  const arr = clientArrets(t, cid);                                             // 7274
  if (arr.length && arr.every((x) => clientValidated(x.cl))) return true;        // client clôturé (7271)
  return !!t.closed;                                                            // tournée figée
}

// ── Détection de violation : compare l'ÉTAT CIBLE au paiement acté ─────────────
// ctx.piece : 'remboursement' | 'nc' | 'rebase' | null
function paiementViolation(t, cid, next, ctx) {
  const p = ((t && t.payments) || {})[cid] || {};
  if (!paiementActe(t, cid)) return null;                       // libre
  ctx = ctx || {};
  // 1. MÉTHODE : immuable absolue
  if ((next.method || null) !== (p.method || null)) return 'method';
  // 2. FACTURE : émission autorisée (false→true), RETRAIT interdit (true→false)
  if (p.facture && !next.facture) return 'facture';
  // 3. MONTANT ENCAISSÉ : immuable, sauf pièce de remboursement à invariant constant
  if (p.method === 'liquide') {
    const m = t.result && t.result.parClient && t.result.parClient.find((x) => x.clientId === cid);
    if (ctx.piece === 'remboursement') {
      const avant = payRecu(m, p) + (p.rembourse || 0);          // 8644 + trace
      const apres = payRecu(m, next) + (next.rembourse || 0);
      return Math.abs(avant - apres) > 0.01 ? 'invariant-cash' : null;
    }
    const cur = (p.rectifie != null) ? p.rectifie : p.montantPaye;
    const nxt = (next.rectifie != null) ? next.rectifie : next.montantPaye;
    if (cur != null && (nxt == null || Math.round(cur) !== Math.round(nxt))) return 'montant';
    if (!!p.partiel !== !!next.partiel) return 'partiel';
    if (Math.round(p.impaye || 0) !== Math.round(next.impaye || 0)) return 'impaye';
    if ((p.resteMode || null) !== (next.resteMode || null)) return 'resteMode';
  }
  // 4. comptaPeriod : libre (rattachement de dépôt ≠ encaissement), voir §2
  return null;
}
```

**Justification du choix `p.method != null` plutôt que `t.closed`** : (a) V2 démontre qu'une clôturée peut n'avoir aucune méthode ; (b) le pro doit pouvoir corriger une faute de frappe **avant** de clôturer le client ; (c) `renderComptaAvenir` (10604) prouve que la première classification est un flux prévu (« virement/facture arrivent après la clôture », commentaire 9575).

### Contrôle de la règle contre TOUS les flux légitimes

| # | Flux légitime | Chemin (ligne) | Verdict |
|---|---|---|---|
| 1 | 1ʳᵉ saisie de paiement en tournée (liquide/virement) | `commitPayments` 14401 sur `p.method === null` | **passe** (`paiementActe` = false) |
| 2 | Correction d'une faute de frappe avant clôture du client | 14401, client non validé, tournée ouverte | **passe** |
| 3 | Clôture d'un arrêt intermédiaire (multi-arrêts) | `closeClientPending` 7278 | **passe** (n'écrit pas `t.payments`) |
| 4 | Clôture définitive d'un client | `closeClientFully` 7280 | **passe** |
| 5 | Clôture de tournée + `priceSnap` + `factureIds` | 15531-15535, `ensureFacturesForClosedTours` 13898 | **passe** (pose monotone, jamais de renumérotation, 13896) |
| 6 | Auto-clôture 3 h après retour | 9470-9475 | **passe** (garde `!t.closed` propre) |
| 7 | **Récupération d'une ancienne tournée puis classification de son paiement** | `recoverTour` 12946 → select Compta (à AJOUTER, §3) | **passe** (`p.method === null`) |
| 8 | Complétion des stats d'une tournée récupérée/clôturée | `modalRecoverStats` 12976-12980 | **passe** (n'écrit ni `payments` ni `result` ; `heure/realMin/consultMin/returnRealMin` hors périmètre) |
| 9 | Client réclame une facture pro après coup | `setComptaPayment` branche `facvir`/`facliq` : `facture` false→true, `method` inchangé | **passe** |
| 10 | Retirer le drapeau facture d'une pièce figée | `facliq → liquide`, `facvir → virement` | **ne passe pas** (retrait de pièce ; + déplace le CA de mois via `effYm` 9616) |
| 11 | Reclassement liquide↔virement après acte | `setComptaPayment` 9581-9584, `commitPayments` 14401, `modalPayment` 14377 | **ne passe pas** |
| 12 | Retour à « à classer » d'un paiement acté | 9585 | **ne passe pas** |
| 13 | Annulation de prestation + note de crédit | `modalCancelBilling` 14198-14213 (`depCredited`, `rembourse`, `_ts`) | **passe** (pièce nouvelle ; `rectifie` inchangé, 14209) |
| 14 | Remboursement liquide après annulation | `applyLiquideRefund` 14254-14258 | **passe** via `ctx.piece='remboursement'` : `payRecu + rembourse` constant (vérifié : `kept = cashRecu − r`, `rembourse += r`) |
| 15 | Marquage « ✓ Remboursée » d'une NC | 10497 | **passe** (n'écrit pas `t.payments`) |
| 16 | Rattachement de caisse à un mois antérieur | `modalRebaseLiquide` 10723-10724 (`comptaPeriod`) | **passe** + garde à ajouter (§2) |
| 17 | Report d'un impayé à la visite suivante | `setClientImpaye` 14420-14426 via 14404 | **passe** (paiement non encore acté au moment du commit) |
| 18 | Collecte d'un impayé à la tournée suivante | `addClientToTour` 7757-7761 (`im.collected` false→true) | **passe** (transition monotone, hors `t.payments`) |
| 19 | Gap-fill de fusion (paiement absent localement) | `graftClosure` 3739 / 3744 | **passe** (complète, ne remplace pas) |
| 20 | Fusion : deux méthodes différentes sur pièce actée | `graftClosure` 3742 (LWW `_ts`) | **ne passe pas** → conflit journalisé, local conservé (§5) |
| 21 | Purge d'arrondi caisse aberrant par le GC | `recalcAllTours` 8487 | **ne passe pas** sur pièce actée (efface un encaissement ; `payRectifie` 8632-8636 retombe sur `m.totalTTC`) |
| 22 | Ressaisie de l'arrondi après « Corriger les prestations » | `modalAdjustArrondi` 14236 | **passe** si `rect == null` (1ʳᵉ saisie, cas `cashClientsNeedingArrondi` 14123) ; **ne passe pas** si un montant acté existe |
| 23 | « Corriger les prestations » d'une tournée legacy | `modalEditPrestations` 14069, garde 14070 (`tourComptaLocked`) | **passe** en AJOUT ; à restreindre (§9) |
| 24 | Restauration / réinjection Drive | `reinjectTour` 4512-4532 | **passe** — contexte `restore` exempté, journalisé |
| 25 | Import « Fusion » | `importSnapshotMerge` 4023 | **passe** |

---

## 2. TABLEAU EXHAUSTIF DES CHAMPS FIGÉS

**Périmètre F1 — corps et montants d'une tournée clôturée**

| Champ | Statut | Condition exacte |
|---|---|---|
| `t.payments[cid].method` | **immuable absolu** | dès `paiementActe(t,cid)` — jamais de liquide↔virement |
| `t.payments[cid].facture` | **conditionnel** | false→true autorisé (émission) ; true→false **interdit** dès `paiementActe` |
| `t.payments[cid].rectifie` / `.montantPaye` | **conditionnel** | immuable dès `paiementActe`, SAUF `applyLiquideRefund` avec invariant `payRecu + rembourse` constant (±0,01 €) |
| `.partiel` / `.impaye` / `.resteMode` | **conditionnel** | idem ; leur extinction n'est licite que dans le même mouvement qu'un remboursement, et **doit** être accompagnée de `setClientImpaye(t,cid,0)` (fait en 14257, **omis en 9583-9585 → défaut**) |
| `.rembourse` / `.depCredited` / `.depCreditNoteNum` | **libre monotone** | croissance seule (`foldMono` 3736 la préserve déjà en fusion) |
| `.comptaPeriod` | **conditionnel** | modifiable tant que **ni** le mois source **ni** le mois cible n'est `encode` — garde cible présente (10699/10718), **garde source ABSENTE (10723) → à ajouter** |
| `._ts` | libre | horodatage de fusion |
| `t.result.*` (`parClient[].totalHT/TVA/TTC`, `htDeplacement`, `materielHT`) | **conditionnel** | recalcul autorisé uniquement sous `withFrozenPrices` (8414-8426) **et** si aucune violation §1 n'a eu lieu en amont. `calcTour` (8538) et `recomputeTourGeo` (8573) recalculent **hors gel** → à interdire sur `t.closed` |
| actes `cv.parage/visite/fourbure/npas/infection/visiteArtId` | **conditionnel** | AJOUT seul (cheval `legacy`, 14080) tant que `!tourComptaLocked` ; décochage d'une prestation facturée **interdit** → passe par `cv.cancel` + NC |
| `cv.cancel.*` | **libre additif** | apparition + `concat` (13996-13998, 14201-14206) ; `credited` false→true |
| `t.articles`, `t.reductions`, `t.parageRemiseOff` | **immuable** sur clôturée | sauf suppression d'annulation (`deleteCancellationItems` 6663-6678, monétairement neutre : `keep()`/`kill()` 8338-8345 les excluaient déjà) |
| `t.date`, `t.closed`, `t.startedAt/endedAt/autoClosedAt`, `t.priceSnap` | **pose monotone** | undefined→valeur uniquement (`ensurePriceSnap` 8411 conforme) |
| `a.validatedAt`, `cl.validatedAt` | **pose monotone** | retrait autorisé UNIQUEMENT par `healValidatedActe` (6902) sur tournée non clôturée ; **`graftClosure` 3763 appelle `syncArretValidated` sans garde de statut → peut supprimer `a.validatedAt` d'une clôturée = à garder** |
| `t.realMin/returnRealMin/consultMin/heure/heureStale/aPrevenir/rdvDone` | **libre** | stats et agenda, jamais dans un montant (vérifié) |
| `t.result.routeGeo/rows`, `addr.lat/lon`, `updatedAt` | **libre** | déjà hors hash (`_HASH_SKIP` 3570) |

**F2 — facture émise** `t.factureIds[cid] = {id, numero, frozenAt}` : **immuable absolu**. Pose monotone seule (13896 « déjà émise → jamais renumérotée »). **Défauts à corriger** : non fusionné par `graftClosure` (aucune occurrence dans 3722-3765) et non conservé par `reinjectTour` (4515-4522) → renumérotation possible ; `nextFactureNumero` (13868) recalcule `max+1` sur le vivant → **réemploi de numéro** après suppression de tournée.

**F3 — notes de crédit** `S.notesCredit[]` : **immuable absolu** (id, numero, montantTTC, moHT/matHT/depHT/tva, date, clientNom). Seuls `sentAt` (10495) et `rembourse/rembourseAt` (10497) sont libres monotones. **La suppression d'une NC non remboursée (8478, 14449) doit devenir un détachement (`tourDeleted = true`), pas une suppression.**

**F4 — impayé reporté non collecté** `c.impayes[]` : montant `ttc` et `sourceTourId` **immuables** ; `collected` false→true **libre monotone** ; le tombstone `c.impayeDel` reste nécessaire (anti-résurrection/re-facturation 3843). Comparaison par `(sourceTourId, ttc)` et **jamais par `id`** (l'id est régénéré à chaque `setClientImpaye`, 14425).

**F5 — noms référencés** : `cli.chevaux[].nom` et le nom client restent **libres** (donnée de référence), mais la facture doit imprimer un nom **figé** ; `rowFromArret` 8343 joint par NOM seul → **à passer en id-first** `(c.id != null && h.id === c.id) || (norm(c.nom) && norm(h.nom) === norm(c.nom))` (motif déjà utilisé en 3795, 6923, 8403). Suppression d'un cheval référencé par une pièce figée : **interdite** (garde à ajouter, symétrique de la garde client 6271-6273), message « rendez-le inactif ».

**Périmètre comptable**

| Champ | Statut |
|---|---|
| `S.comptaStatus[ym].liquide === 'encode'` | **immuable** ; levée uniquement par le `<select data-status>` (10609) avec confirmation explicite. **Interdire** les suppressions automatiques : GC `recalcAllTours` 8477 et `purgeTourData` 14451 |
| `S.comptaDemarche[tourId:cid]` | idem (décochage manuel seul) |
| `S.declarations[ym][type] = {id, frozenAt}` | **immuable** ; `syncDeclaration` 13876 doit poser `revokedAt` au lieu de `delete` ; passer la fusion en map horodatée par clé (aujourd'hui LWW bloc, 3942-3944) |
| `S.comptaRecu[key]` | **libre** (encaissement constaté, distinct de la méthode) |

---

## 3. LE DÉFAUT `setComptaPayment` — CORRECTIF PRÉCIS

### 3.a Le code fautif (9576-9592)

Quatre défauts cumulés, tous vérifiés :
1. **Aucune garde de gel** : les branches 9581-9585 s'exécutent toujours, y compris sur un mois `encode` (seul 9590 est gardé) → une pièce déclarée change de section dans le PDF déjà déposé tandis que ses montants restent ceux du liquide.
2. **Reclassement de méthode** libre → `computeResultMoney` 8297 rejoue/retire la remise de 20 % sur une facture numérotée (13898).
3. **Branches `virement`/`facvir` (9583-9584)** : `partiel:false, impaye:null, resteMode:null` **sans appel à `setClientImpaye`** (contrairement à 14404 et 14257) → la créance `c.impayes[]` survit et sera re-facturée en 7757-7761 alors que la compta encaisse 100 % → **double comptage**.
4. **Mêmes branches** : `comptaPeriod` est **omis** de l'objet reconstruit → le rattachement de caisse est détruit (`keepLiq` 9580 le préserve, pas 9583/9584).

### 3.b Remplacement

```js
function setComptaPayment(tourId, clientId, method) {
  const t = tourById(tourId); if (!t) return;
  if (!t.payments) t.payments = {};
  const prev = t.payments[clientId] || {};

  // (1) VERROU MOIS DÉCLARÉ — AVANT toute écriture (aujourd'hui seul le recalcul est gardé, 9590)
  if (comptaLocked(t, clientId)) {
    alert('🔒 Période comptable déclarée : ce paiement est figé définitivement.\n'
        + 'Pour corriger, émettez une note de crédit ou un remboursement.');
    return;
  }

  const nextMethod  = (method === 'liquide' || method === 'facliq') ? 'liquide'
                    : (method === 'virement' || method === 'facvir') ? 'virement' : null;
  const nextFacture = (method === 'facliq' || method === 'facvir');

  // (2) VERROU MÉTHODE / RETRAIT DE FACTURE
  if (paiementActe(t, clientId)) {
    if (nextMethod !== prev.method) {
      alert('🔒 Le mode de paiement de ce client est ACTÉ (' + prev.method + ').\n'
          + 'Un paiement encaissé ne se reclasse pas : passez par « 🚫 Annuler une facturation » '
          + '(note de crédit) puis ressaisissez le règlement sur une pièce neuve.');
      return;
    }
    if (prev.facture && !nextFacture) {
      alert('🔒 Une facture a déjà été émise pour ce client : elle ne peut pas être retirée.');
      return;
    }
  }

  // (3) Écriture — comptaPeriod et l'impayé préservés dans TOUTES les branches
  const keep = {
    rectifie:  prev.rectifie != null ? prev.rectifie
             : (prev.montantPaye != null && !prev.partiel ? prev.montantPaye : null),
    partiel:   !!prev.partiel,
    impaye:    prev.impaye != null ? prev.impaye : null,
    resteMode: prev.resteMode || null,
    comptaPeriod: prev.comptaPeriod || null,     // ← CORRECTIF : plus perdu en virement/facvir
    rembourse: prev.rembourse || 0
  };
  if (nextMethod === 'liquide') {
    t.payments[clientId] = Object.assign({ method: 'liquide', facture: nextFacture }, keep);
  } else if (nextMethod === 'virement') {
    // le virement ne porte ni partiel ni impayé : on éteint, MAIS on répercute la créance client
    t.payments[clientId] = Object.assign({}, keep, { method: 'virement', facture: nextFacture,
                                                     partiel: false, impaye: null, resteMode: null });
    if (prev.partiel) { setClientImpaye(t, clientId, 0); saveClients(); } // ← CORRECTIF : plus de créance orpheline
  } else {
    if (paiementActe(t, clientId)) { alert('🔒 Un paiement acté ne peut pas revenir à « À classer ».'); return; }
    t.payments[clientId] = { method: null, facture: false, rectifie: null, partiel: false,
                             impaye: null, resteMode: null, comptaPeriod: keep.comptaPeriod,
                             rembourse: keep.rembourse };
  }
  t.payments[clientId]._ts = Date.now();
  logFrozenWrite({ o: 'user', f: 'setComptaPayment', t, cid: clientId, before: prev, after: t.payments[clientId] });

  recomputeTourLocal(t);   // comptaLocked déjà refusé plus haut → plus besoin du test 9590
  persistTourAnywhere(t);  // 12936 (remplace la double branche 9591)
}
```

### 3.c Garder possible la PREMIÈRE saisie « à classer »

Aujourd'hui elle est **impossible** depuis Compta (V1 : `renderComptaAvenir` 10602-10606 n'a pas de select). Deux ajouts :

1. **Rendre le select dans `renderComptaAvenir`** (10606), pour les seules lignes dont `p.method` est nul :
```js
`<div class="li-act"><b>${eur(m.totalTTC)}</b>
   <select data-mode data-tour="${t.id}" data-cid="${m.clientId}">
     ${modeOpts('aclasser')}
   </select></div>`
```
puis `comptaWire(box, renderComptaAvenir)` (10611 câble déjà `[data-mode]`).
2. **Griser le select dans `clientTbl` (10577)** dès que `paiementActe(t, e.clientId)` — remplacer le libellé au lieu du contrôle, comme le fait déjà `dem` :
```js
${(e.derived || dem || paiementActe(tourById(e.tourId), e.clientId))
   ? (e.derived ? 'Reste (virement)' : (modeLbl[e.mode] || '') + ' 🔒')
   : `<select data-mode …>`}
```
sauf pour la bascule `facture` : proposer alors un **bouton dédié** « 🧾 Émettre une facture pro » (appelle `setComptaPayment` avec `facliq`/`facvir` de même méthode), qui reste autorisé.

**Résultat** : `recoverTour` → tournée close, `p.method === null` → le client apparaît en « Tournée à venir », le select est disponible, la première classification passe ; toute modification ultérieure est refusée.

---

## 4. CORRIGER UNE VRAIE ERREUR DE SAISIE DE PAIEMENT

**Ce qui existe déjà** : `createClientCreditNote` (13906-13913, pièce numérotée `nextNcNumero` 13863 dans `S.notesCredit`), `modalCancelBilling` (14131-14216, seul chemin conforme : pièce d'origine figée, `rectifie` inchangé 14209), `applyLiquideRefund` (14245-14258, remboursement tracé à invariant constant), `replayTour` (4562-4574 : `nt.id = uid()`, `nt.closed = false`, `nt.payments = {}` → pièce neuve).

**Ce qui manque** : aucun écran ne permet de saisir un encaissement indépendant d'une tournée, et `modalCancelBilling` refuse le liquide-sans-facture (14141).

**Geste correctif recommandé (A — propre, à construire, ~1 lot)** :
`modalCorrigerReglement(t, cid)` accessible depuis la carte client / la Compta, qui **n'écrit jamais dans `t.payments`** et produit **deux pièces** :
1. une **note de crédit intégrale** de la facture erronée — `createClientCreditNote(cid, t, lignes, { motif: 'erreur de règlement', note })` avec `lignes` = toutes les lignes de `m` (le code sait déjà le faire ligne à ligne, 14193-14198) ;
2. un **règlement rectificatif** : nouvel enregistrement dans une collection `S.reglements[]` (à ajouter à `SETTINGS_COLLECTIONS` 3418) `{ id: uid(), numero, tourId, clientId, at, method, facture, montantTTC, motif, ncId }`, que `comptaData` (9612-9640) lit **en plus** de `t.payments` pour router le CA dans la bonne section du mois d'émission.
La pièce d'origine reste intacte : deux pièces liées, traçables, réconciliables.

**Repli minimal (B — 1 h de code, si A est différé)** : autoriser le changement **mais l'enregistrer**. Dans `setComptaPayment`, sur pièce actée et **hors mois déclaré** :
- exiger un motif libre non vide (modale de confirmation, pas un `confirm()`),
- `p.history = (p.history || []).concat([{ at: Date.now(), from: {method: prev.method, facture: prev.facture, rectifie: prev.rectifie}, to: {...}, motif, dv: S.deviceId }])`,
- émettre automatiquement une NC de l'écart de montant si `|Δ totalTTC| > 0,01 €`.
Le changement cesse d'être une réécriture silencieuse : il devient une pièce.

**Ce qu'il ne faut PAS faire** : passer par `modalEditPrestations` (14069) pour corriger un mode — il marque les chevaux `status:'annule'` (14202) et déclenche `p.rembourse += montant` (14209) pour un facliq, c'est-à-dire un remboursement cash qui n'a jamais eu lieu, imprimé en 8705/8759/9556.

---

## 5. MÉCANISME — OÙ S'ACCROCHER, DÉTECTION, VIOLATION

### 5.a Point d'accrochage : un ÉCRIVAIN UNIQUE, pas `saveTournees`

**Ne pas** accrocher sur `saveTournees`/`saveArchive` (3672-3673) : (a) elles portent **tout le tableau** — un refus global perdrait l'encaissement en cours ; (b) elles sont **contournées** par au moins 8 écritures directes (`normalizeIds` 3705, `applyMerged` 4018, `applyRemoteReplace` 4345, `archiveOldTours` 6827, imports 15293 / 15324-15325, `ensureFacturesForClosedTours` 15455).

**Créer** une fonction unique, à poser près de `setClientImpaye` (~14420) :

```js
function writePayment(t, cid, next, ctx) {
  const v = paiementViolation(t, cid, next, ctx);
  if (v) { logFrozenWrite({ o: (ctx && ctx.o) || 'user', f: (ctx && ctx.f) || '?', t, cid,
                            before: (t.payments||{})[cid], after: next, violation: v, refused: true });
           return { ok: false, violation: v }; }
  next._ts = Date.now();
  t.payments[cid] = next;
  logFrozenWrite({ o: (ctx && ctx.o) || 'user', f: (ctx && ctx.f) || '?', t, cid, after: next });
  return { ok: true };
}
```

Y faire passer les **3 écrivains nominaux** : `setComptaPayment` 9581-9586, `commitPayments` 14401, `modalAdjustArrondi` 14236. Et **exempter explicitement** (avec `ctx.piece`) : `applyLiquideRefund` (14254-14258, `piece:'remboursement'`), `modalCancelBilling` (14208-14210, `piece:'nc'`), `modalRebaseLiquide` (10723-10724, `piece:'rebase'`).

### 5.b Stratégie en cas de violation — la plus sûre

**Refus EN AMONT, jamais rollback silencieux.** Trois raisons : un rollback après coup laisse `syncStamp` (exécuté **avant** `LS.set` dans 3672) sur la version fautive → empreinte désalignée, famille de panne documentée en 3593-3604 ; l'utilisateur verrait sa saisie disparaître sans explication ; et le refus amont permet de proposer le bon geste.

Trois couches, par ordre de livraison :
- **Couche 1 (immédiate, sans risque)** : refus dans `setComptaPayment` (§3), désactivation du bouton `[data-cpay]` (7865) et du listener 7883 dès `paiementActe(currentTour, cl.clientId)` avec `title="Paiement acté — corrections via la Compta / note de crédit"`, alignement de 14412-14414 sur le contrôle `disabled` de 14415, et gel du sélecteur Compta (10577).
- **Couche 2** : `writePayment` + `paiementViolation` en filet, plus `if (t.closed) return false;` en tête de `calcTour` (8497) et `recomputeTourGeo` (8552) — ou, mieux, envelopper le bloc **synchrone** 8534-8540 et 8573 dans `withFrozenPrices(currentTour, …)` (no-op sans `priceSnap`, 8416, donc zéro impact sur les tournées ouvertes).
- **Couche 3 (fusion)** : dans `graftClosure` 3740-3745, si `paiementActe(to, cid)` **et** `fp.method && tp.method && fp.method !== tp.method` → **conserver le local**, ne pas trancher, poser `t._payConflicts = t._payConflicts || {}; t._payConflicts[cid] = { local: tp, remote: fp, at: Date.now() }` et afficher un bandeau de résolution manuelle. Conserver 3739 (gap-fill P0-2, fin de la perte des 500 €) et `foldMono` 3736. Ajouter `factureIds` au gap-fill (union par `clientId`, `frozenAt` le plus ancien gagnant).

---

## 6. TRAÇABILITÉ

### 6.a Sites à instrumenter : **18** (12 mutations en place + 6 remplacements en bloc)

| # | Ligne | Fonction | Origine | Nature |
|---|---|---|---|---|
| 1 | 3739 | `graftClosure` | fusion | gap-fill (paiement absent) |
| 2 | 3742 | `graftClosure` | fusion | **remplacement LWW `_ts`** |
| 3 | 3744 | `graftClosure` | fusion | gap-fill legacy (`!tp.method`) |
| 4 | 3702 | `normalizeIds` | migration | `p.id` (backfill) |
| 5 | 6960 | `reconcileTour` | gc | `delete t.payments[cid]` (client orphelin) |
| 6 | 8487 | `recalcAllTours` | gc | **`p.rectifie = null; p.montantPaye = null`** |
| 7 | 9581-9586 | `setComptaPayment` | user | remplacement intégral (5 branches) |
| 8 | 10723-10724 | `modalRebaseLiquide` | user | `comptaPeriod` set/delete |
| 9 | 14208 | `modalCancelBilling` | user | `depCredited`/`depCreditNoteNum` |
| 10 | 14209 | `modalCancelBilling` | user | `rembourse +=` |
| 11 | 14210 | `modalCancelBilling` | user | `_ts` + réaffectation objet |
| 12 | 14236 | `modalAdjustArrondi` | user | `rectifie`/`montantPaye`/`impaye` |
| 13 | 14254 | `applyLiquideRefund` | user | `rembourse +=` |
| 14 | 14257 | `applyLiquideRefund` | user | purge `partiel/impaye/resteMode` + `setClientImpaye` |
| 15 | 14258 | `applyLiquideRefund` | user | `rectifie = kept` |
| 16 | 14377 | `modalPayment` | user | **méthode provisoire (aperçu)** — restaurée par ✕ 14338 |
| 17 | 14401 | `commitPayments` | user | écriture nominale |
| 18 | 4018 / 4345 / 15293 / 15324-15325 | `applyMerged` / `applyRemoteReplace` / imports | fusion / restore / import | remplacement du parc en bloc |

S'y ajoutent, pour F2/F3/comptaStatus : 13898 (`factureIds`), 13911 (`notesCredit.push`), 10609 (`comptaStatus`), 8477 et 14451 (**suppressions de verrou de mois, à interdire**), 8478 et 14449 (**suppression de NC, à convertir en détachement**).

### 6.b Format d'entrée

```js
{ at: Date.now(), v: APP_VERSION, dv: S.deviceId, dn: S.deviceName,
  o: 'user'|'gc'|'fusion'|'restore'|'import'|'migration',
  f: 'setComptaPayment', k: 'payment', tid: t.id, cid,
  fz: ['F1','F2'],                 // invariants touchés → tri en 2 anneaux
  ch: [{ p:'method', a:'liquide', b:'virement' }, { p:'rectifie', a:114, b:91 }],
  refused: true, violation: 'method' }
```
Champs monétaires, `method`, `facture`, `closed`, `validatedAt`, `numero` : **verbatim, sans exception**. Objets/tableaux : `{ n: taille, h: hashStr(JSON) }` (12 car., `hashStr` 3558).

### 6.c Bornage

Deux anneaux séparés, plafond en **octets réels** (`new Blob([s]).size`, motif déjà utilisé en 15257 — pas `String.length`, qui compte des unités UTF-16) :
- `ftr.wlog` — toutes origines, FIFO, **128 Ko / 1500 entrées** ;
- `ftr.wlogFrozen` — uniquement `fz` non vide, **64 Ko**, jamais évincé par le trafic ordinaire.

**Règles non négociables** :
1. écrire par `localStorage.setItem` **direct**, jamais par `LS.set` (2750-2784) : son gestionnaire de quota purge `ftr.syncmeta` (2766), cause racine du ré-horodatage de masse du 2026-07-16 (3593-3604). Précédents dans le code : `ftr.quotaLog` 2773, `ftr.migHist` 3647, `ftr.rebuildFail` 3668 — tous en `setItem` brut. **Corriger au passage `ftr.stampGuard` 3604, qui utilise encore `LS.set`.**
2. ajouter `ftr.wlog`/`ftr.wlogFrozen` à la liste de purge de `LS.set` (2757), **avant** `ftr.syncmeta` et jamais avant `ftr.tomb` : sous quota, on jette le journal, pas les empreintes.
3. garde de ré-entrance `_wlogBusy` : ne jamais journaliser depuis le gestionnaire de quota.
4. coalescence 2 s par `(o, f, tid, cid)` avec compteur `n` (`edNom` 15510 sauvegarde à chaque `input`).

### 6.d Local vs synchronisé

**Interdiction formelle** : ne PAS mettre le journal dans `S`, ne PAS l'ajouter à `SETTINGS_COLLECTIONS` (3418). Conséquences vérifiables : `saveSettings` (3454) sérialise tout `S` — dont `contactMails` ~2,6 Mo (15254) — à chaque entrée ; `syncStamp` (3444/3607) hacherait 1500 enregistrements ; l'éviction d'un anneau borné poserait un **tombstone** par entrée dans `ftr.tomb` (3613, magasin jamais purgé) ; et `snapshotHash` (4304) haché sur `settings` ferait échouer le court-circuit anti-upload 4841 → retransmission complète du coffre à chaque jalon.

**Chaînage inter-appareils** : ajouter `wlogFrozen` comme champ de **premier niveau** de `exportSnapshot` (3992, à côté de `device: deviceInfo()`), **jamais fusionné**. Chaque révision Drive porte alors la queue de l'appareil qui l'a écrite ; on remonte la chaîne avec `driveListRevisions` (4685) / `driveDownloadRevision` (4749), même mécanique que « 🔍 Analyser ». Zéro conflit. **Réserve** : `snapshotHash` (4303-4308) ignore ce champ et le court-circuit 4845 (`h === _lastPushHash`) peut empêcher l'envoi ; forcer un push si `wlogFrozen` a changé. Et `driveUpload` (4287) ne pose jamais `keepForever` → rétention des révisions non garantie : garder l'anneau **local** comme source primaire.

### 6.e Risque de l'asynchrone

Le contexte d'origine doit être posé en portée **strictement synchrone** (`withOrigin(o, f, fn)` + compteur de profondeur + restauration en `finally`). Vérifié : le cœur d'écriture de la fusion est synchrone (`applyMerged` 3995-4022, aucun `await`), le réseau est entièrement à l'extérieur (4784-4787).
**Sites qui franchissent une frontière asynchrone → étiquetage EXPLICITE par paramètre, jamais par portée** : `flushCalPendingDelete` (4066, après boucle `await`), `pushTourToCalendar` (4134), `deleteTourCalendar` (4144), `geocodeClientAddresses` (6313), `forceRelocate` (5221), `calcTour` (8527/8541), `recomputeTourGeo` (8575), `gmailFetch` (11407), `importSyncFile` (callback `onload` 4855-4860), continuations `.then` 13059/13062/13063.
**Piège vérifié** : `restoreDriveSnapshot` (4485) et `restoreDriveTournees` (4505) écrivent **avant** leur premier `await` (4486/4506) → envelopper l'instruction, pas la fonction `async`.
**Corroboration par le geste** (`_lastGestureAt`) : à utiliser **uniquement** comme signal négatif quand aucun jeton de portée n'existe — jamais comme déclasseur. Sinon les 59 `confirm()` natifs (qui ne produisent aucun événement DOM), l'impression PDF, l'envoi Gmail (`setTimeout` 1400 ms en 10191) et `calcTour` (avec `await sleep(1100)` par arrêt, 8517) marqueraient `suspect:true` exactement les actes les plus délibérés — clôture (15530), NC (10495), suppression d'annulations (6751-6755).

---

## 7. FAUX POSITIFS ÉVITÉS PAR CONSTRUCTION

| Faux positif | Pourquoi une règle naïve le déclencherait | Comment la règle §1 l'évite |
|---|---|---|
| **Remboursement liquide** (`applyLiquideRefund` 14258) | réécrit `p.rectifie` à la baisse | `ctx.piece='remboursement'` → test d'**invariant** `payRecu + rembourse` constant, pas gel de champ |
| **Complétion des stats d'une tournée récupérée** (12976-12980) | écrit dans le corps d'une clôturée | `heure/realMin/consultMin/returnRealMin` **hors périmètre** (vérifié : aucun n'entre dans `computeResultMoney`) |
| **Collecte d'un impayé** (7757-7761) | écrit `c.impayes` d'un client figé | transition monotone `collected` false→true, comparaison par `(sourceTourId, ttc)` et non par `id` |
| **Pose de `factureIds` / `priceSnap` au boot** (13898, 8411) | écrit sur clôturée/archivée | pose **monotone** (undefined→valeur), idempotence 13896 |
| **Annulation par service + NC** (14198-14213) | modifie une pièce figée | `cv.cancel` additif + `rembourse` monotone + `rectifie` inchangé |
| **Première classification d'une tournée récupérée** (V2) | `t.closed === true` | déclencheur = `p.method != null`, **pas** `t.closed` |
| **Émission d'une facture pro après clôture** (facvir/facliq) | passe par le même `<select>` | `method` inchangé → seul `facture` false→true, autorisé |
| **Recalcul de la répartition en cours de tournée** | `t.result.parClient[].totalTTC` d'un client déjà clôturé bouge quand un arrêt est ajouté (8202-8231, prorata déplacement) | l'empreinte gelée porte sur **`t.payments`**, pas sur `t.result` d'une tournée ouverte ; `t.result` n'est gelé que sur `t.closed` |
| **Gap-fill de fusion** (3739/3744) | écrit `t.payments` d'une clôturée | complétion (`!tp`) explicitement autorisée |
| **Réinjection / restauration** (4512-4532) | remplace une pièce figée | contexte `restore` exempté du refus, **journalisé** ; sinon une perte récupérable deviendrait définitive |

---

## 8. PLAN DE TESTS

### 8.a Chaque flux légitime passe

| T | Scénario | Attendu |
|---|---|---|
| L1 | Tournée du jour, client neuf → 💶 Paiement → Liquide + 120 € → Enregistrer & clôturer | `t.payments[cid].method='liquide'`, `rectifie=120`, `cl.validatedAt` posé, **aucun refus** |
| L2 | Même client, **avant** clôture, corriger 120 → 125 | accepté |
| L3 | Client multi-arrêts : arrêt 1 clôturé « en attente » (7278), arrêt 2 paiement | accepté (paiement au dernier arrêt) |
| L4 | Clôture de tournée (`edClose` 15518) | `closed`, `priceSnap`, `factureIds` posés ; aucun refus |
| L5 | `recoverTour` sur une tournée 2025 → « Tournée à venir » → select → Virement | **accepté** (V2) |
| L6 | L5 puis « Compléter les stats » : heures, realMin, consultMin | accepté, `t.result` inchangé |
| L7 | Clôturée non déclarée, client virement → « Facture pro (virement) » | accepté, `totalTTC` **inchangé** (8297 ne dépend que de `method`) |
| L8 | Clôturée, facture virement → « 🚫 Annuler une facturation » → NC | accepté, `S.notesCredit.length++`, `rectifie` inchangé |
| L9 | Clôturée, liquide sans facture → annulation d'un acte → remboursement 85 € sur 120 encaissés | accepté ; `rectifie=35`, `rembourse=85`, invariant `payRecu+rembourse=120` |
| L10 | « 📅 Clôturer la caisse liquide » → rattacher juillet→juin (juin non encodé) | accepté |
| L11 | Fusion : appareil B n'a pas le paiement du client X | `graftClosure` 3739 le greffe |
| L12 | Impayé reporté 40 € → tournée suivante → article « Impayé du … » | accepté, `im.collected=true` |
| L13 | Tournée legacy sans acte coché → « Corriger les prestations » en AJOUT → `modalAdjustArrondi` avec `rect == null` | accepté (1ʳᵉ saisie de l'arrondi, 14123) |
| L14 | Restauration Drive « ♻ Réinjecter » | accepté, entrée `restore` au journal |

### 8.b Chaque dégât historique est refusé

| T | Scénario | Attendu |
|---|---|---|
| D1 | Compta, client liquide+facture **encaissé**, select → Virement | **refusé** ; `t.payments` inchangé ; `c.impayes` intact |
| D2 | D1 sur un mois `liquide === 'encode'` | **refusé avant écriture** (aujourd'hui : écrit, seul le recalcul est sauté) |
| D3 | Facliq partiel (impayé 40 €) → Virement | **refusé** ; sinon créance orpheline re-facturée (7757) = double comptage |
| D4 | Éditeur, tournée du jour, client encaissé **et clôturé** → bouton 💶 Paiement | **désactivé** ; le listener 7883 ne se pose pas |
| D5 | Idem D4 via `[data-carte]` (14414) alors que `payOk` est `disabled` | **aucune écriture** (contrôle aligné sur 14415) |
| D6 | Compta, facliq → Liquide (retrait du drapeau facture) | **refusé** (retrait de pièce + déplacement de mois via `effYm` 9616) |
| D7 | Compta, virement acté → « À classer » | **refusé** |
| D8 | Réglages → « Recalculer toutes les tournées » sur une clôturée liquide avec `|rectifie − totalTTC| > 3 €` (cas remboursement partiel) | **`p.rectifie` NON effacé** (8487 gardé par `paiementActe`) ; report en liste « à vérifier » |
| D9 | Idem, mois déclaré : `S.comptaStatus[ym]` supprimé par 8477 | **refusé** (verrou conservé) |
| D10 | Suppression de tournée d'un mois déclaré (13312/15547) | **refusée** si `t.factureIds` non vide ou `tourComptaLocked` |
| D11 | GC 8478 / `purgeTourData` 14449 sur NC non remboursée | **détachée** (`tourDeleted=true`), pas supprimée |
| D12 | Fusion : A a `liquide/120`, B a `virement` avec `_ts` plus récent, pièce actée | **local conservé**, conflit journalisé, bandeau de résolution |
| D13 | Import « Données seules » → tournée clôturée → ouverture éditeur | `_review` **non posé sur `t.closed`** → éditeur reste verrouillé, pas de re-tarification |
| D14 | `modalEditPrestations` : **décocher** un parage déjà facturé et payé | **refusé** (ajout seul) |
| D15 | `calcTour` (8538) déclenché sur une tournée figée (repli 14106) | **refusé** ou exécuté sous `withFrozenPrices` ; `t.priceSnap` respecté |
| D16 | `graftClosure` 3763 sur une clôturée dont un client vient d'être greffé sans `validatedAt` | `a.validatedAt` **non supprimé** (garde de statut ajoutée) |

---

## 9. CE QUI RESTE RISQUÉ OU INCERTAIN

1. **`t.result` d'une tournée OUVERTE bouge légitimement.** `computeResultMoney` (8202-8231) redistribue le déplacement au prorata entre tous les clients : ajouter un arrêt fait varier le `totalTTC` d'un client **déjà clôturé et payé**. C'est pourquoi l'empreinte gelée porte sur `t.payments` et **jamais** sur `t.result` avant `t.closed`. Conséquence assumée : entre la clôture d'un client et celle de la tournée, sa facture peut encore bouger. **À arbitrer avec le propriétaire** — si c'est inacceptable, il faut figer `m.totalTTC` par client à `closeClientFully` (7280), ce qui est un lot séparé et lourd.
2. **Virement = créance, pas encaissement.** `clientPaiementIssue` (7237-7240) n'exige aucun montant en virement, et `S.comptaRecu` (10577) trace séparément la réception. Un virement annoncé mais jamais arrivé, que le client règle finalement en espèces, tombe sous le refus. **Recommandation** : autoriser la bascule `virement → liquide` **tant que `S.comptaRecu[tourId:cid]` est faux ET que le mois n'est pas déclaré**, avec motif obligatoire et entrée de journal. À valider explicitement avec le propriétaire.
3. **`facliq → liquide` interdit** peut gêner un décochage de « Facture nécessaire » fait par erreur juste après clôture. Repli : autoriser dans les 24 h suivant `frozenAt` (13897), avec journal.
4. **`_review` et l'import** : `markToursReview` (15245) pose `_review` sur toutes les tournées importées, y compris clôturées, ce qui lève `locked` (7301) et rouvre `modalPayment` — le correctif §5 couche 1 neutralise l'accès au paiement, mais **`calcTour(true)` via `edRevalider` (15515) reste hors gel** (8538). À traiter dans le même lot.
5. **`nextFactureNumero` (13868) et `nextNcNumero` (13863)** déduisent la séquence du vivant → réemploi de numéro après suppression/perte de fusion. Correctif : compteur persisté `max(S.factureSeq, dérivé)`, monotone. **Hors périmètre du blocage, mais bloquant pour la conformité comptable.**
6. **`factureIds` non fusionné** (absent de `graftClosure` 3722-3765 et de `reinjectTour` 4515-4522) → renumérotation d'une facture déjà émise. Correctif additif (union par `clientId`, jamais d'écrasement) à livrer avec la couche 3.
7. **Volume du journal** : 192 Ko résidents dans un `localStorage` déjà proche du quota (`contactMails` ~2,6 Mo, 15254). Sans la règle 6.c-2 (journal purgé **avant** `ftr.syncmeta`), le dispositif de traçabilité peut devenir la cause de la perte qu'il documente.
8. **Console / code externe** : rien ne détecte une écriture faite hors UI. Le journal observe, il n'authentifie pas.