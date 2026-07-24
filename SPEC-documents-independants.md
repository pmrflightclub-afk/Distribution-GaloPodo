# ANALYSE — Documents indépendants (facture de vente / note de crédit) + compte client

> Demande du propriétaire, 2026-07-23. **Analyse de conflits/frictions AVANT conception détaillée.**
> Rien n'est tranché ni codé ici — ce document confronte la demande à l'existant et aux modules A→E déjà prévus.
> Lignes = branche `migration-identite-v2`.

## 1. CE QUI EXISTE DÉJÀ (recherche faite)

### 1.1 Note de crédit sur prestations déjà facturées — `modalCancelBilling` (app.js:14131)
**Fait déjà 80 % de la « NC indépendante » demandée** :
- arbre arrêt → client → cheval → **prestation cochée individuellement** (app.js:14161), + ligne déplacement
  cochable à part (14164) ;
- montants **lus depuis le document de référence** (`t.result.parClient`, via `chevalCancelItems` 13834) ;
- **une NC par client**, numérotée, `createClientCreditNote` (13906) ; tournée laissée **figée** ;
- exclusion des prestations **déjà créditées** (`remainingItems` 14134).

**Limites vs la demande** :
- réservé à la tournée **ouverte dans l'éditeur** (pas un point d'entrée « choisir un client / une tournée de
  référence » depuis la Compta) ;
- filtre de mode (14141) : **facture liquide + virement + facture virement uniquement** — **exclut le liquide
  sans facture**. La demande veut les **quatre** modes.

### 1.2 Facture par client — `clientInvoiceHtml` (app.js:8668), moteur `computeResultMoney` (8193)
La facture d'un client est **dérivée** de `t.result.parClient[i]` : actes, articles, matériel, déplacement,
remises. Pas de « facture » stockée comme document autonome (le Lot 02b a ajouté `t.factureIds` = identité
{id, numéro, frozenAt}, mais **pas** un objet facture indépendant).

### 1.3 Remise liquide 20 % — exclusion par ligne DÉJÀ possible (app.js:8297-8303)
La remise `S.reducLiquide` ne s'applique qu'aux lignes `remiseLiquide !== false`. Une ligne peut donc **échapper
au 20 %** en portant `remiseLiquide: false` — c'est **déjà** ce que fait la ligne « Impayé du … » (8288). Donc
« pas de réduction 20 % sur la ligne de facture indépendante » = **faisable sans nouveau mécanisme**.

### 1.4 Rattachement à la prochaine tournée — `addClientToTour` (app.js:7757) + `c.impayes`
Une créance liquide est réinjectée en ligne « Impayé du … » à la prochaine tournée du client. C'est le socle du
« s'attache au prochain RDV ». Mais : réinjection **au moment où le client est ajouté à un arrêt**, pas de
notion de blocage de clôture, pas de gestion de plusieurs RDV concurrents (voir friction F5).

### 1.5 Liste + statut de documents — `renderComptaNC` (app.js:10478)
Les NC sont **déjà** listées (à rembourser / remboursées), avec bouton 📧 Email (`sentAt`), PDF, « ✓ Remboursée ».
**Il n'existe AUCUNE liste des factures de vente** (elles sont par tournée, via `factureIds`). Le registre unifié
demandé (factures + NC, avec statut payée/envoyée) est **à construire**, mais la moitié NC existe.

---

## 2. LE MODÈLE QUE JE COMPRENDS

Un **compte client** hors tournée, soldé au premier RDV effectif :

```
                        ┌─────────────── COMPTE CLIENT ───────────────┐
  Débits (client doit)  │  facture de vente indépendante              │  → ligne + dans la prochaine facture
                        │  impayé liquide (existant)                  │
  Crédits (on doit)     │  note de crédit indépendante                │  → ligne − dans la prochaine facture
                        │  avoir (module E : annul. liquide + NC)     │
                        └─────────────────────────────────────────────┘
                                          │
                     soldé au 1ᵉʳ RDV effectif du client (jamais reporté)
```

Règles de solde (propriétaire) :
- **Liquide / facture liquide** → toujours **fondu dans le paiement global** de l'arrêt (une ligne de la facture).
- **Virement / facture virement** → **paiement individuel** (pièce à part), pas fondu.
- Le paiement du document indépendant est **scindé** du paiement de l'arrêt normal mais **rangé dans les
  `t.payments` de cet arrêt-client**, et il **BLOQUE la clôture** tant qu'il n'est pas validé.
- Mode de paiement du document = **mêmes modes, mêmes conditions et effets** que l'actuel (liquide/virement,
  option facture pour chacun) — **sauf** : pas de remise 20 % sur la ligne de facture de vente indépendante ;
  un seul paiement liquide, un seul virement.

---

## 3. CONFLITS ET FRICTIONS (le cœur de la demande)

### F1 — « Module de contrepassation » : DEUX besoins différents sous un même titre
Le §1 de la demande s'intitule « module de contrepassation » mais décrit des **documents indépendants** (facture
de vente + NC). Or le **module B déjà spécifié** (`SPEC-modules-correction.md §2`) est un **règlement
rectificatif** qui corrige une **erreur d'imputation** (payé virement au lieu de liquide) — ce n'est **pas** la
même chose.

→ **Décision requise** : les documents indépendants **remplacent-ils** le règlement rectificatif, ou
**s'ajoutent-ils** ? Mon analyse : ils sont **orthogonaux**. Une facture de vente crée une créance neuve ; une NC
crédite une prestation ; un règlement rectificatif corrige la **méthode** d'un paiement dont le **montant est
juste**. Aucun des deux documents indépendants ne sait corriger une imputation. **Recommandation : garder les
deux**, mais le règlement rectificatif redevient **secondaire** (le cas « erreur de méthode » est rare ; le
besoin urgent est facturer/créditer hors tournée).

### F2 — NC sur liquide sans facture : conflit avec une décision verrouillée
La demande veut une NC possible sur **les quatre modes**, dont le **liquide sans facture**. Or :
- une NC **crédite une facture** — un liquide sans facture **n'a pas de facture** à créditer (incohérence
  conceptuelle) ;
- décision **antérieure verrouillée** (changelog app.js:226, mémoire) : « le ⊘ ne crée **plus jamais** de note de
  crédit » pour le liquide → annulation liquide = **remboursement**, pas NC. Le **module E** vient d'entériner
  ça (remboursement → avoir).

→ **Friction réelle.** Deux lectures possibles :
  (a) pour le liquide sans facture, l'annulation reste un **remboursement/avoir** (module E) et **pas** une NC —
      on garde la règle actuelle, la « NC » ne s'ouvre qu'aux modes avec facture + virement ;
  (b) on autorise une « NC » sur liquide sans facture, ce qui **rouvre** une décision fermée deux fois.
  **Recommandation : (a).** La NC reste pour facture liquide / virement / facture virement (déjà le périmètre de
  `modalCancelBilling`). Le liquide sans facture se corrige par avoir. **À confirmer**, car la demande dit
  explicitement « les quatre modes ».

### F3 — NC ↔ avoir : PAS d'unification, choix à la création ✅ TRANCHÉ
~~Recommandation d'unification~~ **écartée par le propriétaire.** À la création d'une NC, on **choisit la
méthode de remboursement** : **virement → la pièce reste une NC** (remboursée par virement, listée « à
rembourser ») ; **liquide → avoir** (module E, déduit au prochain RDV). Les deux mécanismes restent **distincts
et complémentaires** ; la méthode est indépendante de l'origine du paiement. Détail en §4 (précision D-c).

### F4 — « Facture de vente comme un arrêt complet » : le déplacement n'a pas de géométrie
La demande veut actes + articles + **déplacement**, « comme un arrêt complet ». Mais le déplacement d'un arrêt
est **calculé** à partir de la géométrie de la tournée (km partagés au prorata, `computeResultMoney` 8202-8225).
Une facture de vente **hors tournée n'a pas de géométrie** → le déplacement ne peut être que **saisi
manuellement** (montant fixe), pas calculé.

→ **Décision requise** : le déplacement d'une facture de vente indépendante est un **montant libre** (ligne
d'article « Déplacement »), pas une distance. Acceptable ? (c'est la seule option techniquement cohérente).

### F5 — Rattachement « au premier RDV effectif » : le point le plus fragile
La demande le signale elle-même : « attention si plusieurs RDV de ce client, ou si ajout d'un RDV avant un RDV
déjà prévu ». Ce problème est **identique** à celui du module C (gel par client) et de la règle « dernier arrêt
porte le paiement » (v1.7.90) : l'ordre des arrêts est **mutable** (`sortTourByHeure` 6997, ajout d'arrêt), donc
« le premier RDV » peut **changer** après coup.

→ **Cause racine du problème** : le code actuel **lie trop tôt**. `addClientToTour` (7757-7761) pose
`im.collected = true` et `im.collectedTourId` **au moment où le client est ajouté** à un arrêt (7761) — pas au
moment où la tournée est **effectivement clôturée**. Donc dès qu'on ajoute le client à une tournée T, la créance
s'y **fige** ; créer ensuite une tournée T′ **antérieure** ne la déplace pas.

→ **Ma proposition — lier à la CLÔTURE, pas à l'ajout** :
1. Une créance / un avoir / un document reste **« en attente » (non lié)** tant qu'aucune tournée du client
   n'est clôturée.
2. Il s'**affiche** sur la tournée **non clôturée la plus ancienne** du client (par date) — recalculé à la volée,
   donc il **suit** automatiquement si une tournée antérieure apparaît (aucun état figé à déplacer).
3. Il ne se **lie définitivement** (`collected = true`, `collectedTourId`) qu'à la **clôture effective** de
   l'arrêt-client qui le porte.
4. `tourFinalizeBlock` (7288) refuse la clôture d'un arrêt-client tant qu'un document en attente le concerne et
   n'est pas validé (F6).

→ **Effets sur l'existant** :
- `addClientToTour` (7761) : **ne plus poser `collected` à l'ajout** — seulement afficher la ligne (dérivée).
  Le passage à `collected` migre vers `closeClientFully` / `closeClientAt` (7280-7282).
- **Idempotence** : la ligne « Impayé/Avoir/Doc du … » est **dérivée** de l'état en attente, jamais dupliquée
  (garde par `impayeId`/`docId`, déjà le motif de 7758).
- **Cohérence avec le module C (gel)** et la règle « dernier arrêt porte le paiement » : le point de liaison est
  le **même** que celui du gel du client → **coder F5 et le module C ensemble** garantit un seul point de vérité
  pour « ce client est clôturé sur cette tournée ».
- Ce changement **corrige aussi** un défaut actuel du liquide (une créance liée trop tôt à une tournée qui
  finalement n'a pas lieu reste « collected » à tort).

### F6 — Paiement scindé rangé dans `t.payments[arrêt-client]` : un modèle à deux paiements
Aujourd'hui `t.payments[clientId]` porte **UN** paiement par client. La demande veut **deux** paiements distincts
sur le même client d'un arrêt (celui de l'arrêt normal + celui du document indépendant), tous deux dans les
`payments` de l'arrêt, tous deux bloquant la clôture.

→ **Friction structurelle** : `t.payments` est indexé par `clientId` (une entrée par client). Porter deux
paiements exige soit une **sous-structure** (`p.docPayments = [...]`), soit une **clé composite**. Toute la chaîne
compta (`comptaData` 9611 itère `parClient`, une entrée = un client = un paiement) devra distinguer les deux.
C'est **faisable mais transverse** — ça touche le cœur du modèle de paiement, en pleine campagne d'immutabilité.
**À cadrer avec le plus grand soin** : c'est le point qui peut déstabiliser les modules A→E.

### F7 — Numérotation : renforce L4, ne la contredit pas
Factures de vente et NC indépendantes consomment `nextFactureNumero` / `nextNcNumero`, déjà identifiés comme
**réemployables** (défaut à corriger en L4 : compteurs persistés monotones). Les documents indépendants
**ajoutent des producteurs** → **raison de plus** de faire L4 **avant**. Pas de conflit, une dépendance d'ordre.

### F8 — Immutabilité : créer un document contre une tournée figée
Une NC indépendante « choisir une tournée de référence » **lit** une tournée clôturée et crée une pièce **contre**
elle — c'est **exactement** le geste conforme que l'immutabilité **autorise** (créer une pièce nouvelle, ne pas
toucher l'originale). **Aucun conflit** : c'est même l'illustration de la règle. Idem facture de vente = pièce
neuve. ✅

### F9 — Envoi par mail à la création : brique existante
`sendClientDoc` (10563) + `modalSendDoc` envoient déjà un PDF. La facture d'arrêt (`clientInvoiceHtml`) et la NC
(`creditNotePdf` 10504) sont déjà imprimables. → **peu de travail**, sauf : le PDF de facture d'arrêt qui
**inclut la ligne du document indépendant** doit être **régénérable** (la demande le veut visualisable +
enregistrable). ✅ faisable.

---

## 4. DÉCISIONS DU PROPRIÉTAIRE (2026-07-23)

| # | Décision | Tranché |
|---|---|---|
| D-a | Documents indépendants **s'ajoutent** au règlement rectificatif (module B) | ✅ B secondaire, conservé |
| D-b | NC **jamais** sur liquide sans facture | ✅ liquide sans facture = avoir (module E) |
| D-c | NC + avoir **PAS unifiés** : à la création d'une NC, on **choisit la méthode de remboursement** — **virement → NC conservée** (remboursée par virement) ; **liquide → avoir** (déduit au prochain RDV) | ✅ |
| D-d | Déplacement d'une facture de vente = **kilométrage facturable saisi** (montant libre) | ✅ |
| D-e | **HYBRIDE par mode** : liquide/facture liquide = **ligne fondue** au prochain arrêt (impayé/avoir, F5) ; virement/facvir = **paiement sur le document**, en attente. `t.payments` **jamais touché** (`p.docPayments` abandonné) | ✅ tranché |
| D-f | Documents indépendants **après** L4 ; module E **séparé** (pas fusionné, cf. D-c) | ✅ |

### Précision D-c — le remboursement d'une NC se choisit à la création
La NC et l'avoir ne fusionnent pas : ce sont **deux voies de remboursement**, choisies dans la modale de
création de la NC.
- **Remboursement par virement** → la pièce reste une **note de crédit** : listée « à rembourser par virement »,
  le professionnel fait le virement plus tard et coche « ✓ Remboursée » (comportement actuel `renderComptaNC`
  10478). `p.rembourse` **non** utilisé.
- **Remboursement liquide** → **avoir** (module E `c.avoirs[]`) : déduit du total du prochain RDV effectif, soldé
  en entier (visite purgée + reliquat cash si l'avoir dépasse la visite).

La méthode de remboursement est **indépendante** de la méthode de paiement d'origine (on peut créditer par
virement un client qui avait payé en liquide, et inversement). Le code actuel **dérive** cette méthode de
l'origine (virement→NC, facture liquide→rembourse app.js:14157) → **à transformer en choix explicite**.

### §6 — F6 : modèle de paiement du document ✅ TRANCHÉ (hybride, voir corps §F6)
Rappel de la demande : pour **virement / facture virement**, le document se paie **individuellement** (paiement
séparé). Pour **liquide / facture liquide**, il est **fondu** dans la facture de l'arrêt (une ligne, un seul
paiement). Dans les deux cas, tant qu'un document indépendant est listé pour ce client, sa validation est
**bloquante** pour la clôture de l'arrêt-client.

**Ce que fait le code aujourd'hui** : `t.payments[clientId]` = **UN** objet paiement par client et par tournée.
La clôture est bloquée par `tourFinalizeBlock` (7288) qui, pour chaque arrêt, vérifie acte + `a.validatedAt` +
`clientPaiementIssue` (7294) — lequel lit **ce paiement unique**. Toute la compta (`comptaData` 9611) itère
`parClient` : **un client = une entrée = un paiement**.

✅ **TRANCHÉ (propriétaire, 2026-07-23) — modèle HYBRIDE par mode de règlement.** Confirmé en deux temps : le
document est une **pièce indépendante** (numérotée, dans le registre) dans tous les cas, mais **la façon de
collecter son paiement dépend du mode** :

| Mode du document | Collecte du paiement | Mécanisme |
|---|---|---|
| **Liquide / facture liquide** | **fondu** au prochain arrêt du client — une **ligne** de sa facture, réglée avec son paiement liquide unique | **impayé/avoir déjà validé** (F5), `addClientToTour` |
| **Virement / facture virement** | **paiement individuel** propre au document, **en attente** (le client vire) | **paiement sur le document** (ci-dessous) |

Mots du propriétaire : *« pour le liquide, ta proposition est la bonne : si impayé en liquide, il est ajouté lors
du prochain arrêt de ce client, comme on l'a validé ensemble »* et *« pour le virement, le paiement se fait par
virement en attente »*.

**Ce que ça donne — et c'est la plus SÛRE des options** :

- **`t.payments` n'est JAMAIS touché** (un paiement par client). Ni sous-structure `p.docPayments`, ni second
  paiement dans la map. Les modules A→E ne sont pas déstabilisés. → l'option `p.docPayments` est **abandonnée**.
- **Document liquide** = exactement le mécanisme impayé/avoir : une ligne « Doc du … » (facture de vente = +,
  NC = −) ajoutée au prochain arrêt effectif du client (F5), réglée dans son paiement liquide global. Remise
  20 % **exclue** sur la ligne facture de vente (`remiseLiquide:false`, déjà en place). Bloque la clôture via
  la présence de la ligne non réglée.
- **Document virement** = le paiement vit **sur le document** (objet `{ method:'virement', facture, reçu }` dans
  la collection de documents). `comptaData` lit `t.payments` **et** les documents → le doc virement a **sa
  propre ligne** dans la section Virements, avec sa case « Reçu ». `tourFinalizeBlock` (7288) refuse la clôture
  de l'arrêt-client rattaché tant que le doc virement n'est pas validé.

Autrement dit : **liquide = ligne dans la facture** (jamais un paiement séparé) ; **virement = pièce à part avec
son paiement en attente**. Le « bloquant pour la clôture » vaut dans les deux cas.

## 5. IMPACT SUR L'ORDRE DE CODAGE

Si validé, un **nouveau lot L10 « Documents indépendants + compte client »**, **après** L4 (compteurs monotones),
et le **module E fusionné dedans** (le compte client sert de mécanisme de solde commun impayé/avoir/doc). L10
dépend aussi de L6 (gel par client) et L0b pour la cohérence du rattachement au prochain RDV (F5). C'est le lot
le **plus transverse** de toute la Phase 3 (il touche `t.payments`, la clôture, la compta) → à coder **en
dernier**, une fois les fondations immuables posées.
