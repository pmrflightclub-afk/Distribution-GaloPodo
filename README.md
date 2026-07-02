# Frais de tournée — mini-app PWA

Petite application autonome (aucun serveur) pour paramétrer une tournée, calculer les **km réels** et
**répartir les frais de déplacement** (véhicule + carburant) sur chaque arrêt. Utilisable au téléphone.

## Modèle de calcul

Les tarifs de référence (€/km) **incluent déjà véhicule + carburant**, calibrés à un prix carburant de
référence (par défaut **1,80 €/L**). L'app réajuste selon le **prix du dernier plein** :

```
€/km_ajusté(type) = tarif_réf(type) + (conso ÷ 100) × (prix_dernier_plein − prix_réf)
```

- **Type par arrêt** : tournée / visite / urgence → base au km différente.
- **Client proche** : arrêt sous le seuil (km) → facturé au **forfait** (cas particulier).
- Le reste du kilométrage de la boucle (domicile → arrêts → domicile, retour inclus) est réparti sur les
  autres arrêts (parts égales ou au prorata du segment), puis divisé par le nombre de clients de l'arrêt.
- **Carburant réel** affiché à titre indicatif = km_total × (conso ÷ 100) × prix_dernier_plein.

## Cartographie (km réels)

Deux fournisseurs, réglables dans l'app :
- **OpenStreetMap public** (Nominatim + OSRM) — sans clé, usage léger (limité à ~1 requête/s, ToS OSM).
- **Geoapify** — avec clé API (quota gratuit ~3000/jour). Restreindre la clé par domaine dans le dashboard.

## Installer sur le téléphone

Une PWA a besoin d'une URL **HTTPS**. Trois options :

1. **Hébergement statique gratuit** (le plus simple) : déposer ce dossier sur GitHub Pages / Netlify / Vercel
   → ouvrir l'URL dans **Chrome (Android)** ou **Safari (iOS)** → menu **« Ajouter à l'écran d'accueil »**.
2. **Sur le VPS** : servir ce dossier en statique (route dédiée).
3. **APK** : empaqueter avec Capacitor si un vrai fichier d'installation est préféré.

## Test en local (ordinateur)

Servir le dossier (le protocole `file://` empêche le service worker) :

```bash
npx serve .        # ou : python -m http.server 8080
```

puis ouvrir `http://localhost:3000` (ou `:8080`).

## Fichiers

- `index.html` — interface (onglets Tournée / Réglages)
- `app.js` — logique (cartographie, calcul, répartition, persistance localStorage)
- `styles.css` — mise en page mobile (thème clair/sombre auto)
- `manifest.webmanifest` + `sw.js` + `icons/` — installation PWA et mode hors-ligne
