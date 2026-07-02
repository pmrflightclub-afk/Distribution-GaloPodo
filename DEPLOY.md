# Déploiement — app installable + mises à jour auto

L'app est un site statique autonome (ce dossier). On l'héberge sur **GitHub Pages** (gratuit),
on l'installe sur le téléphone/tablette via **« Ajouter à l'écran d'accueil »**, et elle
**vérifie une nouvelle version au lancement**.

## 1. Créer le dépôt (une seule fois)

1. Sur GitHub : **New repository** → nom au choix (ex. `frais-tournee`) → **Public** → *sans* README.
2. Donne-moi l'URL (ex. `https://github.com/tonpseudo/frais-tournee`). Je pousse **uniquement**
   le contenu de ce dossier dedans (pas le reste du projet).

## 2. Activer GitHub Pages

Repo → **Settings → Pages** → *Build and deployment* : **Deploy from a branch** →
branche `main`, dossier `/ (root)` → **Save**. Au bout d'1-2 min, l'URL publique apparaît :
`https://tonpseudo.github.io/frais-tournee/`.

## 3. Installer sur le téléphone / la tablette

Ouvre cette URL dans **Chrome (Android)** ou **Safari (iOS)** → menu → **« Ajouter à l'écran
d'accueil »**. L'app s'ouvre ensuite plein écran, fonctionne hors-ligne.

## 4. Mises à jour automatiques

- Dans `app.js` : `APP_VERSION` (version installée) et `UPDATE_REPO = 'tonpseudo/frais-tournee'`.
- Au lancement, l'app interroge `releases/latest` du dépôt. Si la release est **plus récente**
  que `APP_VERSION`, elle **purge le cache et recharge** (mise à jour) ; sinon elle **s'ouvre
  normalement** (et si hors-ligne, elle s'ouvre normalement aussi).

### Publier une nouvelle version
1. Bump `APP_VERSION` (ex. `1.0.1`) + modifs.
2. Push sur `main`.
3. GitHub → **Releases → Draft a new release** → tag `v1.0.1` → **Publish**.
   → Au prochain lancement, les appareils installés se mettent à jour tout seuls.

> Astuce : le n° de version installée est affiché en bas de l'onglet **Réglages**.
