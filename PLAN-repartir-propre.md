# Repartir sur des tournées propres — sans perdre clients ni réglages

> **Objectif** : effacer toutes les tournées, les refaire proprement, et remettre PC + S10
> d'accord via Drive. Tes **clients, chevaux, réglages, comptes, catalogue, provisions**
> sont **préservés** — seules les tournées (et leurs paiements/impayés/notes de crédit)
> sont remises à zéro.
>
> **Règle d'or** : on fait le ménage sur **UN SEUL appareil** (le PC), on le pousse sur Drive,
> et le S10 se met au diapason en tirant. Jamais les deux en même temps.

---

## Avant de commencer — trois conditions

1. **Les deux appareils sont en 1.8.0.** (Le PC l'est déjà. Pour le S10 : il faut avoir publié
   la release GitHub `v1.8.0`, puis ouvert l'app sur le téléphone pour qu'il se mette à jour.
   Vérifie en bas de l'onglet Réglages : la version doit afficher **1.8.0**.)
   → C'est indispensable : les tombstones et la fusion corrigée n'existent que depuis 1.8.0.

2. **Tu as sous les yeux de quoi refaire les tournées** : la sauvegarde de référence du 19/07,
   tes notes papier, ou l'app actuelle. **Note les montants et les actes de chaque tournée
   avant d'effacer** — une fois effacé, tu redessines à partir de ta mémoire / tes notes.

3. **Le S10 est fermé** (pas juste en arrière-plan — vraiment fermé) pendant les étapes 1 à 3.
   On le réveillera à l'étape 4.

---

## Étape 0 — Photographier l'existant (5 min, sur le PC)

Avant tout effacement, garde une trace complète :

- **Réglages → Sauvegarde → ⬇️ Télécharger** → range le fichier dans `_SAUVEGARDES-PROTEGEES/`
  avec un nom clair, ex. `AVANT-remise-a-zero-2026-07-XX.json`.
- Ouvre chaque tournée et **note sur papier** : date, clients, chevaux, actes, articles, montant,
  mode de paiement. C'est ta feuille de route pour les refaire.

> `resetTestTournees` télécharge **aussi** une sauvegarde automatique juste avant d'effacer.
> Tu auras donc deux filets. Mais celui-ci est le tien, nommé et rangé.

---

## Étape 1 — Effacer les tournées (sur le PC uniquement)

1. **Réglages → Synchro → « 🧪 Réinitialiser les tournées de test »**
2. Lis la confirmation : elle liste le nombre de tournées supprimées et **ce qui est préservé**
   (clients, réglages, comptes, rappels, charges, catalogue, provisions). Confirme deux fois.
3. L'app télécharge une sauvegarde de sécurité, efface les tournées, **pose les tombstones**
   (les marqueurs qui diront au S10 : « ces tournées sont supprimées, ne les fais pas revenir »),
   et nettoie les données liées (impayés, notes de crédit, encaissements, verrous de mois).

**Vérifie** : l'accueil ne montre plus aucune tournée. Tes clients et réglages sont intacts.

---

## Étape 2 — Pousser l'effacement sur Drive (PC)

La suppression n'est pour l'instant que sur le PC. Il faut l'envoyer au coffre :

- **Accueil → Déclarer → « 🔄 Synchroniser (Google Drive) »**
  (ou Réglages → Synchro → « Synchroniser »).
- Attends le message de succès.

À ce stade, le **coffre Drive** contient : tes clients + réglages intacts, **zéro tournée**,
et les **tombstones** de toutes les tournées supprimées.

---

## Étape 3 — Mettre le S10 au diapason

1. **Ouvre l'app sur le S10** (rappel : il doit être en 1.8.0).
2. **Synchronise-le** : Accueil → Déclarer → « 🔄 Synchroniser ».
3. Le S10 télécharge le coffre, voit les tombstones, **efface ses tournées à son tour**.
   Ses clients et réglages ne bougent pas.

**Vérifie sur le S10** : plus aucune tournée, clients et réglages intacts.

> ⚠️ **Le point qui compte** : ne recrée **aucune** tournée sur le S10 tant que cette étape 3
> n'est pas faite. Si le S10 avait encore ses anciennes tournées et que tu en créais une
> nouvelle avant de synchroniser, la fusion pourrait faire revivre les anciennes. Une fois
> les deux appareils à zéro et synchronisés, tu es sur une base saine.

---

## Étape 4 — Point de contrôle : les deux appareils à zéro

Avant de recréer quoi que ce soit, confirme :

| | PC | S10 |
|---|---|---|
| Tournées | 0 | 0 |
| Clients | intacts | intacts |
| Réglages / catalogue | intacts | intacts |

Si les deux colonnes sont bonnes, la base est propre et partagée. Tu peux recréer.

---

## Étape 5 — Refaire les tournées, proprement

Recrée chaque tournée **sur un seul appareil à la fois** (le plus simple : tout sur le PC, ou
tout sur le S10 — évite de saisir la même tournée en parallèle sur les deux).

Pour chaque tournée, dans l'ordre chronologique :
1. Crée la tournée à sa date, ajoute les clients et leurs chevaux.
2. Coche les actes réellement faits (parage, visite, etc.), ajoute les articles.
3. Le jour venu de la refaire « comme si » : **💶 Paiement** sur chaque client — choisis le mode
   (Liquide / Virement / Facture) et saisis le montant reçu. **C'est ici que tu classes
   proprement les paiements**, y compris les 451 € du 15/07 qui n'avaient jamais été saisis.
4. Quand tout est bon, **clôture** la tournée. À la clôture, 1.8.0 **fige les tarifs** : elle
   ne pourra plus jamais être re-tarifée toute seule.
5. **Synchronise** après chaque poignée de tournées (pas besoin après chacune, mais régulièrement).

> Tu peux t'aider du bouton **« 🔎 Ce qui a DISPARU depuis cette version »** (Réglages → Synchro →
> récupération Drive → Analyser une vieille version) pour **relire** ce que contenait une tournée
> d'origine — en lecture seule, ça ne réinjecte rien. Pratique pour vérifier un montant.

---

## Étape 6 — Synchro finale et vérification croisée

1. Sur l'appareil où tu as tout saisi : **Synchronise**.
2. Sur l'autre appareil : **Synchronise**.
3. Compare : les deux doivent montrer **le même nombre de tournées, les mêmes montants**.
4. Ouvre **Compta** sur les deux : les totaux doivent être identiques.

À partir de là, PC et S10 sont réellement à jour et cohérents.

---

## Si quelque chose cloche

- **Une ancienne tournée réapparaît** → c'est qu'un appareil n'était pas synchronisé à l'étape 3,
  ou pas en 1.8.0. Refais l'étape 3 sur cet appareil. Le tombstone est toujours dans le coffre,
  il finira par l'emporter.
- **Un doute** → tu as la sauvegarde de l'étape 0 : Réglages → Sauvegarde → « 📥 Données seules »
  (récupère tournées + clients en gardant tes réglages actuels). Réversible.
- **Le S10 refuse de se mettre à jour** → ferme-le complètement, rouvre-le ; s'il n'est pas en
  1.8.0, c'est que la release GitHub `v1.8.0` n'a pas été publiée (voir `DEPLOIEMENT-v1.8.0.md`).

---

## Ce que cette remise à zéro règle définitivement

- Plus de paiements « à classer » impossibles à saisir : tu les classes à la création, avant clôture.
- Plus de factures amputées : tu repars de tournées complètes.
- Plus de divergence PC / S10 : les deux repartent du même coffre propre.
- Les corruptions du passé (500 € effacés, chevaux disparus, tournées incohérentes) sont
  remplacées par des tournées saisies proprement — et 1.8.0 empêche que ça recommence.
