# Déploiement v1.8.0 — fiabilité des données figées

Branche `fix/gel-donnees-figees` · 6 commits · 84 assertions vertes · partie de `main` (`e40bba4`).

> **Contexte** : le PC détient l'état le plus complet, le S10 un état amputé. **L'ordre des opérations
> ci-dessous compte** — le déploiement seul ne répare rien, il empêche que ça recommence.

---

## 0. AVANT TOUTE CHOSE — deux sauvegardes

| Où | Quoi |
|---|---|
| **PC** | Réglages → Sauvegarde → télécharger. C'est ta copie la plus complète. **Range-la dans `_SAUVEGARDES-PROTEGEES/`.** |
| **S10** | Idem, même si son état est amputé — c'est la trace de l'incident, elle sert à comparer. |

Ne saute pas cette étape : tout le reste part du principe que tu peux revenir en arrière.

---

## 1. Publier le code

```bash
cd "d:/0 - DEVscripts/HOT-SacreSabot/GaloPodo"
git checkout main
git merge --no-ff fix/gel-donnees-figees
git push origin main
```

À ce stade : le **site web** sert la nouvelle version. Les **PWA installées ne bougent pas encore** —
elles n'ont pas de release plus récente à détecter. C'est volontaire : ça te laisse tester.

## 2. Tester sur le PC d'abord

Ouvre `https://pmrflightclub-afk.github.io/Distribution-GaloPodo/` **dans un onglet**, avec un
rechargement forcé (`Ctrl+Shift+R`). Vérifie dans la console :

```js
APP_VERSION                                                   // 1.8.0
JSON.parse(localStorage.getItem('ftr.lastRun'))               // version + compteurs
JSON.parse(localStorage.getItem('ftr.migHist'))               // transition 1.7.97 -> 1.8.0
JSON.parse(localStorage.getItem('ftr.stampGuard') || 'null')  // null attendu
JSON.parse(localStorage.getItem('ftr.quotaLog')  || 'null')   // null attendu
JSON.parse(localStorage.getItem('ftr.rebuildFail') || 'null') // null attendu
```

**Le point à regarder** : dans `ftr.migHist`, le champ `baisse`. S'il vaut `true`, un compteur acté a
diminué pendant la montée de version — **arrête-toi et dis-le moi**, `delta` dira quoi exactement.

Puis vérifie que tes 15 tournées sont là, montants inchangés, et que la page Compta s'ouvre normalement.

## 3. Publier la release (déclenche la mise à jour du S10)

GitHub → repo `Distribution-GaloPodo` → **Releases → Draft a new release** → tag **`v1.8.0`** → Publish.

Au lancement suivant, le S10 purge son cache et se met à jour tout seul.

---

## 4. Récupérer les données — APRÈS le déploiement, pas avant

Le déploiement n'a rien réparé : il a rendu la réparation possible et durable.

1. **Sur l'appareil le plus complet (le PC)**, Réglages → Synchro → récupération Drive.
2. Choisis une révision **antérieure au 14/07** → **« 🔍 Analyser »** → **« 🔎 Ce qui a DISPARU depuis
   cette version »**. Tu obtiens la liste exacte : chevaux, articles, paiements, lignes de facture.
3. Deux voies selon ce que tu lis :
   - **« ♻ Réinjecter »** sur une tournée précise — le plus chirurgical ;
   - **« 🐴 Fusionner les tournées (sans rien perdre) »** — remet ce qui manque sur toutes les
     tournées, sans supprimer ni dé-clôturer quoi que ce soit (corrigé au lot 4).
4. **Ne prends jamais « ⚠️ Tout remplacer »** pour récupérer des données. Il est là pour un vrai retour
   en arrière et il annule tout ce qui a été fait depuis.
5. Laisse la synchro propager vers le S10, puis **relance la comparaison sur le S10** pour vérifier.

> Les 451 € du 15/07 et les paiements du 14/07 ne reviendront **pas** par une révision récente : ils ont
> été perdus avant le 16/07. Il faut remonter à une révision **antérieure au 16/07 12h42**.

---

## 5. Si ça se passe mal — retour en arrière

Le déploiement est réversible **côté code** :

```bash
git revert -m 1 <hash-du-merge>   # annule le lot, garde l'historique
git push origin main
```
puis publier une release `v1.8.1` pour que les appareils redescendent.

Côté **données**, le retour se fait par la sauvegarde de l'étape 0 (Réglages → Sauvegarde → importer).

⚠️ Un point à connaître : `ftr.priceSnap` est posé sur les tournées clôturées dès le premier
démarrage en 1.8.0. Un retour en arrière du code le laisse en place — **sans effet**, l'ancienne
version l'ignore. Aucune donnée n'est perdue par ce biais.

---

## Ce que contient la version

| Lot | Effet | Tests |
|---|---|---|
| **1** | Les passes de démarrage ne réécrivent plus les tournées clôturées. Une référence d'empreintes perdue ne permet plus de ré-horodater tout le parc. Le cheval facturé par une planche ne disparaît plus de la facture. | 14 |
| **2** | Fin de l'échec silencieux (zone morte temporelle) qui déclenchait le re-horodatage de masse. Journal des démarrages, des purges de quota et des montées de version, avec détection des baisses d'entités actées. | 23 |
| **3** | Les tarifs sont figés à la clôture : une facture close n'est plus re-tarifée aux prix du jour. Annulations et encaissements continuent de fonctionner. | 21 |
| **4** | La restauration Drive fusionne au lieu de remplacer en bloc. Tombstones unis. Libellés qui ne poussent plus au geste destructeur. | 11 |
| **T1** | Comparer une révision Drive à l'état local et lister **ce qui a disparu**, jusqu'au cheval et à la ligne de facture. | 15 |

**Non inclus** : lot 5 (immutabilité par construction). Volontairement différé — il faut d'abord voir ce
que les traces du lot 2 remontent en conditions réelles, sinon on calibre à l'aveugle.
