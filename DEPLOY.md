# Déploiement — GaloPodo (installable + mises à jour auto)

Site statique autonome (ce dossier), hébergé sur **GitHub Pages** (gratuit), installable en PWA,
avec **vérification de nouvelle version au lancement**.

Dépôt de distribution : **`pmrflightclub-afk/Distribution-GaloPodo`** (public).

## 1. Activer GitHub Pages (à faire une fois)

Repo **Distribution-GaloPodo** → **Settings → Pages** → *Build and deployment* :
**Source = « Deploy from a branch »** → branche **`main`**, dossier **`/ (root)`** → **Save**.
Au bout d'1–2 min : `https://pmrflightclub-afk.github.io/Distribution-GaloPodo/`.

> Si le déploiement « ne se fait pas » : c'est presque toujours que la **Source n'a pas été sauvegardée**
> (l'API `/pages` renvoie alors 404). Refaire l'étape ci-dessus et vérifier que la branche contient bien
> `index.html` **et le dossier `icons/`** à la racine.

## 2. Installer sur téléphone / tablette

Ouvrir l'URL dans **Chrome (Android)** ou **Safari (iOS)** → menu → **« Ajouter à l'écran d'accueil »**.

## 3. Mises à jour automatiques

- Dans `app.js` : `APP_VERSION` (version installée) et `UPDATE_REPO = 'pmrflightclub-afk/Distribution-GaloPodo'`.
- Au lancement, l'app interroge `releases/latest`. Si la release est **plus récente** que `APP_VERSION`,
  elle **purge le cache et recharge** ; sinon ouverture normale (hors-ligne compris).

### Publier une nouvelle version
1. Bump `APP_VERSION` (ex. `1.1.3`) + le nom du cache dans `sw.js`.
2. `git push` sur `main`.
3. GitHub → **Releases → Draft a new release** → tag `vX.Y.Z` → **Publish**.
   → Au prochain lancement, les appareils installés se mettent à jour tout seuls.

> Le n° de version installée est affiché en bas de l'onglet **Réglages**.
