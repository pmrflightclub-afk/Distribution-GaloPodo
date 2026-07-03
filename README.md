# GaloPodo — PWA de tournées & facturation (maréchal / pareur)

Application autonome (aucun serveur, données locales) pour préparer des **tournées**, calculer les **km réels
routiers**, **répartir équitablement les frais de déplacement**, et **facturer** (déplacement + matériel +
articles) avec TVA. Installable sur téléphone / tablette / PC.

**Version : 1.1.4**

## Modèle de calcul

Tarif au km (HT) par type d'arrêt :

```
tarif(type) = base_véhicule + carburant_HT
            + (visite/urgence ? temps : 0) + (urgence ? supplément : 0)

base_véhicule = amortissement/km + Σ frais_véhicule/km
carburant_HT  = (conso ÷ 100) × prix_dernier_plein ÷ (1 + TVA)   # le plein est TVAC
temps         = prix_heure ÷ km_heure                            # visite & urgence
```

- **Boucle complète** mesurée par l'API : domicile → arrêts → domicile (aller **et** retour inclus).
- **Client proche** (mode « par client ») : sous le seuil → **forfait**, sorti du partage.
- Répartition du km restant : **parts égales** / **prorata segment** / **par client**.
- **Facture** par client › cheval, 3 blocs (Articles · Matériel · Déplacement), colonnes
  *Prix unitaire · Base HT · TVA · TTC*. Matériel facturé uniquement si **parage** effectué.
- **Remise** appliquée ligne par ligne, TVA recalculée sur le net (conforme Directive TVA 2006/112 art. 79).
- Tuiles : Total HT/TVA/TTC, **Provision charge véhicule** (base+carburant+forfaits) et **Marge réelle**
  (surplus temps/urgence).

## Cartographie (km réels)

- **OpenStreetMap public** (Nominatim + OSRM) — sans clé, usage léger (~1 req/s).
- **Geoapify** — avec clé API (quota gratuit), autocomplétion par champ.

## Sauvegarde / défauts

Réglages → **Sauvegarde / restauration** : export/import JSON de tous les réglages, articles, frais et données.
La **config usine** (`FACTORY_SETTINGS` dans `app.js`) fixe les valeurs par défaut au tout premier lancement.

## Installer

PWA servie en **HTTPS** (GitHub Pages) → Chrome (Android) / Safari (iOS) → **« Ajouter à l'écran d'accueil »**.
Test local : `python -m http.server 8080` puis `http://localhost:8080` (le service worker exige http/https, pas `file://`).

## Fichiers

- `index.html` — interface (Accueil · Tournées · Gestion · Stats · Réglages).
- `app.js` — logique (carto, calcul, répartition, facturation, persistance localStorage).
- `styles.css` — thème par variables, responsive.
- `manifest.webmanifest` + `sw.js` + `icons/` — installation PWA + hors-ligne.

Documentation complète : voir `HOT-SacreSabot/00 Developpement/GaloPodo/`.
