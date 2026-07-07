/* Frais de tournée — mini-app PWA autonome (clients + chevaux + tournées Réglage/Rapport)
 * Modèle repris de Servos/SerMob (packages/shared/clientele.ts) + TVA :
 *   - km réels routiers via API (Geoapify OU Nominatim+OSRM public) + autocomplétion par champ
 *   - carburant à la pompe = TVAC ; tarifs par type = HTVA : véhicule HT + carburant HT (pompe ÷ (1+TVA))
 *   - sur la tournée on applique la TVA (taux réglable) -> HT + TVA + TTC
 *   - déplacement facturé = provision charges véhicule (base+carburant+forfait) + marge réelle (surplus temps/urgence)
 *   - seuil = "client proche" (auto, distance routière) -> forfait ; boucle complète (retour inclus)
 *   - répartition parts égales | prorata | par client ; écurie partagée -> frais / nb clients ; /cheval
 * Stockage local (localStorage), aucun serveur.
 */
'use strict';

// ---------- Version & mise à jour ----------
const APP_VERSION = '1.1.26';
const UPDATE_REPO = 'pmrflightclub-afk/Distribution-GaloPodo'; // dépôt GitHub des releases (vérif MAJ au lancement)
// Journal des versions (message de passage de version). Concis : quelques puces max par version.
const CHANGELOG = [
  {
    version: '1.1.26', date: '2026-07-07',
    ajouts: [
      'Auto-clôture : une tournée démarrée mais oubliée se clôture automatiquement 3 h après l\'heure d\'arrivée (validation du dernier arrêt + temps de retour réel/estimé). Notée « clôturée automatiquement · HH:MM ».',
      'Temps de travail : les clients « proche » (forfait seuil) ne se voient plus imputer de temps de trajet retour — le retour est réparti sur les autres clients, comme la facturation des km.',
    ],
  },
  {
    version: '1.1.25', date: '2026-07-07',
    ajouts: [
      'Suppression d\'une tournée : ses impayés liés sont maintenant correctement retirés — la créance née de cette tournée disparaît, et un impayé qu\'elle avait encaissé redevient « à percevoir ». (La facture et les stats disparaissaient déjà.) Le suivi Compta et l\'événement d\'agenda récupéré sont aussi nettoyés.',
    ],
  },
  {
    version: '1.1.24', date: '2026-07-07',
    ajouts: [
      'Compta réorganisée en 4 sections d\'encaissement : Liquide (globalisé) · Virements · Facture pro (liquide) · Facture pro (virement). Une facture peut donc être payée en liquide OU en virement.',
      'Nouveau sous-onglet Compta « Tournée à venir » (1ʳᵉ position) : liste les clients dont le paiement n\'est pas encore renseigné ; ils en sortent automatiquement une fois classés.',
    ],
  },
  {
    version: '1.1.23', date: '2026-07-07',
    ajouts: [
      'Connexion Google : une seule fenêtre de validation (Drive + Agenda partagent la même demande — fini la double sélection de compte).',
      'Navigation : quand Waze est choisi, Google Maps ne s\'ouvre plus en même temps (repli seulement si Waze est absent).',
      'Éditeur : la case Heure ne déborde plus de l\'arrêt.',
      'Compta : l\'onglet « Impayés » est désormais en 2ᵉ position (entre « Mois en cours » et « Déclaration compta »).',
      'Agenda : les « Journées récupérées » ont leur propre sous-onglet « Récupération ».',
    ],
  },
  {
    version: '1.1.22', date: '2026-07-05',
    ajouts: [
      'Compta : un arrêt dont le paiement n\'est pas renseigné n\'est plus compté comme « facture » — il apparaît dans une nouvelle section « À classer » (à renseigner via 💶 Paiement, ou le menu Mode). La facture n\'est comptée que si vous cochez « Facture nécessaire ».',
      'Agenda → Items : les « Journées récupérées » (créer/ouvrir la tournée) s\'affichent maintenant en 1ʳᵉ position sur cette page (déplacées depuis Réglages → Calendrier).',
      'Bandeau : widgets Clients / Chevaux / Tournées sur une 2ᵉ ligne, centrés (libellés raccourcis, « Chevaux » corrigé).',
      'Un client créé lors de la récupération d\'un événement (sans cheval) récupère automatiquement ses chevaux dans la tournée dès que vous les ajoutez à sa fiche.',
    ],
  },
  {
    version: '1.1.21', date: '2026-07-05',
    ajouts: [
      'Compta → nouveau sous-onglet « Impayés » : section « En attente de paiement » (tous les restes reportés) + section « Régularisation » (impayés repris et encaissés lors d\'une visite suivante → statut « paiement reçu »). Le passage de l\'un à l\'autre est automatique quand une facture reprend l\'impayé.',
    ],
  },
  {
    version: '1.1.20', date: '2026-07-05',
    ajouts: [
      'Fiche cheval : nouveau champ « Date de prise en charge » (par cheval).',
      'Stats → Analyse financière par cheval : affiche la durée de suivi depuis la prise en charge (« N mois », et au-delà d\'un an « 1 an et N mois »).',
    ],
  },
  {
    version: '1.1.19', date: '2026-07-05',
    ajouts: [
      'Réduction couplée au paiement liquide : quand un client paie en liquide, une réduction (20% par défaut) est appliquée automatiquement aux lignes éligibles (cases « Remise », dont le parage par défaut) et la facture est recalculée en direct. Elle ne s\'applique jamais en virement ni en facture — impossible d\'oublier.',
      'Nouveau réglage : Gestion → Articles → section « Réduction » (pourcentage réglable). Dans la fenêtre de paiement, le total se met à jour dès que vous choisissez « Liquide ».',
    ],
  },
  {
    version: '1.1.18', date: '2026-07-05',
    ajouts: [
      'Statut actif / inactif pour les clients ET les chevaux (case à cocher dans la fiche client). Les inactifs passent en fin de liste (grisés) et ne sont plus ajoutés automatiquement aux nouvelles tournées.',
      'Bandeau : nouveaux widgets nombre de clients actifs, chevaux actifs, et tournées du mois (sous ⛽/🚗/🗓).',
      'Analyse financière par cheval : détail par date pour chaque section (Articles, Matériel, Déplacement) — chaque ligne facturée est listée avec sa date.',
      'Planning : chaque case n\'affiche que les 3 premiers rendez-vous (+N autres) ; cliquez un jour pour voir le détail complet dans une fenêtre, avec navigation jour précédent/suivant et sélecteur de date.',
    ],
  },
  {
    version: '1.1.17', date: '2026-07-05',
    ajouts: [
      'Agenda → nouveau sous-onglet « Planning » (en 1ʳᵉ position) : agenda mensuel complet, 7 colonnes (jours de la semaine) × semaines, affichant par heure les rendez-vous privés et les RDV chevaux/clients des tournées. Navigation mois précédent / suivant / choix du mois (mois en cours par défaut).',
      'Listes de tournées (Accueil + page Tournées) : les noms de clients de chaque arrêt s\'affichent en plus de la date, du nombre d\'arrêts, des km et du montant TTC.',
    ],
  },
  {
    version: '1.1.16', date: '2026-07-05',
    ajouts: [
      'RDV : la date proposée par défaut est maintenant le MÊME JOUR de la semaine, 5 semaines plus tard.',
      'Réglages → Calendrier : nouvelle section « Programmation des RDV » pour régler le délai (semaines) et, en option, imposer un jour de la semaine pour la date proposée.',
    ],
  },
  {
    version: '1.1.15', date: '2026-07-05',
    ajouts: [
      'Heure de RDV par cheval : une colonne « Heure RDV » dans chaque arrêt (par cheval, par client) ; l\'heure s\'affiche dans le Trajet du jour.',
      'Items d\'agenda récupérés : l\'horaire de l\'événement est repris automatiquement comme heure de RDV des chevaux dans la tournée (client connu ou nouveau).',
      'Agenda privé : bouton « Agenda privé » sur chaque item (l\'événement quitte la liste et rejoint votre agenda perso). Une section « Agenda privé du jour » apparaît dans le Trajet du jour (Accueil).',
      'Bouton « 📅 RDV » dans le paiement : programmez la prochaine visite du client. Un ou plusieurs RDV, chevaux au choix par RDV ; pour chaque date, aperçu des arrêts déjà prévus et de l\'agenda privé du jour. Les tournées sont créées si besoin, sinon le client/cheval est ajouté.',
    ],
  },
  {
    version: '1.1.14', date: '2026-07-05',
    ajouts: [
      'Réduction articles par ligne : chaque article (et la ligne « Parage et équilibrage ») a maintenant une case « Remise » dans l\'éditeur. Cochée = la réduction du client s\'applique à cette ligne ; décochée = ligne au prix plein. Cochée par défaut (le parage est remisé quand il est actif). La réduction reste une seule réduction par client (pas de cumul par article).',
      'La ligne Parage apparaît désormais dans la liste des articles de l\'arrêt (auto, non supprimable — elle suit les cases Parage des chevaux), avec sa propre case Remise.',
      'Les impayés (créances reportées) ne sont jamais remisés.',
    ],
  },
  {
    version: '1.1.13', date: '2026-07-05',
    ajouts: [
      'Case « Infection » : elle réapparaît à côté de Fourbure et NPAS dans chaque arrêt (un prix par défaut lui est attribué ; réglable dans Réglages → Calcul). Elle était masquée tant qu\'aucun prix n\'était défini.',
      'Synchro plus complète : l\'adresse de départ (domicile), le carnet « Mes adresses » et le statut « changelog lu » sont désormais conservés/fusionnés entre appareils (jamais écrasés par un appareil qui les avait vides).',
    ],
  },
  {
    version: '1.1.12', date: '2026-07-05',
    ajouts: [
      'Paiement de l\'arrêt (liquide) clarifié en 3 champs : « Montant décimal rectifié » (le total arrondi à l\'euro que vous encaissez — plus de décimale ; la différence +/− passe en facture) ; « Montant impayé » (à l\'euro, quand paiement partiel est coché) ; « Montant réellement reçu » (calculé automatiquement = rectifié − impayé, non modifiable).',
      'Chacun de ces montants est repris partout : facture, ticket, récap et stats (arrondi caisse, impayé/créance et montant réellement reçu).',
    ],
  },
  {
    version: '1.1.11', date: '2026-07-05',
    ajouts: [
      'Connexion Google conservée entre les redémarrages : le jeton est mémorisé (il dure ~1 h). Tant qu\'il est valide, rouvrir l\'app resynchronise Drive et Agenda en silence, sans redemander la connexion. (Après une longue fermeture, une reconnexion reste demandée — limite Google côté navigateur.)',
      'Une seule connexion pour tout : le même clic « Connecter » couvre désormais Drive ET Agenda (plus deux autorisations séparées).',
    ],
  },
  {
    version: '1.1.10', date: '2026-07-05',
    ajouts: [
      'Synchro cohérente des items d\'agenda : les items « Récupéré » et « Inactif » cochés sur un appareil sont désormais conservés sur l\'autre après synchro (fusion par union — un item fait quelque part reste fait partout ; ils ne repassent plus par défaut).',
      'Réglages → Synchro : deux modes exclusifs avec case « Mode actif ». Activer l\'un désactive l\'autre (par défaut : « Synchronisation multi-appareils » par fichier). Quand « Synchro Drive » est active, la section fichier est grisée ; en mode fichier, la synchro Drive automatique est en veille (l\'Agenda reste utilisable).',
      'Bouton « 🔄 Synchroniser (Google Drive) » ajouté en dernière position dans « Déclarer un événement » (Accueil) : synchro manuelle immédiate quand l\'app est déjà ouverte (mode Drive).',
    ],
  },
  {
    version: '1.1.9', date: '2026-07-05',
    ajouts: [
      'Agenda → Items : les deux cases à cocher sont remplacées par deux boutons « Récupérer » et « Inactif » (plus faciles à viser).',
      '« Récupérer » : croise l\'événement avec vos clients (nom, prénom, société, cheval) et propose de lier un client connu OU d\'en créer un nouveau (le nom est pré-rempli avec le titre de l\'événement, à corriger si besoin). Puis crée la tournée du jour si elle n\'existe pas encore, sinon ajoute le client à la tournée déjà prévue (en cours ou à venir). L\'item quitte alors la liste.',
      'Plus de renvoi vers la page d\'authentification Google pendant la navigation : les synchros automatiques (agenda / Drive) n\'utilisent que le jeton déjà obtenu et n\'ouvrent plus jamais d\'écran de connexion en cours d\'usage.',
    ],
  },
  {
    version: '1.1.8', date: '2026-07-05',
    ajouts: [
      'Changement d\'adresse (client ou cheval) dans Gestion : les tournées EN COURS et À VENIR se réactualisent automatiquement (l\'arrêt suit la nouvelle adresse) ; les tournées clôturées restent figées.',
      'Agenda Google : rafraîchissement automatique et silencieux à l\'ouverture de l\'app et à chaque passage sur l\'onglet Agenda (plus besoin de « Rafraîchir » à la main).',
      'Google Drive : envoi automatique de vos modifications vers le coffre après chaque changement (fusion sûre — ne perd pas les modifs de l\'autre appareil), en plus de la synchro à l\'ouverture.',
    ],
  },
  {
    version: '1.1.7', date: '2026-07-05',
    ajouts: [
      'Sous-onglets « Sauvegarde » et « Changelog » dans Réglages.',
      'Bouton « Clôturer la tournée » (fige la tournée), en plus de la clôture auto par date.',
      'Nom de tournée + date en toutes lettres dans les listes (ex. « jeudi 6 novembre : Mons »).',
      'Bouton « Changer l\'arrivée » (adresse d\'arrivée distincte du départ).',
      'Bouton « Article » dans chaque arrêt (déjà couplé au client de l\'arrêt) ; modale « article connu / nouvel article ».',
      'Case « Infection » (comme Fourbure/NPAS) + tarif dédié dans les forfaits pathologiques.',
      'Numéro de version affiché dans le bandeau.',
      'Bouton pour activer/désactiver le réordonnancement des cases (fini les déplacements involontaires au défilement).',
      'Navigation GPS : le bouton ouvre l\'app installée (Waze par défaut, repli Google Maps si Waze absent) ; choix Waze/Google Maps dans Réglages → GPS.',
      'Bouton « Route » (Trajet du jour ET éditeur) : encoder le temps de trajet RÉEL ; repris automatiquement dans le SMS, le récap, le ticket et les stats (l\'estimé reste conservé). Boutons Waze + Route par arrêt dans l\'éditeur.',
      'Stats : nouvelle carte « Temps de trajet — estimé vs réel » (arrêts sans temps réel signalés).',
      'Suivi du temps de travail : « Démarrer la tournée » + « Valider l\'arrêt » + étape « Retour » (Waze + Route + Clôturer) → Stats « Temps de travail » (route + visite mesurée + retour réparti en parts égales) par client et par cheval.',
      'Paiement par arrêt (à la validation) : liquide / virement + « facture nécessaire » ; si liquide, saisie du montant réellement payé → ligne « Arrondi caisse » (facture, récap, ticket) et montant réel repris dans les stats.',
      'Gestion → Compta (mensuelle) : 3 sections Liquide (postes globalisés, sans nom) · Virements · Factures pro, avec totaux HT/TVA/TTC, sélecteur de mois, statut « en attente / comptabilité encodée » par mois archivé, et fiche PDF imprimable par section. Suivi « paiement reçu » par client (virements/factures) → impayés signalés.',
      'Synchro multi-appareils (Réglages → Synchro) : mode Fichier (export/import avec FUSION, sans compte) ET Google Drive automatique — chacun renseigne SON propre ID client Google (rien de partagé), connexion unique puis silencieuse.',
      'Onglet Agenda (Google Calendar) : entre Accueil et Tournées, affiche directement les Items (coche « Récupérer », lié à un client connu ou création). Case « Actif » pour retirer un événement → section « Inactifs ». La vue « Calendrier » (jours + « Créer la tournée ») est passée dans Réglages → Calendrier. Nécessite l\'ID client Google.',
      'Archivage automatique des tournées clôturées > 4 semaines (allège l\'app ; toujours dans Archives et incluses dans les stats).',
    ],
    corrections: [
      'Durées unifiées partout : moins d\'1h → minutes, à partir d\'1h → « 1h30 » (trajets, temps de travail, stats, SMS, saisie Route avec aperçu en direct).',
      'Thème : couleurs enfin fidèles sur téléphone/iOS (les pastilles et boutons ne prennent plus le style système gris) ; l\'app impose ses couleurs quel que soit le mode sombre du téléphone.',
      'Google : aide « Cloud Console » clarifiée (avec lien direct) ; un seul ID client active Drive ET Agenda, au choix (indépendants).',
      'Compta : toute tournée calculée y apparaît (avant, seules les tournées avec paiement enregistré comptaient) ; non classé → « Factures » par défaut. Bouton « 💶 Paiement » ajouté dans l\'éditeur pour classer n\'importe quelle tournée.',
      'Stats « Km & heures » : temps RÉEL par cheval quand la tournée a été suivie (Démarrer→Clôturer), sinon estimé ; toutes les tournées (clôturées, du jour, à venir, archivées).',
      'Réglages : sous-onglets réordonnés (Configuration · Synchro · GPS · Service · Calcul · Analyse · Thème · Changelog · Sauvegarde).',
      'Bandeau : numéro de version déplacé sous le logo (à gauche), en petit, sans réduire le logo.',
      'Compta : virement/facture se gèrent dans la Compta (menu « Mode » par client, écrit dans la tournée) — utile car ces paiements arrivent après la clôture ; statut « reçu » par paiement (impayés signalés).',
      'Stats : nouvelle section « Analyse financière par cheval » (avec le nom du client).',
      'Suppression : confirmation systématique avant de supprimer un client, un cheval, un arrêt, un article, un frais ou du matériel.',
      'Éditeur de tournée : la carte du trajet est placée juste au-dessus des arrêts.',
      'Compta : bouton PDF corrigé (impression via le navigateur, ne ferme plus l\'app). Compta et Agenda déplacés en onglets principaux.',
      'Paiement partiel liquide : option « reste à percevoir » (montant encaissé + reste). Le reste n\'est PAS une remise (créance). Reporté → ligne « Impayé du … » ajoutée automatiquement à la prochaine tournée du client ; ou demandé en virement (suivi en Compta). Repris dans facture, ticket, récap et stats.',
      'Clôture sécurisée : impossible de clôturer une tournée tant qu\'un client n\'a pas de mode de paiement (virement/liquide, aucun présélectionné par défaut) — en liquide, le montant encaissé est obligatoire. Message de blocage dans l\'éditeur.',
      'Compta en 2 sous-onglets : « Mois en cours » (live : classement des paiements + suivi des reçus, sans démarche) et « Déclaration compta » (mois archivés empilés, avec filtre Mois / Trimestre / Semestre / Année + total de plage + PDF par mois). La démarche comptable n\'est validable qu\'une fois le mois terminé (à partir du 1ᵉʳ du mois suivant).',
      'Compta : mois en cours (paiements reçus gérables, sans démarche) vs mois archivé (validation des démarches — liquide 1 pour le mois, virement/facture 1 par client — qui grise et verrouille l\'élément traité). PDF corrigé (plus de page vide) : liquide = postes globalisés ; virements & factures = détail par client ET par cheval.',
      'Compta : statut « paiement reçu » par client (facture & virement, suivi payé/impayé) et statut « démarche comptable » par section (en attente / effectuée), indépendants, disponibles pour tous les mois.',
      'Facture : l\'arrondi caisse (liquide) apparaît en dernière ligne d\'article et corrige le total (facture, ticket, stats). Parage & Équilibrage en 1ʳᵉ position des articles.',
      'Client proche : la ligne « forfait » affiche le km du seuil (ex. 15 km) et ce km est compté dans les stats par client/cheval.',
      'Tournée clôturée : boutons Waze / Route / Paiement masqués dans les arrêts (le paiement se classe dans la Compta).',
      'Correctifs téléphone : logo et n° de version réaffichés (masqués par erreur sur petit écran) ; couleur du bandeau/thème bien appliquée sur iOS (le sélecteur natif émettant « change ») ; le mode sombre du système ne teinte plus l\'app (color-scheme). Sous-onglets Réglages : Synchro · Sauvegarde · Changelog (en dernier).',
      'Trajet du jour : nom du client d\'abord, adresse en dessous ; la tournée du jour apparaît en 1ʳᵉ ligne.',
      'Tournée clôturée réellement figée (changer départ, articles, suppression bloqués).',
      'Palette de couleurs : contours de pastilles visibles, couleur personnalisée indiquée comme sélectionnée.',
      'Catalogue par défaut : article « Parage & Équilibrage » retiré (doublon de la section dédiée).',
    ],
  },
];
function isNewerVersion(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x > y) return true; if (x < y) return false; }
  return false;
}
// Au lancement : vérifie la dernière release GitHub. Si plus récente → purge + recharge (MAJ). Sinon → ouverture normale.
async function checkForUpdate() {
  if (!UPDATE_REPO) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    const latest = String(j.tag_name || '').replace(/^v/i, '');
    if (latest && isNewerVersion(latest, APP_VERSION) && sessionStorage.getItem('ftr.updated') !== latest) {
      sessionStorage.setItem('ftr.updated', latest); // anti-boucle
      if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((x) => x.unregister())); }
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
      location.reload();
    }
  } catch { /* hors-ligne / API indisponible → ouverture normale */ }
}

// ---------- Persistance ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
const uid = () => 'id' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

// ---------- Brouillons : mémoire par formulaire/modale des saisies non encore enregistrées ----------
// Clé par page/modale. Effacer un brouillon ne touche pas les autres.
const DRAFTS = {
  KEY: 'ftr.drafts',
  all() { return LS.get(this.KEY, {}); },
  get(k) { const d = this.all()[k]; return d ? d.data : null; },
  set(k, data) { const a = this.all(); a[k] = { data, ts: Date.now() }; LS.set(this.KEY, a); },
  clear(k) { const a = this.all(); if (a[k] !== undefined) { delete a[k]; LS.set(this.KEY, a); } },
  has(k) { return this.all()[k] !== undefined; },
};

// ---------- Adresses structurées ----------
const emptyAddr = () => ({ rue: '', numero: '', cp: '', localite: '', lat: null, lon: null });
function toAddr(x) { if (!x) return emptyAddr(); if (typeof x === 'string') return Object.assign(emptyAddr(), { rue: x }); return Object.assign(emptyAddr(), x); }
function addrStr(a) { a = toAddr(a); const l1 = [a.rue, a.numero].filter(Boolean).join(' '); const l2 = [a.cp, a.localite].filter(Boolean).join(' '); return [l1, l2].filter(Boolean).join(', '); }

const DEFAULTS = {
  provider: 'osm', geoapifyKey: '',
  home: emptyAddr(),
  consoL100: 9, prixPleinL: 2.0, tvaRate: 21,
  accentColor: '#e8722a',                      // couleur des boutons — orange par défaut
  topbarColor: '',                             // couleur du bandeau principal (vide = suit accentColor)
  navBarColor: '',                             // couleur de fond de la barre d'onglets (vide = couleur carte)
  appBg: '#0d0d0d',                            // fond de l'app (sombre) — noir par défaut, réglable
  logoBg: 'transparent',                       // fond derrière le logo (transparent/blanc/noir/couleur)
  smsTemplate: 'Bonjour {client}, je passe aujourd\'hui pour {cheval}. J\'arrive dans environ {trajet}. À tout de suite !',
  frais: [],                                   // frais véhicule : {id, poste, nature:'recurrent'|'exceptionnel', montantHT, kmPrevus, kmDebut}
  amortissement: { achatHT: 0, dureeVieKm: 0 },// achat & amortissement (réglé une fois)
  tempsKm: 0, urgenceSuppKm: 0.16,             // supplément urgence €/km
  prixHeure: 10, kmHeure: 75,                  // temps de déplacement = prix/heure ÷ km/heure
  materiel: [],                                // matériel : {id, libelle, montantHT} (base/cheval = Σ)
  fourbureHT: 0, npasHT: 0, infectionHT: 0,     // forfaits pathologie ajoutés par cheval (option B)
  parage: { prixHT: 0, tvaPct: 21 },            // article « Parage et équilibrage » (coché par cheval)
  articlesCatalogue: [],                        // catalogue réutilisable : {id, libelle, prixHT, tvaPct}
  navApp: 'waze',                               // application GPS : 'waze' (défaut) | 'gmaps'
  googleClientId: '',                           // ID client OAuth Google PROPRE à chaque utilisateur (aucune clé codée en dur)
  googleAutoSync: false,                        // synchro Drive automatique à l'ouverture
  pays: 'be',                                   // pays (TVA) : 'be' | 'fr'
  seuilKm: 20, forfait: 15,
  repartition: 'egal', rayonMemeEcurieKm: 1, roadFactor: 1.30, vitesseKmh: 90,
  dureeAuto: false,                             // durée : true = service de carte ; false = km ÷ vitesse moyenne
  seuilTarifType: 'tournee',                    // type de tarif pour le déplacement indicatif au seuil
  adresses: [],                                // carnet d'adresses de départ : {id, nom, addr}
  statOrder: [],                               // ordre personnalisé des tuiles de la page Stats
  analyticOrder: [],                           // ordre personnalisé des cases Analytique (tournée)
  tileLabels: {},                              // titres personnalisés des cases (stats + analytique)
  changelogRead: [],                           // versions dont le message de nouveautés a été « marqué comme lu »
  syncMode: 'file',                            // mode de synchro ACTIF (exclusif) : 'file' (multi-appareils par fichier, défaut) | 'drive' (Google Drive)
  rdvDelaiSemaines: 5,                          // proposition RDV : délai par défaut (semaines) — même jour de la semaine
  rdvJourSemaine: '',                          // proposition RDV : jour de la semaine imposé ('' = même jour ; 0=dim..6=sam, JS getDay)
  reducLiquide: 20,                            // réduction (%) appliquée AUTOMATIQUEMENT aux lignes éligibles quand le paiement est en LIQUIDE
};
const _hadSettings = localStorage.getItem('ftr.settings') != null; // 1er lancement ? (pour la config usine)
let S = Object.assign({}, DEFAULTS, LS.get('ftr.settings', {}));
S.frais = Array.isArray(S.frais) ? S.frais : [];
S.materiel = Array.isArray(S.materiel) ? S.materiel : [];
S.articlesCatalogue = Array.isArray(S.articlesCatalogue) ? S.articlesCatalogue : [];
S.amortissement = Object.assign({ achatHT: 0, dureeVieKm: 0 }, S.amortissement || {});
if (typeof S.tempsKm !== 'number') S.tempsKm = 0;
if (typeof S.urgenceSuppKm !== 'number') S.urgenceSuppKm = 0;
if (typeof S.fourbureHT !== 'number') S.fourbureHT = 0;
if (typeof S.npasHT !== 'number') S.npasHT = 0;
if (typeof S.infectionHT !== 'number') S.infectionHT = 0;
S.changelogRead = Array.isArray(S.changelogRead) ? S.changelogRead : [];
if (!S.comptaStatus || typeof S.comptaStatus !== 'object') S.comptaStatus = {}; // { 'YYYY-MM': { liquide, virement, facture } }
if (!S.comptaRecu || typeof S.comptaRecu !== 'object') S.comptaRecu = {};       // { 'tourId:clientId': true } — paiement reçu (virement/facture)
if (!S.comptaDemarche || typeof S.comptaDemarche !== 'object') S.comptaDemarche = {}; // { 'tourId:clientId': true } — démarche comptable effectuée (mois archivé)
S.parage = Object.assign({ prixHT: 0, tvaPct: 21 }, S.parage || {});
if (!S.pays) S.pays = 'be';
if (S.navApp !== 'gmaps') S.navApp = 'waze';
if (typeof S.googleClientId !== 'string') S.googleClientId = '';
if (typeof S.googleAutoSync !== 'boolean') S.googleAutoSync = false;
if (S.syncMode !== 'drive') S.syncMode = 'file'; // défaut = mode fichier (section 1)
if (typeof S.rdvDelaiSemaines !== 'number' || S.rdvDelaiSemaines < 1) S.rdvDelaiSemaines = 5;
if (typeof S.rdvJourSemaine !== 'string') S.rdvJourSemaine = (S.rdvJourSemaine == null ? '' : String(S.rdvJourSemaine));
if (typeof S.reducLiquide !== 'number' || S.reducLiquide < 0) S.reducLiquide = 20;
if (!S.agendaImported || typeof S.agendaImported !== 'object') S.agendaImported = {}; // { eventId: {clientId, title, start, location} }
if (!S.agendaInactive || typeof S.agendaInactive !== 'object') S.agendaInactive = {}; // { eventId: true } — items masqués (section Inactifs)
if (!S.agendaPrive || typeof S.agendaPrive !== 'object') S.agendaPrive = {}; // { eventId: {title, day, start, location} } — agenda privé (perso, non facturé)
if (!S.accentColor) S.accentColor = '#e8722a';
if (typeof S.topbarColor !== 'string') S.topbarColor = '';
if (typeof S.navBarColor !== 'string') S.navBarColor = '';
if (typeof S.smsTemplate !== 'string') S.smsTemplate = DEFAULTS.smsTemplate;
if (!S.appBg) S.appBg = '#0d0d0d';
if (!S.logoBg) S.logoBg = 'transparent';
S.home = toAddr(S.home && S.home.adresse !== undefined ? { rue: S.home.adresse, lat: S.home.lat, lon: S.home.lon } : S.home);
if (typeof S.tvaRate !== 'number') S.tvaRate = 21;
if (typeof S.dureeAuto !== 'boolean') S.dureeAuto = false;
if (typeof S.vitesseKmh !== 'number' || !S.vitesseKmh) S.vitesseKmh = 90;
S.statOrder = Array.isArray(S.statOrder) ? S.statOrder : [];
if (!['tournee', 'visite', 'urgence'].includes(S.seuilTarifType)) S.seuilTarifType = 'tournee';
S.adresses = Array.isArray(S.adresses) ? S.adresses : [];
S.adresses.forEach((a) => { a.addr = toAddr(a.addr); });
S.analyticOrder = Array.isArray(S.analyticOrder) ? S.analyticOrder : [];
S.tileLabels = (S.tileLabels && typeof S.tileLabels === 'object') ? S.tileLabels : {};

// ── Configuration usine (réglages/articles/frais par défaut du pro) ──
// Appliquée UNIQUEMENT au tout premier lancement (aucune donnée locale). Ne touche pas un utilisateur existant.
// Renseignée à la finalisation via l'export (bouton « Sauvegarde ») du pro : coller ici l'objet `settings`.
const FACTORY_SETTINGS = {
  provider: 'osm', geoapifyKey: '',
  home: { rue: '', numero: '', cp: '', localite: '', lat: null, lon: null },
  consoL100: 9, prixPleinL: 1.98, tvaRate: 21,
  accentColor: '#d15e00', appBg: '#0d0d0d', logoBg: '#ffffff',
  frais: [
    { id: 'idmr3xlkpceo5t', poste: 'Entretien', nature: 'recurrent', montantHT: 800, kmPrevus: 30000, kmDebut: 0 },
    { id: 'idmr3xlkpcfgcp', poste: 'Pièces', nature: 'exceptionnel', montantHT: 500, kmPrevus: 30000, kmDebut: 0 },
    { id: 'idmr3xlkpc1k95', poste: 'Pneus', nature: 'recurrent', montantHT: 450, kmPrevus: 30000, kmDebut: 0 },
    { id: 'idmr3xlkpca0y4', poste: 'Plaquettes de frein', nature: 'recurrent', montantHT: 450, kmPrevus: 30000, kmDebut: 0 },
    { id: 'idmr3xlkpcz8v', poste: 'Disques de frein', nature: 'recurrent', montantHT: 500, kmPrevus: 50000, kmDebut: 0 },
    { id: 'idmr3xlkpc4co4', poste: 'Réparation', nature: 'exceptionnel', montantHT: 500, kmPrevus: 40000, kmDebut: 0 },
    { id: 'idmr3xlkpc84yp', poste: 'Montage & équilibrage pneus', nature: 'recurrent', montantHT: 150, kmPrevus: 40000, kmDebut: 0 },
  ],
  amortissement: { achatHT: 50000, dureeVieKm: 300000 },
  tempsKm: 0.07, urgenceSuppKm: 0.13, prixHeure: 10, kmHeure: 100,
  materiel: [
    { id: 'idmr3xlkpccqmm', libelle: 'Râpe', montantHT: 30, nbChevaux: 15 },
    { id: 'idmr3xlkpcjncr', libelle: 'Gants', montantHT: 6.5, nbChevaux: 30 },
    { id: 'idmr3xlkpc1j8', libelle: 'Renette', montantHT: 30, nbChevaux: 250 },
    { id: 'idmr3xlkpc1el', libelle: 'Brosse métallique', montantHT: 8.5, nbChevaux: 250 },
    { id: 'idmr3xlkpce8el', libelle: 'Chaussure', montantHT: 150, nbChevaux: 500 },
    { id: 'idmr3xlkpc9tnp', libelle: 'Vêtements', montantHT: 250, nbChevaux: 500 },
    { id: 'idmr3zuedlk1l1', libelle: 'Pince à parer', montantHT: 245, nbChevaux: 3000 },
    { id: 'idmr3zuedlajk8', libelle: 'Pince à déferrer', montantHT: 95, nbChevaux: 3000 },
    { id: 'idmr3zuedl1zqo', libelle: 'Pince à sonder', montantHT: 245, nbChevaux: 3000 },
  ],
  fourbureHT: 12.9, npasHT: 6.45, infectionHT: 9.9,
  parage: { prixHT: 60, tvaPct: 21 },
  articlesCatalogue: [
    // « Parage & Équilibrage » retiré du catalogue par défaut : il existe déjà comme article auto (section Parage/Équilibrage).
    { id: 'idmr4vkk6vi6ne', libelle: 'Visite 15min', prixHT: 10, tvaPct: 21 },
    { id: 'idmr4vl08gi77k', libelle: 'Visite 30min', prixHT: 25, tvaPct: 21 },
    { id: 'idmr4vlo0verc1', libelle: 'Visite ', prixHT: 40, tvaPct: 21 },
    { id: 'idmr4vmxvz7rva', libelle: 'M.O. 2p', prixHT: 50, tvaPct: 21 },
    { id: 'idmr4vmzb37iis', libelle: 'Evaluation 1er Cheval', prixHT: 120, tvaPct: 21 },
    { id: 'idmr4vnee7ix1q', libelle: 'Evaluation cheval Supp.', prixHT: 25, tvaPct: 21 },
  ],
  pays: 'be', seuilKm: 15, forfait: 12.5, repartition: 'parclient',
  rayonMemeEcurieKm: 5, roadFactor: 1.3, vitesseKmh: 90, dureeAuto: false,
  seuilTarifType: 'tournee', adresses: [], statOrder: [],
  seededServos: true, seededV2: true, seededV3: true, seededV4: true, seededV5: true,
  pincesAdded: true, parageSeeded: true, dureeSeeded: true,
};
if (FACTORY_SETTINGS && !_hadSettings) { S = Object.assign({}, DEFAULTS, FACTORY_SETTINGS); LS.set('ftr.settings', S); }
// Bascule unique : durée = vitesse moyenne 90 km/h (le service de carte gratuit surestime la durée).
if (!S.dureeSeeded) { S.dureeSeeded = true; S.dureeAuto = false; if (!S.vitesseKmh || S.vitesseKmh === 50) S.vitesseKmh = 90; LS.set('ftr.settings', S); }

// Matériel consommable — prix d'achat + nb de chevaux couverts → prix unitaire/cheval = achat ÷ nbChevaux
const MATERIEL_REF = [
  { libelle: 'Râpe', montantHT: 0, nbChevaux: 1 }, { libelle: 'Gants', montantHT: 0, nbChevaux: 1 },
  { libelle: 'Renette', montantHT: 0, nbChevaux: 1 }, { libelle: 'Cure-pied', montantHT: 0, nbChevaux: 1 },
  { libelle: 'Brosse métallique', montantHT: 0, nbChevaux: 1 },
  { libelle: 'Chaussure', montantHT: 0, nbChevaux: 1 }, { libelle: 'Vêtements', montantHT: 0, nbChevaux: 1 },
  { libelle: 'Pince à parer', montantHT: 245, nbChevaux: 3000 }, { libelle: 'Pince à déferrer', montantHT: 95, nbChevaux: 3000 },
  { libelle: 'Pince à sonder', montantHT: 245, nbChevaux: 3000 },
];
const MAT_V2_SET = ['Râpe', 'Gants', 'Renette', 'Cure-pied', 'Brosse métallique'];
const MAT_V3_SET = MAT_V2_SET.concat(['Chaussure', 'Vêtements']);
// Frais véhicule de référence (catégories — montants à compléter par le pro)
const FRAIS_REF = [
  { poste: 'Entretien', nature: 'recurrent', montantHT: 2450, kmPrevus: 10000 },
  { poste: 'Pièces', nature: 'exceptionnel', montantHT: 0, kmPrevus: 0 },
  { poste: 'Pneus', nature: 'exceptionnel', montantHT: 0, kmPrevus: 0 },
  { poste: 'Plaquettes de frein', nature: 'exceptionnel', montantHT: 0, kmPrevus: 0 },
  { poste: 'Disques de frein', nature: 'exceptionnel', montantHT: 0, kmPrevus: 0 },
  { poste: 'Réparation', nature: 'exceptionnel', montantHT: 0, kmPrevus: 0 },
  { poste: 'Montage & équilibrage pneus', nature: 'exceptionnel', montantHT: 0, kmPrevus: 0 },
];
const mkMat = () => MATERIEL_REF.map((m) => ({ id: uid(), libelle: m.libelle, montantHT: m.montantHT, nbChevaux: m.nbChevaux }));
const mkFrais = () => FRAIS_REF.map((f) => ({ id: uid(), poste: f.poste, nature: f.nature, montantHT: f.montantHT, kmPrevus: f.kmPrevus, kmDebut: 0 }));
if (!S.seededServos) {
  S.seededServos = true;
  if (!S.materiel.length) S.materiel = mkMat();
  if (!S.fourbureHT) S.fourbureHT = 12.90;
  if (!S.npasHT) S.npasHT = 6.45;
  if (!S.frais.length) S.frais = mkFrais();
  LS.set('ftr.settings', S);
}
// Infection ajoutée après Fourbure/NPAS : back-fill unique d'un prix par défaut pour que la case apparaisse aussi (les anciens utilisateurs avaient infectionHT=0 → colonne masquée).
if (!S.infectionSeeded) { S.infectionSeeded = true; if (!S.infectionHT) S.infectionHT = 9.90; LS.set('ftr.settings', S); }
S.materiel.forEach((m) => { if (typeof m.nbChevaux !== 'number') m.nbChevaux = 1; }); // migration nbChevaux
// V2 : retire les anciens produits, itemise le matériel, ajoute les catégories véhicule
if (!S.seededV2) {
  S.seededV2 = true;
  S.materiel = S.materiel.filter((m) => !['Silvetrasol', 'Trushender', 'Artimud', 'Hoof-Stuff'].includes(m.libelle));
  const onlyLump = S.materiel.length && S.materiel.every((m) => /Matériel par cheval/.test(m.libelle));
  if (!S.materiel.length || onlyLump) S.materiel = mkMat();
  if (S.frais.length <= 1) S.frais = mkFrais();
  LS.set('ftr.settings', S);
}
// V3 : ajoute Chaussure + Vêtements si la liste est encore le seed V2 par défaut
if (!S.seededV3) {
  S.seededV3 = true;
  if (S.materiel.length && S.materiel.every((m) => MAT_V2_SET.includes(m.libelle) && (m.montantHT || 0) === 0)) S.materiel = mkMat();
  LS.set('ftr.settings', S);
}
// V4 : ajoute les pinces (avec prix) si la liste est encore le seed V3 par défaut
if (!S.seededV4) {
  S.seededV4 = true;
  if (S.materiel.length && S.materiel.every((m) => MAT_V3_SET.includes(m.libelle) && (m.montantHT || 0) === 0)) S.materiel = mkMat();
  LS.set('ftr.settings', S);
}
// V5 : durée de vie des pinces = 3000 chevaux (si encore au défaut)
if (!S.seededV5) {
  S.seededV5 = true;
  S.materiel.forEach((m) => { if (['Pince à parer', 'Pince à déferrer', 'Pince à sonder'].includes(m.libelle) && (m.nbChevaux || 1) <= 1) m.nbChevaux = 3000; });
  LS.set('ftr.settings', S);
}
// Prix par défaut de l'article « Parage et équilibrage » (réf. Servos 60 €)
if (!S.parageSeeded) {
  S.parageSeeded = true;
  if (!S.parage.prixHT) S.parage.prixHT = 60;
  if (!S.parage.tvaPct) S.parage.tvaPct = 21;
  LS.set('ftr.settings', S);
}
// Ajout NON destructif des pinces si absentes (liste déjà personnalisée par le pro)
if (!S.pincesAdded) {
  S.pincesAdded = true;
  [['Pince à parer', 245], ['Pince à déferrer', 95], ['Pince à sonder', 245]].forEach((p) => {
    if (!S.materiel.some((m) => m.libelle === p[0])) S.materiel.push({ id: uid(), libelle: p[0], montantHT: p[1], nbChevaux: 3000 });
  });
  LS.set('ftr.settings', S);
}

// TVA par pays : taux standard + taux autorisés pour les articles
const PAYS_TVA = { be: { nom: 'Belgique', std: 21, rates: [21, 6, 0] }, fr: { nom: 'France', std: 20, rates: [20, 10, 5.5, 0] } };
const tvaRatesPays = () => (PAYS_TVA[S.pays] || PAYS_TVA.be).rates;
const baseMateriel = () => S.materiel.reduce((s, m) => s + ((m.montantHT || 0) / Math.max(1, m.nbChevaux || 1)), 0);
function saveSettings() { S.updatedAt = Date.now(); LS.set('ftr.settings', S); refreshEverywhere(); recomputeMoney(); scheduleDrivePush(); }

// ---------- Thème (couleur bandeau & boutons) ----------
const THEME_PRESETS = ['#e8722a', '#1f6f54', '#2563eb', '#dc2626', '#7c3aed', '#0891b2'];
function idealInk(hex) {
  const c = String(hex).replace('#', ''); if (c.length < 6) return '#ffffff';
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#1c2320' : '#ffffff';
}
const BG_PRESETS = ['#0d0d0d', '#000000', '#15120f', '#101418', '#141a2b', '#0f1a14', '#f6f4f1', '#ffffff', '#fdf6ec', '#eef4ff'];
const LOGO_BG_PRESETS = ['transparent', '#ffffff', '#000000', '#e8722a'];
function lum(hex) { const c = String(hex).replace('#', ''); if (c.length < 6) return 1; const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function applyTheme() {
  const root = document.documentElement.style;
  const acc = S.accentColor || '#e8722a';
  root.setProperty('--accent', acc); root.setProperty('--accent-ink', idealInk(acc));
  const bg = S.appBg || '#0d0d0d'; root.setProperty('--bg', bg);
  let card;
  if (lum(bg) < 0.45) { // fond sombre → palette sombre
    card = '#1d1d1d';
    root.setProperty('--card', card); root.setProperty('--ink', '#efe7de'); root.setProperty('--muted', '#a89a8c'); root.setProperty('--line', '#343434'); root.setProperty('--strong', '#f0b78a');
    root.setProperty('--ro-bg', '#3a3833'); // champs calculés (lecture seule) : fond plus clair, texte inchangé
  } else {              // fond clair → palette claire
    card = '#ffffff';
    root.setProperty('--card', card); root.setProperty('--ink', '#241f1a'); root.setProperty('--muted', '#7a6f64'); root.setProperty('--line', '#e6dfd7'); root.setProperty('--strong', '#6b3410');
    root.setProperty('--ro-bg', '#e7e3dc');
  }
  // Bandeau principal (topbar) : couleur propre, sinon suit l'accent
  const top = S.topbarColor || acc; root.setProperty('--topbar', top); root.setProperty('--topbar-ink', idealInk(top));
  // Barre d'onglets : couleur propre, sinon couleur de la carte
  const nav = S.navBarColor || card; root.setProperty('--navbar', nav); root.setProperty('--navbar-ink', idealInk(nav));
  root.setProperty('--logo-bg', S.logoBg || 'transparent');
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', top);
}
function renderSwatchSet(boxId, presets, current, onPick) {
  const box = $(boxId); if (!box) return; box.innerHTML = '';
  const cur = (current || '').toLowerCase();
  const inPresets = presets.some((c) => c.toLowerCase() === cur);
  presets.forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch' + (c.toLowerCase() === cur ? ' on' : '') + (c === 'transparent' ? ' sw-trans' : ''); if (c !== 'transparent') b.style.background = c; b.title = c; b.addEventListener('click', () => onPick(c)); box.appendChild(b); });
  // Couleur personnalisée (hors presets) : pastille « actuelle » marquée sélectionnée, pour qu'elle apparaisse bien choisie.
  if (cur && cur !== 'transparent' && !inPresets) { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch on sw-custom'; b.style.background = current; b.title = 'Couleur personnalisée ' + current; b.addEventListener('click', () => onPick(current)); box.appendChild(b); }
}
function refreshSwatches() {
  const cardCol = () => (lum(S.appBg) < 0.45 ? '#1d1d1d' : '#ffffff');
  renderSwatchSet('swatches', THEME_PRESETS, S.accentColor, (c) => { S.accentColor = c; if ($('setAccent')) $('setAccent').value = c; saveSettings(); applyTheme(); refreshSwatches(); });
  renderSwatchSet('topbarSwatches', THEME_PRESETS, S.topbarColor || S.accentColor, (c) => { S.topbarColor = c; if ($('setTopbar')) $('setTopbar').value = c; saveSettings(); applyTheme(); refreshSwatches(); });
  renderSwatchSet('navbarSwatches', BG_PRESETS, S.navBarColor || cardCol(), (c) => { S.navBarColor = c; if ($('setNavbar')) $('setNavbar').value = c; saveSettings(); applyTheme(); refreshSwatches(); });
  renderSwatchSet('bgSwatches', BG_PRESETS, S.appBg, (c) => { S.appBg = c; if ($('setAppBg')) $('setAppBg').value = c; saveSettings(); applyTheme(); refreshSwatches(); });
  renderSwatchSet('logoBgSwatches', LOGO_BG_PRESETS, S.logoBg, (c) => { S.logoBg = c; if (c !== 'transparent' && $('setLogoBg')) $('setLogoBg').value = c; saveSettings(); applyTheme(); refreshSwatches(); });
}

let clients = LS.get('ftr.clients', []);
let tournees = LS.get('ftr.tournees', []);
let archive = LS.get('ftr.archive', []);            // tournées clôturées > 4 semaines (D2 — allègement)
const allTours = () => tournees.concat(archive);    // union pour stats/finances/odomètre/fusion

// ---------- Synchro D1 : horodatage (updatedAt) + tombstones (suppressions) ----------
// Signature de contenu d'un enregistrement, hors updatedAt (pour détecter un vrai changement).
function hashRec(rec) { const c = {}; for (const k in rec) if (k !== 'updatedAt') c[k] = rec[k]; return JSON.stringify(c); }
function syncMeta() { const m = LS.get('ftr.syncmeta', {}); m.hash = m.hash || {}; m.tomb = m.tomb || {}; return m; }
// Pose updatedAt sur les enregistrements modifiés et enregistre les suppressions en tombstones (par « kind »).
function syncStamp(kind, arr) {
  const m = syncMeta(); m.hash[kind] = m.hash[kind] || {}; m.tomb[kind] = m.tomb[kind] || {};
  const now = Date.now(); const seen = {};
  arr.forEach((rec) => {
    if (!rec.id) rec.id = uid(); seen[rec.id] = true;
    const h = hashRec(rec);
    if (m.hash[kind][rec.id] !== h) { rec.updatedAt = now; m.hash[kind][rec.id] = h; } else if (!rec.updatedAt) rec.updatedAt = now;
    if (m.tomb[kind][rec.id] && m.tomb[kind][rec.id] <= (rec.updatedAt || 0)) delete m.tomb[kind][rec.id]; // réapparu → tombstone périmé
  });
  Object.keys(m.hash[kind]).forEach((id) => { if (!seen[id]) { m.tomb[kind][id] = now; delete m.hash[kind][id]; } }); // disparu → tombstone
  LS.set('ftr.syncmeta', m);
}
function saveClients() { syncStamp('clients', clients); LS.set('ftr.clients', clients); scheduleDrivePush(); }
function saveTournees() { syncStamp('tournees', allTours()); LS.set('ftr.tournees', tournees); scheduleDrivePush(); }
function saveArchive() { syncStamp('tournees', allTours()); LS.set('ftr.archive', archive); scheduleDrivePush(); }

// ---------- Synchro D1 : fusion idempotente (moteur pur — utilisé par l'import fichier et, plus tard, Drive) ----------
// Union de deux collections par id : garde le updatedAt le plus élevé ; un tombstone plus récent supprime l'enregistrement.
function mergeCollection(localArr, remoteArr, tomb) {
  const byId = {};
  const put = (rec) => { if (!rec || !rec.id) return; const cur = byId[rec.id]; if (!cur || (rec.updatedAt || 0) > (cur.updatedAt || 0)) byId[rec.id] = rec; };
  (localArr || []).forEach(put); (remoteArr || []).forEach(put);
  return Object.values(byId).filter((rec) => ((tomb && tomb[rec.id]) || 0) <= (rec.updatedAt || 0));
}
function mergeTomb(a, b) { const t = Object.assign({}, a || {}); Object.keys(b || {}).forEach((id) => { t[id] = Math.max(t[id] || 0, b[id]); }); return t; }
// Réglages : l'objet le plus récent gagne (entier), MAIS les états accumulatifs sont unifiés (union) pour
// ne jamais écraser ce qui a été fait sur l'autre appareil : changelog lu, items d'agenda inactivés/récupérés.
function mergeSettings(localS, remoteS) {
  const base = ((remoteS && remoteS.updatedAt) || 0) > ((localS && localS.updatedAt) || 0) ? remoteS : localS;
  const merged = Object.assign({}, base || {});
  merged.changelogRead = Array.from(new Set([].concat((localS && localS.changelogRead) || [], (remoteS && remoteS.changelogRead) || [])));
  // Items d'agenda : « fait sur un appareil = fait partout » → union des clés (eventId), jamais l'un n'efface l'autre.
  merged.agendaImported = Object.assign({}, (localS && localS.agendaImported) || {}, (remoteS && remoteS.agendaImported) || {});
  merged.agendaInactive = Object.assign({}, (localS && localS.agendaInactive) || {}, (remoteS && remoteS.agendaInactive) || {});
  merged.agendaPrive = Object.assign({}, (localS && localS.agendaPrive) || {}, (remoteS && remoteS.agendaPrive) || {});
  // Adresse de départ (domicile) : ne jamais la perdre si l'appareil « gagnant » l'avait vide → reprendre celle qui est renseignée.
  const hasAddr = (a) => { try { return !!addrStr(a).trim(); } catch { return false; } };
  if (!hasAddr(merged.home)) { if (localS && hasAddr(localS.home)) merged.home = localS.home; else if (remoteS && hasAddr(remoteS.home)) merged.home = remoteS.home; }
  // Carnet « Mes adresses » de départ : union par id (ne pas perdre celles saisies sur l'autre appareil).
  { const byId = {}; ((localS && localS.adresses) || []).forEach((a) => { if (a && a.id) byId[a.id] = a; }); ((remoteS && remoteS.adresses) || []).forEach((a) => { if (a && a.id) byId[a.id] = a; }); merged.adresses = Object.values(byId); }
  return merged;
}
// Fusionne un instantané distant dans l'instantané local (idempotent : rejouer donne le même résultat).
function mergeSnapshots(local, remote) {
  const tombC = mergeTomb(local.tomb && local.tomb.clients, remote.tomb && remote.tomb.clients);
  const tombT = mergeTomb(local.tomb && local.tomb.tournees, remote.tomb && remote.tomb.tournees);
  return {
    settings: mergeSettings(local.settings, remote.settings),
    clients: mergeCollection(local.clients, remote.clients, tombC),
    tours: mergeCollection(local.tours, remote.tours, tombT),
    tomb: { clients: tombC, tournees: tombT },
  };
}
// Instantané local complet (pour export / fusion).
function exportSnapshot() {
  const m = syncMeta();
  return { app: 'GaloPodo', version: APP_VERSION, at: Date.now(), settings: S, clients, tours: allTours(), tomb: { clients: (m.tomb && m.tomb.clients) || {}, tournees: (m.tomb && m.tomb.tournees) || {} } };
}
// Applique le résultat de fusion : réécrit les stores + re-partitionne les tournées (actives / archive > 4 semaines).
function applyMerged(merged) {
  S = Object.assign(S, merged.settings);
  clients = merged.clients;
  const d = new Date(); d.setDate(d.getDate() - 28); const cutoff = d.toISOString().slice(0, 10);
  const isArch = (t) => (t.closed || (t.date || '') < todayStr()) && (t.date || '') < cutoff;
  tournees = merged.tours.filter((t) => !isArch(t));
  archive = merged.tours.filter((t) => isArch(t));
  const m = syncMeta(); m.tomb.clients = merged.tomb.clients; m.tomb.tournees = merged.tomb.tournees; LS.set('ftr.syncmeta', m);
  LS.set('ftr.settings', S); LS.set('ftr.clients', clients); LS.set('ftr.tournees', tournees); LS.set('ftr.archive', archive);
}
function importSnapshotMerge(remote) { applyMerged(mergeSnapshots(exportSnapshot(), remote)); }
// ---------- Agenda Google (Calendar, lecture seule) ----------
let _agendaEvents = []; // derniers événements récupérés (transitoires)
async function fetchCalendarEvents(interactive) {
  const token = await googleToken(interactive, GSCOPE_CAL);
  const now = new Date(); const min = now.toISOString();
  const max = new Date(now.getTime() + 60 * 24 * 3600 * 1000).toISOString(); // 60 jours à venir
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}&singleEvents=true&orderBy=startTime&maxResults=100`, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Calendar HTTP ' + r.status);
  const j = await r.json();
  return (j.items || []).map((ev) => ({ id: ev.id, title: ev.summary || '(sans titre)', start: (ev.start && (ev.start.dateTime || ev.start.date)) || '', day: ((ev.start && (ev.start.dateTime || ev.start.date)) || '').slice(0, 10), location: ev.location || '', desc: ev.description || '' }));
}
// Rafraîchissement SILENCIEUX de l'agenda (jeton déjà consenti) — appelé à l'ouverture de l'app et à la navigation vers Agenda.
// Non interactif : n'affiche jamais d'écran de connexion. Si le jeton n'est pas encore consenti, l'utilisateur clique « Rafraîchir » une fois.
async function agendaAutoSync(allowAcquire) {
  if (!S.googleClientId) return;
  if (!allowAcquire && !gTokenValid(GSCOPE_CAL)) return; // navigation : jamais d'écran d'auth si le jeton n'est pas déjà en cache
  try {
    _agendaEvents = await fetchCalendarEvents(false);
    if ($('tab-agenda') && $('tab-agenda').classList.contains('active')) renderAgendaItems();
    if (typeof renderAgendaCalendrier === 'function') renderAgendaCalendrier();
  } catch { /* jeton non consenti / hors-ligne : rafraîchissement manuel disponible */ }
}
// Croise un événement (titre + lieu + description) avec la base clients : nom, prénom, société ET noms de chevaux.
// Renvoie TOUS les clients connus qui correspondent (pour proposer la liaison).
function matchClientsForEvent(ev) {
  const hay = norm([ev && ev.title, ev && ev.location, ev && ev.desc].filter(Boolean).join(' '));
  if (!hay) return [];
  const out = [];
  clients.forEach((c) => {
    const keys = [fullName(c), c.nom, c.prenom, c.societe].filter(Boolean).map(norm);
    (c.chevaux || []).forEach((h) => { if (h.nom) keys.push(norm(h.nom)); });
    if (keys.some((k) => k && k.length >= 2 && hay.includes(k))) out.push(c);
  });
  return out;
}
// Meilleure proposition unique (pour l'étiquette de l'item).
function matchClientForEvent(title) { return matchClientsForEvent({ title })[0] || null; }
// D3 (mode fichier) : télécharge l'instantané dans un fichier .json.
function downloadSnapshot() {
  const data = JSON.stringify(exportSnapshot(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `galopodo-sync-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// ---------- Synchro D3 (Google Drive) : OAuth par-utilisateur (aucune clé codée en dur) ----------
// Jetons persistés (localStorage) pour SURVIVRE au redémarrage de l'app : un jeton Google dure ~1 h ;
// tant qu'il est valide, rouvrir l'app resynchronise en silence SANS redemander la connexion.
let _gTokens = LS.get('ftr.gtokens', {}) || {}; // scope → { token, exp }
function persistGTokens() { try { LS.set('ftr.gtokens', _gTokens); } catch { /* quota — sans gravité */ } }
const GDRIVE_FILE = 'galopodo-sync.json';
// UN SEUL jeton combiné (Drive appData + Calendar lecture) → une seule connexion couvre Drive ET Agenda,
// persistée une fois. Les deux constantes sont volontairement identiques : même clé de cache, même jeton partagé.
const GSCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/calendar.readonly';
const GSCOPE_CAL = GSCOPE_DRIVE;
// Vrai si un jeton VALIDE est déjà en cache pour ce scope → autorise une opération silencieuse SANS jamais afficher d'écran d'auth.
function gTokenValid(scope) { const c = _gTokens[scope || GSCOPE_DRIVE]; return !!(c && Date.now() < c.exp - 60000); }
function loadGis() {
  return new Promise((res, rej) => {
    if (window.google && google.accounts && google.accounts.oauth2) return res();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('Chargement de Google impossible (hors-ligne ?)'));
    document.head.appendChild(s);
  });
}
// Jeton d'accès (par scope) : silencieux si déjà consenti, sinon écran de connexion (interactive).
let _gTokenInflight = {}; // scope → Promise en cours (évite 2 fenêtres de connexion au boot : Drive + Agenda partagent la MÊME requête)
async function googleToken(interactive, scope) {
  scope = scope || GSCOPE_DRIVE;
  const c = _gTokens[scope]; if (c && Date.now() < c.exp - 60000) return c.token;
  if (_gTokenInflight[scope]) return _gTokenInflight[scope]; // une demande est déjà en cours pour ce scope → on la partage
  if (!S.googleClientId) throw new Error('Renseignez d\'abord votre ID client Google.');
  const pr = (async () => {
    await loadGis();
    return new Promise((resolve, reject) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: S.googleClientId, scope,
        callback: (resp) => { if (resp && resp.error) return reject(new Error(resp.error)); _gTokens[scope] = { token: resp.access_token, exp: Date.now() + ((resp.expires_in || 3600) * 1000) }; persistGTokens(); resolve(resp.access_token); },
        error_callback: (err) => reject(new Error((err && err.type) || 'connexion refusée')),
      });
      tc.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  })();
  _gTokenInflight[scope] = pr;
  try { return await pr; } finally { delete _gTokenInflight[scope]; }
}
async function driveFindFile(token) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent("name='" + GDRIVE_FILE + "'")}&fields=files(id,name)`, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Drive HTTP ' + r.status); const j = await r.json(); return (j.files && j.files[0]) || null;
}
async function driveDownload(token, id) { const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: 'Bearer ' + token } }); if (!r.ok) throw new Error('Drive téléchargement ' + r.status); return r.json(); }
async function driveUpload(token, id, data) {
  const meta = { name: GDRIVE_FILE }; if (!id) meta.parents = ['appDataFolder'];
  const boundary = 'gp' + Math.floor(Math.random() * 1e9).toString(36);
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
  const url = id ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const r = await fetch(url, { method: id ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
  if (!r.ok) throw new Error('Drive envoi ' + r.status); return r.json();
}
// Synchro Drive : télécharge le distant, FUSIONNE, renvoie le tout (le coffre porte l'état fusionné). interactive = autorise l'écran de connexion.
async function googleSync(interactive, statusEl, reload) {
  const setS = (cls, txt) => { if (statusEl) { statusEl.className = 'status ' + cls; statusEl.textContent = txt; } };
  try {
    setS('', 'Connexion à Google…'); const token = await googleToken(interactive);
    setS('', 'Synchronisation Drive…'); const f = await driveFindFile(token);
    if (f) { const remote = await driveDownload(token, f.id); if (remote && Array.isArray(remote.tours)) importSnapshotMerge(remote); await driveUpload(token, f.id, exportSnapshot()); }
    else { await driveUpload(token, null, exportSnapshot()); }
    if (reload) { setS('ok', 'Synchronisé ✔ Rechargement…'); setTimeout(() => location.reload(), 800); }
    else { setS('ok', 'Synchronisé ✔'); refreshEverywhere(); if ($('tab-accueil').classList.contains('active')) renderHome(); if ($('tab-agenda') && $('tab-agenda').classList.contains('active')) renderAgendaItems(); }
  } catch (e) { setS('err', 'Erreur : ' + e.message); }
}
// Modes de synchro EXCLUSIFS : 'file' (multi-appareils par fichier) OU 'drive' (Google Drive). Activer l'un désactive l'autre.
// La section fichier est grisée+inerte quand Drive est actif ; la synchro Drive est en veille quand le mode fichier est actif
// (l'Agenda et l'ID client restent disponibles dans les deux cas).
function applySyncMode(mode) {
  mode = (mode === 'drive') ? 'drive' : 'file';
  S.syncMode = mode;
  const fileOn = mode === 'file';
  if ($('syncSecFile')) $('syncSecFile').checked = fileOn;
  if ($('syncSecDrive')) $('syncSecDrive').checked = !fileOn;
  if ($('syncCardFile')) $('syncCardFile').classList.toggle('sync-off', !fileOn); // section fichier désactivée si Drive actif
  if ($('setGoogleAuto')) $('setGoogleAuto').disabled = fileOn;                    // contrôles de synchro Drive inactifs en mode fichier
  if ($('googleConnect')) $('googleConnect').disabled = fileOn;
  if ($('googleSyncBtn')) $('googleSyncBtn').disabled = fileOn;
  if ($('syncDriveDim')) $('syncDriveDim').style.display = fileOn ? '' : 'none';
}
// Envoi automatique vers Drive à CHAQUE modification utilisateur (débattu ~4 s pour regrouper les rafales de saisie).
// Toujours une fusion (télécharge → fusionne → renvoie) : ne perd pas les modifs faites sur l'autre appareil. Silencieux.
let _drivePushTimer = null;
function scheduleDrivePush() {
  if (S.syncMode !== 'drive') return;                  // mode fichier actif → pas d'envoi Drive automatique
  if (!(S.googleAutoSync && S.googleClientId)) return; // synchro auto désactivée ou non configurée
  if (_drivePushTimer) clearTimeout(_drivePushTimer);
  _drivePushTimer = setTimeout(() => { _drivePushTimer = null; drivePushNow(); }, 4000);
}
async function drivePushNow() {
  if (S.syncMode !== 'drive') return;
  if (!(S.googleAutoSync && S.googleClientId)) return;
  if (!gTokenValid(GSCOPE_DRIVE)) return; // pas de jeton en cache → on n'ouvre JAMAIS d'écran d'auth ici (évite le renvoi vers Google en pleine navigation) ; la synchro au boot rattrapera
  try {
    const token = await googleToken(false); // silencieux : jeton déjà en cache (retour immédiat, aucune UI)
    const f = await driveFindFile(token);
    if (f) { const remote = await driveDownload(token, f.id); if (remote && Array.isArray(remote.tours)) importSnapshotMerge(remote); await driveUpload(token, f.id, exportSnapshot()); }
    else { await driveUpload(token, null, exportSnapshot()); }
  } catch { /* hors-ligne ou jeton non consenti : la synchro au prochain boot rattrapera */ }
}
// D3 (mode fichier) : lit un fichier de synchro et le FUSIONNE (sans écraser).
function importSyncFile(file, statusEl) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const o = JSON.parse(r.result);
      if (!o.tours && Array.isArray(o.tournees)) o.tours = o.tournees; // compat ancienne sauvegarde
      if (!o.settings || !Array.isArray(o.clients) || !Array.isArray(o.tours)) throw new Error('format non reconnu');
      importSnapshotMerge(o);
      if (statusEl) { statusEl.className = 'status ok'; statusEl.textContent = 'Fusionné ✔ Rechargement…'; }
      setTimeout(() => location.reload(), 700);
    } catch (err) { if (statusEl) { statusEl.className = 'status err'; statusEl.textContent = 'Fichier invalide : ' + err.message; } }
  };
  r.readAsText(file);
}

(function migrate() {
  clients.forEach((c) => {
    if (c.adresse !== undefined) { c.addr = toAddr(c.adresse); delete c.adresse; }
    c.addr = toAddr(c.addr);
    // Migration nom → prénom + nom : on NE TOUCHE PAS au nom existant (aucune perte), on ajoute juste un prénom vide.
    if (c.prenom === undefined) c.prenom = '';
    if (c.nom === undefined) c.nom = '';
    if (c.societe === undefined) c.societe = '';
    if (c.assujettiTva === undefined) c.assujettiTva = false;
    if (c.tvaNum === undefined) c.tvaNum = '';
    if (c.entrepriseNum === undefined) c.entrepriseNum = '';
    if (c.societeMemeAdresse === undefined) c.societeMemeAdresse = true;
    if (!Array.isArray(c.impayes)) c.impayes = []; // restes reportés (paiement partiel liquide)
    c.societeAddr = toAddr(c.societeAddr);
    (c.chevaux || []).forEach((h) => { if (!h.id) h.id = uid(); if (h.adresse !== undefined) { h.addr = toAddr(h.adresse); delete h.adresse; } h.addr = toAddr(h.addr); if (!h.addrSource) h.addrSource = (h.memeAdresse === false) ? 'specifique' : 'client'; });
  });
  tournees.forEach((t) => {
    if (!Array.isArray(t.articles)) t.articles = [];
    if (!t.reductions) t.reductions = {};
    if (t.nom === undefined) t.nom = '';           // nom / identification de la tournée
    if (t.closed === undefined) t.closed = false;  // clôture manuelle (fige la tournée)
    if (t.arrivee === undefined) t.arrivee = null; // adresse d'arrivée distincte (null = retour au départ)
    if (!t.payments || typeof t.payments !== 'object') t.payments = {}; // paiement par client : {method, facture, montantPaye}
    (t.arrets || []).forEach((a) => {
      if (!a.addr) { a.addr = toAddr(a.adresse); a.addr.lat = a.lat || null; a.addr.lon = a.lon || null; }
      if (!a.clients) a.clients = (a.clientIds || []).map((id, i) => ({ clientId: id, chevalNoms: i === 0 ? (a.chevalNoms || []) : [] }));
      // chevalNoms (noms) -> chevaux (objets avec drapeaux fourbure/npas)
      a.clients.forEach((cl) => { if (!cl.chevaux) cl.chevaux = (cl.chevalNoms || []).map((n) => ({ nom: n, fourbure: false, npas: false })); });
    });
  });
  saveClients(); saveTournees();
})();

let currentTour = null;
let _settingsPaints = {}; // fonctions de repeinture des champs numériques des Réglages
let _deferredInstall = null; // évènement beforeinstallprompt (installation PWA)

// ---------- Utilitaires ----------
const $ = (id) => document.getElementById(id);
const eur = (n) => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const eurkm = (n) => (Math.round(n * 1000) / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €';
const km = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km';
// Nombre affiché avec séparateur de milliers (espace) et virgule décimale ; parsing tolérant (espaces/virgule).
const fmtNum = (n, dec) => (n === '' || n == null || isNaN(n)) ? '' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 2 : dec });
const parseNum = (v) => { if (typeof v === 'number') return v; const s = String(v == null ? '' : v).replace(/[\s  ]/g, '').replace(',', '.'); const x = parseFloat(s); return isNaN(x) ? 0 : x; };
// Ajoute un suffixe d'unité (HT, TTC, km, €/L…) DANS le champ. Enveloppe l'input d'un <span class="fu">.
function addUnit(input, unit) {
  if (!input) return;
  let wrap = input.closest('.fu');
  if (!wrap) { wrap = document.createElement('span'); wrap.className = 'fu'; input.parentNode.insertBefore(wrap, input); wrap.appendChild(input); }
  let u = wrap.querySelector('.fu-unit'); if (!u) { u = document.createElement('span'); u.className = 'fu-unit'; wrap.appendChild(u); }
  u.textContent = unit || '';
}
// Ajuste la largeur de l'input à son contenu (repli pour les navigateurs sans field-sizing:content).
function fitSize(input) { if (!input) return; const s = String(input.value || input.placeholder || '0'); try { input.size = Math.min(24, Math.max(2, s.length + 1)); } catch { /* ignore */ } }
// Transforme un input en champ numérique formaté (milliers + unité) relié au modèle.
function wireNum(input, { get, set, unit, dec, after }) {
  if (!input) return;
  input.type = 'text'; input.setAttribute('inputmode', 'decimal');
  const paint = () => { const v = get(); input.value = (v || v === 0) && v !== '' ? fmtNum(v, dec) : ''; fitSize(input); };
  if (unit) addUnit(input, unit);
  paint();
  input.addEventListener('input', () => { set(parseNum(input.value)); fitSize(input); if (after) after(); });
  input.addEventListener('blur', paint);
  return paint;
}
// Champ en lecture seule qui affiche une valeur calculée (avec unité).
function makeReadout(input, unit) { if (!input) return; input.type = 'text'; input.readOnly = true; input.classList.add('ro'); if (unit) addUnit(input, unit); const w = input.closest('.fu'); if (w) w.classList.add('fu-ro'); }
// Applique format milliers + unité à un champ de modale (lecture via parseNum au moment voulu).
function mUnit(id, unit, dec) {
  const el = $(id); if (!el) return;
  el.type = 'text'; el.setAttribute('inputmode', 'decimal');
  if (unit) addUnit(el, unit);
  if (el.value !== '') el.value = fmtNum(parseNum(el.value), dec);
  fitSize(el);
  el.addEventListener('input', () => fitSize(el));
  el.addEventListener('blur', () => { el.value = el.value === '' ? '' : fmtNum(parseNum(el.value), dec); fitSize(el); });
}
const TYPES = { tournee: 'Tournée', visite: 'Visite', urgence: 'Urgence' };
const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const todayStr = () => new Date().toISOString().slice(0, 10);
function tourStatus(date) { const t = todayStr(); if (!date) return 'avenir'; if (date < t) return 'cloturee'; if (date === t) return 'active'; return 'avenir'; }
// Statut d'une tournée : clôturée si fermée manuellement OU date passée ; sinon selon la date.
function statusOf(tour) { return (tour && tour.closed) ? 'cloturee' : tourStatus(tour ? tour.date : null); }
const STATUS_LBL = { cloturee: 'Clôturée', active: "Aujourd'hui", avenir: 'À venir' };
// Date en toutes lettres (ex. « jeudi 6 novembre »).
function fmtDateFr(d) { if (!d) return 'Sans date'; const dt = new Date(d + 'T00:00:00'); if (isNaN(dt.getTime())) return d; return dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }

function haversineKm(a, b) {
  const R = 6371, r = (d) => d * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const rate = () => (S.tvaRate || 0) / 100;
const fuelPerKmHT = () => (S.consoL100 / 100) * S.prixPleinL / (1 + rate());
// Odomètre = somme des km de toutes les tournées calculées (chaque tournée compte une fois).
const odometer = () => allTours().reduce((s, t) => s + (t.result ? t.result.totalKm : 0), 0);
const fraisActif = (f) => f.nature === 'recurrent' ? true : (odometer() - (f.kmDebut || 0)) < (f.kmPrevus || 0);
const fraisContribHT = (f) => (f.kmPrevus > 0 && fraisActif(f)) ? (f.montantHT || 0) / f.kmPrevus : 0;
const amortContribHT = () => (S.amortissement.achatHT > 0 && S.amortissement.dureeVieKm > 0) ? S.amortissement.achatHT / S.amortissement.dureeVieKm : 0;
const baseVehiculeHT = () => amortContribHT() + S.frais.reduce((s, f) => s + fraisContribHT(f), 0);
const tempsPerKm = () => (S.kmHeure > 0 ? (S.prixHeure || 0) / S.kmHeure : 0); // temps de déplacement €/km = prix/heure ÷ km/heure
const tarifHT = (type) => baseVehiculeHT() + fuelPerKmHT() + (type !== 'tournee' ? tempsPerKm() : 0) + (type === 'urgence' ? S.urgenceSuppKm : 0);
const ttc = (ht) => ht * (1 + rate());
const fullName = (c) => c ? [c.prenom, c.nom].filter((x) => x && String(x).trim()).join(' ').trim() : '';
const clientName = (id) => { const c = clients.find((x) => x.id === id); return c ? (fullName(c) || '?') : '?'; };
const arretNbClients = (a) => (a.clients || []).length;
// Adresse de départ effective : celle de la tournée si définie, sinon le domicile des Réglages.
const tourHome = () => (currentTour && currentTour.home && addrStr(currentTour.home).trim()) ? currentTour.home : S.home;
const homeXY = () => { const h = tourHome(); return { lat: h.lat, lon: h.lon }; };
// Adresse d'arrivée : propre à la tournée si définie, sinon retour au départ.
const tourArrivee = () => (currentTour && currentTour.arrivee && addrStr(currentTour.arrivee).trim()) ? currentTour.arrivee : tourHome();
const arrivalXY = () => { const a = tourArrivee(); return { lat: a.lat, lon: a.lon }; };

// ---------- Cartographie ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function suggestAddress(text, kind) {
  if (S.provider === 'geoapify') {
    if (!S.geoapifyKey) throw new Error('Clé Geoapify manquante');
    const typeParam = kind ? `&type=${kind}` : '';
    const r = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&limit=6&lang=fr&filter=countrycode:be,fr,lu${typeParam}&apiKey=${S.geoapifyKey}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return (j.features || []).map((f) => { const p = f.properties; return { rue: p.street || p.name || '', numero: p.housenumber || '', cp: p.postcode || '', localite: p.city || p.town || p.village || '', lat: p.lat, lon: p.lon, label: p.formatted }; });
  }
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=be,fr,lu&q=${encodeURIComponent(text)}`, { headers: { 'Accept-Language': 'fr' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return j.map((x) => { const a = x.address || {}; return { rue: a.road || a.pedestrian || a.hamlet || '', numero: a.house_number || '', cp: a.postcode || '', localite: a.city || a.town || a.village || a.municipality || '', lat: parseFloat(x.lat), lon: parseFloat(x.lon), label: x.display_name }; });
}
async function geocode(addr) { const text = addrStr(addr); if (!text.trim()) throw new Error('Adresse vide'); const res = await suggestAddress(text); if (!res.length) throw new Error('Adresse introuvable : ' + text); return { lat: res[0].lat, lon: res[0].lon }; }

// Distances domicile → chaque arrêt EN UN SEUL APPEL (matrix). Renvoie un tableau de km (null si indisponible).
async function directMatrix(home, stops) {
  if (S.provider === 'geoapify') {
    const body = { mode: 'drive', sources: [{ location: [home.lon, home.lat] }], targets: stops.map((s) => ({ location: [s.lon, s.lat] })) };
    const r = await fetch(`https://api.geoapify.com/v1/routematrix?apiKey=${S.geoapifyKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Matrix HTTP ' + r.status);
    const j = await r.json(); const row = (j.sources_to_targets && j.sources_to_targets[0]) || [];
    return stops.map((_, i) => { const c = row.find((x) => x.target_index === i) || row[i]; return c && c.distance != null ? c.distance / 1000 : null; });
  }
  const coords = [home, ...stops].map((p) => `${p.lon},${p.lat}`).join(';');
  const r = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`);
  if (!r.ok) throw new Error('Matrix HTTP ' + r.status);
  const j = await r.json(); const d = j.distances && j.distances[0];
  if (!d) throw new Error('distances indisponibles');
  return stops.map((_, i) => (d[i + 1] != null ? d[i + 1] / 1000 : null));
}
async function route(points) {
  if (S.provider === 'geoapify') {
    const wp = points.map((p) => `${p.lat},${p.lon}`).join('|');
    const r = await fetch(`https://api.geoapify.com/v1/routing?waypoints=${encodeURIComponent(wp)}&mode=drive&apiKey=${S.geoapifyKey}`);
    if (!r.ok) throw new Error('Itinéraire HTTP ' + r.status);
    const j = await r.json(); const f = j.features && j.features[0]; const p = f && f.properties;
    if (!p) throw new Error('Itinéraire indisponible');
    let geo = []; const g = f.geometry;
    if (g) { const cc = g.type === 'MultiLineString' ? [].concat(...g.coordinates) : (g.type === 'LineString' ? g.coordinates : []); geo = cc.map((c) => [c[1], c[0]]); }
    return { totalKm: p.distance / 1000, totalMin: p.time / 60, legsKm: (p.legs || []).map((l) => l.distance / 1000), geo };
  }
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
  if (!r.ok) throw new Error('Itinéraire HTTP ' + r.status);
  const j = await r.json(); const rt = j.routes && j.routes[0];
  if (!rt) throw new Error('Itinéraire indisponible');
  const geo = ((rt.geometry && rt.geometry.coordinates) || []).map((c) => [c[1], c[0]]);
  return { totalKm: rt.distance / 1000, totalMin: rt.duration / 60, legsKm: (rt.legs || []).map((l) => l.distance / 1000), geo };
}

// ---------- Widget d'adresse (suggestion PAR champ) ----------
function attachAuto(input, kind, addr, onPick, onEdit) {
  let deb, box;
  const close = () => { if (box) { box.remove(); box = null; } };
  const run = async () => {
    const v = input.value.trim(); if (v.length < 2) { close(); return; }
    const text = kind === 'street' ? [v, addr.cp, addr.localite].filter(Boolean).join(' ') : kind === 'postcode' ? [v, addr.localite].filter(Boolean).join(' ') : v;
    close(); box = document.createElement('div'); box.className = 'aw-sugg'; input.parentElement.appendChild(box); box.innerHTML = '<div class="aw-item">Recherche…</div>';
    try {
      const res = await suggestAddress(text, kind); if (!box) return; box.innerHTML = '';
      if (!res.length) { box.innerHTML = '<div class="aw-item">Aucun résultat</div>'; return; }
      res.forEach((s) => { const d = document.createElement('div'); d.className = 'aw-item'; d.textContent = s.label; d.addEventListener('mousedown', (e) => { e.preventDefault(); onPick(s); close(); }); box.appendChild(d); });
    } catch (e) { if (box) box.innerHTML = '<div class="aw-item">Erreur : ' + e.message + '</div>'; }
  };
  input.addEventListener('input', () => { addr.lat = null; addr.lon = null; onEdit && onEdit(); clearTimeout(deb); deb = setTimeout(run, S.provider === 'geoapify' ? 350 : 1100); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
function mountAddress(container, addr, onChange) {
  addr = toAddr(addr); container.classList.add('addr-widget');
  container.innerHTML = `
    <div class="row"><label class="grow af" style="flex:3">Rue<input class="aw-rue" value="${esc(addr.rue)}" autocomplete="off"/></label><label style="flex:1">N°<input class="aw-num" value="${esc(addr.numero)}" autocomplete="off"/></label></div>
    <div class="row"><label class="af" style="flex:1">Code postal<input class="aw-cp" value="${esc(addr.cp)}" autocomplete="off"/></label><label class="grow af" style="flex:2">Localité<input class="aw-loc" value="${esc(addr.localite)}" autocomplete="off"/></label></div>`;
  const el = { rue: container.querySelector('.aw-rue'), numero: container.querySelector('.aw-num'), cp: container.querySelector('.aw-cp'), localite: container.querySelector('.aw-loc') };
  const emit = () => { addr.rue = el.rue.value; addr.numero = el.numero.value; addr.cp = el.cp.value; addr.localite = el.localite.value; onChange && onChange(addr); };
  const fill = (s) => { if (s.rue) addr.rue = s.rue; if (s.numero) addr.numero = s.numero; if (s.cp) addr.cp = s.cp; if (s.localite) addr.localite = s.localite; addr.lat = s.lat; addr.lon = s.lon; el.rue.value = addr.rue; el.numero.value = addr.numero; el.cp.value = addr.cp; el.localite.value = addr.localite; onChange && onChange(addr); };
  el.numero.addEventListener('input', () => { addr.lat = null; addr.lon = null; emit(); });
  attachAuto(el.rue, 'street', addr, fill, emit); attachAuto(el.cp, 'postcode', addr, fill, emit); attachAuto(el.localite, 'city', addr, fill, emit);
  return addr;
}

// ---------- Carte (Leaflet, marqueurs numérotés) ----------
let _map = null, _mapLayer = null;
function renderMap(rows, home, routeGeo, arrivee) {
  const hint = $('edMapHint');
  if (typeof L === 'undefined') { if (hint) hint.textContent = 'Carte indisponible (hors-ligne).'; return; }
  if (!_map) { _map = L.map('edMap'); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(_map); }
  if (_mapLayer) _mapLayer.remove();
  _mapLayer = L.layerGroup().addTo(_map);
  const pts = [];
  const h = home && home.lat ? [home.lat, home.lon] : null;
  // Arrivée distincte du départ ?
  const aDiff = arrivee && arrivee.lat != null && (!h || arrivee.lat !== home.lat || arrivee.lon !== home.lon);
  if (h) { pts.push(h); L.marker(h, { icon: L.divIcon({ className: '', html: '<div class="map-home">🏠</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(_mapLayer).bindPopup(aDiff ? 'Départ' : 'Départ / retour'); }
  rows.forEach((r, i) => { if (r.lat) { const p = [r.lat, r.lon]; pts.push(p); L.marker(p, { icon: L.divIcon({ className: '', html: `<div class="map-num"><span>${i + 1}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 26] }) }).addTo(_mapLayer).bindPopup(`${i + 1}. ${esc(r.label)}`); } });
  if (aDiff) { const a = [arrivee.lat, arrivee.lon]; pts.push(a); L.marker(a, { icon: L.divIcon({ className: '', html: '<div class="map-home">🏁</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(_mapLayer).bindPopup('Arrivée'); }
  else if (h) pts.push(h);
  const col = S.accentColor || '#e8722a';
  if (routeGeo && routeGeo.length > 1) { L.polyline(routeGeo, { color: col, weight: 4 }).addTo(_mapLayer); _map.fitBounds(routeGeo, { padding: [30, 30] }); }
  else if (pts.length > 1) { L.polyline(pts, { color: col, weight: 3, dashArray: '6 6' }).addTo(_mapLayer); _map.fitBounds(pts, { padding: [30, 30] }); }
  else if (pts.length === 1) _map.setView(pts[0], 13);
  setTimeout(() => _map.invalidateSize(), 150);
}
async function showMapOnly() {
  const hint = $('edMapHint');
  if (!currentTour.arrets.length) { hint.textContent = 'Ajoutez d\'abord des arrêts.'; return; }
  hint.textContent = 'Localisation…';
  try {
    for (const a of currentTour.arrets) { if (!a.addr.lat) { const g = await geocode(a.addr); a.addr.lat = g.lat; a.addr.lon = g.lon; if (S.provider === 'osm') await sleep(1100); } }
    renderMap(currentTour.arrets.map((a) => ({ lat: a.addr.lat, lon: a.addr.lon, label: labelFor(a) })), homeXY(), null, arrivalXY()); hint.textContent = '';
  } catch (e) { hint.textContent = 'Erreur : ' + e.message; }
}
// Force la re-géolocalisation (efface le cache de positions) : domicile + tous les arrêts.
async function forceRelocate() {
  const hint = $('edMapHint'); hint.textContent = 'Re-localisation du départ…';
  try {
    const H = tourHome();
    if (addrStr(H).trim()) { const g = await geocode(H); H.lat = g.lat; H.lon = g.lon; if (currentTour && currentTour.home) saveTournees(); else saveSettings(); if (S.provider === 'osm') await sleep(1100); }
    for (const a of currentTour.arrets) { a.addr.lat = null; a.addr.lon = null; }
    for (const a of currentTour.arrets) { hint.textContent = 'Re-localisation des arrêts…'; const g = await geocode(a.addr); a.addr.lat = g.lat; a.addr.lon = g.lon; if (S.provider === 'osm') await sleep(1100); }
    renderMap(currentTour.arrets.map((a) => ({ lat: a.addr.lat, lon: a.addr.lon, label: labelFor(a) })), homeXY(), null, arrivalXY());
    hint.textContent = 'Positions actualisées. Vérifiez le 🏠 puis relancez « Calculer les frais ».';
  } catch (e) { hint.textContent = 'Erreur : ' + e.message; }
}

// ---------- Navigation GPS (Waze / Google Maps) ----------
const navLabel = () => (S.navApp === 'gmaps' ? 'Maps' : 'Waze');
// Ouvre l'app GPS choisie. Waze : tente l'app installée, repli Google Maps si absente (heuristique de visibilité).
function openNav(addr) {
  const adresse = addrStr(addr);
  const ll = (addr && addr.lat && addr.lon) ? `${addr.lat},${addr.lon}` : null;
  const gmaps = ll ? `https://www.google.com/maps/dir/?api=1&destination=${ll}` : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`;
  try { if (navigator.clipboard) navigator.clipboard.writeText(adresse).catch(() => {}); } catch { /* ignore */ }
  if (S.navApp === 'gmaps') { window.location.href = gmaps; return; }
  const wazeApp = ll ? `waze://?ll=${ll}&navigate=yes` : `waze://?q=${encodeURIComponent(adresse)}&navigate=yes`;
  // Repli Maps SEULEMENT si Waze n'a pas pris la main (app absente). On annule dès que la page perd le focus / se cache / se décharge (= Waze s'est ouvert), sinon les DEUX s'ouvraient.
  let done = false; const cancel = () => { done = true; clearTimeout(timer); };
  const timer = setTimeout(() => { if (!done && !document.hidden) window.location.href = gmaps; }, 2500);
  window.addEventListener('blur', cancel, { once: true });
  window.addEventListener('pagehide', cancel, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); }, { once: true });
  window.location.href = wazeApp;
}

// ---------- Modal ----------
function openModal(html) { $('modalBox').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); $('modalBox').innerHTML = ''; }

// ---------- Navigation ----------
// Recalcule les hauteurs des barres collantes (bandeau + onglets) → offsets sticky des sous-onglets.
function updateStickyOffsets() {
  const root = document.documentElement.style;
  const tb = document.querySelector('.topbar'), tabs = $('mainTabs');
  if (tb) root.setProperty('--topbar-h', tb.offsetHeight + 'px');
  if (tabs) root.setProperty('--tabs-h', tabs.offsetHeight + 'px');
}
function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  $('tab-' + name).classList.add('active'); window.scrollTo(0, 0);
  const cur = document.querySelector('.tab[data-tab="' + name + '"]');
  if (cur && $('navCurrentLabel')) $('navCurrentLabel').textContent = cur.textContent;
  if ($('mainTabs')) $('mainTabs').classList.remove('open'); // referme le menu déroulant (mobile)
  if (name === 'accueil') renderHome();
  if (name === 'tournees') renderTours();
  if (name === 'agenda') { showAgenda(currentAsub); agendaAutoSync(); } // affiche le cache puis rafraîchit silencieusement
  if (name === 'compta') showCompta(currentCsub);
  if (name === 'gestion') showGestion(currentGsub);
  if (name === 'stats') renderStats();
  if (name === 'reglages') showReglages(currentRsub);
}

// Sous-navigation Agenda : Planning / Items
let currentAsub = 'planning';
function showAgenda(sub) {
  currentAsub = sub || 'planning';
  document.querySelectorAll('#agendaSub .subtab').forEach((b) => b.classList.toggle('active', b.dataset.asub === currentAsub));
  document.querySelectorAll('#tab-agenda .subpanel').forEach((p) => p.classList.toggle('active', p.id === 'asub-' + currentAsub));
  const ab = document.querySelector('#agendaSub .subtab[data-asub="' + currentAsub + '"]'), al = document.querySelector('#agendaSub .subnav-label');
  if (ab && al) al.textContent = ab.textContent;
  if ($('agendaSub')) $('agendaSub').classList.remove('open');
  if (currentAsub === 'planning') renderPlanning();
  if (currentAsub === 'items') renderAgendaItems();
  if (currentAsub === 'recuperation') renderAgendaCalendrier();
}

// Sous-navigation Réglages : Configuration / Calcul / Thème
let currentRsub = 'config';
function showReglages(sub) {
  currentRsub = sub || 'config';
  document.querySelectorAll('#reglagesSub .subtab').forEach((b) => b.classList.toggle('active', b.dataset.rsub === currentRsub));
  document.querySelectorAll('#tab-reglages .subpanel').forEach((p) => p.classList.toggle('active', p.id === 'rsub-' + currentRsub));
  const rb = document.querySelector('#reglagesSub .subtab[data-rsub="' + currentRsub + '"]'), rl = document.querySelector('#reglagesSub .subnav-label');
  if (rb && rl) rl.textContent = rb.textContent;
  if ($('reglagesSub')) $('reglagesSub').classList.remove('open');
  if (currentRsub === 'calcul') renderCalcul();
  if (currentRsub === 'analyse') renderAnalyse();
  if (currentRsub === 'changelog') renderChangelog();
  if (currentRsub === 'calendrier') renderAgendaCalendrier();
  window.scrollTo(0, 0);
}

// Hub Gestion : sous-navigation Clients / Articles / Matériel / Frais véhicule / Calcul
let currentGsub = 'clients';
function showGestion(sub) {
  currentGsub = sub || 'clients';
  document.querySelectorAll('#gestionSub .subtab').forEach((b) => b.classList.toggle('active', b.dataset.gsub === currentGsub));
  document.querySelectorAll('#tab-gestion .subpanel').forEach((p) => p.classList.toggle('active', p.id === 'gsub-' + currentGsub));
  const gb = document.querySelector('#gestionSub .subtab[data-gsub="' + currentGsub + '"]'), gl = document.querySelector('#gestionSub .subnav-label');
  if (gb && gl) gl.textContent = gb.textContent;
  if ($('gestionSub')) $('gestionSub').classList.remove('open');
  if (currentGsub === 'clients') renderClients();
  if (currentGsub === 'adresses') renderAdresses();
  if (currentGsub === 'articles') renderArticlesPage();
  if (currentGsub === 'materiel') renderMateriel();
  if (currentGsub === 'vehicule') renderFraisVehicule();
  if (currentGsub === 'sms') renderSMS();
}

// ================= AGENDA (Google Calendar) — onglet Items =================
// Heure "HH:MM" d'un événement (vide si journée entière).
function eventHeure(ev) { const s = (ev && ev.start) || ''; return s.length > 10 ? s.slice(11, 16) : ''; }
// Événements de l'agenda privé pour un jour donné (triés par heure).
function privateEventsForDay(day) {
  return Object.keys(S.agendaPrive || {}).map((id) => Object.assign({ id }, S.agendaPrive[id])).filter((x) => x.day === day).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
}
// Tous les rendez-vous d'un jour (agenda privé + chevaux/clients des tournées), triés par heure (sans heure en dernier).
function dayAgendaEntries(day) {
  const out = [];
  privateEventsForDay(day).forEach((p) => out.push({ heure: eventHeure(p), type: 'prive', label: p.title || '(privé)' }));
  allTours().forEach((t) => { if (t.date !== day) return; (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => out.push({ heure: cv.heure || '', type: 'tour', label: clientLabel(cl.clientId) + ' · ' + cv.nom })))); });
  return out.sort((x, y) => (x.heure || '~').localeCompare(y.heure || '~'));
}
// Décale un mois 'YYYY-MM' de delta mois.
function shiftMonth(ym, delta) { let [y, m] = ym.split('-').map(Number); m += delta; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + '-' + String(m).padStart(2, '0'); }
// Détail complet d'un jour (modale) : liste tous les RDV, avec filtre de date (mini-agenda natif) + jour précédent/suivant.
function modalDay(ds) {
  const entries = dayAgendaEntries(ds);
  let h = `<div class="modal-head"><b>📅 ${esc(fmtDateFr(ds))}</b><button class="x" id="mX">✕</button></div>
    <div class="row planning-ctrl"><button class="btn small" id="dPrev">◀ Jour</button><input type="date" id="dDate" value="${ds}"/><button class="btn small" id="dNext">Jour ▶</button></div>`;
  if (!entries.length) h += '<p class="hint">Aucun rendez-vous ce jour.</p>';
  else h += '<div class="list">' + entries.map((e) => `<div class="list-item"><div class="li-main"><b>${e.heure ? '🕘 ' + esc(e.heure) + ' · ' : ''}${esc(e.label)}</b><span class="li-sub">${e.type === 'prive' ? '📅 Agenda privé' : '🗺 Tournée'}</span></div></div>`).join('') + '</div>';
  openModal(h);
  $('mX').addEventListener('click', closeModal);
  $('dPrev').addEventListener('click', () => modalDay(addDaysStr(ds, -1)));
  $('dNext').addEventListener('click', () => modalDay(addDaysStr(ds, 1)));
  $('dDate').addEventListener('change', (e) => { if (e.target.value) modalDay(e.target.value); });
}
// ================= PLANNING (agenda mensuel : 7 colonnes × semaines) =================
let planningYm = null; // 'YYYY-MM' affiché
function renderPlanning() {
  const host = $('planningBody'); if (!host) return;
  if (!planningYm) planningYm = todayStr().slice(0, 7);
  const [y, m] = planningYm.split('-').map(Number);
  host.innerHTML = '';
  const ctrl = document.createElement('div'); ctrl.className = 'row planning-ctrl';
  ctrl.innerHTML = `<button class="btn small" id="plPrev">◀</button><b class="planning-title">${monthLabel(planningYm)}</b><button class="btn small" id="plNext">▶</button><input type="month" id="plMonth" value="${planningYm}"/><button class="btn small" id="plToday">Ce mois</button>`;
  host.appendChild(ctrl);
  const scroll = document.createElement('div'); scroll.className = 'planning-scroll';
  const grid = document.createElement('div'); grid.className = 'planning-grid';
  ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach((d) => { const h = document.createElement('div'); h.className = 'pl-head'; h.textContent = d; grid.appendChild(h); });
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // blancs avant le 1er (lundi = 0)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const todayS = todayStr();
  for (let i = 0; i < total; i++) {
    const dayNum = i - lead + 1;
    const cell = document.createElement('div'); cell.className = 'pl-cell';
    if (dayNum < 1 || dayNum > daysInMonth) { cell.classList.add('pl-empty'); grid.appendChild(cell); continue; }
    const ds = y + '-' + String(m).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0');
    if (ds === todayS) cell.classList.add('pl-today');
    const entries = dayAgendaEntries(ds);
    let hh = `<div class="pl-num">${dayNum}</div>`;
    entries.slice(0, 3).forEach((e) => { hh += `<div class="pl-ev pl-${e.type}" title="${esc((e.heure ? e.heure + ' ' : '') + e.label)}">${e.heure ? '<b>' + e.heure + '</b> ' : ''}${esc(e.label)}</div>`; });
    if (entries.length > 3) hh += `<div class="pl-more">+${entries.length - 3} autre(s)</div>`;
    cell.innerHTML = hh;
    if (entries.length) cell.classList.add('pl-has');
    cell.addEventListener('click', () => modalDay(ds)); // détail complet du jour
    grid.appendChild(cell);
  }
  scroll.appendChild(grid); host.appendChild(scroll);
  $('plPrev').addEventListener('click', () => { planningYm = shiftMonth(planningYm, -1); renderPlanning(); });
  $('plNext').addEventListener('click', () => { planningYm = shiftMonth(planningYm, 1); renderPlanning(); });
  $('plToday').addEventListener('click', () => { planningYm = todayStr().slice(0, 7); renderPlanning(); });
  $('plMonth').addEventListener('change', (e) => { if (e.target.value) { planningYm = e.target.value; renderPlanning(); } });
}
// Crée un client si besoin, crée la tournée du jour si aucune n'existe (en cours / à venir), sinon ajoute le client
// à la tournée déjà prévue à cette date ; puis l'item quitte la liste. (Jamais les tournées clôturées.)
function attachEventToTour(ev, client) {
  let t = tournees.find((x) => x.date === ev.day && statusOf(x) !== 'cloturee'); // tournée en cours / à venir à cette date
  let created = false;
  if (!t) { t = { id: uid(), date: ev.day, nom: '', closed: false, arrivee: null, arrets: [], articles: [], reductions: {}, payments: {}, result: null, createdAt: Date.now() }; tournees.push(t); created = true; }
  const prev = currentTour; currentTour = t; // addClientToTour opère sur currentTour → on bascule le temps de l'ajout
  addClientToTour(client, activeChevaux(client));
  currentTour = prev;
  const heure = eventHeure(ev); if (heure) setChevalHeure(t, client.id, activeChevaux(client), heure); // reprend l'horaire de l'événement agenda sur les chevaux
  t.result = null; // arrêts modifiés → recalcul géométrie/km à la prochaine ouverture de la tournée
  saveTournees();
  S.agendaImported[ev.id] = { clientId: client.id, tourId: t.id, title: ev.title, start: ev.start, day: ev.day, location: ev.location };
  saveSettings();
  renderAgendaItems(); if (typeof renderAgendaCalendrier === 'function') renderAgendaCalendrier();
  return { tour: t, created };
}
// Bouton « Récupérer » : propose de lier un client connu (croisement nom/prénom/société/cheval) ou d'en créer un nouveau,
// puis rattache l'événement à la tournée du jour.
function recuperateEvent(ev) {
  const matches = matchClientsForEvent(ev);
  const attach = (client) => { const r = attachEventToTour(ev, client); closeModal(); const st = $('agendaStatus'); if (st) { st.className = 'status ok'; st.textContent = (r.created ? 'Tournée créée' : 'Ajouté à la tournée') + ' du ' + (ev.day ? fmtDateFr(ev.day) : '') + ' → ' + fullName(client) + '.'; } };
  let h = `<div class="modal-head"><b>Récupérer l'événement</b><button class="x" id="mX">✕</button></div>
    <p class="hint">« ${esc(ev.title)} »${ev.day ? ' · ' + esc(fmtDateFr(ev.day)) : ''}${ev.location ? ' · 📍 ' + esc(ev.location) : ''}</p>`;
  h += matches.length ? '<h2 style="font-size:.9rem">Client connu proposé</h2><div id="recMatches"></div>' : '<p class="hint">Aucun client connu ne correspond à cet événement.</p>';
  h += '<div class="actions"><button class="btn primary block" id="recNew">+ Créer un nouveau client (nom pré-rempli)</button></div>';
  openModal(h);
  if ($('mX')) $('mX').addEventListener('click', closeModal);
  if (matches.length && $('recMatches')) matches.forEach((c) => { const b = document.createElement('button'); b.className = 'btn block'; b.style.marginBottom = '6px'; b.textContent = 'Lier à ' + fullName(c) + (c.societe ? ' — ' + c.societe : ''); b.addEventListener('click', () => attach(c)); $('recMatches').appendChild(b); });
  if ($('recNew')) $('recNew').addEventListener('click', () => editClient(null, (nc) => attach(nc), ev.title)); // nom pré-rempli avec le titre de l'item
}
function agendaItemRow(ev) {
  const match = matchClientForEvent(ev.title);
  const el = document.createElement('div'); el.className = 'list-item';
  const linkTxt = match ? '≈ ' + esc(fullName(match)) + ' (proposé)' : '⚠ client inconnu → création';
  el.innerHTML = `<div class="li-main"><b>${esc(ev.title)}</b><span class="li-sub">${esc(ev.day ? fmtDateFr(ev.day) : '')}${ev.location ? ' · 📍 ' + esc(ev.location) : ''} · ${linkTxt}</span></div>
    <div class="li-act"><button class="btn small primary" data-rec>Récupérer</button> <button class="btn small" data-prive>Agenda privé</button> <button class="btn small" data-inact>Inactif</button></div>`;
  el.querySelector('[data-rec]').addEventListener('click', () => recuperateEvent(ev));
  el.querySelector('[data-prive]').addEventListener('click', () => { S.agendaPrive[ev.id] = { title: ev.title, day: ev.day, start: ev.start, location: ev.location }; saveSettings(); renderAgendaItems(); if ($('tab-accueil') && $('tab-accueil').classList.contains('active')) renderHomeTrajet(); }); // → agenda privé (perso), quitte la liste
  el.querySelector('[data-inact]').addEventListener('click', () => { S.agendaInactive[ev.id] = true; saveSettings(); renderAgendaItems(); }); // → section Inactifs
  return el;
}
function renderAgendaItems() {
  const box = $('agendaItems'); if (!box) return; box.innerHTML = '';
  const inactBox = $('agendaInactifs'); if (inactBox) inactBox.innerHTML = '';
  const active = _agendaEvents.filter((ev) => !S.agendaInactive[ev.id] && !S.agendaImported[ev.id] && !S.agendaPrive[ev.id]); // récupérés + privés + inactifs quittent la liste
  const inactive = _agendaEvents.filter((ev) => S.agendaInactive[ev.id]);
  if ($('agendaItemsEmpty')) $('agendaItemsEmpty').style.display = active.length ? 'none' : 'block';
  active.forEach((ev) => box.appendChild(agendaItemRow(ev)));
  if ($('agendaInactifsEmpty')) $('agendaInactifsEmpty').style.display = inactive.length ? 'none' : 'block';
  if (inactBox) inactive.forEach((ev) => {
    const el = document.createElement('div'); el.className = 'list-item';
    el.innerHTML = `<div class="li-main"><b>${esc(ev.title)}</b><span class="li-sub">${esc(ev.day ? fmtDateFr(ev.day) : '')}${ev.location ? ' · 📍 ' + esc(ev.location) : ''}</span></div><div class="li-act"><button class="btn small" data-react>Réactiver</button></div>`;
    el.querySelector('[data-react]').addEventListener('click', () => { delete S.agendaInactive[ev.id]; saveSettings(); renderAgendaItems(); });
    inactBox.appendChild(el);
  });
}
function renderAgendaCalendrier() {
  const box = $('agendaDays'); if (!box) return; box.innerHTML = '';
  const imported = Object.keys(S.agendaImported).map((id) => Object.assign({ id }, S.agendaImported[id])).filter((x) => x.day);
  if ($('agendaDaysEmpty')) $('agendaDaysEmpty').style.display = imported.length ? 'none' : 'block';
  const byDay = {}; imported.forEach((x) => { (byDay[x.day] = byDay[x.day] || []).push(x); });
  Object.keys(byDay).sort().forEach((day) => {
    const items = byDay[day];
    const el = document.createElement('div'); el.className = 'inv-client';
    const existing = allTours().find((x) => x.date === day); // « Récupérer » a déjà créé/rempli la tournée du jour
    let h = `<div class="inv-head"><span>${esc(fmtDateFr(day))}</span><button class="btn small primary" data-newtour>${existing ? 'Ouvrir la tournée' : 'Créer la tournée'}</button></div>`;
    items.forEach((x) => { const c = clients.find((cc) => cc.id === x.clientId); h += `<div class="inv-line"><span>${esc(x.title)}</span><span>${c ? esc(fullName(c)) : '⚠ client supprimé'}</span></div>`; });
    el.innerHTML = h;
    el.querySelector('[data-newtour]').addEventListener('click', () => createTourFromDay(day, items));
    box.appendChild(el);
  });
}
// Ouvre la tournée du jour si elle existe déjà (créée par « Récupérer »), sinon en crée une pré-remplie à partir des items.
function createTourFromDay(day, items) {
  const existing = allTours().find((x) => x.date === day);
  if (existing) { openTour(existing); return; } // pas de doublon
  currentTour = { id: uid(), date: day, nom: '', closed: false, arrivee: null, arrets: [], articles: [], reductions: {}, payments: {}, result: null, createdAt: Date.now() };
  const seen = {};
  items.forEach((x) => { const c = clients.find((cc) => cc.id === x.clientId); if (c && !seen[c.id]) { seen[c.id] = 1; addClientToTour(c, activeChevaux(c)); } });
  openEditor(); scheduleGeoRecalc();
}

// ================= CLIENTS =================
const isClientActif = (c) => !!c && c.actif !== false;                     // défaut = actif
const activeChevaux = (c) => ((c && c.chevaux) || []).filter((h) => h.actif !== false);
function renderClients() {
  const list = $('clientsList'); list.innerHTML = '';
  $('clientsEmpty').style.display = clients.length ? 'none' : 'block';
  // Actifs d'abord, inactifs en fin de liste (grisés).
  [...clients].sort((a, b) => (isClientActif(a) === isClientActif(b) ? 0 : (isClientActif(a) ? -1 : 1))).forEach((c) => {
    const nAdr = new Set((c.chevaux || []).map((h) => norm(addrStr(chevalAddr(c, h))))).size || 1;
    const soc = c.societe ? ' — ' + esc(c.societe) : '';
    const inactif = !isClientActif(c);
    const nChev = (c.chevaux || []).length, nChevInact = (c.chevaux || []).filter((h) => h.actif === false).length;
    const el = document.createElement('div'); el.className = 'list-item clickable' + (inactif ? ' item-off' : '');
    el.innerHTML = `<div class="li-main"><b>${esc(fullName(c)) || '<i>sans nom</i>'}${soc}${inactif ? ' <span class="badge">inactif</span>' : ''}</b><span class="li-sub">${esc(addrStr(c.addr)) || '<i>adresse ?</i>'} · ${nChev} cheval(aux)${nChevInact ? ' (' + nChevInact + ' inactif' + (nChevInact > 1 ? 's' : '') + ')' : ''}${nAdr > 1 ? ' · ' + nAdr + ' adresses' : ''}</span></div><div class="li-act"><span class="li-chev">›</span></div>`;
    el.addEventListener('click', () => editClient(c));
    list.appendChild(el);
  });
}
function editClient(existing, onSaved, prefillNom) {
  const key = 'client:' + (existing ? existing.id : 'new');
  const draft = DRAFTS.get(key);
  const w = draft ? draft : (existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), prenom: '', nom: (prefillNom || ''), societe: '', assujettiTva: false, tvaNum: '', entrepriseNum: '', societeMemeAdresse: true, addr: emptyAddr(), societeAddr: emptyAddr(), chevaux: [] });
  w.addr = toAddr(w.addr); w.societeAddr = toAddr(w.societeAddr);
  if (w.prenom === undefined) w.prenom = '';
  if (w.societe === undefined) w.societe = '';
  if (w.societeMemeAdresse === undefined) w.societeMemeAdresse = true;
  const saveDraft = () => DRAFTS.set(key, w); // mémorise la saisie en cours
  openModal(`
    <div class="modal-head"><b>${existing ? 'Éditer' : 'Nouveau'} client</b><button class="x" id="mX">✕</button></div>
    ${draft ? '<div class="draft-bar">✏️ Brouillon en cours restauré<button class="btn small" id="cDraftReset">Effacer le brouillon</button></div>' : ''}
    <div class="row"><label class="grow">Prénom<input type="text" id="cPrenom" value="${esc(w.prenom || '')}" /></label><label class="grow">Nom<input type="text" id="cNom" value="${esc(w.nom)}" /></label></div>
    <label>Société<input type="text" id="cSociete" value="${esc(w.societe)}" placeholder="Raison sociale (facultatif)" /></label>
    <label class="chk2"><input type="checkbox" id="cActif" ${w.actif !== false ? 'checked' : ''}/> Client actif</label>
    <h2 style="font-size:.9rem">Adresse du client</h2><div id="cAddr"></div>
    <div id="cLegal">
      <h2 style="font-size:.9rem">Informations légales</h2>
      <p class="hint" id="cLegalHint">Renseignez d'abord la <b>Société</b> pour activer ces champs.</p>
      <label class="chk2"><input type="checkbox" id="cAssuj" ${w.assujettiTva ? 'checked' : ''}/> Assujetti à la TVA</label>
      <div class="row"><label class="grow">N° de TVA<input type="text" id="cTvaNum" value="${esc(w.tvaNum)}" placeholder="BE0123.456.789" /></label><label class="grow">N° d'entreprise / SIRET<input type="text" id="cEntNum" value="${esc(w.entrepriseNum)}" /></label></div>
      <label class="chk2"><input type="checkbox" id="cSocMeme" ${w.societeMemeAdresse !== false ? 'checked' : ''}/> Société à l'adresse du client</label>
      <div id="cSocAddrWrap" ${w.societeMemeAdresse !== false ? 'style="display:none"' : ''}><h3 style="font-size:.82rem;color:var(--muted);margin:8px 0 4px">Adresse de la société</h3><div id="cSocAddr"></div></div>
    </div>
    <div class="card-head"><h2 style="font-size:.9rem">Chevaux</h2><button class="btn small" id="cAddCheval">+ Cheval</button></div>
    <div id="cChevaux"></div>
    ${existing ? '<button class="btn small danger" id="cDel">Supprimer ce client</button>' : ''}
    <div class="actions"><button class="btn primary block" id="cSave">Enregistrer</button></div>
    <p class="status err" id="cErr"></p>`);
  mountAddress($('cAddr'), w.addr, (a) => { w.addr = a; saveDraft(); });
  mountAddress($('cSocAddr'), w.societeAddr, (a) => { w.societeAddr = a; saveDraft(); });
  // Section légale grisée/inactive tant que la société est vide.
  const updateLegalState = () => {
    const on = !!(w.societe && w.societe.trim());
    const box = $('cLegal'); if (!box) return;
    box.classList.toggle('section-off', !on);
    box.querySelectorAll('input, select').forEach((el) => { el.disabled = !on; });
    if ($('cLegalHint')) $('cLegalHint').style.display = on ? 'none' : '';
  };
  const renderCh = () => {
    const box = $('cChevaux'); box.innerHTML = '';
    if (!w.chevaux.length) box.innerHTML = '<p class="empty">Aucun cheval.</p>';
    w.chevaux.forEach((h, i) => {
      h.addr = toAddr(h.addr); if (!h.addrSource) h.addrSource = 'specifique';
      const row = document.createElement('div'); row.className = 'cheval';
      row.innerHTML = `<div class="a-top"><input type="text" class="grow" placeholder="Nom du cheval" value="${esc(h.nom)}" data-nom /><label class="chk2"><input type="checkbox" data-actif ${h.actif !== false ? 'checked' : ''}/> Actif</label><button class="a-del" data-del>✕</button></div>
        <label>Date de prise en charge<input type="date" data-pec value="${h.datePriseEnCharge || ''}"/></label>
        <label>Adresse du cheval<select data-src>
          <option value="client">Même adresse que le client</option>
          <option value="societe">Adresse de la société</option>
          <option value="specifique">Adresse spécifique</option>
        </select></label>
        <div data-addrmount ${h.addrSource === 'specifique' ? '' : 'style="display:none"'}></div>`;
      row.querySelector('[data-src]').value = h.addrSource;
      row.querySelector('[data-nom]').addEventListener('input', (e) => { h.nom = e.target.value; saveDraft(); });
      row.querySelector('[data-actif]').addEventListener('change', (e) => { h.actif = e.target.checked; saveDraft(); });
      row.querySelector('[data-pec]').addEventListener('change', (e) => { h.datePriseEnCharge = e.target.value || ''; saveDraft(); });
      row.querySelector('[data-del]').addEventListener('click', () => { if (!confirm('Supprimer ce cheval ?')) return; w.chevaux.splice(i, 1); renderCh(); saveDraft(); });
      row.querySelector('[data-src]').addEventListener('change', (e) => { h.addrSource = e.target.value; renderCh(); saveDraft(); });
      if (h.addrSource === 'specifique') mountAddress(row.querySelector('[data-addrmount]'), h.addr, (a) => { h.addr = a; saveDraft(); });
      box.appendChild(row);
    });
  };
  renderCh();
  updateLegalState();
  $('mX').addEventListener('click', closeModal);
  if (draft && $('cDraftReset')) $('cDraftReset').addEventListener('click', () => { DRAFTS.clear(key); closeModal(); editClient(existing, onSaved); });
  $('cPrenom').addEventListener('input', (e) => { w.prenom = e.target.value; saveDraft(); });
  $('cNom').addEventListener('input', (e) => { w.nom = e.target.value; saveDraft(); });
  $('cSociete').addEventListener('input', (e) => { w.societe = e.target.value; updateLegalState(); saveDraft(); });
  if ($('cActif')) $('cActif').addEventListener('change', (e) => { w.actif = e.target.checked; saveDraft(); });
  $('cAssuj').addEventListener('change', (e) => { w.assujettiTva = e.target.checked; saveDraft(); });
  $('cTvaNum').addEventListener('input', (e) => { w.tvaNum = e.target.value; saveDraft(); });
  $('cEntNum').addEventListener('input', (e) => { w.entrepriseNum = e.target.value; saveDraft(); });
  $('cSocMeme').addEventListener('change', (e) => { w.societeMemeAdresse = e.target.checked; $('cSocAddrWrap').style.display = e.target.checked ? 'none' : ''; saveDraft(); });
  $('cAddCheval').addEventListener('click', () => { w.chevaux.push({ id: uid(), nom: '', addrSource: 'specifique', addr: emptyAddr() }); renderCh(); saveDraft(); });
  if (existing) $('cDel').addEventListener('click', () => { if (confirm('Supprimer ce client ?')) { DRAFTS.clear(key); clients = clients.filter((x) => x.id !== w.id); saveClients(); closeModal(); renderClients(); } });
  $('cSave').addEventListener('click', () => {
    if (!(w.nom || '').trim() && !(w.prenom || '').trim()) { $('cErr').textContent = 'Le nom (ou le prénom) est obligatoire.'; return; }
    if (!addrStr(w.addr).trim()) { $('cErr').textContent = 'L\'adresse du client est obligatoire.'; return; }
    const i = clients.findIndex((x) => x.id === w.id); if (i >= 0) clients[i] = w; else clients.push(w);
    DRAFTS.clear(key); saveClients(); reconcileActiveTours(); closeModal();
    if (onSaved) onSaved(w); else renderClients();
  });
}

// ================= GESTION → MES ADRESSES (départ) =================
function renderAdresses() {
  const box = $('adressesList'); if (!box) return; box.innerHTML = '';
  $('adressesEmpty').style.display = S.adresses.length ? 'none' : 'block';
  S.adresses.forEach((a) => {
    const el = document.createElement('div'); el.className = 'list-item';
    el.innerHTML = `<div class="li-main"><b>${esc(a.nom || 'Adresse')}</b><span class="li-sub">${esc(addrStr(a.addr)) || '<i>adresse ?</i>'}</span></div><div class="li-act"><button class="btn small" data-edit>Éditer</button></div>`;
    el.querySelector('[data-edit]').addEventListener('click', () => modalAdresse(a));
    box.appendChild(el);
  });
}
function modalAdresse(existing, onSaved) {
  const key = 'adresse:' + (existing ? existing.id : 'new');
  const draft = DRAFTS.get(key);
  const w = draft ? draft : (existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), nom: '', addr: emptyAddr() });
  w.addr = toAddr(w.addr);
  const saveDraft = () => DRAFTS.set(key, w);
  openModal(`<div class="modal-head"><b>${existing ? 'Éditer' : 'Nouvelle'} adresse de départ</b><button class="x" id="mX">✕</button></div>
    ${draft ? '<div class="draft-bar">✏️ Brouillon en cours restauré<button class="btn small" id="adDraftReset">Effacer le brouillon</button></div>' : ''}
    <label>Nom de l'adresse<input type="text" id="adNom" value="${esc(w.nom)}" placeholder="Domicile, Écurie du Nord…" /></label>
    <h2 style="font-size:.9rem">Adresse</h2><div id="adAddr"></div>
    ${existing ? '<button class="btn small danger" id="adDel">Supprimer</button>' : ''}
    <div class="actions"><button class="btn primary block" id="adOk">Enregistrer</button></div>
    <p class="status err" id="adErr"></p>`);
  mountAddress($('adAddr'), w.addr, (a) => { w.addr = a; saveDraft(); });
  $('mX').addEventListener('click', closeModal);
  if (draft && $('adDraftReset')) $('adDraftReset').addEventListener('click', () => { DRAFTS.clear(key); closeModal(); modalAdresse(existing, onSaved); });
  $('adNom').addEventListener('input', (e) => { w.nom = e.target.value; saveDraft(); });
  if (existing) $('adDel').addEventListener('click', () => { if (confirm('Supprimer cette adresse ?')) { DRAFTS.clear(key); S.adresses = S.adresses.filter((x) => x.id !== w.id); saveSettings(); closeModal(); renderAdresses(); } });
  $('adOk').addEventListener('click', async () => {
    if (!w.nom.trim()) { $('adErr').textContent = 'Le nom est obligatoire.'; return; }
    if (!addrStr(w.addr).trim()) { $('adErr').textContent = 'L\'adresse est obligatoire.'; return; }
    if (!w.addr.lat) { try { const g = await geocode(w.addr); w.addr.lat = g.lat; w.addr.lon = g.lon; } catch { /* localisation différée */ } }
    const i = S.adresses.findIndex((x) => x.id === w.id); if (i >= 0) S.adresses[i] = w; else S.adresses.push(w);
    DRAFTS.clear(key); saveSettings(); closeModal();
    if (onSaved) onSaved(w); else renderAdresses();
  });
}
// Modale « Changer le départ » d'une tournée : choisir une adresse enregistrée, le domicile, ou en créer une.
function modalTourHome() {
  if (!currentTour) return;
  openModal(`<div class="modal-head"><b>Adresse de départ de la tournée</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Choisissez une adresse enregistrée, le domicile des Réglages, ou créez-en une nouvelle.</p>
    <div class="actions"><button class="btn block" id="thNew">➕ Créer une nouvelle adresse</button></div>
    <div class="actions"><button class="btn block" id="thHome">🏠 Domicile (Réglages) : ${esc(addrStr(S.home)) || 'non défini'}</button></div>
    <p class="hint">${S.adresses.length ? 'Adresses enregistrées :' : 'Aucune adresse enregistrée — créez-en une ci-dessus.'}</p>
    <div class="list" id="thList"></div>`);
  $('mX').addEventListener('click', closeModal);
  const setHome = async (addr) => {
    currentTour.home = toAddr(addr);
    if (!currentTour.home.lat && addrStr(currentTour.home).trim()) { try { const g = await geocode(currentTour.home); currentTour.home.lat = g.lat; currentTour.home.lon = g.lon; } catch { /* localisation différée */ } }
    saveTournees(); closeModal(); openEditor(); scheduleGeoRecalc();
  };
  $('thNew').addEventListener('click', () => modalAdresse(null, (na) => setHome(na.addr)));
  $('thHome').addEventListener('click', () => { currentTour.home = null; saveTournees(); closeModal(); openEditor(); scheduleGeoRecalc(); });
  const box = $('thList');
  S.adresses.forEach((a) => { const b = document.createElement('button'); b.className = 'btn block'; b.style.textAlign = 'left'; b.style.marginBottom = '6px'; b.innerHTML = `<b>${esc(a.nom)}</b> <span class="li-sub">${esc(addrStr(a.addr))}</span>`; b.addEventListener('click', () => setHome(a.addr)); box.appendChild(b); });
}
// Modale « Changer l'arrivée » : adresse d'arrivée distincte du départ (ou retour au départ).
function modalTourArrivee() {
  if (!currentTour) return;
  openModal(`<div class="modal-head"><b>Adresse d'arrivée de la tournée</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Par défaut, la tournée revient au point de départ. Choisissez une arrivée différente (adresse enregistrée ou nouvelle) pour plus de flexibilité.</p>
    <div class="actions"><button class="btn block" id="taNew">➕ Créer une nouvelle adresse</button></div>
    <div class="actions"><button class="btn block" id="taHome">🏠 Retour au départ (par défaut)</button></div>
    <p class="hint">${S.adresses.length ? 'Adresses enregistrées :' : 'Aucune adresse enregistrée — créez-en une ci-dessus.'}</p>
    <div class="list" id="taList"></div>`);
  $('mX').addEventListener('click', closeModal);
  const setArr = async (addr) => {
    currentTour.arrivee = toAddr(addr);
    if (!currentTour.arrivee.lat && addrStr(currentTour.arrivee).trim()) { try { const g = await geocode(currentTour.arrivee); currentTour.arrivee.lat = g.lat; currentTour.arrivee.lon = g.lon; } catch { /* localisation différée */ } }
    saveTournees(); closeModal(); openEditor(); scheduleGeoRecalc();
  };
  $('taNew').addEventListener('click', () => modalAdresse(null, (na) => setArr(na.addr)));
  $('taHome').addEventListener('click', () => { currentTour.arrivee = null; saveTournees(); closeModal(); openEditor(); scheduleGeoRecalc(); });
  const box = $('taList');
  S.adresses.forEach((a) => { const b = document.createElement('button'); b.className = 'btn block'; b.style.textAlign = 'left'; b.style.marginBottom = '6px'; b.innerHTML = `<b>${esc(a.nom)}</b> <span class="li-sub">${esc(addrStr(a.addr))}</span>`; b.addEventListener('click', () => setArr(a.addr)); box.appendChild(b); });
}

// ================= TOURNÉES =================
function tourListItem(t, showBadge) {
  const st = statusOf(t);
  const el = document.createElement('div'); el.className = 'list-item clickable';
  const titre = fmtDateFr(t.date) + (t.nom && t.nom.trim() ? ' : ' + esc(t.nom.trim()) : '');
  const clientsLine = (t.arrets || []).map((a) => labelFor(a)).filter(Boolean).join(' · '); // noms de clients par arrêt
  el.innerHTML = `<div class="li-main"><b>${titre}${showBadge ? ' · ' + STATUS_LBL[st] : ''}</b><span class="li-sub">${t.arrets.length} arrêt(s) · ${t.result ? km(t.result.totalKm) + ' · ' + eur(t.result.totalTTC) + ' TTC' : 'non calculée'}</span>${clientsLine ? '<span class="li-sub">👤 ' + esc(clientsLine) + '</span>' : ''}</div><div class="li-act"><span class="li-chev">›</span></div>`;
  el.addEventListener('click', () => openTour(t));
  return el;
}
function renderTours() {
  const d = new Date(); d.setDate(d.getDate() - 28); const fourWeeksAgo = d.toISOString().slice(0, 10);
  const asc = (a, b) => (a.date || '').localeCompare(b.date || ''), desc = (a, b) => (b.date || '').localeCompare(a.date || '');
  const closed = allTours().filter((x) => statusOf(x) === 'cloturee'); // inclut les archivées (store séparé)
  const fill = (listId, emptyId, items) => { const box = $(listId); if (!box) return; box.innerHTML = ''; $(emptyId).style.display = items.length ? 'none' : 'block'; items.forEach((x) => box.appendChild(tourListItem(x, true))); };
  // « À venir » regroupe désormais aujourd'hui (non clôturée) + les tournées futures.
  fill('trUpcoming', 'trUpcomingEmpty', tournees.filter((x) => { const s = statusOf(x); return s === 'active' || s === 'avenir'; }).sort(asc));
  fill('trClosed', 'trClosedEmpty', closed.filter((x) => (x.date || '') >= fourWeeksAgo).sort(desc));
  fill('trArchive', 'trArchiveEmpty', closed.filter((x) => (x.date || '') < fourWeeksAgo).sort(desc));
}
function newTour() { currentTour = { id: uid(), date: todayStr(), nom: '', closed: false, arrivee: null, arrets: [], articles: [], reductions: {}, result: null, createdAt: Date.now() }; openEditor(); }
// D2 — archivage : déplace les tournées clôturées > 4 semaines de `tournees` vers `archive` (simple déplacement, union inchangée).
function archiveOldTours() {
  const d = new Date(); d.setDate(d.getDate() - 28); const cutoff = d.toISOString().slice(0, 10);
  const move = tournees.filter((t) => statusOf(t) === 'cloturee' && (t.date || '') < cutoff);
  if (!move.length) return 0;
  const ids = new Set(move.map((t) => t.id));
  tournees = tournees.filter((t) => !ids.has(t.id));
  move.forEach((t) => { if (!archive.some((a) => a.id === t.id)) archive.push(t); });
  LS.set('ftr.tournees', tournees); LS.set('ftr.archive', archive); // pas de tombstone : déplacement, pas suppression
  return move.length;
}
function openTour(t) { currentTour = JSON.parse(JSON.stringify(t)); openEditor(); }

// Synchronise une tournée non clôturée avec les données client actuelles (chevaux ajoutés/supprimés/renommés
// ET changements d'adresse client/cheval → l'arrêt suit la nouvelle adresse). Les clôturées restent figées.
function reconcileTour(tour) {
  if (statusOf(tour) === 'cloturee') return false;
  let changed = false;
  const beforeArrets = JSON.stringify(tour.arrets || []);
  const addrSig = (arrets) => (arrets || []).map((a) => norm(addrStr(a.addr))).sort().join('|');
  const beforeAddr = addrSig(tour.arrets);
  const oldArrets = tour.arrets || [];
  const newArrets = [];
  const findOrCreate = (addr, type) => { let a = newArrets.find((x) => norm(addrStr(x.addr)) === norm(addrStr(addr))); if (!a) { a = { addr: toAddr(JSON.parse(JSON.stringify(addr))), type: type || 'tournee', clients: [] }; newArrets.push(a); } return a; };
  oldArrets.forEach((a) => {
    (a.clients || []).forEach((cl) => {
      const c = clients.find((x) => x.id === cl.clientId);
      if (!c) return; // client supprimé → retiré
      const actifs = activeChevaux(c);
      if (!actifs.length) { const arr = findOrCreate(c.addr, a.type); if (!arr.clients.some((x) => x.clientId === cl.clientId)) arr.clients.push({ clientId: cl.clientId, chevaux: [] }); return; } // client sans cheval actif → déplacement seul, à l'adresse ACTUELLE du client
      if (!cl.chevaux.length) { // arrêt « déplacement seul » alors que le client a maintenant des chevaux actifs (ex. client créé à la récupération d'un item, chevaux ajoutés depuis) → on les rattache
        actifs.forEach((h) => { const arr = findOrCreate(chevalAddr(c, h), a.type); let ncl = arr.clients.find((x) => x.clientId === cl.clientId); if (!ncl) { ncl = { clientId: cl.clientId, chevaux: [] }; arr.clients.push(ncl); } if (!ncl.chevaux.some((x) => (x.id && x.id === h.id) || norm(x.nom) === norm(h.nom))) ncl.chevaux.push({ id: h.id, nom: h.nom, fourbure: false, npas: false, infection: false, parage: false, heure: '' }); });
        return;
      }
      cl.chevaux.forEach((cv) => {
        const h = (c.chevaux || []).find((x) => (cv.id && x.id === cv.id) || norm(x.nom) === norm(cv.nom));
        if (!h) return; // cheval supprimé → retiré
        const arr = findOrCreate(chevalAddr(c, h), a.type); // adresse ACTUELLE du cheval → suit le changement d'adresse
        let ncl = arr.clients.find((x) => x.clientId === cl.clientId); if (!ncl) { ncl = { clientId: cl.clientId, chevaux: [] }; arr.clients.push(ncl); }
        if (!ncl.chevaux.some((x) => (x.id && x.id === h.id) || norm(x.nom) === norm(h.nom))) ncl.chevaux.push({ id: h.id, nom: h.nom, fourbure: !!cv.fourbure, npas: !!cv.npas, infection: !!cv.infection, parage: !!cv.parage, heure: cv.heure || '' });
      });
    });
  });
  newArrets.forEach((na) => { const old = oldArrets.find((o) => norm(addrStr(o.addr)) === norm(addrStr(na.addr))); if (old) { if (typeof old.realMin === 'number') na.realMin = old.realMin; if (typeof old.validatedAt === 'number') na.validatedAt = old.validatedAt; } });
  tour.arrets = newArrets.filter((a) => a.clients.length);
  if (JSON.stringify(tour.arrets) !== beforeArrets) changed = true;
  if (beforeAddr !== addrSig(tour.arrets)) tour.result = null; // adresses modifiées → recalcul géométrie au prochain ouvrir
  // Articles : resync par id (renommage / suppression de cheval)
  (tour.articles || []).forEach((art) => {
    if (art.impaye) return; // impayé : rattaché au client, sans cheval → on n'y touche pas
    const c = clients.find((x) => x.id === art.clientId); if (!c) return;
    if (!art.chevalIds) art.chevalIds = (art.chevalNoms || []).map((n) => { const h = (c.chevaux || []).find((x) => norm(x.nom) === norm(n)); return h ? h.id : null; }).filter(Boolean);
    const kept = (art.chevalIds || []).filter((id) => (c.chevaux || []).some((h) => h.id === id));
    if (JSON.stringify(kept) !== JSON.stringify(art.chevalIds || [])) changed = true;
    art.chevalIds = kept;
    art.chevalNoms = kept.map((id) => { const h = c.chevaux.find((x) => x.id === id); return h ? h.nom : ''; }).filter(Boolean);
  });
  const na = (tour.articles || []).length;
  tour.articles = (tour.articles || []).filter((art) => art.impaye || (art.chevalIds || art.chevalNoms || []).length);
  if ((tour.articles || []).length !== na) changed = true;
  if (changed) saveTournees();
  return changed;
}

// Répercute les changements client/cheval (dont adresse) sur toutes les tournées en cours/à venir (jamais les clôturées).
function reconcileActiveTours() {
  let any = false;
  (tournees || []).forEach((t) => { if (statusOf(t) !== 'cloturee') { if (reconcileTour(t)) any = true; } });
  return any;
}

// Sécurité de clôture : chaque client doit avoir un mode de paiement (virement/liquide) ; en liquide, le montant encaissé est requis.
function tourCloseBlock(t) {
  const out = []; const seen = new Set();
  (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => {
    if (seen.has(cl.clientId)) return; seen.add(cl.clientId);
    const p = (t.payments || {})[cl.clientId];
    const method = p ? p.method : null;
    if (method !== 'virement' && method !== 'liquide') out.push(clientName(cl.clientId) + ' : mode de paiement non choisi');
    else if (method === 'liquide' && (!p || (p.rectifie == null && p.montantPaye == null))) out.push(clientName(cl.clientId) + ' : montant liquide non renseigné');
  }));
  return out;
}
function openEditor() {
  const st = statusOf(currentTour); const locked = st === 'cloturee';
  reconcileTour(currentTour); // resync chevaux/clients (non clôturée)
  const dateLbl = currentTour.date ? fmtDateFr(currentTour.date) : '';
  $('edTitle').textContent = currentTour.result ? ('Tournée — ' + dateLbl + (currentTour.nom ? ' : ' + currentTour.nom : '')) : 'Nouvelle tournée';
  $('edStatusBadge').textContent = STATUS_LBL[st];
  $('edDate').value = currentTour.date; $('edDate').disabled = locked;
  if ($('edNom')) { $('edNom').value = currentTour.nom || ''; $('edNom').disabled = locked; }
  const H = tourHome();
  const hasHome = addrStr(H).trim();
  $('edHome').textContent = hasHome ? ('Départ : ' + addrStr(H) + (currentTour.home && addrStr(currentTour.home).trim() ? ' (propre à cette tournée)' : ' (domicile)')) : '⚠️ Départ non défini — cliquez « Changer le départ », ou renseignez-le dans Gestion → Mes adresses → Point de départ.';
  if ($('edHome')) $('edHome').classList.toggle('err', !hasHome);
  // Arrivée : distincte si définie, sinon retour au départ.
  const hasArr = currentTour.arrivee && addrStr(currentTour.arrivee).trim();
  if ($('edArrivee')) $('edArrivee').textContent = hasArr ? ('Arrivée : ' + addrStr(currentTour.arrivee) + ' (propre à cette tournée)') : (hasHome ? 'Arrivée : retour au départ' : 'Arrivée : non définie');
  if ($('edChangeHome')) $('edChangeHome').style.display = locked ? 'none' : '';
  if ($('edChangeArrivee')) $('edChangeArrivee').style.display = locked ? 'none' : '';
  if ($('edCloseWrap')) $('edCloseWrap').style.display = locked ? 'none' : '';
  if ($('edCloseWarn')) { const blk = locked ? [] : tourCloseBlock(currentTour); $('edCloseWarn').innerHTML = blk.length ? '🔒 Clôture bloquée — paiement à renseigner :<br>• ' + blk.map(esc).join('<br>• ') + '<br>Ouvrez l\'arrêt concerné → <b>💶 Paiement</b>.' : ''; $('edCloseWarn').classList.toggle('hidden', !blk.length); }
  $('edLockBanner').classList.toggle('hidden', !locked);
  if (locked && $('edLockBanner')) $('edLockBanner').textContent = currentTour.autoClosedAt ? '🤖 Tournée clôturée automatiquement · ' + hm(currentTour.autoClosedAt) + ' (retour + 3 h). Lecture seule.' : '🔒 Tournée clôturée (figée). Lecture seule.';
  $('edAddArret').style.display = locked ? 'none' : '';
  $('edCalc').style.display = 'none'; // recalcul automatique — bouton masqué mais fonctionnel
  $('edDelete').style.display = '';
  renderEditorArrets(locked);
  if (locked) renderResultUI(currentTour.result || null); // tournée figée : on affiche le résultat stocké, sans recalcul ni ré-enregistrement
  else if (currentTour.result && currentTour.result.rows && currentTour.result.rows.length === currentTour.arrets.length) recomputeMoney();
  else { renderResultUI(null); if (currentTour.arrets.length) scheduleGeoRecalc(); }
  $('edStatus').textContent = '';
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  $('tab-editeur').classList.add('active'); window.scrollTo(0, 0);
  if (currentTour.result) renderMap(currentTour.result.rows.map((r) => ({ lat: r.lat, lon: r.lon, label: r.label })), homeXY(), currentTour.result.routeGeo, arrivalXY());
  else if (_mapLayer) { _mapLayer.remove(); _mapLayer = null; }
}

// Libellé d'arrêt = nom du/des client(s) (+ société), SANS les chevaux.
function clientLabel(id) { const c = clients.find((x) => x.id === id); return c ? (fullName(c) + (c.societe ? ' — ' + c.societe : '')) : '?'; }
function labelFor(a) { return (a.clients || []).map((cl) => clientLabel(cl.clientId)).join(' + '); }

// ----- Sélecteur de client cherchable (nom / prénom / société / cheval), trié par prénom nom -----
function clientMatches(c, q) {
  q = norm(q); if (!q) return true;
  const hay = norm([c.prenom, c.nom, c.societe].concat((c.chevaux || []).map((h) => h.nom)).filter(Boolean).join(' '));
  return q.split(/\s+/).filter(Boolean).every((tok) => hay.includes(tok));
}
function sortByName(list) {
  return [...list].sort((a, b) => norm(a.prenom || '').localeCompare(norm(b.prenom || '')) || norm(a.nom || '').localeCompare(norm(b.nom || '')));
}
// container : élément hôte ; opts = { list, getSelected, onPick, highlightId }
function mountClientPicker(container, opts) {
  const list = opts.list || clients;
  container.innerHTML = `<div class="cp"><input class="cp-search" type="search" placeholder="Rechercher : nom, prénom, société, cheval…" autocomplete="off"/><div class="cp-list"></div></div>`;
  const search = container.querySelector('.cp-search'), listEl = container.querySelector('.cp-list');
  const render = () => {
    const sel = opts.getSelected ? opts.getSelected() : null;
    let items = sortByName(list).filter((c) => clientMatches(c, search.value));
    if (opts.highlightId) items.sort((a, b) => (a.id === opts.highlightId ? -1 : b.id === opts.highlightId ? 1 : 0));
    listEl.innerHTML = '';
    if (!items.length) { listEl.innerHTML = '<p class="empty">Aucun client trouvé.</p>'; return; }
    items.forEach((c) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'cp-item' + (c.id === sel ? ' on' : '');
      const soc = c.societe ? ' — ' + esc(c.societe) : '';
      const chn = (c.chevaux || []).map((h) => h.nom).filter(Boolean).join(', ');
      b.innerHTML = `<b>${esc(fullName(c)) || '<i>sans nom</i>'}${soc}</b><span class="li-sub">${esc(addrStr(c.addr))} · ${(c.chevaux || []).length} cheval(aux)${chn ? ' · 🐴 ' + esc(chn) : ''}${c.id === opts.highlightId ? ' · ✔ nouveau' : ''}</span>`;
      b.addEventListener('click', () => opts.onPick(c));
      listEl.appendChild(b);
    });
  };
  search.addEventListener('input', render);
  render();
  return { render };
}

// ----- Ajout d'arrêt : client -> (choix chevaux si multi-adresses) -----
function pickClientForArret(highlightId) {
  openModal(`<div class="modal-head"><b>Ajouter un arrêt</b><button class="x" id="mX">✕</button></div>
    <div class="actions"><button class="btn block" id="pNew">➕ Créer un nouveau client</button></div>
    <p class="hint">${clients.length ? 'Choisissez un client existant :' : 'Aucun client encore — créez-en un ci-dessus.'}</p>
    <div id="pickPicker"></div>`);
  $('mX').addEventListener('click', closeModal);
  $('pNew').addEventListener('click', () => editClient(null, (nc) => pickClientForArret(nc.id)));
  if (clients.length) mountClientPicker($('pickPicker'), { list: clients, highlightId, onPick: (c) => chooseClientTargets(c) });
}
const societeAddrOf = (c) => (c.societeMemeAdresse !== false || !addrStr(c.societeAddr)) ? c.addr : c.societeAddr;
const chevalAddr = (c, h) => {
  const src = h.addrSource || (h.memeAdresse === false ? 'specifique' : 'client');
  if (src === 'societe') return societeAddrOf(c);
  if (src === 'specifique') return addrStr(h.addr) ? h.addr : c.addr;
  return c.addr;
};
function chooseClientTargets(c) {
  const chs = c.chevaux || [];
  const distinct = new Set(chs.map((h) => norm(addrStr(chevalAddr(c, h)))));
  if (!chs.length || distinct.size <= 1) { addClientToTour(c, chs); closeModal(); renderEditorArrets(); scheduleGeoRecalc(); return; }
  const picked = new Set(chs.map((_, i) => i));
  openModal(`<div class="modal-head"><b>Chevaux — ${esc(fullName(c))}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Ce client a des chevaux à des adresses différentes. Cochez ceux à visiter (un arrêt par adresse).</p>
    <div id="chList"></div><div class="actions"><button class="btn primary block" id="addSel">Ajouter la sélection</button></div>`);
  $('mX').addEventListener('click', closeModal);
  const box = $('chList');
  chs.forEach((h, i) => { const row = document.createElement('label'); row.className = 'chk'; row.style.marginBottom = '8px'; row.innerHTML = `<input type="checkbox" checked/> <b>${esc(h.nom || 'cheval')}</b> — ${esc(addrStr(chevalAddr(c, h)))}`; row.querySelector('input').addEventListener('change', (e) => { e.target.checked ? picked.add(i) : picked.delete(i); }); box.appendChild(row); });
  $('addSel').addEventListener('click', () => { addClientToTour(c, chs.filter((_, i) => picked.has(i))); closeModal(); renderEditorArrets(); scheduleGeoRecalc(); });
}
function addClientToTour(c, chevaux) {
  const groups = {};
  const push = (addr, ch) => { const k = norm(addrStr(addr)); if (!groups[k]) groups[k] = { addr: toAddr(addr), chevaux: [] }; if (ch) groups[k].chevaux.push({ id: ch.id, nom: ch.nom || 'cheval', fourbure: false, npas: false, infection: false }); };
  if (!chevaux.length) push(c.addr, null);
  else chevaux.forEach((h) => push(chevalAddr(c, h), h));
  Object.values(groups).forEach((g) => {
    const ex = currentTour.arrets.find((a) => norm(addrStr(a.addr)) === norm(addrStr(g.addr)));
    if (ex) { let cl = ex.clients.find((x) => x.clientId === c.id); if (!cl) { cl = { clientId: c.id, chevaux: [] }; ex.clients.push(cl); } g.chevaux.forEach((n) => cl.chevaux.push(n)); }
    else currentTour.arrets.push({ addr: JSON.parse(JSON.stringify(g.addr)), type: 'tournee', clients: [{ clientId: c.id, chevaux: g.chevaux.slice() }] });
  });
  // Impayés reportés du client → ligne d'article « Impayé du … » mise en place directement dans cette tournée.
  if (!currentTour.articles) currentTour.articles = [];
  let addedImpaye = false;
  (c.impayes || []).filter((im) => !im.collected).forEach((im) => { // reste « reporté » (liquide) réintégré automatiquement à la tournée du client
    if (currentTour.articles.some((a) => a.impayeId === im.id)) return;
    const r = rate(); const ht = im.ttc / (1 + r);
    currentTour.articles.push({ id: uid(), clientId: c.id, chevalNoms: [], chevalIds: [], libelle: 'Impayé du ' + fmtDateFr(im.date), prixHT: ht, tvaPct: S.tvaRate, impaye: true, impayeId: im.id });
    im.collected = true; im.collectedTourId = currentTour.id; addedImpaye = true;
  });
  if (addedImpaye) saveClients();
}

function renderEditorArrets(locked) {
  if (locked === undefined) locked = statusOf(currentTour) === 'cloturee';
  const box = $('edArrets'); box.innerHTML = '';
  $('edArretsEmpty').style.display = currentTour.arrets.length ? 'none' : 'block';
  const N = currentTour.arrets.length;
  const legMins = legMinutesFor(currentTour); // temps de trajet estimé cumulé par arrêt
  currentTour.arrets.forEach((a, i) => {
    const nb = arretNbClients(a);
    const single = a.clients.length === 1 ? a.clients[0] : null; // réduction dans l'en-tête si 1 seul client
    const el = document.createElement('div'); el.className = 'arret'; el.dataset.idx = i;
    el.innerHTML = `
      <div class="a-top">
        ${locked ? '' : '<div class="a-drag" title="Glisser pour réordonner">⠿</div>'}
        ${locked ? `<span class="a-num">${i + 1}</span>` : `<input class="a-num-in" data-order type="number" min="1" max="${N}" value="${i + 1}" title="N° d'ordre de passage (modifiable)"/>`}
        <div class="grow"><b>${esc(labelFor(a))}</b><div class="li-sub">${esc(addrStr(a.addr))}${nb > 1 ? ' · <span class="badge">' + nb + ' clients ici</span>' : ''}</div></div>
        ${locked ? '' : '<button class="a-del" data-del title="Retirer">✕</button>'}
      </div>
      ${(!locked && single) ? `<label class="a-reduc-row"><span>Réduction articles</span><span class="fu"><input type="number" data-reduc-h min="0" max="100" step="1" value="${currentTour.reductions && currentTour.reductions[single.clientId] || ''}" placeholder="0"/><span class="fu-unit">%</span></span></label>` : ''}
      <div class="a-grid"><label class="grow">Tarif appliqué<select data-type ${locked ? 'disabled' : ''}><option value="tournee">Tournée</option><option value="visite">Visite</option><option value="urgence">Urgence</option></select></label></div>`;
    el.querySelector('[data-type]').value = a.type || 'tournee';
    // Temps trajet + (tournée non clôturée) Waze / Route / Paiement. Tournée clôturée = figée : aucun bouton (paiement se gère en Compta).
    const nav = document.createElement('div'); nav.className = 'a-nav';
    const estMin = legMins[i] != null ? Math.round(legMins[i]) : null;
    const realMin = (typeof a.realMin === 'number') ? a.realMin : null;
    nav.innerHTML = `<span class="a-nav-t">🕒 ${estMin != null ? durMin(estMin) + ' est.' : '—'}${realMin != null ? ' · <b>' + durMin(realMin) + ' réel</b>' : ''}</span>${locked ? '' : `<span class="a-nav-b"><button class="btn small" data-waze>${navLabel()}</button> <button class="btn small" data-route>Route</button> <button class="btn small" data-pay>💶 Paiement</button></span>`}`;
    if (!locked) {
      nav.querySelector('[data-waze]').addEventListener('click', () => openNav(a.addr));
      nav.querySelector('[data-route]').addEventListener('click', () => modalRouteTime(currentTour, a, estMin, () => renderEditorArrets()));
      nav.querySelector('[data-pay]').addEventListener('click', () => modalPayment(currentTour, a, () => renderEditorArrets())); // classer le paiement pour la Compta
    }
    el.appendChild(nav);
    if (!locked) {
      if (!currentTour.reductions) currentTour.reductions = {};
      el.querySelector('[data-type]').addEventListener('change', (e) => { a.type = e.target.value; recomputeMoney(); });
      el.querySelector('[data-del]').addEventListener('click', () => { if (!confirm('Retirer cet arrêt (client) de la tournée ?')) return; currentTour.arrets.splice(i, 1); renderEditorArrets(locked); scheduleGeoRecalc(); });
      // N° d'ordre saisi : déplace l'arrêt à la position demandée ; les autres se renumérotent tout seuls.
      const ord = el.querySelector('[data-order]');
      if (ord) ord.addEventListener('change', (e) => {
        let np = parseInt(e.target.value, 10);
        if (isNaN(np)) { renderEditorArrets(locked); return; }
        np = Math.max(1, Math.min(N, np)) - 1;
        if (np === i) return;
        const [moved] = currentTour.arrets.splice(i, 1);
        currentTour.arrets.splice(np, 0, moved);
        renderEditorArrets(locked); scheduleGeoRecalc();
      });
      const rh = el.querySelector('[data-reduc-h]');
      if (rh) rh.addEventListener('input', (e) => { currentTour.reductions[single.clientId] = parseFloat(e.target.value) || 0; saveTournees(); recomputeMoney(); });
    }
    if (!locked) {
      if (!currentTour.reductions) currentTour.reductions = {};
      a.clients.forEach((cl) => {
        if (!cl.chevaux.length) return;
        const wrap = document.createElement('div'); wrap.className = 'a-patho';
        // Nom + réduction affichés ici SEULEMENT si plusieurs clients (sinon c'est dans l'en-tête de l'arrêt).
        let h = single ? '' : `<div class="patho-client">${esc(clientName(cl.clientId))}</div>`;
        if (!single) h += `<label class="reduc-row"><span class="grow">Réduction articles</span><input type="number" data-reduc step="1" min="0" max="100" value="${currentTour.reductions[cl.clientId] || ''}" placeholder="0" style="width:70px"/><span>%</span></label>`;
        // Parage en 1er (déclencheur) ; Fourbure / NPAS actifs UNIQUEMENT si Parage coché pour ce cheval.
        const cols = [{ key: 'parage', label: 'Parage/Équil.' }];
        if (S.fourbureHT > 0) cols.push({ key: 'fourbure', label: 'Fourbure' });
        if (S.npasHT > 0) cols.push({ key: 'npas', label: 'NPAS' });
        if (S.infectionHT > 0) cols.push({ key: 'infection', label: 'Infection' });
        h += `<table class="patho-tbl"><thead><tr><th>Cheval</th>${cols.map((c) => '<th>' + c.label + '</th>').join('')}<th>Heure RDV</th></tr></thead><tbody>`;
        cl.chevaux.forEach((cv, ci) => {
          h += `<tr><td>🐴 ${esc(cv.nom)}</td>${cols.map((c) => {
            const dis = c.key !== 'parage' && !cv.parage ? ' disabled' : '';
            return `<td><input type="checkbox" data-key="${c.key}" data-ci="${ci}" ${cv[c.key] ? 'checked' : ''}${dis}/></td>`;
          }).join('')}<td><input type="time" class="heure-in" data-heure data-ci="${ci}" value="${cv.heure || ''}"/></td></tr>`;
        });
        h += '</tbody></table>';
        h += `<p class="hint" style="margin-top:2px">Fourbure / NPAS / Infection ne s'activent que si « Parage/Équil. » est coché (le matériel n'est facturé qu'avec un parage).</p>`;
        wrap.innerHTML = h;
        const rin = wrap.querySelector('[data-reduc]');
        if (rin) rin.addEventListener('input', (e) => { currentTour.reductions[cl.clientId] = parseFloat(e.target.value) || 0; saveTournees(); recomputeMoney(); });
        wrap.querySelectorAll('[data-key]').forEach((inp) => inp.addEventListener('change', (e) => {
          const cv = cl.chevaux[+inp.dataset.ci], key = inp.dataset.key;
          cv[key] = e.target.checked;
          // Parage (dé)verrouille Fourbure/NPAS → il faut re-render pour mettre à jour l'état "disabled" des cases.
          if (key === 'parage') { if (!e.target.checked) { cv.fourbure = false; cv.npas = false; cv.infection = false; } recomputeMoney(); renderEditorArrets(locked); return; }
          recomputeMoney();
        }));
        wrap.querySelectorAll('[data-heure]').forEach((inp) => inp.addEventListener('change', (e) => { cl.chevaux[+inp.dataset.ci].heure = e.target.value || ''; saveTournees(); })); // heure de RDV par cheval (n'affecte pas les montants)
        el.appendChild(wrap);
      });
    }
    // ----- Articles de cet arrêt (couplés au client de l'arrêt) -----
    const artWrap = document.createElement('div'); artWrap.className = 'a-articles';
    const arts = articlesForArret(a);
    artWrap.innerHTML = `<div class="a-art-head"><span>🧾 Articles</span>${locked ? '' : '<button class="btn small" data-add-art>+ Article</button>'}</div>`;
    const alist = document.createElement('div'); alist.className = 'list';
    // Case « Remise » (à cocher) = la réduction client s'applique à cette ligne. Cochée par défaut.
    const remiseChkHtml = (off) => locked ? '' : `<label class="chk2 art-remise" title="La réduction client s'applique à cette ligne"><input type="checkbox" data-remise ${off ? '' : 'checked'}/> Remise</label>`;
    // Ligne(s) Parage & équilibrage (auto, par cheval coché) : affichée avec sa case Remise (remisée par défaut).
    if (S.parage && S.parage.prixHT > 0) {
      if (!currentTour.parageRemiseOff) currentTour.parageRemiseOff = {};
      a.clients.forEach((cl) => {
        const pc = (cl.chevaux || []).filter((c) => c.parage); if (!pc.length) return;
        const qte = pc.length, ttcv = S.parage.prixHT * qte * (1 + (S.parage.tvaPct || 0) / 100);
        const off = !!currentTour.parageRemiseOff[cl.clientId];
        const row = document.createElement('div'); row.className = 'list-item';
        row.innerHTML = `<div class="li-main"><b>Parage et équilibrage</b><span class="li-sub">${esc(clientName(cl.clientId))} · ×${qte} · 🐴 ${esc(pc.map((c) => c.nom).join(', '))} · ${eur(ttcv)} TTC · <i>auto</i></span></div><div class="li-act">${remiseChkHtml(off)}</div>`;
        const rc = row.querySelector('[data-remise]');
        if (rc) rc.addEventListener('change', (e) => { if (!currentTour.parageRemiseOff) currentTour.parageRemiseOff = {}; if (e.target.checked) delete currentTour.parageRemiseOff[cl.clientId]; else currentTour.parageRemiseOff[cl.clientId] = true; saveTournees(); recomputeMoney(); });
        alist.appendChild(row);
      });
    }
    arts.forEach((art) => {
      const rr = (art.tvaPct || 0) / 100, qte = Math.max(1, (art.chevalNoms || []).length || 1), ttcv = (art.prixHT || 0) * qte * (1 + rr);
      const row = document.createElement('div'); row.className = 'list-item';
      const chn = (art.chevalNoms || []).join(', ');
      const remiseChk = art.impaye ? '' : remiseChkHtml(!!art.remiseOff); // l'impayé (créance) n'est jamais remisé
      row.innerHTML = `<div class="li-main"><b>${esc(art.libelle)}</b><span class="li-sub">${esc(clientName(art.clientId))} · ×${qte}${chn ? ' · 🐴 ' + esc(chn) : ''} · ${eur(ttcv)} TTC</span></div>${locked ? '' : `<div class="li-act">${remiseChk}<button class="btn small" data-e>Éditer</button> <button class="btn small danger" data-d>✕</button></div>`}`;
      if (!locked) {
        const rc = row.querySelector('[data-remise]'); if (rc) rc.addEventListener('change', (e) => { art.remiseOff = !e.target.checked; saveTournees(); recomputeMoney(); });
        row.querySelector('[data-e]').addEventListener('click', () => modalTourArticle(art, { arret: a }));
        row.querySelector('[data-d]').addEventListener('click', () => { if (!confirm('Supprimer cet article ?')) return; if (art.impaye && art.impayeId) uncollectImpaye(art.impayeId); currentTour.articles = (currentTour.articles || []).filter((x) => x.id !== art.id); saveTournees(); renderEditorArrets(locked); recomputeMoney(); });
      }
      alist.appendChild(row);
    });
    if (!alist.children.length) alist.innerHTML = '<p class="hint">Aucun article pour cet arrêt.</p>';
    artWrap.appendChild(alist);
    if (!locked) { const ab = artWrap.querySelector('[data-add-art]'); if (ab) ab.addEventListener('click', () => modalTourArticle(null, { arret: a, clientId: a.clients.length === 1 ? a.clients[0].clientId : undefined })); }
    el.appendChild(artWrap);
    box.appendChild(el);
  });
  if (!locked) enableDrag(box);
}

function enableDrag(listEl) {
  listEl.querySelectorAll('.a-drag').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const dragEl = handle.closest('.arret'); dragEl.classList.add('dragging');
      const move = (ev) => {
        const after = [...listEl.querySelectorAll('.arret:not(.dragging)')].find((sib) => { const r = sib.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
        if (after) listEl.insertBefore(dragEl, after); else listEl.appendChild(dragEl);
      };
      const up = () => {
        dragEl.classList.remove('dragging');
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
        const order = [...listEl.querySelectorAll('.arret')].map((x) => +x.dataset.idx);
        currentTour.arrets = order.map((i) => currentTour.arrets[i]);
        renderEditorArrets(false); scheduleGeoRecalc();
      };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
  });
}

// Réorganisation générique d'une liste (.list-item + poignée .drag-h) → réordonne le tableau `arr` en place.
function enableListDrag(listEl, arr, save) {
  if (!listEl) return;
  listEl.querySelectorAll('.drag-h').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const item = handle.closest('.list-item'); item.classList.add('dragging');
      const move = (ev) => { const after = [...listEl.querySelectorAll('.list-item:not(.dragging)')].find((sib) => { const r = sib.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; }); if (after) listEl.insertBefore(item, after); else listEl.appendChild(item); };
      const up = () => {
        item.classList.remove('dragging');
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
        const order = [...listEl.querySelectorAll('.list-item')].map((x) => +x.dataset.idx);
        const na = order.map((i) => arr[i]); arr.length = 0; na.forEach((x) => arr.push(x)); save();
      };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
  });
}

// Réorganisation d'une liste de lignes éditables (.edit-row + poignée .drag-h) → réordonne `arr` en place.
function enableRowDrag(listEl, arr, save) {
  if (!listEl) return;
  listEl.querySelectorAll('.drag-h').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const item = handle.closest('.edit-row'); item.classList.add('dragging');
      const move = (ev) => { const after = [...listEl.querySelectorAll('.edit-row:not(.dragging)')].find((sib) => { const r = sib.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; }); if (after) listEl.insertBefore(item, after); else listEl.appendChild(item); };
      const up = () => {
        item.classList.remove('dragging');
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
        const order = [...listEl.querySelectorAll('.edit-row')].map((x) => +x.dataset.idx);
        const na = order.map((i) => arr[i]); arr.length = 0; na.forEach((x) => arr.push(x)); save();
      };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
  });
}

// ----- Calcul : ARGENT (pur, instantané, sans API) à partir de la géométrie -----
function computeResultMoney(rows, geom, articles, reducs, parageNoRemise, payments) {
  articles = articles || (currentTour && currentTour.articles) || [];
  reducs = reducs || (currentTour && currentTour.reductions) || {};
  parageNoRemise = parageNoRemise || (currentTour && currentTour.parageRemiseOff) || {}; // { clientId: true } → parage EXCLU de la remise client
  payments = payments || (currentTour && currentTour.payments) || {}; // paiement par client → couplage réduction LIQUIDE
  const useSeuil = S.repartition === 'parclient'; // seuil/forfait « client proche » actifs seulement dans ce mode
  rows.forEach((r) => (r.proche = useSeuil && r.directKm < S.seuilKm));
  const loin = rows.filter((r) => !r.proche);
  // Clients au seuil : on retire leur distance ALLER SIMPLE domicile→client (sommée si plusieurs) du km total.
  const kmProches = rows.filter((r) => r.proche).reduce((s, r) => s + r.directKm, 0);
  const kmRestant = Math.max(0, geom.totalKm - kmProches);
  const sumSegLoin = loin.reduce((s, r) => s + r.segKm, 0);
  const totClientsLoin = loin.reduce((s, r) => s + r.nbClients, 0);
  rows.forEach((r) => {
    if (r.proche) { r.kmAttribue = S.seuilKm || 0; r.tarifHT = 0; r.montantHT = S.forfait; } // forfait = km du seuil (compté dans les stats), montant = forfait fixe
    else {
      if (S.repartition === 'prorata' && sumSegLoin > 0) r.kmAttribue = kmRestant * r.segKm / sumSegLoin;
      else if (S.repartition === 'parclient' && totClientsLoin > 0) r.kmAttribue = kmRestant * r.nbClients / totClientsLoin;
      else r.kmAttribue = loin.length ? kmRestant / loin.length : 0;
      r.tarifHT = tarifHT(r.type); r.montantHT = r.kmAttribue * r.tarifHT;
    }
    r.montantTTC = ttc(r.montantHT);
  });
  const stdRate = rate();
  const baseMat = baseMateriel();
  const cmap = {};
  const getC = (id, nom) => cmap[id] || (cmap[id] = { clientId: id, nom, deplacement: [], materiel: [], articles: [], htDep: 0, htMat: 0, htArt: 0, tvaArt: 0 });
  // Déplacement (par arrêt) + Matériel (par cheval — facturé UNIQUEMENT si parage effectué)
  rows.forEach((r) => {
    const partHT = r.montantHT / r.nbClients, partTTC = r.montantTTC / r.nbClients;
    const kmClient = (r.kmAttribue || 0) / r.nbClients;
    r.clients.forEach((cl) => {
      const m = getC(cl.clientId, cl.nom);
      m.deplacement.push({ adresse: r.adresse, type: r.type, partHT, partTTC, km: kmClient, tarifHT: r.tarifHT || 0, proche: !!r.proche, chevaux: cl.chevaux.map((c) => c.nom) });
      m.htDep += partHT;
      cl.chevaux.forEach((c) => {
        if (!c.parage) return; // pas de parage → pas de matériel facturé pour ce cheval
        const mat = baseMat + (c.fourbure ? S.fourbureHT : 0) + (c.npas ? S.npasHT : 0) + (c.infection ? S.infectionHT : 0);
        if (mat > 0) { m.materiel.push({ nom: c.nom, adresse: r.adresse, baseHT: baseMat, fourbure: !!c.fourbure, npas: !!c.npas, infection: !!c.infection, ht: mat, ttc: mat * (1 + stdRate) }); m.htMat += mat; }
      });
    });
  });
  // Articles (lignes manuelles) — TVA par ligne
  (articles || []).forEach((a) => {
    const noms = a.chevalNoms || [];
    if (!a.impaye && !noms.length) return; // article normal : lié à ≥1 cheval ; impayé : sans cheval, quantité 1
    const qte = a.impaye ? 1 : noms.length;
    const lineHT = (a.prixHT || 0) * qte, rr = (a.tvaPct || 0) / 100;
    const m = getC(a.clientId, clientName(a.clientId));
    m.articles.push({ libelle: a.libelle, chevaux: a.impaye ? [] : noms, qte, prixHT: a.prixHT || 0, tvaPct: a.tvaPct || 0, ht: lineHT, tva: lineHT * rr, ttc: lineHT * (1 + rr), impaye: !!a.impaye, remiseOff: !!(a.remiseOff || a.impaye) }); // impayé (créance) jamais remisé
    m.htArt += lineHT; m.tvaArt += lineHT * rr;
  });
  // Parage & équilibrage auto (cheval coché) → ligne d'article
  if (S.parage && S.parage.prixHT > 0) {
    const pa = {};
    rows.forEach((r) => r.clients.forEach((cl) => cl.chevaux.forEach((c) => { if (c.parage) (pa[cl.clientId] = pa[cl.clientId] || []).push(c.nom); })));
    Object.keys(pa).forEach((cid) => {
      const noms = pa[cid], qte = noms.length, rr = (S.parage.tvaPct || 0) / 100, lineHT = S.parage.prixHT * qte;
      const m = getC(cid, clientName(cid));
      m.articles.unshift({ libelle: 'Parage et équilibrage', chevaux: noms, qte, prixHT: S.parage.prixHT, tvaPct: S.parage.tvaPct || 0, ht: lineHT, tva: lineHT * rr, ttc: lineHT * (1 + rr), parage: true, remiseOff: !!parageNoRemise[cid] }); // Parage en 1ʳᵉ position ; remisé par défaut (sauf si exclu)
      m.htArt += lineHT; m.tvaArt += lineHT * rr;
    });
  }
  const parClient = Object.values(cmap).map((m) => {
    // Réduction effective : la réduction manuelle du client, ET si le paiement est en LIQUIDE, au moins la réduction liquide couplée (Réglages → Articles → Réduction). Jamais avec virement/facture.
    const manual = reducs[m.clientId] || 0;
    const isLiquide = (payments[m.clientId] || {}).method === 'liquide';
    const rpct = isLiquide ? Math.max(manual, S.reducLiquide || 0) : manual, rf = rpct / 100;
    // Totaux « tarif plein » (avant toute remise) — capturés AVANT de réduire les lignes.
    const htArtBrut = m.articles.reduce((s, a) => s + a.ht, 0), tvaArtBrut = m.articles.reduce((s, a) => s + a.tva, 0);
    // Remise appliquée LIGNE PAR LIGNE : le HT de chaque article est réduit, puis TVA et TTC recalculés sur le net.
    if (rpct) m.articles.forEach((a) => { if (a.remiseOff) return; a.remisePct = rpct; a.htBrut = a.ht; a.ht = a.ht * (1 - rf); a.tva = a.tva * (1 - rf); a.ttc = a.ttc * (1 - rf); }); // remise SEULEMENT sur les lignes activées
    const htArt = m.articles.reduce((s, a) => s + a.ht, 0), tvaArt = m.articles.reduce((s, a) => s + a.tva, 0);
    const totalHT = m.htDep + m.htMat + htArt;
    const totalTVA = (m.htDep + m.htMat) * stdRate + tvaArt;
    const pleinHT = m.htDep + m.htMat + htArtBrut, pleinTVA = (m.htDep + m.htMat) * stdRate + tvaArtBrut;
    return Object.assign(m, { reducPct: rpct, htArt, tvaArt, totalHT, totalTVA, totalTTC: totalHT + totalTVA, pleinHT, pleinTVA, pleinTTC: pleinHT + pleinTVA });
  });
  const totalHT = parClient.reduce((s, m) => s + m.totalHT, 0);
  const totalTVA = parClient.reduce((s, m) => s + m.totalTVA, 0);
  const totalTTC = totalHT + totalTVA;
  const htDeplacement = rows.reduce((s, r) => s + r.montantHT, 0);
  // Marge réelle = SEULEMENT le surplus « temps » (visite/urgence) + supplément urgence.
  // Le reste (base véhicule + carburant + forfaits) est une PROVISION destinée à couvrir les charges véhicule.
  const margeReelle = rows.reduce((s, r) => { if (r.proche) return s; const tps = (r.type !== 'tournee' ? tempsPerKm() : 0), urg = (r.type === 'urgence' ? S.urgenceSuppKm : 0); return s + (r.kmAttribue || 0) * (tps + urg); }, 0);
  const provisionVehiculeHT = htDeplacement - margeReelle;
  const servicesHT = parClient.reduce((s, m) => s + m.htArt, 0);   // Analytique : Services (articles HT nets)
  const materielHT = parClient.reduce((s, m) => s + m.htMat, 0);   // Analytique : Matériel (HT)
  const fuelReel = geom.totalKm * (S.consoL100 / 100) * S.prixPleinL;
  const fuelHT = fuelReel / (1 + stdRate);
  return { rows, parClient, totalKm: geom.totalKm, totalMin: geom.totalMin, kmHomeFirst: geom.kmHomeFirst, kmLastHome: geom.kmLastHome, totalHT, totalTVA, totalTTC, htDeplacement, fuelReel, fuelHT, provisionVehiculeHT, margeReelle, servicesHT, materielHT, tvaRate: S.tvaRate, repartition: S.repartition, computedAt: Date.now() };
}

function rowFromArret(a, geo) {
  return { label: labelFor(a), adresse: addrStr(a.addr), lat: a.addr.lat, lon: a.addr.lon, type: a.type || 'tournee',
    nbClients: Math.max(1, arretNbClients(a)),
    clients: (a.clients || []).map((cl) => ({ clientId: cl.clientId, nom: clientName(cl.clientId), chevaux: (cl.chevaux || []).map((c) => ({ nom: c.nom, fourbure: !!c.fourbure, npas: !!c.npas, infection: !!c.infection, parage: !!c.parage })) })),
    segKm: geo.segKm, directKm: geo.directKm };
}

// Enregistre currentTour dans le bon store (actif ou archive) sans jamais créer de doublon.
function persistCurrentTour() {
  const ai = archive.findIndex((t) => t.id === currentTour.id);
  if (ai >= 0) { archive[ai] = currentTour; saveArchive(); return; }
  const i = tournees.findIndex((t) => t.id === currentTour.id); if (i >= 0) tournees[i] = currentTour; else tournees.push(currentTour);
  saveTournees();
}
// Recalcul ARGENT uniquement (types/tarifs/TVA/seuil/répartition) — instantané, réutilise la géométrie.
function recomputeMoney() {
  const R = currentTour && currentTour.result;
  if (!R || !R.rows || R.rows.length !== currentTour.arrets.length) return; // géométrie absente/périmée
  const rows = currentTour.arrets.map((a, i) => rowFromArret(a, R.rows[i]));
  const prov = (R.providerMin != null ? R.providerMin : R.totalMin); // durée brute du service de carte
  const totalMin = S.dureeAuto ? prov : (R.totalKm * 60 / (S.vitesseKmh || 50));
  const geom = { totalKm: R.totalKm, totalMin, kmHomeFirst: R.kmHomeFirst, kmLastHome: R.kmLastHome };
  const geo = R.routeGeo;
  currentTour.result = computeResultMoney(rows, geom);
  currentTour.result.providerMin = prov;
  currentTour.result.routeGeo = geo || [];
  persistCurrentTour();
  renderResultUI(currentTour.result);
}

// Recalcule (sans API) durée + montants d'une tournée à partir de sa géométrie mémorisée.
function recomputeTourLocal(t) {
  const R = t.result;
  if (!R || !R.rows || R.rows.length !== (t.arrets || []).length) return false; // géométrie absente/périmée
  const rows = t.arrets.map((a, i) => rowFromArret(a, R.rows[i]));
  const prov = (R.providerMin != null ? R.providerMin : R.totalMin);
  const totalMin = S.dureeAuto ? prov : (R.totalKm * 60 / (S.vitesseKmh || 50));
  const geom = { totalKm: R.totalKm, totalMin, kmHomeFirst: R.kmHomeFirst, kmLastHome: R.kmLastHome };
  const res = computeResultMoney(rows, geom, t.articles, t.reductions, t.parageRemiseOff, t.payments);
  res.providerMin = prov; res.routeGeo = R.routeGeo || [];
  t.result = res;
  return true;
}
// Bouton Réglages : actualise durées + montants des tournées d'aujourd'hui et à venir (PAS les clôturées/archivées).
function refreshActiveTours() {
  let n = 0, skipped = 0;
  tournees.forEach((t) => {
    const st = statusOf(t);
    if (st !== 'active' && st !== 'avenir') return; // on ne touche pas aux clôturées / archivées
    reconcileTour(t);
    if (recomputeTourLocal(t)) n++; else if (t.result) skipped++;
  });
  saveTournees();
  const h = $('refreshToursHint');
  if (h) h.innerHTML = `✔ ${n} tournée(s) actualisée(s)${skipped ? ` · ${skipped} à rouvrir pour recalcul complet` : ''}. Clôturées & archivées non modifiées.`;
  if ($('tab-accueil').classList.contains('active')) renderHome();
  if ($('tab-tournees').classList.contains('active')) renderTours();
  return n;
}

// Recalcul complet GÉOMÉTRIE + argent (API). silent = ne change pas d'onglet, statut discret.
let _geoTimer = null;
function scheduleGeoRecalc() { clearTimeout(_geoTimer); _geoTimer = setTimeout(() => { if (currentTour && currentTour.arrets.length) calcTour(true); }, 700); }

async function calcTour(silent) {
  if (!currentTour) return; // tournée supprimée entre-temps → ne pas la ré-enregistrer
  const st = $('edStatus'); st.className = 'status';
  currentTour.date = $('edDate').value;
  if (!currentTour.arrets.length) {
    currentTour.result = null;
    const i = tournees.findIndex((t) => t.id === currentTour.id); if (i >= 0) tournees[i] = currentTour;
    saveTournees(); renderResultUI(null); renderEditorArrets();
    if (_mapLayer) { _mapLayer.remove(); _mapLayer = null; }
    if (!silent) { st.className = 'status err'; st.textContent = 'Ajoutez au moins un arrêt.'; }
    return;
  }
  const H = tourHome();
  if (!H.lat && addrStr(H).trim()) { try { const g = await geocode(H); H.lat = g.lat; H.lon = g.lon; } catch { /* localisation impossible */ } }
  // Départ manquant : on le signale TOUJOURS (même en recalcul auto), sinon rien ne se passe en silence.
  if (!H.lat) { st.className = 'status err'; st.textContent = addrStr(H).trim() ? 'Adresse de départ introuvable — vérifiez-la (« Changer le départ » ou Gestion → Mes adresses).' : '⚠️ Départ non défini : renseignez votre adresse de départ via « Changer le départ » ci-dessus, ou Gestion → Mes adresses → Point de départ.'; return; }
  try {
    st.textContent = silent ? 'Recalcul…' : 'Localisation des adresses…';
    for (const a of currentTour.arrets) { if (!a.addr.lat) { const g = await geocode(a.addr); a.addr.lat = g.lat; a.addr.lon = g.lon; if (S.provider === 'osm') await sleep(1100); } }
    const home = homeXY();
    if (!silent) st.textContent = 'Distances directes (seuil client proche)…';
    const stops = currentTour.arrets.map((a) => ({ lat: a.addr.lat, lon: a.addr.lon }));
    const fallbackDirect = (s) => haversineKm(home, s) * (S.roadFactor || 1.3);
    let directs;
    try { directs = await directMatrix(home, stops); directs = directs.map((d, i) => (d != null ? d : fallbackDirect(stops[i]))); }
    catch { directs = []; for (const s of stops) { try { const dr = await route([home, s]); directs.push(dr.totalKm); if (S.provider === 'osm') await sleep(1100); } catch { directs.push(fallbackDirect(s)); } } }
    // Arrivée : propre à la tournée si définie (sinon retour au départ). Géocodée si besoin.
    const A = tourArrivee();
    if (A.lat == null && addrStr(A).trim()) { try { const g = await geocode(A); A.lat = g.lat; A.lon = g.lon; if (currentTour.arrivee) saveTournees(); if (S.provider === 'osm') await sleep(1100); } catch { /* repli sur le départ */ } }
    const arrXY = (A.lat != null) ? { lat: A.lat, lon: A.lon } : home;
    if (!silent) st.textContent = 'Itinéraire de la tournée…';
    const points = [home, ...stops, arrXY];
    const rt = await route(points); const legs = rt.legsKm;

    const rows = currentTour.arrets.map((a, i) => rowFromArret(a, { segKm: legs[i] != null ? legs[i] : 0, directKm: directs[i] }));
    // Durée : service de carte (auto) OU estimation km ÷ vitesse moyenne réglée par le pro.
    const totalMin = (S.dureeAuto && rt.totalMin) ? rt.totalMin : (rt.totalKm * 60 / (S.vitesseKmh || 50));
    const geom = { totalKm: rt.totalKm, kmHomeFirst: legs.length ? legs[0] : 0, kmLastHome: legs.length ? legs[legs.length - 1] : 0, totalMin };
    currentTour.result = computeResultMoney(rows, geom);
    currentTour.result.providerMin = rt.totalMin || totalMin; // durée brute du service de carte (conservée)
    currentTour.result.routeGeo = rt.geo || [];
    persistCurrentTour();
    renderResultUI(currentTour.result);
    renderMap(rows.map((r) => ({ lat: r.lat, lon: r.lon, label: r.label })), home, currentTour.result.routeGeo, arrXY);
    st.className = 'status ok'; st.textContent = silent ? 'À jour ✔' : 'Frais calculés et enregistrés.';
  } catch (e) { st.className = 'status err'; st.textContent = 'Erreur : ' + e.message; }
}

// Rendu unique : tuiles (haut) + facture (répartition par client > cheval + HT/TVA/TTC).
function renderResultUI(R) {
  if (R) {
    $('rKm').textContent = km(R.totalKm);
    $('rMin').textContent = durMin(R.totalMin);
    $('rHT').textContent = eur(R.totalHT) + ' HT'; $('rTVA').textContent = eur(R.totalTVA);
    $('rTTC').textContent = eur(R.totalTTC) + ' TTC';
  } else { ['rKm', 'rMin', 'rHT', 'rTVA', 'rTTC'].forEach((id) => { if ($(id)) $(id).textContent = '—'; }); }
  renderAnalytique(R);
  const box = $('edInvoice'); box.innerHTML = '';
  if (!R || !R.parClient || !R.parClient.length) { $('edInvoiceEmpty').style.display = 'block'; box.style.display = 'none'; return; }
  $('edInvoiceEmpty').style.display = 'none'; box.style.display = '';
  const pays = (currentTour && currentTour.payments) || {};
  let arHT = 0, arTVA = 0, arTTC = 0;
  R.parClient.forEach((m) => { const ar = cashRounding(m, pays[m.clientId]); arHT += ar.ht; arTVA += ar.tva; arTTC += ar.ttc; box.appendChild(clientInvoiceEl(m, pays[m.clientId])); });
  const f = document.createElement('div'); f.className = 'inv-footer';
  f.innerHTML = `<div class="inv-line"><span>Total HT</span><span>${eur(R.totalHT + arHT)}</span></div>
    <div class="inv-line"><span>TVA</span><span>${eur(R.totalTVA + arTVA)}</span></div>
    ${Math.abs(arTTC) >= 0.005 ? `<div class="inv-line" style="color:var(--warn)"><span>dont arrondi caisse (liquide)</span><span>${eur(arTTC)}</span></div>` : ''}
    <div class="inv-line inv-total"><span>Total TTC</span><span>${eur(R.totalTTC + arTTC)}</span></div>`;
  box.appendChild(f);
}

// Un bloc facture pour un client : 3 sections (Articles · Matériel · Déplacement), par cheval.
function clientInvoiceEl(m, payment) { const el = document.createElement('div'); el.className = 'inv-client'; el.innerHTML = clientInvoiceHtml(m, payment); return el; }
// ---------- Modèle de paiement liquide (arrondi « décimal rectifié » + impayé partiel) ----------
// rectifie = total TTC ARRONDI à l'euro (choisi par le pro, sans décimale) → corrige la facture + ligne d'arrondi +/−.
// impaye   = créance (paiement partiel), à l'euro. recu = rectifie − impaye = liquide réellement reçu en caisse.
// Repli sur l'ancien champ montantPaye pour les tournées enregistrées avant la refonte.
function payRectifie(m, p) {
  if (!p || p.method !== 'liquide') return m ? m.totalTTC : 0;
  if (p.rectifie != null) return p.rectifie;
  if (p.montantPaye != null && !p.partiel) return p.montantPaye; // ancien modèle : montantPaye = total arrondi
  return m ? m.totalTTC : 0;
}
function payImpaye(m, p) {
  if (!p || p.method !== 'liquide' || !p.partiel) return 0;
  if (p.impaye != null) return Math.max(0, p.impaye);
  if (p.montantPaye != null) return Math.max(0, (m ? m.totalTTC : 0) - p.montantPaye); // ancien modèle : reste = total − encaissé
  return 0;
}
function payRecu(m, p) { return payRectifie(m, p) - payImpaye(m, p); }  // liquide réellement reçu (rectifié − impayé)
function payArrondi(m, p) { if (!p || p.method !== 'liquide') return 0; const d = payRectifie(m, p) - (m ? m.totalTTC : 0); return Math.abs(d) < 0.005 ? 0 : d; }
// Arrondi caisse d'un client : { has, ht, tva, ttc } — différence (+/−) à intégrer dans la facture (s'applique aussi en partiel).
function cashRounding(m, payment) {
  const diffTTC = payArrondi(m, payment);
  if (!diffTTC) return { has: false, ht: 0, tva: 0, ttc: 0 };
  const r = rate(); const ht = diffTTC / (1 + r); return { has: true, ht, tva: diffTTC - ht, ttc: diffTTC };
}
// Info paiement partiel (liquide) : reçu + reste impayé (créance). Le total facturé reste le total rectifié.
function partialPay(m, payment) {
  if (!payment || payment.method !== 'liquide' || !payment.partiel) return null;
  const reste = payImpaye(m, payment), recu = payRecu(m, payment), r = rate();
  return { paid: recu, paidHT: recu / (1 + r), reste, resteHT: reste / (1 + r), mode: payment.resteMode === 'virement' ? 'virement' : 'prochaine visite' };
}
function clientInvoiceHtml(m, payment) {
  const stdRate = rate();
  // Colonnes : Poste | Prix unitaire | Base HT (×quantité, remise incluse) | TVA | TTC.
  const row = (label, unitStr, baseHT, tva, ttc, cls) => `<tr${cls ? ' class="' + cls + '"' : ''}><td>${label}</td><td>${unitStr}</td><td>${eur(baseHT)}</td><td>${eur(tva)}</td><td>${eur(ttc)}</td></tr>`;
  const sec = (t) => `<tr class="inv-sec-row"><td colspan="5">${t}</td></tr>`;
  const arr = cashRounding(m, payment); // arrondi caisse (liquide)
  let rows = '';
  if (m.articles.length || arr.has) {
    rows += sec('Articles');
    m.articles.forEach((a) => { const noms = a.chevaux.length ? ' — ' + a.chevaux.map(esc).join(', ') : ''; const rem = a.remisePct ? ` <span class="rem-tag">−${a.remisePct}%</span>` : ''; rows += row(`🧾 ${esc(a.libelle)} ×${a.qte}${noms} (TVA ${a.tvaPct}%)${rem}`, eur(a.prixHT), a.ht, a.tva, a.ttc); });
    // Arrondi caisse en DERNIÈRE position des articles → impacte le sous-total.
    if (arr.has) rows += row('💶 Arrondi caisse (liquide)', '', arr.ht, arr.tva, arr.ttc, 'inv-reduc');
  }
  if (m.materiel.length) {
    rows += sec('Matériel');
    m.materiel.forEach((x) => { const tags = [x.fourbure ? 'Fourbure' : '', x.npas ? 'NPAS' : '', x.infection ? 'Infection' : ''].filter(Boolean).join(', '); rows += row(`🐴 ${esc(x.nom)}${tags ? ' (' + tags + ')' : ''}`, eur(x.ht), x.ht, x.ht * stdRate, x.ttc); });
  }
  if (m.deplacement.length) {
    rows += sec('Déplacement');
    m.deplacement.forEach((l) => {
      const noms = l.chevaux.length ? ' — ' + l.chevaux.map(esc).join(', ') : '';
      const unitStr = l.proche ? 'forfait' : `${eurkm(l.tarifHT)}/km`;
      const mult = ` · ${km(l.km)}`; // toujours afficher le km (client proche = km du seuil)
      rows += row(`📍 ${esc(l.adresse)} ${TYPES[l.type]}${noms}${mult}`, unitStr, l.partHT, l.partHT * stdRate, l.partTTC);
    });
  }
  const netHT = m.totalHT + arr.ht, netTVA = m.totalTVA + arr.tva, netTTC = m.totalTTC + arr.ttc; // total corrigé (arrondi inclus)
  const pp = partialPay(m, payment);
  const ppRows = pp ? row('💵 Montant réellement reçu (liquide)', '', pp.paidHT, pp.paid - pp.paidHT, pp.paid, 'inv-brut-row') + row('⏳ Montant impayé (' + pp.mode + ')', '', pp.resteHT, pp.reste - pp.resteHT, pp.reste, 'inv-reduc') : '';
  return `<div class="inv-head"><span>${esc(m.nom)}</span><span class="inv-amt">${eur(netTTC)} TTC</span></div>
    <div class="table-wrap"><table class="inv-tbl"><thead><tr><th>Poste</th><th>Prix unitaire</th><th>Base HT</th><th>TVA</th><th>TTC</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>${row(arr.has ? 'Sous-total (rectifié)' : 'Sous-total', '', netHT, netTVA, netTTC, 'inv-total-row')}${row('Tarif plein', '', (m.pleinHT != null ? m.pleinHT : m.totalHT), (m.pleinTVA != null ? m.pleinTVA : m.totalTVA), (m.pleinTTC != null ? m.pleinTTC : m.totalTTC), 'inv-brut-row')}${ppRows}</tfoot></table></div>`;
}

// Récap ANONYMISÉ (texte) : ni noms, ni adresses, ni chevaux — juste la répartition.
function recapText(R, tour) {
  if (!R) return '';
  tour = tour || currentTour;
  const stdRate = rate(), htDep = R.htDeplacement || 0;
  let s = `Frais de tournée — ${tour ? tour.date : ''}\n`;
  s += `Distance : ${km(R.totalKm)} · Durée estimée : ${durMin(R.totalMin)}\n`;
  // Temps de trajet RÉEL (encodé via le bouton Route) : total renseigné + arrêts sans temps réel.
  if (tour && Array.isArray(tour.arrets) && tour.arrets.length) {
    const withReal = tour.arrets.filter((a) => typeof a.realMin === 'number');
    const realTot = withReal.reduce((acc, a) => acc + a.realMin, 0);
    const missing = tour.arrets.length - withReal.length;
    s += `Trajet réel renseigné : ${realTot} min (${withReal.length}/${tour.arrets.length} arrêt(s)${missing ? ` · ${missing} sans temps réel` : ''})\n`;
  }
  s += `Carburant : ${eur(S.prixPleinL)}/L (TVAC)\n`;
  s += `Frais de déplacement — HT ${eur(htDep)} · TVA ${eur(htDep * stdRate)} · TTC ${eur(htDep * (1 + stdRate))}\n\n`;
  s += `Km par client (anonymisé) :\n`;
  const kmByClient = {};
  (R.rows || []).forEach((r) => { const kmc = (r.kmAttribue || 0) / Math.max(1, r.nbClients); r.clients.forEach((cl) => { kmByClient[cl.clientId] = (kmByClient[cl.clientId] || 0) + kmc; }); });
  (R.parClient || []).forEach((m, i) => { s += `• Client ${i + 1} : ${km(kmByClient[m.clientId] || 0)}\n`; });
  // Restes à percevoir (paiements partiels liquide) — anonymisé.
  let resteTot = 0;
  (R.parClient || []).forEach((m) => { const pp = partialPay(m, ((tour && tour.payments) || {})[m.clientId]); if (pp) resteTot += pp.reste; });
  if (resteTot > 0.005) s += `\nReste à percevoir (impayés) : ${eur(resteTot)} TTC\n`;
  return s;
}
// Détail nominatif d'UN client (toutes ses lignes de facture) — pour le « Ticket ».
function invoiceTextForClient(m, payment) {
  const stdRate = rate();
  const arr = cashRounding(m, payment);
  const L = [`Client : ${m.nom}`];
  if (m.articles.length || arr.has) {
    L.push('— Articles —');
    m.articles.forEach((a) => { const ch = a.chevaux.length ? ' (' + a.chevaux.join(', ') + ')' : ''; const rem = a.remisePct ? ` −${a.remisePct}%` : ''; L.push(`  ${a.libelle} ×${a.qte}${ch}${rem} : ${eur(a.ht)} HT · ${eur(a.tva)} TVA · ${eur(a.ttc)} TTC`); });
    if (arr.has) L.push(`  Arrondi caisse (liquide) : ${eur(arr.ht)} HT · ${eur(arr.tva)} TVA · ${eur(arr.ttc)} TTC`);
  }
  if (m.materiel.length) {
    L.push('— Matériel —');
    m.materiel.forEach((x) => { const tags = [x.fourbure ? 'Fourbure' : '', x.npas ? 'NPAS' : '', x.infection ? 'Infection' : ''].filter(Boolean).join(', '); L.push(`  ${x.nom}${tags ? ' (' + tags + ')' : ''} : ${eur(x.ht)} HT · ${eur(x.ht * stdRate)} TVA · ${eur(x.ttc)} TTC`); });
  }
  if (m.deplacement.length) {
    L.push('— Déplacement —');
    m.deplacement.forEach((l) => { const ch = l.chevaux.length ? ' (' + l.chevaux.join(', ') + ')' : ''; const u = l.proche ? `${km(l.km)} (forfait)` : `${km(l.km)} × ${eurkm(l.tarifHT)}/km`; L.push(`  ${l.adresse} ${TYPES[l.type]}${ch} — ${u} : ${eur(l.partHT)} HT · ${eur(l.partHT * stdRate)} TVA · ${eur(l.partTTC)} TTC`); });
  }
  L.push(`Sous-total${arr.has ? ' (rectifié)' : ' (à payer)'} : ${eur(m.totalHT + arr.ht)} HT · ${eur(m.totalTVA + arr.tva)} TVA · ${eur(m.totalTTC + arr.ttc)} TTC`);
  const pHT = m.pleinHT != null ? m.pleinHT : m.totalHT, pTVA = m.pleinTVA != null ? m.pleinTVA : m.totalTVA, pTTC = m.pleinTTC != null ? m.pleinTTC : m.totalTTC;
  L.push(`Tarif plein : ${eur(pHT)} HT · ${eur(pTVA)} TVA · ${eur(pTTC)} TTC`);
  const pp = partialPay(m, payment);
  if (pp) { L.push(`Montant réellement reçu (liquide) : ${eur(pp.paid)} TTC`); L.push(`Montant impayé (${pp.mode}) : ${eur(pp.reste)} TTC`); }
  if (payment && payment.method) L.push(`Paiement : ${payment.method === 'liquide' ? 'liquide' : 'virement'}${payment.facture ? ' · facture demandée' : ''}`);
  return L.join('\n');
}

// ----- Facture détaillée : le calcul expliqué, étape par étape, avec les vraies valeurs -----
function factureDetailHtml(R) {
  const f = fuelPerKmHT(); const rows = R.rows;
  let legs = `<div class="inv-line"><span>🏠 Domicile → ${esc(rows[0] ? rows[0].label : '')}</span><span>${km(rows[0] ? rows[0].segKm : 0)}</span></div>`;
  for (let i = 1; i < rows.length; i++) legs += `<div class="inv-line"><span>${esc(rows[i - 1].label)} → ${esc(rows[i].label)}</span><span>${km(rows[i].segKm)}</span></div>`;
  legs += `<div class="inv-line"><span>${esc(rows.length ? rows[rows.length - 1].label : '')} → 🏠 Domicile</span><span>${km(R.kmLastHome)}</span></div>`;
  legs += `<div class="inv-line inv-total"><span>Km total de la boucle</span><span>${km(R.totalKm)}</span></div>`;

  const proches = rows.filter((r) => r.proche), loin = rows.filter((r) => !r.proche);
  const kmRetires = proches.reduce((s, r) => s + r.directKm, 0);
  let seuil = rows.map((r) => `<div class="inv-line"><span>${esc(r.label)} — domicile→arrêt ${km(r.directKm)} vs seuil ${S.seuilKm} km</span><span>${r.proche ? 'PROCHE → forfait' : '≥ seuil'}</span></div>`).join('');
  seuil += `<div class="inv-line inv-total"><span>Km retirés (aller simple des clients proches)</span><span>${km(kmRetires)}</span></div>`;

  const kmRestant = Math.max(0, R.totalKm - kmRetires);
  let rep = `<div class="inv-line"><span>Km restant = ${km(R.totalKm)} − ${km(kmRetires)}</span><span>${km(kmRestant)}</span></div>`;
  rep += loin.length ? loin.map((r) => `<div class="inv-line"><span>${esc(r.label)} — part « ${R.repartition} »</span><span>${km(r.kmAttribue)}</span></div>`).join('') : '<div class="inv-line"><i>tous les arrêts sont proches (forfait)</i></div>';

  const tar = rows.map((r) => r.proche
    ? `<div class="inv-line"><span>${esc(r.label)} — forfait client proche</span><span>${eur(r.montantHT)} HT → ${eur(r.montantTTC)} TTC</span></div>`
    : `<div class="inv-line"><span>${esc(r.label)} — ${km(r.kmAttribue)} × ${eurkm(r.tarifHT)} (${TYPES[r.type]})</span><span>${eur(r.montantHT)} HT → ${eur(r.montantTTC)} TTC</span></div>`).join('');

  const cli = R.parClient.map((m) => `<div class="inv-client">${clientInvoiceHtml(m)}</div>`).join('');

  return `
    <div class="modal-head"><b>📄 Facture détaillée — exemple</b><button class="x" id="mX">✕</button></div>
    <p class="banner">Données fictives (clients, adresses, chevaux). Seuls vos tarifs, TVA et mode de répartition réels sont appliqués.</p>
    <p class="hint">Comment le total et la répartition sont obtenus, dans l'ordre du calcul.</p>
    <div class="fd-step"><h4>① Contexte &amp; tarifs</h4><div class="fd-zone">
      Base véhicule HT/km (amortissement + frais) = <b>${eurkm(baseVehiculeHT())}</b><br>
      Carburant HT/km = (${S.consoL100} ÷ 100) × ${eur(S.prixPleinL)} ÷ (1 + ${S.tvaRate}%) = <b>${eurkm(f)}</b><br>
      Tarif HT/km = base véhicule + carburant HT (+ temps pour visite/urgence + supplément urgence) :<br>
      ${Object.keys(TYPES).map((t) => `${TYPES[t]} <b>${eurkm(tarifHT(t))}</b>`).join(' · ')}<br>
      Seuil « client proche » : ${S.seuilKm} km · Forfait : ${eur(S.forfait)} HT · TVA : ${S.tvaRate}% · Répartition : « ${R.repartition} »
    </div></div>
    <div class="fd-step"><h4>② Mesure de la boucle (km réels, domicile → arrêts → domicile)</h4><div class="fd-zone">${legs}</div></div>
    <div class="fd-step"><h4>③ Détection des clients proches (seuil)</h4><div class="fd-zone">${seuil}</div></div>
    <div class="fd-step"><h4>④ Répartition du km restant (${R.repartition})</h4><div class="fd-zone">${rep}</div></div>
    <div class="fd-step"><h4>⑤ Application des tarifs par type + TVA</h4><div class="fd-zone">${tar}</div></div>
    <div class="fd-step"><h4>⑥ Facture par client (Articles · Matériel · Déplacement) › par cheval</h4>${cli}</div>
    <div class="fd-step"><h4>⑦ Totaux de la tournée</h4><div class="fd-zone">
      <div class="inv-line"><span>Total HT</span><span>${eur(R.totalHT)}</span></div>
      <div class="inv-line"><span>TVA (${R.tvaRate}%)</span><span>${eur(R.totalTVA)}</span></div>
      <div class="inv-line inv-total"><span>Total TTC</span><span>${eur(R.totalTTC)}</span></div>
    </div></div>`;
}
// Jeu de données FICTIF pour la facture détaillée (illustration) — calculé avec vos tarifs réels.
function exampleResult() {
  // parage coché par défaut (sinon le matériel n'est pas facturé) — illustre le couplage matériel⇄parage.
  const ch = (nom, fourbure, npas) => ({ nom, fourbure: !!fourbure, npas: !!npas, parage: true });
  const mk = (adresse, type, clients, segKm, directKm) => ({
    label: clients.map((c) => c.nom + (c.chevaux.length ? ' (' + c.chevaux.map((x) => x.nom).join(', ') + ')' : '')).join(' + '),
    adresse, lat: null, lon: null, type, nbClients: clients.length, clients, segKm, directKm,
  });
  const rows = [
    mk('Rue de l\'Exemple 1, 5000 Ville-A', 'tournee', [{ clientId: 'd', nom: 'Client Dupont (ex.)', chevaux: [ch('Bella', true, false)] }], 15, 35),
    mk('Chemin Fictif 2, 5100 Ville-B', 'tournee', [{ clientId: 'd', nom: 'Client Dupont (ex.)', chevaux: [ch('Filou')] }], 12, 30),
    mk('Route Modèle 3, 5200 Ville-C', 'visite', [{ clientId: 'm', nom: 'Client Martin (ex.)', chevaux: [ch('Rex')] }, { clientId: 'l', nom: 'Client Leroy (ex.)', chevaux: [ch('Nala'), ch('Étoile')] }], 20, 40),
  ];
  const kmLastHome = 28;
  const totalKm = rows.reduce((s, r) => s + r.segKm, 0) + kmLastHome;
  const articles = [{ clientId: 'm', chevalNoms: ['Rex'], libelle: 'Plaque orthopédique (ex.)', prixHT: 40, tvaPct: 21 }];
  return computeResultMoney(rows, { totalKm, kmHomeFirst: rows[0].segKm, kmLastHome, totalMin: Math.round(totalKm * 60 / (S.vitesseKmh || 50)) }, articles, { m: 10 }, {});
}
function openFactureDetail() {
  openModal(factureDetailHtml(exampleResult()));
  $('mX').addEventListener('click', closeModal);
}

// ================= GESTION → FRAIS VÉHICULE =================
function kmStats() {
  const now = new Date();
  const ym = now.toISOString().slice(0, 7), y = now.toISOString().slice(0, 4);
  let mois = 0, annee = 0; const cmap = {};
  allTours().forEach((t) => {
    if (!t.result) return;
    if ((t.date || '').startsWith(ym)) mois += t.result.totalKm;
    if ((t.date || '').startsWith(y)) annee += t.result.totalKm;
    const w = travailForTour(t); // temps réel si la tournée a été suivie (Démarrer→Clôturer), sinon durée estimée
    const totMin = (w && w.totalMs != null) ? w.totalMs / 60000 : t.result.totalMin;
    const mpk = t.result.totalKm > 0 ? totMin / t.result.totalKm : 0; // minutes par km (réel si dispo)
    (t.result.rows || []).forEach((r) => {
      const kmClient = (r.kmAttribue || 0) / Math.max(1, r.nbClients);
      (r.clients || []).forEach((cl) => {
        const c = cmap[cl.clientId] = cmap[cl.clientId] || { nom: cl.nom, km: 0, min: 0, chevaux: {} };
        c.km += kmClient; c.min += kmClient * mpk;
        const nb = (cl.chevaux || []).length;
        if (nb) { const kpc = kmClient / nb; cl.chevaux.forEach((cv) => { const ch = c.chevaux[cv.nom] = c.chevaux[cv.nom] || { nom: cv.nom, km: 0, min: 0 }; ch.km += kpc; ch.min += kpc * mpk; }); }
      });
    });
  });
  const parClient = Object.values(cmap).map((c) => ({ ...c, chevaux: Object.values(c.chevaux).sort((a, b) => b.km - a.km) })).sort((a, b) => b.km - a.km);
  return { mois, annee, odo: odometer(), parClient };
}
const hrs = (min) => (Math.round(min / 6) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' h';
const STAT_TILE_DEFS = [
  { key: 'kmMonth', label: 'Km ce mois' }, { key: 'kmYear', label: 'Km cette année' }, { key: 'kmOdo', label: 'Odomètre (total)' },
  { key: 'baseVeh', label: 'Base véhicule /km' }, { key: 'tCarb', label: 'Carburant /km' }, { key: 'tTournee', label: 'Tarif tournée /km' },
];
const STAT_TILES = STAT_TILE_DEFS.map((d) => d.key);
// Cases Analytique de la tournée (toutes en HT) — total = Total HT de la tournée.
const ANALYTIC_DEFS = [
  { key: 'anaServices', label: 'Services', get: (R) => R.servicesHT || 0 },
  { key: 'anaMateriel', label: 'Matériel', get: (R) => R.materielHT || 0 },
  { key: 'anaVehicule', label: 'Véhicule', get: (R) => R.provisionVehiculeHT || 0 },
  { key: 'anaMarge', label: 'Marge réelle', get: (R) => R.margeReelle || 0 },
];
const tileLabel = (key, def) => (S.tileLabels && S.tileLabels[key]) || def;
const orderedKeys = (saved, all) => { const s = (saved || []).filter((k) => all.includes(k)); return s.concat(all.filter((k) => !s.includes(k))); };
// Applique l'ordre + les titres perso aux tuiles Stats, puis (ré)active le glisser-déposer.
function applyStatOrder() {
  const box = $('statTiles'); if (!box) return;
  orderedKeys(S.statOrder, STAT_TILES).forEach((k) => { const el = box.querySelector(`[data-key="${k}"]`); if (el) box.appendChild(el); });
  STAT_TILE_DEFS.forEach((d) => { const el = box.querySelector(`[data-key="${d.key}"] .t-label`); if (el) el.textContent = tileLabel(d.key, d.label); });
  if (!box._dragWired) { wireTileDrag(box, 'statOrder'); box._dragWired = true; }
}
// Cases Analytique (tournée) : construites dynamiquement, réordonnables, titres perso.
function renderAnalytique(R) {
  const box = $('analyticTiles'); if (!box) return;
  box.innerHTML = '';
  orderedKeys(S.analyticOrder, ANALYTIC_DEFS.map((d) => d.key)).forEach((key) => {
    const d = ANALYTIC_DEFS.find((x) => x.key === key); if (!d) return;
    const el = document.createElement('div'); el.className = 'tile draggable'; el.dataset.key = key;
    el.innerHTML = `<span class="t-label">${esc(tileLabel(key, d.label))}</span><span class="t-val">${R ? eur(d.get(R)) + ' HT' : '—'}</span>`;
    box.appendChild(el);
  });
  wireTileDrag(box, 'analyticOrder');
}
// Réordonnancement des cases activable/désactivable par section (évite les déplacements involontaires au défilement).
const _tileDrag = { analyticOrder: false, statOrder: false };
function toggleTileDrag(orderKey, box, btn) {
  _tileDrag[orderKey] = !_tileDrag[orderKey];
  if (box) box.classList.toggle('reorder-on', _tileDrag[orderKey]);
  if (btn) { btn.classList.toggle('primary', _tileDrag[orderKey]); btn.textContent = _tileDrag[orderKey] ? '✓ Ordre activé' : '⇅ Réordonner'; }
}
function wireTileDrag(box, orderKey) {
  if (box) box.classList.toggle('reorder-on', !!_tileDrag[orderKey]);
  box.querySelectorAll('.tile.draggable').forEach((tile) => {
    tile.addEventListener('pointerdown', (e) => {
      if (!_tileDrag[orderKey]) return; // réordonnancement désactivé → le défilement reste normal
      e.preventDefault(); tile.classList.add('dragging'); tile.setPointerCapture && tile.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const sibs = [...box.querySelectorAll('.tile:not(.dragging)')];
        let best = null, bestD = Infinity, after = false;
        sibs.forEach((s) => { const r = s.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const d = Math.hypot(ev.clientX - cx, ev.clientY - cy); if (d < bestD) { bestD = d; best = s; after = ev.clientY > cy + 4 || (Math.abs(ev.clientY - cy) <= r.height / 2 && ev.clientX > cx); } });
        if (best) { after ? best.after(tile) : box.insertBefore(tile, best); }
      };
      const up = () => {
        tile.classList.remove('dragging');
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
        S[orderKey] = [...box.querySelectorAll('.tile')].map((x) => x.dataset.key); saveSettings();
      };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
  });
}
// Réglages → Analyse : renommer les titres des cases (Analytique + Stats).
function renderAnalyse() {
  const build = (containerId, defs) => {
    const box = $(containerId); if (!box) return; box.innerHTML = '';
    defs.forEach((d) => {
      const lab = document.createElement('label'); lab.textContent = 'Défaut : ' + d.label;
      const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = d.label;
      inp.value = (S.tileLabels && S.tileLabels[d.key]) || '';
      inp.addEventListener('input', (e) => { const v = e.target.value.trim(); if (v) S.tileLabels[d.key] = v; else delete S.tileLabels[d.key]; saveSettings(); });
      lab.appendChild(inp); box.appendChild(lab);
    });
  };
  build('analyseAnalytic', ANALYTIC_DEFS);
  build('analyseStats', STAT_TILE_DEFS);
}
function renderStats() {
  applyStatOrder();
  const st = kmStats();
  if ($('kmMonth')) $('kmMonth').textContent = km(st.mois);
  if ($('kmYear')) $('kmYear').textContent = km(st.annee);
  if ($('kmOdo')) $('kmOdo').textContent = km(st.odo);
  if ($('baseVeh')) $('baseVeh').textContent = eurkm(baseVehiculeHT());
  if ($('tCarb')) $('tCarb').textContent = eurkm(fuelPerKmHT()) + ' HT';
  if ($('tTournee')) $('tTournee').textContent = eurkm(tarifHT('tournee')) + ' HT';
  const box = $('kmParClient'); if (box) {
    box.innerHTML = ''; $('kmParClientEmpty').style.display = st.parClient.length ? 'none' : 'block';
    st.parClient.forEach((c) => {
      const el = document.createElement('div'); el.className = 'inv-client';
      let h = `<div class="inv-head"><span>${esc(c.nom)}</span><span>${km(c.km)} · ${durMin(c.min)}</span></div>`;
      c.chevaux.forEach((cv) => { h += `<div class="fin-cheval"><span>🐴 ${esc(cv.nom)}</span><span>${km(cv.km)} · ${durMin(cv.min)}</span></div>`; });
      el.innerHTML = h; box.appendChild(el);
    });
  }
  renderTrajetTemps();
  renderTravail();
  renderFinance();
  renderFinanceCheval();
}
// Stats : temps de trajet estimé (tournée) vs réel encodé (par arrêt), avec arrêts manquants signalés.
function renderTrajetTemps() {
  const box = $('trajetTempsList'); if (!box) return; box.innerHTML = '';
  const list = allTours().filter((t) => (t.arrets || []).length).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if ($('trajetTempsEmpty')) $('trajetTempsEmpty').style.display = list.length ? 'none' : 'block';
  list.forEach((t) => {
    const na = (t.arrets || []).length;
    const withReal = (t.arrets || []).filter((a) => typeof a.realMin === 'number');
    const realTot = withReal.reduce((s, a) => s + a.realMin, 0);
    const missing = na - withReal.length;
    const estTot = t.result ? Math.round(t.result.totalMin) : null;
    const el = document.createElement('div'); el.className = 'inv-client';
    let h = `<div class="inv-head"><span>${esc(fmtDateFr(t.date))}${t.nom && t.nom.trim() ? ' : ' + esc(t.nom.trim()) : ''}</span><span>${withReal.length}/${na} réel</span></div>`;
    h += `<div class="inv-line"><span>Durée estimée (tournée)</span><span>${estTot != null ? durMin(estTot) : '—'}</span></div>`;
    h += `<div class="inv-line"><span>Temps réel renseigné (somme)</span><span>${withReal.length ? durMin(realTot) : '—'}</span></div>`;
    if (missing) h += `<div class="inv-line" style="color:var(--warn)"><span>Arrêts sans temps réel</span><span>${missing}</span></div>`;
    (t.arrets || []).forEach((a, i) => { const r = (typeof a.realMin === 'number') ? durMin(a.realMin) : '<i>non renseigné</i>'; h += `<div class="fin-cheval"><span>${i + 1}. ${esc(labelFor(a)) || 'arrêt'}</span><span>réel : ${r}</span></div>`; });
    el.innerHTML = h; box.appendChild(el);
  });
}
// ---------- Temps de travail (suivi réel : « Démarrer » + « Valider l'arrêt ») ----------
// Trajet = réel (Route) sinon estimé ; visite = mesurée entre l'arrivée (calculée) et la validation ; retour = mesuré (Terminer) sinon estimé.
function travailForTour(t) {
  if (!t.startedAt || !(t.arrets || []).length) return null;
  const R = t.result;
  const mpk = (R && R.totalKm > 0 && R.totalMin) ? (R.totalMin / R.totalKm) : (60 / (S.vitesseKmh || 90));
  const travelMin = (i) => { const a = t.arrets[i]; if (typeof a.realMin === 'number') return a.realMin; const seg = (R && R.rows && R.rows[i]) ? (R.rows[i].segKm || 0) : 0; return seg * mpk; };
  const returnMinEst = (R && R.kmLastHome != null) ? R.kmLastHome * mpk : 0;
  const per = []; let prevDepart = t.startedAt; let complete = true;
  t.arrets.forEach((a, i) => {
    const travelMs = travelMin(i) * 60000;
    const arrival = prevDepart + travelMs;
    const dep = (typeof a.validatedAt === 'number') ? a.validatedAt : null;
    let visitMs = null;
    if (dep != null) { visitMs = Math.max(0, dep - arrival); prevDepart = dep; } else complete = false;
    per.push({ travelMs, visitMs, arrival, dep });
  });
  const lastDep = per.length ? per[per.length - 1].dep : null;
  // Retour : réel encodé (Route) en priorité, sinon mesuré (Clôturer), sinon estimé.
  const returnMs = (typeof t.returnRealMin === 'number') ? t.returnRealMin * 60000 : ((t.endedAt && lastDep) ? Math.max(0, t.endedAt - lastDep) : returnMinEst * 60000);
  const endTs = t.endedAt || (lastDep != null ? lastDep + returnMs : null);
  return { per, returnMs, complete, totalMs: endTs != null ? (endTs - t.startedAt) : null, endTs };
}
function travailStats() {
  const out = [];
  allTours().forEach((t) => {
    const w = travailForTour(t); if (!w) return;
    const clientIds = new Set(); t.arrets.forEach((a) => (a.clients || []).forEach((cl) => clientIds.add(cl.clientId)));
    // Retour : réparti UNIQUEMENT sur les clients « loin » (comme la facturation km). Les clients « proche » (forfait seuil) n'ont pas de temps de retour.
    const rows = (t.result && t.result.rows) || [];
    const loin = new Set(); t.arrets.forEach((a, i) => { if (!(rows[i] && rows[i].proche)) (a.clients || []).forEach((cl) => loin.add(cl.clientId)); });
    const returnSet = loin.size ? loin : clientIds;
    const returnPer = w.returnMs / (returnSet.size || 1);
    const cmap = {};
    t.arrets.forEach((a, i) => {
      const nc = (a.clients || []).length || 1;
      const travelPer = w.per[i].travelMs / nc;
      const visitPer = (w.per[i].visitMs != null ? w.per[i].visitMs : 0) / nc;
      (a.clients || []).forEach((cl) => {
        const c = cmap[cl.clientId] = cmap[cl.clientId] || { clientId: cl.clientId, nom: clientName(cl.clientId), travelMs: 0, visitMs: 0, chevaux: {} };
        c.travelMs += travelPer; c.visitMs += visitPer;
        const chn = (cl.chevaux || []).length || 1;
        (cl.chevaux || []).forEach((cv) => { const ch = c.chevaux[cv.nom] = c.chevaux[cv.nom] || { nom: cv.nom, ms: 0 }; ch.ms += (travelPer + visitPer) / chn; });
      });
    });
    const clientsArr = Object.values(cmap).map((c) => {
      const rMs = returnSet.has(c.clientId) ? returnPer : 0; // client proche → aucun temps de retour
      const chList = Object.values(c.chevaux); const rpc = chList.length ? rMs / chList.length : 0;
      chList.forEach((cv) => { cv.ms += rpc; });
      return Object.assign({}, c, { returnMs: rMs, totalMs: c.travelMs + c.visitMs + rMs, chevaux: chList });
    });
    out.push({ tour: t, clients: clientsArr, totalMs: w.totalMs, complete: w.complete, startedAt: t.startedAt, endTs: w.endTs });
  });
  out.sort((a, b) => (b.tour.date || '').localeCompare(a.tour.date || ''));
  return out;
}
// Heure d'arrivée estimée/réelle au retour (timestamp) : dernier arrêt validé + temps de retour (réel encodé sinon estimé) ;
// repli si aucun arrêt validé : démarrage + durée estimée totale de la tournée.
function estimatedArrivalTs(t) {
  const w = travailForTour(t);
  if (w && w.endTs != null) return w.endTs;
  if (t.startedAt && t.result && t.result.totalMin) return t.startedAt + t.result.totalMin * 60000;
  return null;
}
// Auto-clôture : une tournée DÉMARRÉE non clôturée manuellement se clôture seule 3 h après l'heure d'arrivée (indication + log).
function autoCloseOverdueTours() {
  let changed = false;
  (tournees || []).forEach((t) => {
    if (!t.startedAt || t.endedAt || t.closed) return;
    const arr = estimatedArrivalTs(t); if (arr == null) return;
    const deadline = arr + 3 * 3600 * 1000;
    if (Date.now() > deadline) { t.endedAt = deadline; t.closed = true; t.autoClosedAt = deadline; changed = true; }
  });
  if (changed) saveTournees();
}
function renderTravail() {
  const box = $('travailList'); if (!box) return; box.innerHTML = '';
  const st = travailStats();
  if ($('travailEmpty')) $('travailEmpty').style.display = st.length ? 'none' : 'block';
  st.forEach((w) => {
    const t = w.tour;
    const el = document.createElement('div'); el.className = 'inv-client';
    let h = `<div class="inv-head"><span>${esc(fmtDateFr(t.date))}${t.nom && t.nom.trim() ? ' : ' + esc(t.nom.trim()) : ''}</span><span>${durHm(w.totalMs)}${w.complete ? '' : ' ⚠'}</span></div>`;
    h += `<div class="inv-line"><span>Départ → fin</span><span>${hm(w.startedAt)} → ${hm(w.endTs)}</span></div>`;
    if (!w.complete) h += '<div class="inv-line" style="color:var(--warn)"><span>Suivi incomplet</span><span>arrêts non validés</span></div>';
    w.clients.forEach((c) => {
      h += `<div class="inv-line"><span><b>${esc(c.nom)}</b> — route ${durHm(c.travelMs)} · visite ${durHm(c.visitMs)} · retour ${durHm(c.returnMs)}</span><span><b>${durHm(c.totalMs)}</b></span></div>`;
      c.chevaux.forEach((cv) => { h += `<div class="fin-cheval"><span>🐴 ${esc(cv.nom)}</span><span>${durHm(cv.ms)}</span></div>`; });
    });
    el.innerHTML = h; box.appendChild(el);
  });
}
function financeStats() {
  const cmap = {};
  allTours().forEach((t) => {
    if (!t.result || !t.result.parClient) return;
    t.result.parClient.forEach((m) => {
      const c = cmap[m.clientId] = cmap[m.clientId] || { nom: m.nom, dep: 0, mat: 0, art: 0, arrondi: 0, impaye: 0, chevaux: {} };
      const dep = (m.deplacement || []).reduce((s, l) => s + l.partTTC, 0);
      const mat = (m.materiel || []).reduce((s, x) => s + x.ttc, 0);
      const art = (m.articles || []).reduce((s, a) => s + a.ttc, 0); // remise déjà appliquée ligne par ligne
      c.dep += dep; c.mat += mat; c.art += art;
      // Arrondi caisse (liquide) : le total facturé = total rectifié. Impayé (partiel) suivi à part (créance, ne change pas le CA).
      const pay = (t.payments || {})[m.clientId];
      c.arrondi += payArrondi(m, pay);
      c.impaye += payImpaye(m, pay);
      (m.materiel || []).forEach((x) => { const ch = c.chevaux[x.nom] = c.chevaux[x.nom] || { nom: x.nom, dep: 0, mat: 0, art: 0 }; ch.mat += x.ttc; });
      (m.deplacement || []).forEach((l) => { const per = l.chevaux.length ? l.partTTC / l.chevaux.length : 0; l.chevaux.forEach((n) => { const ch = c.chevaux[n] = c.chevaux[n] || { nom: n, dep: 0, mat: 0, art: 0 }; ch.dep += per; }); });
      (m.articles || []).forEach((a) => { const per = a.chevaux.length ? a.ttc / a.chevaux.length : 0; a.chevaux.forEach((n) => { const ch = c.chevaux[n] = c.chevaux[n] || { nom: n, dep: 0, mat: 0, art: 0 }; ch.art += per; }); });
    });
  });
  return Object.values(cmap).map((c) => ({ ...c, total: c.dep + c.mat + c.art + (c.arrondi || 0), recu: c.dep + c.mat + c.art + (c.arrondi || 0) - (c.impaye || 0), chevaux: Object.values(c.chevaux) })).sort((a, b) => b.total - a.total);
}
function renderFinance() {
  const box = $('financeList'); if (!box) return; box.innerHTML = '';
  const fs = financeStats();
  $('financeEmpty').style.display = fs.length ? 'none' : 'block';
  fs.forEach((c) => {
    const el = document.createElement('div'); el.className = 'inv-client';
    let h = `<div class="inv-head"><span>${esc(c.nom)}</span><span class="inv-amt">${eur(c.total)} TTC</span></div>`;
    h += `<div class="inv-line"><span>Articles</span><span>${eur(c.art)}</span></div><div class="inv-line"><span>Matériel</span><span>${eur(c.mat)}</span></div><div class="inv-line"><span>Déplacement</span><span>${eur(c.dep)}</span></div>`;
    if (Math.abs(c.arrondi || 0) >= 0.005) h += `<div class="inv-line" style="color:var(--warn)"><span>Arrondi caisse (liquide)</span><span>${eur(c.arrondi)}</span></div>`;
    if ((c.impaye || 0) >= 0.005) { h += `<div class="inv-line" style="color:var(--warn)"><span>Montant impayé (créance)</span><span>−${eur(c.impaye)}</span></div>`; h += `<div class="inv-line"><span>Montant réellement reçu</span><span>${eur(c.recu)}</span></div>`; }
    c.chevaux.forEach((cv) => { h += `<div class="fin-cheval"><span>🐴 ${esc(cv.nom)} · A ${eur(cv.art)} M ${eur(cv.mat)} D ${eur(cv.dep)}</span><span>${eur(cv.art + cv.mat + cv.dep)}</span></div>`; });
    el.innerHTML = h; box.appendChild(el);
  });
}
// ================= GESTION → COMPTA (mensuelle) =================
const monthLabel = (ym) => { const d = new Date(ym + '-01T00:00:00'); return isNaN(d.getTime()) ? ym : d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
// Mois ayant au moins une tournée calculée (facturée).
function comptaMonths() {
  const set = new Set();
  allTours().forEach((t) => { if ((t.date || '') && t.result && t.result.parClient && t.result.parClient.length) set.add(t.date.slice(0, 7)); });
  return [...set].sort().reverse();
}
// Retrouve une tournée (active ou archivée) par id.
function tourById(id) { return tournees.find((t) => t.id === id) || archive.find((t) => t.id === id) || null; }
// Classe le paiement d'un client d'une tournée depuis la Compta (virement/facture arrivent après la clôture).
function setComptaPayment(tourId, clientId, method) {
  const t = tourById(tourId); if (!t) return;
  if (!t.payments) t.payments = {};
  const prev = t.payments[clientId] || {};
  const keepLiq = { rectifie: prev.rectifie != null ? prev.rectifie : (prev.montantPaye != null && !prev.partiel ? prev.montantPaye : null), partiel: !!prev.partiel, impaye: prev.impaye != null ? prev.impaye : null, resteMode: prev.resteMode || null };
  if (method === 'liquide') t.payments[clientId] = Object.assign({ method: 'liquide', facture: false }, keepLiq);
  else if (method === 'facliq') t.payments[clientId] = Object.assign({ method: 'liquide', facture: true }, keepLiq); // facture pro payée en liquide
  else if (method === 'virement') t.payments[clientId] = { method: 'virement', facture: false, rectifie: null, partiel: false, impaye: null, resteMode: null };
  else if (method === 'facvir') t.payments[clientId] = { method: 'virement', facture: true, rectifie: null, partiel: false, impaye: null, resteMode: null }; // facture pro payée par virement
  else t.payments[clientId] = { method: null, facture: false, rectifie: null, partiel: false, impaye: null, resteMode: null }; // « à classer » (tournée à venir)
  const i = tournees.findIndex((x) => x.id === t.id); if (i >= 0) { tournees[i] = t; saveTournees(); } else { const ai = archive.findIndex((x) => x.id === t.id); if (ai >= 0) { archive[ai] = t; saveArchive(); } }
}
// Agrégats du mois : liquide (postes globalisés, sans nom) + virements + factures (par client).
// 4 sections d'encaissement : Liquide (globalisé) · Virement · Facture pro liquide · Facture pro virement.
// « Facture » = case « Facture nécessaire » COMBINÉE au mode de paiement (une facture peut être payée en liquide OU virement).
// Aucun mode choisi → « aclasser » (sous-onglet « Tournée à venir », hors mois en cours).
function comptaData(ym) {
  const r = rate();
  const liquideClients = [], virementClients = [], factureLiqClients = [], factureVirClients = [], aclasserClients = [];
  const posts = {}; const addPost = (lib, ht, tva, ttc) => { const p = posts[lib] = posts[lib] || { libelle: lib, ht: 0, tva: 0, ttc: 0 }; p.ht += ht; p.tva += tva; p.ttc += ttc; };
  allTours().forEach((t) => {
    if (!(t.date || '').startsWith(ym) || !t.result || !t.result.parClient) return;
    t.result.parClient.forEach((m) => {
      const p = (t.payments || {})[m.clientId];
      const method = p ? p.method : null; const fac = !!(p && p.facture);
      const mode = method === 'liquide' ? (fac ? 'facliq' : 'liquide') : method === 'virement' ? (fac ? 'facvir' : 'virement') : 'aclasser';
      const entry = { tourId: t.id, tourDate: t.date, clientId: m.clientId, nom: m.nom, ht: m.totalHT, tva: m.totalTVA, ttc: m.totalTTC, mode, m, payment: p };
      if (mode === 'aclasser') { aclasserClients.push(entry); return; }
      if (mode === 'virement') { virementClients.push(entry); return; }
      if (mode === 'facvir') { factureVirClients.push(entry); return; }
      if (mode === 'facliq') { const cash = payRecu(m, p); factureLiqClients.push(Object.assign({}, entry, { ht: cash / (1 + r), tva: cash - cash / (1 + r), ttc: cash })); return; }
      // mode === 'liquide' (globalisé, sans facture)
      const cash = payRecu(m, p); const cHT = cash / (1 + r); liquideClients.push({ nom: m.nom, ht: cHT, tva: cash - cHT, ttc: cash });
      if (p && p.partiel) {
        addPost('Acompte liquide (partiel)', cHT, cash - cHT, cash);
        const reste = payImpaye(m, p);
        if (reste > 0.005 && p.resteMode === 'virement') virementClients.push({ tourId: t.id, clientId: m.clientId, nom: m.nom + ' — reste impayé', ht: reste / (1 + r), tva: reste - reste / (1 + r), ttc: reste, mode: 'virement', derived: true, recuKey: t.id + ':' + m.clientId + ':reste' });
      } else {
        (m.articles || []).forEach((a) => addPost(a.libelle, a.ht, a.tva, a.ttc));
        if (m.htMat > 0) addPost('Matériel', m.htMat, m.htMat * r, m.htMat * (1 + r));
        const depHT = (m.deplacement || []).reduce((s, l) => s + l.partHT, 0); if (depHT > 0) addPost('Déplacement', depHT, depHT * r, depHT * (1 + r));
        const diff = payArrondi(m, p); if (Math.abs(diff) >= 0.005) { const dHT = diff / (1 + r); addPost('Arrondi caisse', dHT, diff - dHT, diff); }
      }
    });
  });
  const sum = (arr) => arr.reduce((a, x) => ({ ht: a.ht + x.ht, tva: a.tva + x.tva, ttc: a.ttc + x.ttc }), { ht: 0, tva: 0, ttc: 0 });
  return { liquideClients, virementClients, factureLiqClients, factureVirClients, aclasserClients,
    liquidePosts: Object.values(posts), liquideTotal: sum(liquideClients), virementTotal: sum(virementClients),
    factureLiqTotal: sum(factureLiqClients), factureVirTotal: sum(factureVirClients), aclasserTotal: sum(aclasserClients) };
}
// Génère le PDF via l'impression du navigateur, dans le document courant (compatible PWA installée,
// contrairement à window.open('_blank') qui est bloqué / ferme l'app sur mobile).
function printHtml(title, bodyHtml) {
  let pa = document.getElementById('printArea');
  if (!pa) { pa = document.createElement('div'); pa.id = 'printArea'; document.body.appendChild(pa); }
  pa.innerHTML = bodyHtml;
  document.title = title;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); pa.innerHTML = ''; document.title = 'GaloPodo'; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); }, 60);
  setTimeout(done, 120000); // filet de sécurité
}
// --- Sous-navigation Compta : Mois en cours / Déclaration ---
let currentCsub = 'mois';
function showCompta(sub) {
  currentCsub = sub || 'mois';
  document.querySelectorAll('#comptaSub .subtab').forEach((b) => b.classList.toggle('active', b.dataset.csub === currentCsub));
  document.querySelectorAll('#tab-compta .subpanel').forEach((p) => p.classList.toggle('active', p.id === 'csub-' + currentCsub));
  const cb = document.querySelector('#comptaSub .subtab[data-csub="' + currentCsub + '"]'), cl = document.querySelector('#comptaSub .subnav-label');
  if (cb && cl) cl.textContent = cb.textContent;
  if ($('comptaSub')) $('comptaSub').classList.remove('open');
  if (currentCsub === 'decl') renderComptaDecl(); else if (currentCsub === 'impayes') renderComptaImpayes(); else if (currentCsub === 'avenir') renderComptaAvenir(); else renderComptaMois();
  window.scrollTo(0, 0);
}
// Sous-onglet Compta « Impayés » : tous les impayés clients, séparés « en attente » / « régularisés » (paiement reçu).
function renderComptaImpayes() {
  const attente = $('impayesAttente'), regul = $('impayesRegul'); if (!attente || !regul) return;
  attente.innerHTML = ''; regul.innerHTML = '';
  const all = [];
  clients.forEach((c) => (c.impayes || []).forEach((im) => all.push({ c, im })));
  const enAttente = all.filter((x) => !x.im.collected).sort((a, b) => (a.im.date || '').localeCompare(b.im.date || ''));
  const regularises = all.filter((x) => x.im.collected).sort((a, b) => (b.im.date || '').localeCompare(a.im.date || ''));
  const totA = enAttente.reduce((s, x) => s + (x.im.ttc || 0), 0);
  if ($('impayesAttenteEmpty')) $('impayesAttenteEmpty').style.display = enAttente.length ? 'none' : 'block';
  if ($('impayesRegulEmpty')) $('impayesRegulEmpty').style.display = regularises.length ? 'none' : 'block';
  if ($('impayesAttenteTot')) $('impayesAttenteTot').textContent = totA > 0.005 ? 'Total en attente : ' + eur(totA) + ' TTC' : '';
  enAttente.forEach(({ c, im }) => {
    const el = document.createElement('div'); el.className = 'list-item';
    el.innerHTML = `<div class="li-main"><b>${esc(fullName(c))}</b><span class="li-sub">Impayé du ${esc(fmtDateFr(im.date))} · <span class="badge">en attente</span></span></div><div class="li-act"><b>${eur(im.ttc)}</b></div>`;
    attente.appendChild(el);
  });
  regularises.forEach(({ c, im }) => {
    const rt = im.collectedTourId ? tourById(im.collectedTourId) : null;
    const el = document.createElement('div'); el.className = 'list-item';
    el.innerHTML = `<div class="li-main"><b>${esc(fullName(c))}</b><span class="li-sub">Impayé du ${esc(fmtDateFr(im.date))} · <span class="badge">paiement reçu</span>${rt ? ' · régularisé le ' + esc(fmtDateFr(rt.date)) : ''}</span></div><div class="li-act"><b>${eur(im.ttc)}</b></div>`;
    regul.appendChild(el);
  });
}
// HTML des 3 sections d'UN mois. archived (ym < mois courant) = démarches disponibles.
function comptaSectionsHtml(ym) {
  const archived = ym < todayStr().slice(0, 7);
  const d = comptaData(ym);
  const tot = (tt) => `HT ${eur(tt.ht)} · TVA ${eur(tt.tva)} · <b>TTC ${eur(tt.ttc)}</b>`;
  const statusOfKind = (k) => (S.comptaStatus[ym] && S.comptaStatus[ym][k]) || 'attente';
  const recuKeyOf = (e) => e.recuKey || (e.tourId + ':' + e.clientId);
  const isRecu = (e) => !!(S.comptaRecu && S.comptaRecu[recuKeyOf(e)]);
  const isDem = (e) => !!(S.comptaDemarche && S.comptaDemarche[recuKeyOf(e)]);
  const modeLbl = { aclasser: 'À classer', liquide: 'Liquide', virement: 'Virement', facliq: 'Facture pro (liquide)', facvir: 'Facture pro (virement)' };
  const modeOpts = (m) => ['aclasser', 'liquide', 'facliq', 'virement', 'facvir'].map((v) => `<option value="${v}"${v === m ? ' selected' : ''}>${modeLbl[v]}</option>`).join('');
  const clientTbl = (arr) => arr.length ? `<div class="table-wrap"><table><thead><tr><th>Client</th><th>HT</th><th>TVA</th><th>TTC</th><th>Mode</th><th>Reçu</th>${archived ? '<th>Démarche</th>' : ''}</tr></thead><tbody>${arr.map((e) => { const rk = recuKeyOf(e), dem = isDem(e); return `<tr${dem ? ' style="opacity:.45"' : ''}><td>${esc(e.nom)}</td><td>${eur(e.ht)}</td><td>${eur(e.tva)}</td><td>${eur(e.ttc)}</td><td>${(e.derived || dem) ? (e.derived ? 'Reste (virement)' : (modeLbl[e.mode] || '')) : `<select data-mode data-tour="${e.tourId}" data-cid="${e.clientId}">${modeOpts(e.mode)}</select>`}</td><td style="text-align:center"><input type="checkbox" data-recu data-key="${rk}" ${isRecu(e) ? 'checked' : ''}${dem ? ' disabled' : ''}/></td>${archived ? `<td style="text-align:center"><input type="checkbox" data-dem data-key="${rk}" ${dem ? 'checked' : ''}/></td>` : ''}</tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">Aucun.</p>';
  const postTbl = (arr) => arr.length ? `<div class="table-wrap"><table><thead><tr><th>Poste</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead><tbody>${arr.map((x) => `<tr><td>${esc(x.libelle)}</td><td>${eur(x.ht)}</td><td>${eur(x.tva)}</td><td>${eur(x.ttc)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucun.</p>';
  const recuRow = (arr) => { if (!arr.length) return ''; const n = arr.filter(isRecu).length; const imp = arr.length - n; return `<p class="hint"${imp ? ' style="color:var(--warn);font-weight:700"' : ''}>Paiements reçus : ${n}/${arr.length}${imp ? ` · ⚠ ${imp} impayé(s)` : ' ✅'}</p>`; };
  const section = (title, k, total, detail, arr) => `<section class="card"><div class="card-head"><h3 style="margin:0">${title}</h3><button class="btn small" data-print="${k}" data-ym="${ym}">🖨 PDF</button></div><p class="hint">${tot(total)}</p>${arr ? recuRow(arr) : ''}${detail}</section>`;
  const liqDem = archived && statusOfKind('liquide') === 'encode';
  const liquideStatus = archived ? `<label>Démarche comptable (caisse du mois)<select data-status="liquide" data-ym="${ym}"><option value="attente"${statusOfKind('liquide') === 'attente' ? ' selected' : ''}>En attente de démarche</option><option value="encode"${statusOfKind('liquide') === 'encode' ? ' selected' : ''}>Démarche effectuée (encodée)</option></select></label>` : '';
  const liquideSec = `<section class="card"><div class="card-head"><h3 style="margin:0">💶 Liquide (globalisé)</h3><button class="btn small" data-print="liquide" data-ym="${ym}">🖨 PDF</button></div><p class="hint">${tot(d.liquideTotal)}</p><div${liqDem ? ' style="opacity:.45;pointer-events:none"' : ''}>${postTbl(d.liquidePosts)}</div>${liquideStatus}</section>`;
  return liquideSec
    + section('🏦 Virements', 'virement', d.virementTotal, clientTbl(d.virementClients), d.virementClients)
    + section('🧾 Facture pro — liquide', 'facliq', d.factureLiqTotal, clientTbl(d.factureLiqClients), d.factureLiqClients)
    + section('🧾 Facture pro — virement', 'facvir', d.factureVirTotal, clientTbl(d.factureVirClients), d.factureVirClients);
}
// Sous-onglet « Tournée à venir » : clients de toute tournée calculée sans mode de paiement choisi (à classer), toutes périodes.
function renderComptaAvenir() {
  const box = $('comptaAvenirBody'); if (!box) return; box.innerHTML = '';
  const rows = [];
  allTours().forEach((t) => { if (!t.result || !t.result.parClient) return; t.result.parClient.forEach((m) => { const p = (t.payments || {})[m.clientId]; const method = p ? p.method : null; if (method !== 'liquide' && method !== 'virement') rows.push({ t, m }); }); });
  rows.sort((a, b) => (a.t.date || '').localeCompare(b.t.date || ''));
  if ($('comptaAvenirEmpty')) $('comptaAvenirEmpty').style.display = rows.length ? 'none' : 'block';
  const total = rows.reduce((s, x) => s + (x.m.totalTTC || 0), 0);
  if ($('comptaAvenirTot')) $('comptaAvenirTot').textContent = rows.length ? 'Total non classé : ' + eur(total) + ' TTC' : '';
  rows.forEach(({ t, m }) => {
    const el = document.createElement('div'); el.className = 'list-item';
    el.innerHTML = `<div class="li-main"><b>${esc(m.nom)}</b><span class="li-sub">${esc(fmtDateFr(t.date))}${t.nom && t.nom.trim() ? ' · ' + esc(t.nom.trim()) : ''} · ${statusOf(t) === 'cloturee' ? 'clôturée' : (statusOf(t) === 'active' ? "aujourd'hui" : 'à venir')} · <span class="badge">à classer</span></span></div><div class="li-act"><b>${eur(m.totalTTC)}</b></div>`;
    box.appendChild(el);
  });
}
function comptaWire(container, rerender) {
  container.querySelectorAll('[data-status]').forEach((el) => el.addEventListener('change', (e) => { const ym = el.dataset.ym; S.comptaStatus[ym] = S.comptaStatus[ym] || {}; S.comptaStatus[ym][el.dataset.status] = e.target.value; saveSettings(); rerender(); }));
  container.querySelectorAll('[data-dem]').forEach((cb) => cb.addEventListener('change', (e) => { S.comptaDemarche = S.comptaDemarche || {}; const k = cb.dataset.key; if (e.target.checked) S.comptaDemarche[k] = true; else delete S.comptaDemarche[k]; saveSettings(); rerender(); }));
  container.querySelectorAll('[data-mode]').forEach((el) => el.addEventListener('change', () => { setComptaPayment(el.dataset.tour, el.dataset.cid, el.value); rerender(); }));
  container.querySelectorAll('[data-recu]').forEach((cb) => cb.addEventListener('change', (e) => { S.comptaRecu = S.comptaRecu || {}; const k = cb.dataset.key; if (e.target.checked) S.comptaRecu[k] = true; else delete S.comptaRecu[k]; saveSettings(); rerender(); }));
  container.querySelectorAll('[data-print]').forEach((btn) => btn.addEventListener('click', () => comptaPrint(btn.dataset.ym, btn.dataset.print)));
}
function comptaPrint(ym, k) {
  const d = comptaData(ym), ml = monthLabel(ym);
  const foot = (tt) => `<tfoot><tr><td>Total</td><td>${eur(tt.ht)}</td><td>${eur(tt.tva)}</td><td>${eur(tt.ttc)}</td></tr></tfoot>`;
  const postTbl = (arr) => arr.length ? `<table><thead><tr><th>Poste</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead><tbody>${arr.map((x) => `<tr><td>${esc(x.libelle)}</td><td>${eur(x.ht)}</td><td>${eur(x.tva)}</td><td>${eur(x.ttc)}</td></tr>`).join('')}</tbody></table>` : '';
  const detailPdf = (entries, total, titre, sousTitre, vide) => entries.length
    ? `<h1>${titre}</h1><h2>${sousTitre}</h2>` + entries.map((e) => `<h3>${esc(e.nom)}${e.tourDate ? ' · ' + esc(fmtDateFr(e.tourDate)) : ''}</h3>${e.m ? clientInvoiceHtml(e.m, e.payment) : '<p>Reste impayé (paiement partiel liquide) : ' + eur(e.ttc) + ' TTC</p>'}`).join('') + `<h2 style="margin-top:14px">Total : ${eur(total.ttc)} TTC (HT ${eur(total.ht)} · TVA ${eur(total.tva)})</h2>`
    : `<h1>${titre}</h1><h2>${sousTitre}</h2><p>${vide}</p>`;
  if (k === 'liquide') printHtml('Caisse liquide — ' + ml, `<h1>Caisse / paiements liquide</h1><h2>${ml} — postes globalisés (sans nom de client)</h2>` + (d.liquidePosts.length ? postTbl(d.liquidePosts).replace('</tbody>', '</tbody>' + foot(d.liquideTotal)) : '<p>Aucun paiement liquide ce mois.</p>'));
  else if (k === 'virement') printHtml('Virements — ' + ml, detailPdf(d.virementClients, d.virementTotal, 'Virements bancaires — détail', ml + ' — par client et par cheval', 'Aucun virement ce mois.'));
  else if (k === 'facliq') printHtml('Factures pro liquide — ' + ml, detailPdf(d.factureLiqClients, d.factureLiqTotal, 'Factures pro payées en liquide', ml + ' — par client et par cheval', 'Aucune facture liquide ce mois.'));
  else printHtml('Factures pro virement — ' + ml, detailPdf(d.factureVirClients, d.factureVirTotal, 'Factures pro payées par virement', ml + ' — par client et par cheval', 'Aucune facture virement ce mois.'));
}
function renderComptaMois() {
  const box = $('comptaMoisBody'); if (!box) return;
  box.innerHTML = comptaSectionsHtml(todayStr().slice(0, 7));
  comptaWire(box, renderComptaMois);
}
// --- Déclaration : filtre mois/trimestre/semestre/année → mois empilés ---
const comptaYears = () => [...new Set(comptaMonths().map((m) => m.slice(0, 4)))].sort().reverse();
function comptaPeriodOptions(type) {
  if (type === 'mois') return comptaMonths().map((m) => ({ key: m, label: monthLabel(m) }));
  const ys = comptaYears();
  if (type === 'annee') return ys.map((y) => ({ key: y, label: 'Année ' + y }));
  if (type === 'semestre') return ys.flatMap((y) => [{ key: y + '-S1', label: '1ᵉʳ semestre ' + y }, { key: y + '-S2', label: '2ᵉ semestre ' + y }]);
  return ys.flatMap((y) => [1, 2, 3, 4].map((q) => ({ key: y + '-T' + q, label: 'Trimestre ' + q + ' ' + y })));
}
function monthsOfRange(type, key) {
  const pad = (n) => String(n).padStart(2, '0');
  if (type === 'mois') return [key];
  const y = key.slice(0, 4);
  if (type === 'annee') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => y + '-' + pad(n));
  if (type === 'semestre') { const base = key.endsWith('S1') ? 1 : 7; return [0, 1, 2, 3, 4, 5].map((i) => y + '-' + pad(base + i)); }
  const q = +key.slice(-1); const base = (q - 1) * 3 + 1; return [0, 1, 2].map((i) => y + '-' + pad(base + i));
}
let declPeriod = null;
function renderComptaDecl() {
  const typeSel = $('declType'), perSel = $('declPeriod'), box = $('comptaDeclBody'); if (!typeSel || !perSel || !box) return;
  const type = typeSel.value || 'mois';
  const opts = comptaPeriodOptions(type);
  typeSel.onchange = () => { declPeriod = null; renderComptaDecl(); };
  perSel.onchange = () => { declPeriod = perSel.value; renderComptaDecl(); };
  if (!opts.length) { perSel.innerHTML = ''; box.innerHTML = ''; if ($('comptaDeclEmpty')) $('comptaDeclEmpty').style.display = 'block'; return; }
  if (!opts.some((o) => o.key === declPeriod)) declPeriod = opts[0].key;
  perSel.innerHTML = opts.map((o) => `<option value="${o.key}"${o.key === declPeriod ? ' selected' : ''}>${o.label}</option>`).join('');
  const withData = comptaMonths();
  const months = monthsOfRange(type, declPeriod).filter((m) => withData.includes(m));
  if ($('comptaDeclEmpty')) $('comptaDeclEmpty').style.display = months.length ? 'none' : 'block';
  const rt = months.reduce((a, m) => { const d = comptaData(m); a.liq += d.liquideTotal.ttc; a.vir += d.virementTotal.ttc; a.fac += d.factureLiqTotal.ttc + d.factureVirTotal.ttc; return a; }, { liq: 0, vir: 0, fac: 0 });
  box.innerHTML = (months.length ? `<p class="banner">Total plage — Liquide <b>${eur(rt.liq)}</b> · Virements <b>${eur(rt.vir)}</b> · Factures pro <b>${eur(rt.fac)}</b> (TTC)</p>` : '')
    + months.sort().reverse().map((m) => `<h2 class="rsub" style="margin-top:16px">${monthLabel(m)}${m < todayStr().slice(0, 7) ? '' : ' (en cours — pas de démarche)'}</h2>` + comptaSectionsHtml(m)).join('');
  comptaWire(box, renderComptaDecl);
}
// Analyse financière PAR CHEVAL avec le DÉTAIL par date (chaque ligne facturée) pour Articles / Matériel / Déplacement.
function chevalFinanceDetail() {
  const map = {}; // clé = clientId|chevalNom
  const get = (cid, nom, cnom) => { const k = cid + '|' + nom; return map[k] || (map[k] = { clientId: cid, nom, client: cnom, art: [], mat: [], dep: [], total: 0 }); };
  allTours().forEach((t) => {
    if (!t.result || !t.result.parClient) return; const date = t.date;
    t.result.parClient.forEach((m) => {
      (m.articles || []).forEach((a) => { const per = (a.chevaux && a.chevaux.length) ? a.ttc / a.chevaux.length : 0; (a.chevaux || []).forEach((n) => { const g = get(m.clientId, n, m.nom); g.art.push({ date, libelle: a.libelle + (a.remisePct ? ' (−' + a.remisePct + '%)' : ''), ttc: per }); g.total += per; }); });
      (m.materiel || []).forEach((x) => { const tags = [x.fourbure ? 'Fourbure' : '', x.npas ? 'NPAS' : '', x.infection ? 'Infection' : ''].filter(Boolean).join('+'); const g = get(m.clientId, x.nom, m.nom); g.mat.push({ date, libelle: 'Matériel' + (tags ? ' (' + tags + ')' : ''), ttc: x.ttc }); g.total += x.ttc; });
      (m.deplacement || []).forEach((l) => { const per = (l.chevaux && l.chevaux.length) ? l.partTTC / l.chevaux.length : 0; (l.chevaux || []).forEach((n) => { const g = get(m.clientId, n, m.nom); g.dep.push({ date, libelle: (l.adresse || 'Déplacement') + ' ' + (TYPES[l.type] || ''), ttc: per }); g.total += per; }); });
    });
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}
// Nombre de mois entre deux dates 'YYYY-MM-DD' (arrondi au mois entamé complet).
function monthsBetween(fromYmd, toYmd) {
  if (!fromYmd) return null;
  const [y1, m1, d1] = fromYmd.split('-').map(Number); const [y2, m2, d2] = (toYmd || todayStr()).split('-').map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1); if (d2 < d1) months -= 1; return Math.max(0, months);
}
// Libellé de durée : « N mois » ; au-delà d'un an « 1 an et N mois ».
function durMonthsLabel(months) {
  if (months == null) return '';
  const y = Math.floor(months / 12), mo = months % 12;
  if (y >= 1) return y + ' an' + (y > 1 ? 's' : '') + (mo ? ' et ' + mo + ' mois' : '');
  return mo + ' mois';
}
// Retrouve l'objet cheval (profil) d'un client par nom, pour lire sa date de prise en charge.
function findChevalObj(clientId, nom) { const c = clients.find((x) => x.id === clientId); return c ? (c.chevaux || []).find((h) => norm(h.nom) === norm(nom)) : null; }
function renderFinanceCheval() {
  const box = $('financeChevalList'); if (!box) return; box.innerHTML = '';
  const fs = chevalFinanceDetail();
  if ($('financeChevalEmpty')) $('financeChevalEmpty').style.display = fs.length ? 'none' : 'block';
  const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');
  fs.forEach((cv) => {
    const el = document.createElement('div'); el.className = 'inv-client';
    const hObj = findChevalObj(cv.clientId, cv.nom); const pec = hObj && hObj.datePriseEnCharge;
    const suivi = pec ? ` · 🗓 suivi depuis le ${fmtDateFr(pec)} (${durMonthsLabel(monthsBetween(pec))})` : '';
    let h = `<div class="inv-head"><span>🐴 ${esc(cv.nom)} <span class="li-sub">— ${esc(cv.client)}${suivi}</span></span><span class="inv-amt">${eur(cv.total)} TTC</span></div>`;
    [['Articles', cv.art], ['Matériel', cv.mat], ['Déplacement', cv.dep]].forEach(([titre, lignes]) => {
      const sum = lignes.reduce((s, l) => s + l.ttc, 0);
      h += `<div class="inv-line"><span><b>${titre}</b></span><span><b>${eur(sum)}</b></span></div>`;
      lignes.slice().sort(byDate).forEach((l) => { h += `<div class="fin-detail"><span>${esc(fmtDateFr(l.date))} · ${esc(l.libelle)}</span><span>${eur(l.ttc)}</span></div>`; });
    });
    el.innerHTML = h; box.appendChild(el);
  });
}
function renderFraisVehicule() {
  const odo = odometer();
  if ($('kmIndicatif')) $('kmIndicatif').innerHTML = `Tarif indicatif tournée : <b>${eurkm(tarifHT('tournee'))} HT</b> · <b>${eurkm(ttc(tarifHT('tournee')))} TVAC</b> (base véhicule + carburant).`;
  if ($('fraisUnitHT')) { makeReadout($('fraisUnitHT'), '€/km HT'); $('fraisUnitHT').value = fmtNum(baseVehiculeHT(), 3); fitSize($('fraisUnitHT')); }
  if ($('fraisUnitTTC')) { makeReadout($('fraisUnitTTC'), '€/km TTC'); $('fraisUnitTTC').value = fmtNum(ttc(baseVehiculeHT()), 3); fitSize($('fraisUnitTTC')); }
  const box = $('fraisList'); if (!box) return; box.innerHTML = '';
  $('fraisEmpty').style.display = S.frais.length ? 'none' : 'block';
  S.frais.forEach((f, i) => {
    const parcouru = odo - (f.kmDebut || 0);
    const jauge = f.nature === 'recurrent'
      ? `récurrent · ${km(Math.max(0, parcouru))} roulés / ${km(f.kmPrevus)} avant échéance`
      : (fraisActif(f) ? `exceptionnel · reste ${km(Math.max(0, f.kmPrevus - parcouru))}` : 'exceptionnel · épuisé ✔');
    const el = document.createElement('div'); el.className = 'edit-row'; el.dataset.idx = i;
    el.innerHTML = `<div class="er-top"><span class="drag-h">⠿</span>
        <input class="grow er-title" data-k="poste" value="${esc(f.poste)}" placeholder="Poste (entretien, assurance…)"/>
        <button class="a-del" data-del title="Supprimer">✕</button></div>
      <div class="er-grid">
        <label>Nature<select data-k="nature"><option value="recurrent">Récurrent</option><option value="exceptionnel">Exceptionnel</option></select></label>
        <label>Montant<input data-k="montantHT" type="number" step="1" min="0" value="${f.montantHT || ''}"/></label>
        <label>Km prévus<input data-k="kmPrevus" type="number" step="1000" min="0" value="${f.kmPrevus || ''}"/></label>
        <label>Contribution<input data-ro="contrib" readonly/></label>
      </div>
      <p class="hint er-jauge">${jauge}</p>`;
    el.querySelector('[data-k="nature"]').value = f.nature;
    const ro = el.querySelector('[data-ro="contrib"]');
    const montEl = el.querySelector('[data-k="montantHT"]'), kmEl = el.querySelector('[data-k="kmPrevus"]');
    addUnit(montEl, '€ HT'); addUnit(kmEl, 'km'); makeReadout(ro, '€/km');
    wireNum(montEl, { get: () => f.montantHT, dec: 0, set: (v) => { f.montantHT = v; ro.value = fmtNum(fraisContribHT(f), 3); fitSize(ro); }, after: () => saveSettings() });
    wireNum(kmEl, { get: () => f.kmPrevus, dec: 0, set: (v) => { f.kmPrevus = v; ro.value = fmtNum(fraisContribHT(f), 3); fitSize(ro); }, after: () => saveSettings() });
    ro.value = fmtNum(fraisContribHT(f), 3); fitSize(ro);
    el.querySelector('[data-k="poste"]').addEventListener('input', (e) => { f.poste = e.target.value; saveSettings(); });
    el.querySelector('[data-k="nature"]').addEventListener('change', (e) => { f.nature = e.target.value; if (f.nature === 'exceptionnel' && !f.kmDebut) f.kmDebut = odometer(); saveSettings(); renderFraisVehicule(); });
    el.querySelector('[data-del]').addEventListener('click', () => { if (!confirm('Supprimer ce frais véhicule ?')) return; S.frais = S.frais.filter((x) => x.id !== f.id); saveSettings(); renderFraisVehicule(); });
    box.appendChild(el);
  });
  enableRowDrag(box, S.frais, () => saveSettings());
}
// Page Articles = catalogue + forfaits pathologie + tableau des tarifs
function renderArticlesPage() {
  refreshTarifTable();
  updateReadouts();
  renderArticlesCat();
}
function modalFrais(existing) {
  const w = existing ? Object.assign({}, existing) : { id: uid(), poste: '', nature: 'recurrent', montantHT: 0, kmPrevus: 0, kmDebut: odometer() };
  openModal(`<div class="modal-head"><b>${existing ? 'Éditer' : 'Nouveau'} frais véhicule</b><button class="x" id="mX">✕</button></div>
    <label>Poste<input type="text" id="fPoste" value="${esc(w.poste)}" placeholder="Entretien annuel, assurance, réparation…" /></label>
    <label>Nature<select id="fNature">
      <option value="recurrent">Récurrent (facture annuelle : entretien, assurance…)</option>
      <option value="exceptionnel">Exceptionnel (réparation ponctuelle…)</option>
    </select></label>
    <div class="row"><label class="grow">Montant HT (€)<input type="number" id="fMontant" step="1" min="0" value="${w.montantHT || ''}" /></label><label class="grow">Km prévus<input type="number" id="fKm" step="1000" min="0" value="${w.kmPrevus || ''}" /></label></div>
    <p class="hint" id="fBreak"></p>
    ${existing ? '<button class="btn small danger" id="fDel">Supprimer ce frais</button>' : ''}
    <div class="actions"><button class="btn primary block" id="fOk">Enregistrer</button></div>`);
  $('fNature').value = w.nature;
  const upd = () => { const m = parseFloat($('fMontant').value) || 0, k = parseFloat($('fKm').value) || 0; $('fBreak').innerHTML = k > 0 ? `Contribution = ${eur(m)} ÷ ${km(k)} = <b>${eurkm(m / k)}/km</b>` : ''; };
  upd(); $('fMontant').addEventListener('input', upd); $('fKm').addEventListener('input', upd);
  $('mX').addEventListener('click', closeModal);
  if (existing) $('fDel').addEventListener('click', () => { if (!confirm('Supprimer ce frais véhicule ?')) return; S.frais = S.frais.filter((x) => x.id !== w.id); saveSettings(); closeModal(); renderFraisVehicule(); });
  $('fOk').addEventListener('click', () => {
    w.poste = $('fPoste').value.trim() || 'Frais'; w.nature = $('fNature').value;
    w.montantHT = parseFloat($('fMontant').value) || 0; w.kmPrevus = parseFloat($('fKm').value) || 0;
    const i = S.frais.findIndex((x) => x.id === w.id); if (i >= 0) S.frais[i] = w; else S.frais.push(w);
    saveSettings(); closeModal(); renderFraisVehicule();
  });
}

// ================= GESTION → MATÉRIEL =================
function renderMateriel() {
  if ($('matUnitHT')) { makeReadout($('matUnitHT'), '€/cheval HT'); $('matUnitHT').value = fmtNum(baseMateriel(), 2); fitSize($('matUnitHT')); }
  if ($('matUnitTTC')) { makeReadout($('matUnitTTC'), '€/cheval TTC'); $('matUnitTTC').value = fmtNum(ttc(baseMateriel()), 2); fitSize($('matUnitTTC')); }
  const box = $('materielList'); if (!box) return; box.innerHTML = '';
  $('materielEmpty').style.display = S.materiel.length ? 'none' : 'block';
  S.materiel.forEach((m, i) => {
    const el = document.createElement('div'); el.className = 'edit-row'; el.dataset.idx = i;
    el.innerHTML = `<div class="er-top"><span class="drag-h">⠿</span>
        <input class="grow er-title" data-k="libelle" value="${esc(m.libelle)}" placeholder="Râpe, gants, renette…"/>
        <button class="a-del" data-del title="Supprimer">✕</button></div>
      <div class="er-grid">
        <label>Prix d'achat<input data-k="montantHT" type="number" step="0.01" min="0" value="${m.montantHT || ''}"/></label>
        <label>Nb de chevaux<input data-k="nbChevaux" type="number" step="1" min="1" value="${m.nbChevaux || 1}"/></label>
        <label>Prix unitaire<input data-ro="unit" readonly/></label>
      </div>`;
    const ro = el.querySelector('[data-ro="unit"]');
    const montEl = el.querySelector('[data-k="montantHT"]'), nbEl = el.querySelector('[data-k="nbChevaux"]');
    addUnit(montEl, '€ HT'); addUnit(nbEl, 'chevaux'); makeReadout(ro, '€/cheval');
    const paintRo = () => { ro.value = fmtNum((m.montantHT || 0) / Math.max(1, m.nbChevaux || 1), 2); fitSize(ro); if ($('matUnitHT')) { $('matUnitHT').value = fmtNum(baseMateriel(), 2); fitSize($('matUnitHT')); } if ($('matUnitTTC')) { $('matUnitTTC').value = fmtNum(ttc(baseMateriel()), 2); fitSize($('matUnitTTC')); } };
    wireNum(montEl, { get: () => m.montantHT, dec: 2, set: (v) => { m.montantHT = v; paintRo(); }, after: () => saveSettings() });
    wireNum(nbEl, { get: () => m.nbChevaux, dec: 0, set: (v) => { m.nbChevaux = Math.max(1, v); paintRo(); }, after: () => saveSettings() });
    paintRo();
    el.querySelector('[data-k="libelle"]').addEventListener('input', (e) => { m.libelle = e.target.value; saveSettings(); });
    el.querySelector('[data-del]').addEventListener('click', () => { if (!confirm('Supprimer ce matériel ?')) return; S.materiel = S.materiel.filter((x) => x.id !== m.id); saveSettings(); renderMateriel(); });
    box.appendChild(el);
  });
  enableRowDrag(box, S.materiel, () => saveSettings());
}
function modalMateriel(existing) {
  const w = existing ? Object.assign({}, existing) : { id: uid(), libelle: '', montantHT: 0, nbChevaux: 1 };
  openModal(`<div class="modal-head"><b>${existing ? 'Éditer' : 'Nouveau'} matériel</b><button class="x" id="mX">✕</button></div>
    <label>Libellé<input type="text" id="mLib" value="${esc(w.libelle)}" placeholder="Râpe, gants, renette…" /></label>
    <div class="row"><label class="grow">Prix d'achat HT (€)<input type="number" id="mMont" step="0.01" min="0" value="${w.montantHT || ''}" /></label><label class="grow">Nb de chevaux<input type="number" id="mNb" step="1" min="1" value="${w.nbChevaux || 1}" /></label></div>
    <p class="hint" id="mHint"></p>
    ${existing ? '<button class="btn small danger" id="mDel">Supprimer</button>' : ''}
    <div class="actions"><button class="btn primary block" id="mOk">Enregistrer</button></div>`);
  const upd = () => { const p = parseFloat($('mMont').value) || 0, n = Math.max(1, parseFloat($('mNb').value) || 1); $('mHint').innerHTML = `Prix unitaire = ${eur(p)} ÷ ${n} = <b>${eur(p / n)}/cheval</b>`; };
  upd(); $('mMont').addEventListener('input', upd); $('mNb').addEventListener('input', upd);
  $('mX').addEventListener('click', closeModal);
  if (existing) $('mDel').addEventListener('click', () => { if (!confirm('Supprimer ce matériel ?')) return; S.materiel = S.materiel.filter((x) => x.id !== w.id); saveSettings(); closeModal(); renderMateriel(); });
  $('mOk').addEventListener('click', () => { w.libelle = $('mLib').value.trim() || 'Matériel'; w.montantHT = parseFloat($('mMont').value) || 0; w.nbChevaux = Math.max(1, parseFloat($('mNb').value) || 1); const i = S.materiel.findIndex((x) => x.id === w.id); if (i >= 0) S.materiel[i] = w; else S.materiel.push(w); saveSettings(); closeModal(); renderMateriel(); });
}

// ================= GESTION → ARTICLES (catalogue) =================
function renderArticlesCat() {
  const box = $('articlesCatList'); if (!box) return; box.innerHTML = '';
  $('articlesCatEmpty').style.display = S.articlesCatalogue.length ? 'none' : 'block';
  const tvaOpts = tvaRatesPays().map((r) => `<option value="${r}">${r}%</option>`).join('');
  S.articlesCatalogue.forEach((a, i) => {
    const el = document.createElement('div'); el.className = 'edit-row'; el.dataset.idx = i;
    el.innerHTML = `<div class="er-top"><span class="drag-h">⠿</span>
        <input class="grow er-title" data-k="libelle" value="${esc(a.libelle)}" placeholder="Intitulé de l'article"/>
        <button class="a-del" data-del title="Supprimer">✕</button></div>
      <div class="er-grid er-grid-3">
        <label>TVA<select data-k="tvaPct">${tvaOpts}</select></label>
        <label>Prix<input data-k="prixHT" type="number" step="0.01" min="0" value="${a.prixHT || ''}"/></label>
        <label>Prix<input data-ro="ttc" readonly/></label>
      </div>`;
    el.querySelector('[data-k="tvaPct"]').value = String(a.tvaPct);
    const ro = el.querySelector('[data-ro="ttc"]'), prixEl = el.querySelector('[data-k="prixHT"]');
    addUnit(prixEl, '€ HT'); makeReadout(ro, '€ TTC');
    const paintRo = () => { ro.value = fmtNum((a.prixHT || 0) * (1 + (a.tvaPct || 0) / 100), 2); fitSize(ro); };
    wireNum(prixEl, { get: () => a.prixHT, dec: 2, set: (v) => { a.prixHT = v; paintRo(); }, after: () => saveSettings() });
    paintRo();
    el.querySelector('[data-k="libelle"]').addEventListener('input', (e) => { a.libelle = e.target.value; saveSettings(); });
    el.querySelector('[data-k="tvaPct"]').addEventListener('change', (e) => { a.tvaPct = parseFloat(e.target.value) || 0; paintRo(); saveSettings(); });
    el.querySelector('[data-del]').addEventListener('click', () => { if (!confirm('Supprimer cet article du catalogue ?')) return; S.articlesCatalogue = S.articlesCatalogue.filter((x) => x.id !== a.id); saveSettings(); renderArticlesCat(); });
    box.appendChild(el);
  });
  enableRowDrag(box, S.articlesCatalogue, () => saveSettings());
}
function modalArticleCat(existing) {
  const w = existing ? Object.assign({}, existing) : { id: uid(), libelle: '', prixHT: 0, tvaPct: (PAYS_TVA[S.pays] || PAYS_TVA.be).std };
  const opts = tvaRatesPays().map((r) => `<option value="${r}">${r}%</option>`).join('');
  openModal(`<div class="modal-head"><b>${existing ? 'Éditer' : 'Nouvel'} article</b><button class="x" id="mX">✕</button></div>
    <label>Intitulé<input type="text" id="aLib" value="${esc(w.libelle)}" /></label>
    <div class="row"><label class="grow">TVA<select id="aTva">${opts}</select></label><label class="grow">Prix<input type="number" id="aPrix" step="0.01" min="0" value="${w.prixHT || ''}" /></label></div>
    ${existing ? '<button class="btn small danger" id="aDel">Supprimer</button>' : ''}
    <div class="actions"><button class="btn primary block" id="aOk">Enregistrer</button></div>`);
  $('aTva').value = String(w.tvaPct); $('mX').addEventListener('click', closeModal); mUnit('aPrix', '€ HT', 2);
  if (existing) $('aDel').addEventListener('click', () => { if (!confirm('Supprimer cet article du catalogue ?')) return; S.articlesCatalogue = S.articlesCatalogue.filter((x) => x.id !== w.id); saveSettings(); closeModal(); renderArticlesCat(); });
  $('aOk').addEventListener('click', () => { w.libelle = $('aLib').value.trim() || 'Article'; w.prixHT = parseNum($('aPrix').value); w.tvaPct = parseFloat($('aTva').value) || 0; const i = S.articlesCatalogue.findIndex((x) => x.id === w.id); if (i >= 0) S.articlesCatalogue[i] = w; else S.articlesCatalogue.push(w); saveSettings(); closeModal(); renderArticlesCat(); });
}

// ----- Articles d'une tournée -----
function tourClientChevaux(clientId) {
  const seen = {}, out = [];
  (currentTour.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => { if (cl.clientId === clientId) cl.chevaux.forEach((c) => { const k = c.id || c.nom; if (!seen[k]) { seen[k] = 1; out.push({ id: c.id, nom: c.nom }); } }); }));
  return out;
}
// Chevaux d'un client PRÉSENTS à cet arrêt (article couplé à l'arrêt).
function arretClientChevaux(arret, clientId) {
  const cl = (arret.clients || []).find((x) => x.clientId === clientId);
  return cl ? (cl.chevaux || []).map((c) => ({ id: c.id, nom: c.nom })) : [];
}
// Articles rattachés à un arrêt (par le client + au moins un cheval présent à l'arrêt).
function articlesForArret(arret) {
  return (currentTour.articles || []).filter((art) => {
    const cl = (arret.clients || []).find((x) => x.clientId === art.clientId);
    if (!cl) return false;
    if (art.impaye) { const first = (currentTour.arrets || []).find((a2) => (a2.clients || []).some((x) => x.clientId === art.clientId)); return first === arret; } // impayé : sous le 1ᵉʳ arrêt du client
    const ids = new Set((cl.chevaux || []).map((c) => c.id || c.nom));
    const noms = new Set((cl.chevaux || []).map((c) => norm(c.nom)));
    return (art.chevalIds || []).some((id) => ids.has(id)) || (art.chevalNoms || []).some((n) => noms.has(norm(n)));
  });
}
// Modale article (ouverte depuis un arrêt) : « article connu » (catalogue) ou « nouvel article ».
// opts = { arret, clientId }. Si clientId fourni (ou 1 seul client à l'arrêt), le client est verrouillé (couplé à l'arrêt).
function modalTourArticle(existing, opts) {
  opts = opts || {};
  const arret = opts.arret || null;
  const tourClients = [...new Set((currentTour.arrets || []).flatMap((a) => a.clients.map((c) => c.clientId)))];
  const pool = tourClients.length ? tourClients : clients.map((c) => c.id);
  if (!pool.length) { alert('Ajoutez d\'abord un arrêt (client) à la tournée.'); return; }
  let selClient = opts.clientId || (existing && existing.clientId) || (arret && arret.clients[0] && arret.clients[0].clientId) || pool[0];
  if (!pool.includes(selClient)) selClient = pool[0];
  const lockClient = !!opts.clientId || !!existing || (arret && arret.clients.length === 1);
  const idsFor = (cid) => arret ? arretClientChevaux(arret, cid) : tourClientChevaux(cid);
  const catOpts = ['<option value="">— choisir —</option>'].concat(S.articlesCatalogue.map((a) => `<option value="${a.id}">${esc(a.libelle)} (${eur(a.prixHT)})</option>`)).join('');
  const tvaOpts = tvaRatesPays().map((r) => `<option value="${r}">${r}%</option>`).join('');
  const w = existing ? Object.assign({}, existing) : { id: uid(), clientId: selClient, chevalNoms: [], libelle: '', prixHT: 0, tvaPct: (PAYS_TVA[S.pays] || PAYS_TVA.be).std };
  let mode = existing ? 'nouveau' : (S.articlesCatalogue.length ? 'catalogue' : 'nouveau');
  openModal(`<div class="modal-head"><b>${existing ? 'Éditer' : 'Nouvel'} article</b><button class="x" id="mX">✕</button></div>
    ${lockClient ? '<p class="hint" id="aClientSel"></p>' : '<label>Client (dans la tournée)</label><div id="aClientPicker"></div><p class="hint" id="aClientSel"></p>'}
    <label>Chevaux concernés (quantité = nb cochés)</label><div id="aChevaux"></div>
    <div class="seg" id="aMode">
      <button type="button" class="seg-btn" data-mode="catalogue">Article connu</button>
      <button type="button" class="seg-btn" data-mode="nouveau">Nouvel article</button>
    </div>
    <div id="aCatWrap"><label>Choisir dans le catalogue<select id="aCat">${catOpts}</select></label></div>
    <div id="aNewWrap">
      <label>Intitulé<input type="text" id="aLib" value="${esc(w.libelle)}" /></label>
      <div class="row"><label class="grow">TVA<select id="aTva">${tvaOpts}</select></label><label class="grow">Prix<input type="number" id="aPrix" step="0.01" min="0" value="${w.prixHT || ''}" /></label></div>
      <label class="chk"><input type="checkbox" id="aSaveCat" checked/> Ajouter au catalogue réutilisable</label>
    </div>
    <p class="hint" id="aBreak"></p>
    <div class="actions"><button class="btn primary block" id="aOk">Enregistrer</button></div>`);
  $('aTva').value = String(w.tvaPct); mUnit('aPrix', '€ HT', 2);
  const setSel = (id) => { selClient = id; const c = clients.find((x) => x.id === id); if ($('aClientSel')) $('aClientSel').innerHTML = c ? 'Client : <b>' + esc(fullName(c)) + (c.societe ? ' — ' + esc(c.societe) : '') + '</b>' + (arret ? ' · arrêt : ' + esc(addrStr(arret.addr)) : '') : ''; };
  const picked = new Set(w.chevalIds || (w.chevalNoms || []).map((n) => { const c = idsFor(selClient).find((x) => x.nom === n); return c ? c.id : n; }));
  const upd = () => { const qte = Math.max(1, picked.size || 1), p = parseNum($('aPrix').value), rr = (parseFloat($('aTva').value) || 0) / 100; $('aBreak').innerHTML = `Quantité ${qte} · HT ${eur(p * qte)} · TVA ${eur(p * qte * rr)} · <b>TTC ${eur(p * qte * (1 + rr))}</b>`; };
  const renderCh = () => {
    const box = $('aChevaux'); box.innerHTML = ''; const chs = idsFor(selClient);
    if (!chs.length) { box.innerHTML = '<p class="hint" style="color:var(--danger)">Ce client n\'a pas de cheval à cet arrêt — un article doit être lié à au moins un cheval.</p>'; return; }
    chs.forEach((c) => { const row = document.createElement('label'); row.className = 'chk'; row.innerHTML = `<input type="checkbox" ${picked.has(c.id) ? 'checked' : ''}/> 🐴 ${esc(c.nom)}`; row.querySelector('input').addEventListener('change', (e) => { e.target.checked ? picked.add(c.id) : picked.delete(c.id); upd(); }); box.appendChild(row); });
  };
  const applyMode = (m) => {
    mode = m;
    document.querySelectorAll('#aMode .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('aCatWrap').style.display = m === 'catalogue' ? '' : 'none';
    $('aNewWrap').style.display = m === 'nouveau' ? '' : 'none';
  };
  setSel(selClient);
  if (!lockClient) { const poolClients = pool.map((id) => clients.find((c) => c.id === id)).filter(Boolean); const pk = mountClientPicker($('aClientPicker'), { list: poolClients, getSelected: () => selClient, onPick: (c) => { setSel(c.id); picked.clear(); renderCh(); upd(); pk.render(); } }); }
  renderCh(); upd(); applyMode(mode);
  document.querySelectorAll('#aMode .seg-btn').forEach((b) => b.addEventListener('click', () => applyMode(b.dataset.mode)));
  $('aPrix').addEventListener('input', upd); $('aTva').addEventListener('change', upd);
  $('aCat').addEventListener('change', (e) => { const c = S.articlesCatalogue.find((x) => x.id === e.target.value); if (c) { $('aLib').value = c.libelle; $('aPrix').value = fmtNum(c.prixHT, 2); $('aTva').value = String(c.tvaPct); upd(); } });
  $('mX').addEventListener('click', closeModal);
  $('aOk').addEventListener('click', () => {
    if (!selClient) { alert('Choisissez un client.'); return; }
    if (!picked.size) { alert('Sélectionnez au moins un cheval pour cet article.'); return; }
    if (mode === 'catalogue' && !$('aCat').value) { alert('Choisissez un article dans le catalogue, ou passez en « Nouvel article ».'); return; }
    const cid = selClient; const chs = idsFor(cid).filter((c) => picked.has(c.id));
    const art = { id: w.id || uid(), clientId: cid, chevalIds: chs.map((c) => c.id), chevalNoms: chs.map((c) => c.nom), libelle: $('aLib').value.trim() || 'Article', prixHT: parseNum($('aPrix').value), tvaPct: parseFloat($('aTva').value) || 0 };
    if (!currentTour.articles) currentTour.articles = [];
    const i = currentTour.articles.findIndex((x) => x.id === art.id); if (i >= 0) currentTour.articles[i] = art; else currentTour.articles.push(art);
    // Ajout au catalogue seulement en mode « nouvel article » (case cochée) et si le libellé n'y est pas déjà.
    if (mode === 'nouveau' && $('aSaveCat') && $('aSaveCat').checked && !S.articlesCatalogue.some((x) => norm(x.libelle) === norm(art.libelle))) { S.articlesCatalogue.push({ id: uid(), libelle: art.libelle, prixHT: art.prixHT, tvaPct: art.tvaPct }); saveSettings(); }
    saveTournees(); closeModal(); renderEditorArrets(); recomputeMoney();
  });
}

// ================= SMS (modèle) =================
const SMS_FIELDS = [
  { k: '{prenom}', label: 'Prénom' },
  { k: '{nom}', label: 'Nom' },
  { k: '{client}', label: 'Client (prénom nom)' },
  { k: '{societe}', label: 'Société' },
  { k: '{cheval}', label: 'Cheval(aux)' },
  { k: '{trajet}', label: 'Temps de trajet' },
  { k: '{adresse}', label: 'Adresse' },
];
// Remplace {champ} par les valeurs fournies (laisse le jeton tel quel si absent).
function fillSms(tpl, data) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (data[k] != null && data[k] !== '' ? data[k] : m)); }
function insertAtCursor(ta, text) {
  const s = ta.selectionStart != null ? ta.selectionStart : ta.value.length, e = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length; ta.focus();
  S.smsTemplate = ta.value; saveSettings(); updateSmsPreview();
}
function updateSmsPreview() {
  const p = $('smsPreview'); if (!p) return;
  const sample = fillSms(S.smsTemplate, { prenom: 'Jean', nom: 'Dupont', client: 'Jean Dupont', societe: 'Écurie du Nord', cheval: 'Indianna', trajet: '15 min', adresse: 'Rue de l\'Exemple 1, 5000 Namur' });
  p.innerHTML = '<b>Aperçu :</b> ' + esc(sample);
}
function renderSMS() {
  const ta = $('smsTemplate'); if (!ta) return;
  ta.value = S.smsTemplate || '';
  ta.oninput = () => { S.smsTemplate = ta.value; saveSettings(); updateSmsPreview(); };
  const box = $('smsFields'); if (box) { box.innerHTML = ''; SMS_FIELDS.forEach((f) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = '+ ' + f.label; b.addEventListener('click', () => insertAtCursor(ta, f.k)); box.appendChild(b); }); }
  updateSmsPreview();
}

// ================= ACCUEIL =================
// Temps de trajet cumulé (min, depuis le départ) jusqu'à chaque arrêt d'une tournée calculée.
function legMinutesFor(t) {
  const R = t.result; const out = [];
  const mpk = (R && R.totalKm > 0 && R.totalMin) ? (R.totalMin / R.totalKm) : (60 / (S.vitesseKmh || 90));
  let cum = 0;
  (t.arrets || []).forEach((a, i) => { const seg = (R && R.rows && R.rows[i]) ? (R.rows[i].segKm || 0) : 0; cum += seg * mpk; out.push(R && R.rows ? cum : null); });
  return out;
}
// Heure locale HH:MM et durée « X h Y min » (temps de travail).
const hm = (ts) => ts ? new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
// Durée à partir de MINUTES : < 1h → « 45 min » ; ≥ 1h → « 1h30 » / « 2h ». Format unique partout.
function durMin(min) { if (min == null || isNaN(min) || min < 0) return '—'; min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; if (!h) return m + ' min'; return m ? `${h}h${m < 10 ? '0' + m : m}` : `${h}h`; }
function durHm(ms) { return (ms == null || ms < 0) ? '—' : durMin(ms / 60000); }
function renderHomeTrajet() {
  const box = $('homeTrajet'); if (!box) return; box.innerHTML = '';
  const todays = [...tournees].filter((t) => statusOf(t) === 'active').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  // Agenda privé du jour (événements perso récupérés du calendrier) — en tête du Trajet du jour.
  const priv = privateEventsForDay(todayStr());
  if (priv.length) {
    const sec = document.createElement('div'); sec.className = 'card'; sec.style.marginBottom = '10px';
    sec.innerHTML = '<div class="a-art-head"><span>📅 Agenda privé du jour</span></div>';
    const list = document.createElement('div'); list.className = 'list';
    priv.forEach((p) => {
      const heure = eventHeure(p);
      const row = document.createElement('div'); row.className = 'list-item';
      row.innerHTML = `<div class="li-main"><b>${heure ? '🕘 ' + heure + ' · ' : ''}${esc(p.title)}</b>${p.location ? '<span class="li-sub">📍 ' + esc(p.location) + '</span>' : ''}</div><div class="li-act"><button class="btn small" data-rm>Retirer</button></div>`;
      row.querySelector('[data-rm]').addEventListener('click', () => { delete S.agendaPrive[p.id]; saveSettings(); renderHomeTrajet(); });
      list.appendChild(row);
    });
    sec.appendChild(list); box.appendChild(sec);
  }
  $('homeTrajetEmpty').style.display = (todays.length || priv.length) ? 'none' : 'block';
  todays.forEach((t) => {
    // 1ʳᵉ ligne : la tournée du jour elle-même (cliquable → ouvre l'éditeur).
    box.appendChild(tourListItem(t, false));
    const persistTour = () => { const idx = tournees.findIndex((x) => x.id === t.id); if (idx >= 0) tournees[idx] = t; saveTournees(); };
    // Barre de suivi du temps de travail : Démarrer → (valider chaque arrêt) → Terminer.
    const ctrl = document.createElement('div'); ctrl.className = 'tour-timer';
    if (!t.startedAt) ctrl.innerHTML = '<button class="btn small primary" data-start>▶ Démarrer la tournée</button>';
    else if (!t.endedAt) ctrl.innerHTML = `<span class="tt-info">⏱ Démarrée à ${hm(t.startedAt)}</span><span class="li-sub">Validez chaque arrêt, puis « Clôturer » au retour.</span>`;
    else ctrl.innerHTML = `<span class="tt-info">✅ ${hm(t.startedAt)} → ${hm(t.endedAt)} · ${durHm(t.endedAt - t.startedAt)}</span>`;
    box.appendChild(ctrl);
    const sb = ctrl.querySelector('[data-start]'); if (sb) sb.addEventListener('click', () => { t.startedAt = Date.now(); persistTour(); renderHomeTrajet(); });
    const mins = legMinutesFor(t);
    (t.arrets || []).forEach((a, i) => {
      const adresse = addrStr(a.addr);
      const chNames = (a.clients || []).flatMap((cl) => (cl.chevaux || []).map((c) => c.nom)).filter(Boolean).join(', ');
      const chNamesH = (a.clients || []).flatMap((cl) => (cl.chevaux || []).map((c) => c.nom + (c.heure ? ' 🕘' + c.heure : ''))).filter(Boolean).join(', '); // avec l'heure de RDV
      const cl0 = (a.clients || [])[0] || {}; const c0 = clients.find((x) => x.id === cl0.clientId) || {};
      const est = mins[i] != null ? Math.round(mins[i]) : null;                       // temps estimé (précalculé)
      const real = (typeof a.realMin === 'number') ? a.realMin : null;                 // temps réel encodé (bouton Route)
      const trajet = real != null ? durMin(real) : (est != null ? durMin(est) : '—'); // SMS : réel si encodé, sinon estimé
      const trajetLbl = (est != null ? durMin(est) + ' est.' : '—') + (real != null ? ' · <b>' + durMin(real) + ' réel</b>' : '');
      const el = document.createElement('div'); el.className = 'list-item';
      // Nom du client d'abord, adresse en dessous.
      // Bouton « Valider » (marque la fin de visite / départ) — visible seulement après « Démarrer ».
      const validBtn = t.startedAt ? (typeof a.validatedAt === 'number' ? ` <button class="btn small" data-valid title="Re-valider">✓ ${hm(a.validatedAt)}</button>` : ' <button class="btn small primary" data-valid>Valider</button>') : '';
      const validLbl = (typeof a.validatedAt === 'number') ? ' · ✅ ' + hm(a.validatedAt) : '';
      el.innerHTML = `<div class="li-main"><b>${i + 1}. ${esc(labelFor(a)) || '<i>client ?</i>'}</b><span class="li-sub">📍 ${esc(adresse) || '<i>adresse ?</i>'}${chNamesH ? ' · 🐴 ' + esc(chNamesH) : ''} · 🕒 ${trajetLbl}${validLbl}</span></div>
        <div class="li-act"><button class="btn small" data-waze>${navLabel()}</button> <button class="btn small" data-route>Route</button>${validBtn} <button class="btn small" data-sms>SMS</button> <button class="btn small" data-ticket>Ticket</button></div>`;
      el.querySelector('[data-waze]').addEventListener('click', () => openNav(a.addr));
      el.querySelector('[data-route]').addEventListener('click', () => modalRouteTime(t, a, est));
      const vb = el.querySelector('[data-valid]'); if (vb) vb.addEventListener('click', () => { a.validatedAt = Date.now(); persistTour(); renderHomeTrajet(); modalPayment(t, a, renderHomeTrajet); });
      el.querySelector('[data-sms]').addEventListener('click', async () => {
        const msg = fillSms(S.smsTemplate, { prenom: c0.prenom || '', nom: c0.nom || '', client: fullName(c0), societe: c0.societe || '', cheval: chNames, trajet, adresse });
        const btn = el.querySelector('[data-sms]');
        try { await navigator.clipboard.writeText(msg); btn.textContent = 'Copié ✔'; setTimeout(() => { btn.textContent = 'SMS'; }, 1500); }
        catch { alert(msg); }
      });
      // Ticket = temps trajet (estimé + réel) + récap de la tournée + détail complet de la facture de CE client.
      el.querySelector('[data-ticket]').addEventListener('click', async () => {
        const btn = el.querySelector('[data-ticket]');
        const m = (t.result && t.result.parClient) ? t.result.parClient.find((x) => x.clientId === cl0.clientId) : null;
        let txt = `Trajet vers ${adresse}\n  Estimé : ${est != null ? durMin(est) : '—'} · Réel : ${real != null ? durMin(real) : 'non renseigné'}\n\n`;
        txt += recapText(t.result, t);
        txt += '\n\n————— DÉTAIL CLIENT —————\n' + (m ? invoiceTextForClient(m, (t.payments || {})[cl0.clientId]) : '(Détail indisponible — ouvrez la tournée et laissez-la se calculer.)');
        try { await navigator.clipboard.writeText(txt); btn.textContent = 'Copié ✔'; setTimeout(() => { btn.textContent = 'Ticket'; }, 1500); }
        catch { alert(txt); }
      });
      box.appendChild(el);
    });
    // ----- Retour → domicile/arrivée : Waze + Route (temps réel) + Clôturer (après « Démarrer ») -----
    if (t.startedAt) {
      const retAddr = returnAddrOf(t);
      const R = t.result; const mpk = (R && R.totalKm > 0 && R.totalMin) ? (R.totalMin / R.totalKm) : (60 / (S.vitesseKmh || 90));
      const estRet = (R && R.kmLastHome != null) ? Math.round(R.kmLastHome * mpk) : null;
      const realRet = (typeof t.returnRealMin === 'number') ? t.returnRealMin : null;
      const retLbl = (estRet != null ? durMin(estRet) + ' est.' : '—') + (realRet != null ? ' · <b>' + durMin(realRet) + ' réel</b>' : '') + (t.endedAt ? ' · ✅ ' + hm(t.endedAt) : '');
      const rr = document.createElement('div'); rr.className = 'list-item';
      rr.innerHTML = `<div class="li-main"><b>🏁 Retour</b><span class="li-sub">📍 ${esc(addrStr(retAddr)) || 'domicile'} · 🕒 ${retLbl}</span></div>
        <div class="li-act"><button class="btn small" data-waze>${navLabel()}</button> <button class="btn small" data-route>Route</button>${t.endedAt ? '' : ' <button class="btn small primary" data-close>Clôturer</button>'}</div>`;
      rr.querySelector('[data-waze]').addEventListener('click', () => openNav(retAddr));
      rr.querySelector('[data-route]').addEventListener('click', () => modalReturnTime(t, estRet, renderHomeTrajet));
      const cb = rr.querySelector('[data-close]'); if (cb) cb.addEventListener('click', () => { const blk = tourCloseBlock(t); if (blk.length) { alert('🔒 Clôture bloquée — paiement à renseigner :\n\n• ' + blk.join('\n• ') + '\n\nOuvrez la tournée, puis 💶 Paiement sur l\'arrêt concerné.'); return; } if (!confirm('Clôturer la tournée ? Elle sera figée (non modifiable).')) return; t.endedAt = Date.now(); t.closed = true; persistTour(); renderHome(); });
      box.appendChild(rr);
    }
  });
}
// Encodage du temps de trajet RÉEL d'un arrêt (relevé sur Waze) — repris dans SMS / récap / ticket / stats.
// `tour` peut être l'objet stocké (Trajet du jour) ou un clone en édition (éditeur) → on réécrit dans `tournees` par id.
function modalRouteTime(tour, arret, estMin, after) {
  const cur = (typeof arret.realMin === 'number') ? arret.realMin : '';
  const persist = () => { const i = tournees.findIndex((t) => t.id === tour.id); if (i >= 0) tournees[i] = tour; else tournees.push(tour); saveTournees(); };
  openModal(`<div class="modal-head"><b>⏱ Temps de trajet réel</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Estimé (précalculé) : <b>${estMin != null ? durMin(estMin) : '—'}</b>. Encodez le temps réel relevé sur Waze pour <b>${esc(labelFor(arret))}</b> — il sera repris automatiquement dans le SMS, le récap, le ticket et les stats (l'estimé reste conservé).</p>
    <label>Temps réel (en minutes)<input type="number" id="rtMin" step="1" min="0" inputmode="numeric" value="${cur}" /></label>
    <p class="hint" id="rtConv"></p>
    <div class="actions two"><button class="btn" id="rtClear">Effacer</button><button class="btn primary" id="rtOk">Enregistrer</button></div>`);
  $('mX').addEventListener('click', closeModal);
  const rtConv = () => { const v = parseInt($('rtMin').value, 10); $('rtConv').innerHTML = (!isNaN(v) && v >= 0) ? '= <b>' + durMin(v) + '</b>' : ''; };
  $('rtMin').addEventListener('input', rtConv); rtConv();
  $('rtOk').addEventListener('click', () => { const v = parseInt($('rtMin').value, 10); if (isNaN(v) || v < 0) delete arret.realMin; else arret.realMin = v; persist(); closeModal(); (after || renderHomeTrajet)(); });
  $('rtClear').addEventListener('click', () => { delete arret.realMin; persist(); closeModal(); (after || renderHomeTrajet)(); });
}
// Adresse de retour d'une tournée : arrivée propre si définie, sinon départ propre, sinon domicile.
function returnAddrOf(t) {
  if (t.arrivee && addrStr(t.arrivee).trim()) return toAddr(t.arrivee);
  if (t.home && addrStr(t.home).trim()) return toAddr(t.home);
  return S.home;
}
// Encodage du temps de trajet RÉEL du retour (dernier arrêt → domicile/arrivée).
function modalReturnTime(t, estMin, after) {
  const cur = (typeof t.returnRealMin === 'number') ? t.returnRealMin : '';
  const persist = () => { const i = tournees.findIndex((x) => x.id === t.id); if (i >= 0) tournees[i] = t; saveTournees(); };
  openModal(`<div class="modal-head"><b>⏱ Temps de trajet retour</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Estimé : <b>${estMin != null ? durMin(estMin) : '—'}</b>. Encodez le temps réel du retour vers <b>${esc(addrStr(returnAddrOf(t))) || 'le domicile'}</b> (relevé sur Waze). Repris dans le temps de travail.</p>
    <label>Temps réel du retour (en minutes)<input type="number" id="rtMin" step="1" min="0" inputmode="numeric" value="${cur}" /></label>
    <p class="hint" id="rtConv"></p>
    <div class="actions two"><button class="btn" id="rtClear">Effacer</button><button class="btn primary" id="rtOk">Enregistrer</button></div>`);
  $('mX').addEventListener('click', closeModal);
  const rtConv = () => { const v = parseInt($('rtMin').value, 10); $('rtConv').innerHTML = (!isNaN(v) && v >= 0) ? '= <b>' + durMin(v) + '</b>' : ''; };
  $('rtMin').addEventListener('input', rtConv); rtConv();
  $('rtOk').addEventListener('click', () => { const v = parseInt($('rtMin').value, 10); if (isNaN(v) || v < 0) delete t.returnRealMin; else t.returnRealMin = v; persist(); closeModal(); (after || renderHomeTrajet)(); });
  $('rtClear').addEventListener('click', () => { delete t.returnRealMin; persist(); closeModal(); (after || renderHomeTrajet)(); });
}
// Paiement d'un arrêt (par client) : liquide / virement + facture ? + (si liquide) montant réel payé (arrondi caisse).
function modalPayment(t, arret, after) {
  const clientsAt = (arret.clients || []).map((cl) => cl.clientId);
  if (!clientsAt.length) { if (after) after(); return; }
  if (!t.payments) t.payments = {};
  const paySnapshot = JSON.parse(JSON.stringify(t.payments)); // pour restaurer si l'utilisateur annule (les bascules de méthode modifient les totaux en direct)
  const invTTC = (cid) => { const m = (t.result && t.result.parClient) ? t.result.parClient.find((x) => x.clientId === cid) : null; return m ? m.totalTTC : 0; };
  const persist = () => { const i = tournees.findIndex((x) => x.id === t.id); if (i >= 0) { tournees[i] = t; saveTournees(); return; } const ai = archive.findIndex((x) => x.id === t.id); if (ai >= 0) { archive[ai] = t; saveArchive(); return; } tournees.push(t); saveTournees(); };
  recomputeTourLocal(t); // reflète la réduction liquide couplée dans les totaux affichés
  let html = '<div class="modal-head"><b>💶 Paiement de l\'arrêt</b><button class="x" id="mX">✕</button></div><p class="hint">Choisissez le mode de paiement (obligatoire pour clôturer). En <b>liquide</b>, saisissez le <b>montant décimal rectifié</b> : le total arrondi à l\'euro que vous encaissez (la différence + ou − passe en facture).</p>';
  clientsAt.forEach((cid) => {
    const p = t.payments[cid] || { method: null, facture: false, rectifie: null, partiel: false, impaye: null }; // par défaut : aucun mode choisi (neutre)
    const ttc = invTTC(cid);
    const rectVal = p.rectifie != null ? p.rectifie : (p.montantPaye != null && !p.partiel ? p.montantPaye : '');
    html += `<div class="pay-block" data-cid="${cid}">
      <h3 style="font-size:.9rem;margin:.4rem 0">${esc(clientName(cid))} <span class="li-sub">— facture <span data-facture>${eur(ttc)}</span> TTC</span> <button type="button" class="btn small" data-rdv="${cid}">📅 RDV</button></h3>
      <div class="seg pay-method">
        <button type="button" class="seg-btn${p.method === 'virement' ? ' on' : ''}" data-m="virement">Virement</button>
        <button type="button" class="seg-btn${p.method === 'liquide' ? ' on' : ''}" data-m="liquide">Liquide</button>
      </div>
      <label class="chk2"><input type="checkbox" data-fac ${p.facture ? 'checked' : ''}/> Facture nécessaire</label>
      <div class="pay-cash" style="${p.method === 'liquide' ? '' : 'display:none'}">
        <label>Montant décimal rectifié (TTC, arrondi à l'euro)<input type="number" data-rectifie step="1" min="0" inputmode="numeric" value="${rectVal}" placeholder="${ttc ? Math.round(ttc) : ''}"/></label>
        <p class="hint" data-diff></p>
        <label class="chk2"><input type="checkbox" data-partiel ${p.partiel ? 'checked' : ''}/> Paiement partiel (reste impayé)</label>
        <div class="pay-reste" style="${p.partiel ? '' : 'display:none'}">
          <label>Montant impayé (TTC, à l'euro)<input type="number" data-impaye step="1" min="0" inputmode="numeric" value="${p.impaye != null ? p.impaye : ''}" placeholder="0"/></label>
          <label>Reste à percevoir par<select data-restemode><option value="report"${p.resteMode !== 'virement' ? ' selected' : ''}>Prochaine visite (liquide)</option><option value="virement"${p.resteMode === 'virement' ? ' selected' : ''}>Virement</option></select></label>
          <p class="hint" data-recu></p>
        </div>
      </div>
    </div>`;
  });
  html += '<div class="actions"><button class="btn primary block" id="payOk">Enregistrer</button></div>';
  openModal(html);
  $('mX').addEventListener('click', () => { t.payments = paySnapshot; recomputeTourLocal(t); closeModal(); if (after) after(); }); // annulation → restaure les méthodes/montants d'origine
  document.querySelectorAll('.pay-block').forEach((block) => {
    const cid = block.dataset.cid;
    const cash = block.querySelector('.pay-cash');
    const rectInt = () => { const v = block.querySelector('[data-rectifie]').value; return v === '' ? null : Math.max(0, Math.round(parseNum(v))); };
    const impInt = () => { const v = block.querySelector('[data-impaye]').value; return v === '' ? 0 : Math.max(0, Math.round(parseNum(v))); };
    const refreshFacture = () => { const ttc = invTTC(cid); const f = block.querySelector('[data-facture]'); if (f) f.textContent = eur(ttc); const ri = block.querySelector('[data-rectifie]'); if (ri) ri.placeholder = ttc ? Math.round(ttc) : ''; };
    const upd = () => {
      const ttc = invTTC(cid); const rect = rectInt();
      const diffEl = block.querySelector('[data-diff]');
      if (diffEl) {
        if (rect == null) diffEl.innerHTML = `Facture <b>${eur(ttc)}</b> TTC — arrondissez à l'euro (vers le haut ou le bas).`;
        else { const d = rect - ttc; diffEl.innerHTML = `Différence (arrondi) : <b>${eur(d)}</b> TTC ${d < -0.004 ? '(remise)' : d > 0.004 ? '(supplément)' : ''}`; }
      }
      const recuEl = block.querySelector('[data-recu]');
      if (recuEl) { const base = rect != null ? rect : ttc; const imp = impInt(); recuEl.innerHTML = `Montant réellement reçu : <b>${eur(base - imp)}</b> TTC <span class="li-sub">(rectifié ${eur(base)} − impayé ${eur(imp)})</span>`; }
    };
    // Bascule de méthode : couple la réduction LIQUIDE en direct (recalcul de la facture).
    block.querySelectorAll('.pay-method .seg-btn').forEach((b) => b.addEventListener('click', () => {
      block.querySelectorAll('.pay-method .seg-btn').forEach((x) => x.classList.toggle('on', x === b));
      cash.style.display = b.dataset.m === 'liquide' ? '' : 'none';
      t.payments[cid] = Object.assign({}, t.payments[cid], { method: b.dataset.m }); // méthode provisoire → recalcul
      recomputeTourLocal(t); refreshFacture(); upd();
    }));
    const pt = block.querySelector('[data-partiel]'); if (pt) pt.addEventListener('change', () => { const pr = block.querySelector('.pay-reste'); if (pr) pr.style.display = pt.checked ? '' : 'none'; upd(); });
    // Champs à l'euro : recalcul en direct + normalisation (aucune décimale) à la sortie du champ.
    ['[data-rectifie]', '[data-impaye]'].forEach((sel) => { const i = block.querySelector(sel); if (i) { i.addEventListener('input', upd); i.addEventListener('blur', () => { if (i.value !== '') i.value = String(Math.max(0, Math.round(parseNum(i.value)))); }); } });
    upd();
  });
  const commitPayments = () => {
    document.querySelectorAll('.pay-block').forEach((block) => {
      const cid = block.dataset.cid;
      const on = block.querySelector('.pay-method .seg-btn.on');
      const method = on ? on.dataset.m : null; // aucun choix → neutre (bloque la clôture)
      const facture = block.querySelector('[data-fac]').checked;
      let rectifie = null, partiel = false, impaye = null, resteMode = null;
      if (method === 'liquide') {
        const rv = block.querySelector('[data-rectifie]').value; rectifie = rv !== '' ? Math.max(0, Math.round(parseNum(rv))) : null;
        partiel = block.querySelector('[data-partiel]').checked;
        if (partiel) { const iv = block.querySelector('[data-impaye]').value; impaye = iv !== '' ? Math.max(0, Math.round(parseNum(iv))) : 0; resteMode = block.querySelector('[data-restemode]').value; }
      }
      t.payments[cid] = { method, facture, rectifie, partiel, impaye, resteMode };
      // Impayé « reporté » (prochaine visite) rattaché au client ; « virement » dérivé en Compta (pas d'impayé client).
      const imp = (partiel && impaye != null) ? impaye : 0;
      setClientImpaye(t, cid, resteMode === 'report' ? imp : 0);
    });
    recomputeTourLocal(t); // fige la réduction liquide couplée dans les totaux
    if (t === currentTour && currentTour.result && typeof renderResultUI === 'function') renderResultUI(currentTour.result); // rafraîchit la facture de l'éditeur
    persist(); saveClients();
  };
  // Bouton « RDV » (programmer le suivi) : sauvegarde d'abord le paiement en cours, puis ouvre la planification ; retour au paiement à la fermeture.
  document.querySelectorAll('[data-rdv]').forEach((b) => b.addEventListener('click', () => { commitPayments(); modalRDV(t, arret, b.dataset.rdv, () => modalPayment(t, arret, after)); }));
  $('payOk').addEventListener('click', () => { commitPayments(); closeModal(); if (after) after(); });
}
// Reste « reporté » (liquide, à percevoir à la prochaine visite) rattaché au client.
function setClientImpaye(t, cid, resteTTC) {
  const c = clients.find((x) => x.id === cid); if (!c) return;
  if (!Array.isArray(c.impayes)) c.impayes = [];
  c.impayes = c.impayes.filter((im) => !(im.sourceTourId === t.id && !im.collected)); // recrée l'impayé non perçu de cette tournée
  if (resteTTC > 0.005) c.impayes.push({ id: uid(), sourceTourId: t.id, date: t.date, ttc: resteTTC, collected: false, collectedTourId: null });
}
// Remet un impayé « à percevoir » (ex. si on retire sa ligne d'article d'une tournée).
function uncollectImpaye(impayeId) {
  clients.forEach((c) => (c.impayes || []).forEach((im) => { if (im.id === impayeId) { im.collected = false; im.collectedTourId = null; } }));
  saveClients();
}
// Nettoyage à la SUPPRESSION d'une tournée : impayés + suivi Compta liés. (Facture/stats/compta se recalculent seuls car ils lisent allTours().)
function purgeTourData(id) {
  clients.forEach((c) => {
    if (!Array.isArray(c.impayes)) return;
    c.impayes = c.impayes.filter((im) => im.sourceTourId !== id);                    // créance NÉE de cette tournée → disparaît avec elle
    c.impayes.forEach((im) => { if (im.collectedTourId === id) { im.collected = false; im.collectedTourId = null; } }); // impayé PERÇU par cette tournée → redevient « à percevoir »
  });
  saveClients();
  // Clés de suivi Compta orphelines (« tourId:clientId » et « …:reste »).
  [S.comptaRecu, S.comptaDemarche].forEach((map) => { if (map) Object.keys(map).forEach((k) => { if (k.split(':')[0] === id) delete map[k]; }); });
  // Événement d'agenda récupéré vers cette tournée → il redevient disponible dans « Items ».
  Object.keys(S.agendaImported || {}).forEach((eid) => { if (S.agendaImported[eid] && S.agendaImported[eid].tourId === id) delete S.agendaImported[eid]; });
  saveSettings();
}
// ---------- Programmation de suivi (RDV) ----------
// Ajout de jours en UTC (cohérent avec todayStr = UTC) → pas de décalage de date selon le fuseau.
function addDaysStr(ymd, days) {
  const [y, m, d] = (ymd || todayStr()).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1)); dt.setUTCDate(dt.getUTCDate() + (days || 0));
  return dt.toISOString().slice(0, 10);
}
// Date de prochaine visite proposée : baseDate + délai (semaines, réglable) → même jour de la semaine ;
// si un jour de la semaine est imposé dans les Réglages, on avance jusqu'à ce jour.
function proposedRdvDate(baseDate) {
  const weeks = (typeof S.rdvDelaiSemaines === 'number' && S.rdvDelaiSemaines >= 1) ? S.rdvDelaiSemaines : 5;
  let ymd = addDaysStr(baseDate || todayStr(), weeks * 7); // multiple de 7 → même jour de la semaine
  const jour = S.rdvJourSemaine;
  if (jour !== '' && jour != null) {
    const target = parseInt(jour, 10);
    if (!isNaN(target)) { const [y, m, d] = ymd.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + ((target - dt.getUTCDay() + 7) % 7)); ymd = dt.toISOString().slice(0, 10); }
  }
  return ymd;
}
// Applique une heure de RDV aux chevaux (par id) d'un client dans une tournée.
function setChevalHeure(t, clientId, chevalObjs, heure) {
  const ids = new Set((chevalObjs || []).map((h) => h.id));
  (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => { if (cl.clientId !== clientId) return; (cl.chevaux || []).forEach((cv) => { if (ids.has(cv.id)) cv.heure = heure; }); }));
}
// Planifie un client (avec des chevaux) sur une date : crée la tournée du jour si absente (en cours/à venir), sinon complète l'existante.
function scheduleClientOnDate(date, client, chevalObjs, heure) {
  let t = tournees.find((x) => x.date === date && statusOf(x) !== 'cloturee');
  let created = false;
  if (!t) { t = { id: uid(), date, nom: '', closed: false, arrivee: null, arrets: [], articles: [], reductions: {}, payments: {}, result: null, createdAt: Date.now() }; tournees.push(t); created = true; }
  const prev = currentTour; currentTour = t;
  addClientToTour(client, chevalObjs);
  currentTour = prev;
  if (heure) setChevalHeure(t, client.id, chevalObjs, heure);
  t.result = null; saveTournees();
  return { tour: t, created };
}
// Aperçu d'une journée : arrêts déjà prévus (toutes tournées) + agenda privé.
function rdvDayPreview(date) {
  const arrets = [];
  allTours().forEach((x) => { if (x.date !== date) return; (x.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => { const chn = (cl.chevaux || []).map((c) => c.nom).join(', '); arrets.push(clientName(cl.clientId) + (chn ? ' (' + chn + ')' : '') + (statusOf(x) === 'cloturee' ? ' — clôturée' : '')); })); });
  return { arrets, priv: privateEventsForDay(date) };
}
// Modale « RDV » (depuis le paiement) : un ou plusieurs rendez-vous pour le client, chevaux par RDV, aperçu de la journée.
function modalRDV(t, arret, cid, onDone) {
  const client = clients.find((x) => x.id === cid);
  if (!client) { if (onDone) onDone(); return; }
  const arrCl = (arret.clients || []).find((x) => x.clientId === cid);
  const poolIds = ((arrCl && arrCl.chevaux) || []).map((c) => c.id).filter(Boolean);
  const chevalPool = activeChevaux(client).filter((h) => !poolIds.length || poolIds.includes(h.id));
  const pool = chevalPool.length ? chevalPool : activeChevaux(client);
  const proposed = proposedRdvDate(t.date || todayStr());
  const blocks = [{ date: proposed, ids: new Set(pool.map((h) => h.id)) }];
  const render = () => {
    openModal(`<div class="modal-head"><b>📅 Programmer le suivi (RDV)</b><button class="x" id="mX">✕</button></div>
      <p class="hint">Client : <b>${esc(fullName(client))}</b>. Proposez la prochaine visite ; ajoutez plusieurs RDV si les chevaux ne reviennent pas le même jour. Les tournées sont créées si besoin, sinon le client/cheval est ajouté.</p>
      <div id="rdvBlocks"></div>
      <div class="actions two"><button class="btn" id="rdvAdd">+ Ajouter un RDV</button><button class="btn primary" id="rdvOk">Enregistrer les RDV</button></div>`);
    $('mX').addEventListener('click', () => { closeModal(); if (onDone) onDone(); });
    const box = $('rdvBlocks');
    blocks.forEach((blk, bi) => {
      const wrap = document.createElement('div'); wrap.className = 'card'; wrap.style.marginBottom = '8px';
      wrap.innerHTML = `<div class="a-art-head"><span>RDV n°${bi + 1}</span>${blocks.length > 1 ? '<button class="btn small danger" data-rm>✕</button>' : ''}</div>
        <label>Date<input type="date" data-date value="${blk.date}"/></label>
        <div class="rdv-chevaux">${pool.map((hrs) => `<label class="chk"><input type="checkbox" data-cv="${hrs.id}" ${blk.ids.has(hrs.id) ? 'checked' : ''}/> 🐴 ${esc(hrs.nom)}</label>`).join('')}</div>
        <p class="hint" data-prev></p>`;
      const prev = wrap.querySelector('[data-prev]');
      const upPrev = () => { const d = wrap.querySelector('[data-date]').value; const pv = rdvDayPreview(d); prev.innerHTML = `<b>${d ? fmtDateFr(d) : '—'}</b> — Arrêts déjà prévus : ${pv.arrets.length ? esc(pv.arrets.join(' · ')) : 'aucune tournée'}${pv.priv.length ? '<br>📅 Agenda privé : ' + pv.priv.map((p) => esc((eventHeure(p) ? eventHeure(p) + ' ' : '') + p.title)).join(' · ') : ''}`; };
      wrap.querySelector('[data-date]').addEventListener('change', (e) => { blk.date = e.target.value; upPrev(); });
      wrap.querySelectorAll('[data-cv]').forEach((c) => c.addEventListener('change', (e) => { if (e.target.checked) blk.ids.add(e.target.dataset.cv); else blk.ids.delete(e.target.dataset.cv); }));
      const rm = wrap.querySelector('[data-rm]'); if (rm) rm.addEventListener('click', () => { blocks.splice(bi, 1); render(); });
      box.appendChild(wrap); upPrev();
    });
    $('rdvAdd').addEventListener('click', () => { blocks.push({ date: proposed, ids: new Set() }); render(); });
    $('rdvOk').addEventListener('click', () => {
      blocks.forEach((blk) => {
        if (!blk.date || !blk.ids.size) return;
        const chevalObjs = (client.chevaux || []).filter((h) => blk.ids.has(h.id));
        if (chevalObjs.length) scheduleClientOnDate(blk.date, client, chevalObjs);
      });
      closeModal(); if (onDone) onDone();
    });
  };
  render();
}
function renderHome() {
  autoCloseOverdueTours(); // vérifie à chaque affichage de l'Accueil
  const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');
  const upcoming = [...tournees].filter((t) => statusOf(t) === 'avenir').sort(byDate); // du plus proche au plus lointain
  const fill = (listId, emptyId, items) => { const box = $(listId); if (!box) return; box.innerHTML = ''; $(emptyId).style.display = items.length ? 'none' : 'block'; items.forEach((t) => box.appendChild(tourListItem(t, true))); };
  renderHomeChangelog();
  renderHomeTrajet();
  fill('homeUpcoming', 'homeUpcomingEmpty', upcoming);
}
// ================= CHANGELOG / message de passage de version =================
const changelogUnread = () => CHANGELOG.filter((e) => !(S.changelogRead || []).includes(e.version));
function markChangelogRead(version) { if (!Array.isArray(S.changelogRead)) S.changelogRead = []; if (!S.changelogRead.includes(version)) S.changelogRead.push(version); LS.set('ftr.settings', S); }
function changelogEntryHtml(e) {
  const li = (arr) => (arr || []).map((x) => `<li>${esc(x)}</li>`).join('');
  return `<h3 style="margin:.2rem 0 .3rem">Version ${esc(e.version)} <span class="li-sub">· ${esc(e.date || '')}</span></h3>
    ${e.ajouts && e.ajouts.length ? `<p class="cl-h">✨ Nouveautés</p><ul class="cl-ul">${li(e.ajouts)}</ul>` : ''}
    ${e.corrections && e.corrections.length ? `<p class="cl-h">🔧 Corrections</p><ul class="cl-ul">${li(e.corrections)}</ul>` : ''}`;
}
function openChangelogEntry(e) {
  openModal(`<div class="modal-head"><b>📣 Nouveautés</b><button class="x" id="mX">✕</button></div>
    ${changelogEntryHtml(e)}
    <div class="actions"><button class="btn primary block" id="clRead">✔ Marquer comme lu</button></div>`);
  $('mX').addEventListener('click', closeModal);
  $('clRead').addEventListener('click', () => { markChangelogRead(e.version); closeModal(); if ($('tab-reglages') && $('tab-reglages').classList.contains('active') && currentRsub === 'changelog') renderChangelog(); if ($('tab-accueil').classList.contains('active')) renderHome(); else renderHomeChangelog(); });
}
// Carte « message de passage de version » sur l'Accueil (seulement si version non lue).
function renderHomeChangelog() {
  const card = $('homeChangelog'); if (!card) return;
  const unread = changelogUnread();
  if (!unread.length) { card.classList.add('hidden'); card.innerHTML = ''; card.onclick = null; return; }
  const e = unread[0];
  card.classList.remove('hidden');
  card.innerHTML = `<div class="cl-msg"><div class="li-main"><b>📣 Nouveautés — version ${esc(e.version)}</b><span class="li-sub">Appuyez pour découvrir les nouveautés et corrections.</span></div><span class="li-chev">›</span></div>`;
  card.onclick = () => openChangelogEntry(e);
}
// Réglages → Changelog : toutes les versions ; non lues mises en avant, lues grisées.
function renderChangelog() {
  const box = $('changelogList'); if (!box) return; box.innerHTML = '';
  if (!CHANGELOG.length) { box.innerHTML = '<p class="empty">Aucune note de version.</p>'; return; }
  CHANGELOG.forEach((e) => {
    const read = (S.changelogRead || []).includes(e.version);
    const el = document.createElement('div'); el.className = 'card cl-entry' + (read ? ' cl-read' : ' cl-unread'); el.style.cursor = 'pointer';
    el.innerHTML = changelogEntryHtml(e) + `<p class="li-sub">${read ? '✔ Lu' : '● Non lu — appuyez pour lire'}</p>`;
    el.addEventListener('click', () => openChangelogEntry(e));
    box.appendChild(el);
  });
}
function modalVehicule() {
  openModal(`<div class="modal-head"><b>📋 Déclarer un événement</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Que voulez-vous faire ?</p>
    <div class="actions"><button class="btn primary block" id="vClient">👤 Créer un client</button></div>
    <div class="actions"><button class="btn block" id="vPlein">⛽ Valider un plein (prix du carburant)</button></div>
    <div class="actions"><button class="btn block" id="vConso">🚗 Corriger la consommation</button></div>
    <div class="actions"><button class="btn block" id="vFrais">🧾 Frais véhicule (entretien, achat…)</button></div>
    <div class="actions"><button class="btn block" id="vMat">🧰 Frais de matériel</button></div>
    <div class="actions"><button class="btn block" id="vSync">🔄 Synchroniser (Google Drive)</button></div>
    <p class="status" id="vSyncStatus"></p>`);
  $('mX').addEventListener('click', closeModal);
  $('vClient').addEventListener('click', () => { closeModal(); editClient(null); });
  $('vPlein').addEventListener('click', modalPlein);
  $('vConso').addEventListener('click', modalConso);
  $('vFrais').addEventListener('click', () => { closeModal(); showTab('gestion'); showGestion('vehicule'); });
  $('vMat').addEventListener('click', () => { closeModal(); showTab('gestion'); showGestion('materiel'); });
  // Synchro manuelle immédiate (interactive : peut demander la connexion Google si besoin), puis recharge l'app à jour.
  $('vSync').addEventListener('click', () => { const s = $('vSyncStatus'); if (S.syncMode !== 'drive') { s.className = 'status err'; s.textContent = 'Activez « Synchro Drive » dans Réglages → Synchro (le mode fichier est actif).'; return; } if (!S.googleClientId) { s.className = 'status err'; s.textContent = 'Renseignez d\'abord votre ID client Google dans Réglages → Synchro.'; return; } googleSync(true, s, true); });
}
function modalPlein() {
  openModal(`<div class="modal-head"><b>⛽ Valider un plein</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Prix TVAC (à la pompe). Corrige le carburant de tous les tarifs.</p>
    <label>Prix au litre<input type="number" id="pL" step="0.01" min="0" value="${S.prixPleinL}" /></label>
    <p class="hint" id="pBreak"></p>
    <details class="assistant"><summary>Je n'ai que le montant total</summary><div class="row"><label class="grow">Montant<input type="number" id="pM" step="0.01" min="0"/></label><label class="grow">Litres<input type="number" id="pLi" step="0.01" min="0"/></label></div><button class="btn small" id="pCalc">Déduire le €/L</button></details>
    <div class="actions"><button class="btn primary block" id="pOk">Valider le plein</button></div>`);
  $('mX').addEventListener('click', closeModal);
  mUnit('pL', '€/L TTC', 3); mUnit('pM', '€', 2); mUnit('pLi', 'L', 2);
  const upd = () => { const v = parseNum($('pL').value); const r = rate(); const ht = v / (1 + r), tva = v - ht; $('pBreak').innerHTML = v > 0 ? `HT : <b>${eur(ht)}</b>/L · TVA (${S.tvaRate}%) : <b>${eur(tva)}</b>/L` : ''; };
  upd(); $('pL').addEventListener('input', upd);
  $('pCalc').addEventListener('click', () => { const m = parseNum($('pM').value), li = parseNum($('pLi').value); if (m > 0 && li > 0) $('pL').value = fmtNum(Math.round((m / li) * 1000) / 1000, 3); upd(); });
  $('pOk').addEventListener('click', () => { const v = parseNum($('pL').value); if (v > 0) { S.prixPleinL = v; saveSettings(); } closeModal(); });
}
function modalConso() {
  openModal(`<div class="modal-head"><b>🚗 Corriger la consommation</b><button class="x" id="mX">✕</button></div>
    <label>Consommation<input type="number" id="cV" step="0.1" min="0" value="${S.consoL100}" /></label>
    <div class="actions"><button class="btn primary block" id="cOk">Valider</button></div>`);
  $('mX').addEventListener('click', closeModal);
  mUnit('cV', 'L/100', 1);
  $('cOk').addEventListener('click', () => { const v = parseNum($('cV').value); if (v > 0) { S.consoL100 = v; saveSettings(); } closeModal(); });
}

// ================= PAGE CALCUL =================
function calculExample() {
  const arr = [
    { nom: 'A — client proche', type: 'tournee', seg: 12, direct: Math.max(1, Math.round(S.seuilKm * 0.4)), clients: 1, chevaux: 1 },
    { nom: 'B — écurie partagée', type: 'tournee', seg: 20, direct: S.seuilKm + 12, clients: 2, chevaux: 2 },
    { nom: 'C — urgence', type: 'urgence', seg: 13, direct: S.seuilKm + 25, clients: 1, chevaux: 1 },
  ];
  const kmRetour = 15; const total = arr.reduce((s, a) => s + a.seg, 0) + kmRetour;
  arr.forEach((a) => (a.proche = (S.repartition === 'parclient') && a.direct < S.seuilKm));
  const loin = arr.filter((a) => !a.proche);
  const kmProches = arr.filter((a) => a.proche).reduce((s, a) => s + a.direct, 0);
  const kmRestant = Math.max(0, total - kmProches);
  const sumSeg = loin.reduce((s, a) => s + a.seg, 0), sumCli = loin.reduce((s, a) => s + a.clients, 0);
  arr.forEach((a) => {
    a.tarifTTC = ttc(tarifHT(a.type));
    if (a.proche) { a.km = 0; a.montant = ttc(S.forfait); }
    else { a.km = S.repartition === 'prorata' && sumSeg ? kmRestant * a.seg / sumSeg : S.repartition === 'parclient' && sumCli ? kmRestant * a.clients / sumCli : kmRestant / loin.length; a.montant = ttc(a.km * tarifHT(a.type)); }
  });
  return { arr, total, kmRetour, kmProches, kmRestant };
}
function renderCalcul() {
  const f = fuelPerKmHT();
  const modes = [
    ['egal', 'Parts égales (équitable)', 'Le km total est divisé en parts identiques entre TOUS les arrêts. Chacun paie la même distance. Le seuil/forfait « client proche » ne s\'applique pas.'],
    ['prorata', 'Au prorata du segment', 'Chaque arrêt paie proportionnellement à la longueur de son segment : les plus éloignés paient davantage. Le seuil/forfait « client proche » ne s\'applique pas.'],
    ['parclient', 'Par client + client proche', 'Les clients sous le seuil sont facturés au forfait et sortis du partage ; le reste est réparti selon le nombre de clients à chaque arrêt.'],
  ];
  const modesHtml = modes.map(([k, t, d]) => `<div class="cr-line">${k === S.repartition ? '▶' : '•'} <b>${t}</b>${k === S.repartition ? ' — <span class="badge">actif</span>' : ''} — ${d}</div>`).join('');
  const tarifRows = Object.keys(TYPES).map((t) => `<tr><td>${TYPES[t]}</td><td>${eurkm(baseVehiculeHT())}</td><td>${eurkm(f)}</td><td>${eurkm(tarifHT(t))}</td><td class="strong">${eurkm(ttc(tarifHT(t)))}</td></tr>`).join('');
  const ex = calculExample();
  const exRows = ex.arr.map((a, i) => `<tr><td>${i + 1}. ${a.nom}</td><td>${a.proche ? 'oui' : '—'}</td><td>${a.proche ? 'forfait' : km(a.km)}</td><td>${a.proche ? '—' : eurkm(a.tarifTTC)}</td><td>${eur(a.montant)}</td></tr>`).join('');
  const totEx = ex.arr.reduce((s, a) => s + a.montant, 0);
  $('calculBody').innerHTML = `
    <section class="card"><h2>Facture détaillée (exemple)</h2><p class="hint">Un exemple complet, étape par étape, avec des <b>données fictives</b> (clients, adresses, chevaux) et vos tarifs réels, en temps réel.</p><div class="actions"><button class="btn primary block" id="calcFactureBtn">📄 Voir la facture détaillée (exemple)</button></div></section>
    <section class="card"><h2>Comment sont calculés les frais</h2><p>On mesure les vrais km de la boucle, on met à part les « clients proches » (forfait), on partage le reste sur les autres arrêts, puis on divise par client et par cheval. La TVA est ajoutée à la fin. Les valeurs sont <b>vos réglages actuels</b>, mises à jour en direct.</p></section>
    <section class="card"><h2><span class="step-n">1</span>Le coût du kilomètre (HT)</h2><p>Tarif au km = <b>part véhicule</b> (fixe, HT) + <b>carburant HT</b>. Le carburant à la pompe est TVAC, on le ramène en HT :</p>
      <div class="formula">carburant HT/km = (${S.consoL100} ÷ 100) × ${eur(S.prixPleinL)} ÷ (1 + ${S.tvaRate}%) = <b>${eurkm(f)}</b></div>
      <div class="table-wrap"><table><thead><tr><th>Type</th><th>Véhicule HT</th><th>Carburant HT</th><th>Tarif HT</th><th>TTC</th></tr></thead><tbody>${tarifRows}</tbody></table></div></section>
    <section class="card"><h2><span class="step-n">2</span>Le kilométrage total</h2><p>La boucle complète est mesurée par l'API : <b>domicile → 1ᵉʳ arrêt → … → dernier arrêt → domicile</b>. L'aller vers le 1ᵉʳ arrêt <u>et</u> le retour sont <b>tous deux inclus</b> dans le total réparti.</p></section>
    <section class="card"><h2><span class="step-n">3</span>Les clients proches (forfait) — mode « par client » uniquement</h2><p><b>Uniquement</b> quand la répartition est « par client » : si la distance routière domicile→arrêt &lt; <b>seuil (${S.seuilKm} km)</b>, le client est « proche », facturé au <b>forfait (${eur(S.forfait)} HT)</b> et <b>sorti du partage</b>. On retire alors du km total sa <b>distance aller simple domicile→client</b> (additionnée s'il y a plusieurs clients proches). En modes « parts égales » et « prorata », cette étape ne s'applique pas.</p><div class="formula">km restant = km total de la boucle − Σ (aller domicile→client de chaque client proche)</div></section>
    <section class="card"><h2><span class="step-n">4</span>La répartition du kilométrage</h2>
      <p>Le <b>km restant</b> (retour compris) est réparti entre les arrêts <b>non proches</b>, puis multiplié par le €/km HT du type de chaque arrêt. Trois méthodes, réglables dans Réglages :</p>
      ${modesHtml}
      <p class="hint">Méthode active : « <b>${S.repartition}</b> ». La règle « parts égales » est le partage <b>équitable</b> d'une tournée commune : chaque client restant paie la même part du chemin, quel que soit son éloignement, une fois les clients proches sortis.</p></section>
    <section class="card"><h2><span class="step-n">5</span>Par client, par cheval, + TVA</h2><p>Frais d'un arrêt ÷ nombre de clients = part de chaque client. La part est ensuite ÷ nombre de chevaux de ce client à cet endroit = coût par cheval. La <b>TVA (${S.tvaRate}%)</b> est appliquée pour obtenir le TTC.</p></section>
    <section class="card"><h2>Exemple chiffré (TTC, avec vos tarifs)</h2><p class="hint">3 arrêts, boucle de ${km(ex.total)} (dont ${km(ex.kmRetour)} de retour). A proche → forfait ; B partagé par 2 clients ; C urgence.</p>
      <div class="table-wrap"><table><thead><tr><th>Arrêt</th><th>Proche</th><th>Km attribué</th><th>Tarif TTC/km</th><th>Frais TTC</th></tr></thead><tbody>${exRows}</tbody></table></div>
      <div class="formula">Km partagé = ${km(ex.total)} − ${km(ex.kmProches)} = <b>${km(ex.kmRestant)}</b> · Total TTC = <b>${eur(totEx)}</b></div></section>`;
  const fb = $('calcFactureBtn'); if (fb) fb.addEventListener('click', openFactureDetail);
}

// ================= RÉGLAGES =================
function bindSettings() {
  const set = (id, val) => { if ($(id)) $(id).value = val; };
  mountAddress($('homeAddr'), S.home, (a) => { S.home = a; saveSettings(); });
  set('setRepartition', S.repartition); set('setProvider', S.provider); set('setKey', S.geoapifyKey); set('setPays', S.pays);
  if ($('setDureeMode')) $('setDureeMode').value = S.dureeAuto ? 'auto' : 'vitesse';
  toggleKeyRow(); refreshTarifTable();
  // iOS : le sélecteur natif de couleur émet « change » (à la fermeture) et pas toujours « input » → on écoute les deux.
  const bindColor = (id, set) => { const el = $(id); if (!el) return; const h = (e) => { set(e.target.value); saveSettings(); applyTheme(); refreshSwatches(); }; el.addEventListener('input', h); el.addEventListener('change', h); };
  if ($('setAccent')) { $('setAccent').value = S.accentColor; bindColor('setAccent', (v) => { S.accentColor = v; }); }
  if ($('setTopbar')) { $('setTopbar').value = S.topbarColor || S.accentColor; bindColor('setTopbar', (v) => { S.topbarColor = v; }); }
  if ($('setNavbar')) { $('setNavbar').value = S.navBarColor || (lum(S.appBg) < 0.45 ? '#1d1d1d' : '#ffffff'); bindColor('setNavbar', (v) => { S.navBarColor = v; }); }
  if ($('setAppBg')) { $('setAppBg').value = S.appBg; bindColor('setAppBg', (v) => { S.appBg = v; }); }
  if ($('setLogoBg')) { if (S.logoBg && S.logoBg !== 'transparent') $('setLogoBg').value = S.logoBg; bindColor('setLogoBg', (v) => { S.logoBg = v; }); }
  refreshSwatches();
  // Champs numériques : séparateur de milliers + unité DANS le champ, mise à jour en direct.
  const paints = {};
  const wS = (id, key, unit, dec) => { paints[id] = wireNum($(id), { get: () => S[key], dec, unit, set: (v) => { S[key] = v; }, after: () => saveSettings() }); };
  const wA = (id, key, unit, dec) => { paints[id] = wireNum($(id), { get: () => S.amortissement[key], dec, unit, set: (v) => { S.amortissement[key] = v; }, after: () => saveSettings() }); };
  const wP = (id, key, unit, dec) => { paints[id] = wireNum($(id), { get: () => S.parage[key], dec, unit, set: (v) => { S.parage[key] = v; }, after: () => saveSettings() }); };
  wS('setConso', 'consoL100', 'L/100', 1); wS('setPrixPlein', 'prixPleinL', '€/L TTC', 2); wS('setTva', 'tvaRate', '%', 1);
  wS('setPrixHeure', 'prixHeure', '€ HT', 2); wS('setKmHeure', 'kmHeure', 'km/h', 0); wS('setUrgenceSupp', 'urgenceSuppKm', '€ HT/km', 3);
  wS('setSeuil', 'seuilKm', 'km', 0); wS('setForfait', 'forfait', '€ HT', 2); wS('setRayon', 'rayonMemeEcurieKm', 'km', 1);
  wS('setVitesse', 'vitesseKmh', 'km/h', 0);
  wA('setAchat', 'achatHT', '€ HT', 0); wA('setDureeVie', 'dureeVieKm', 'km', 0);
  wS('setFourbure', 'fourbureHT', '€ HT', 2); wS('setNpas', 'npasHT', '€ HT', 2); wS('setInfection', 'infectionHT', '€ HT', 2);
  wP('setParagePrix', 'prixHT', '€ HT', 2); wP('setParageTva', 'tvaPct', '%', 1);
  if ($('setReducLiquide')) { $('setReducLiquide').value = (S.reducLiquide != null ? S.reducLiquide : 20); $('setReducLiquide').addEventListener('input', (e) => { const v = parseInt(e.target.value, 10); S.reducLiquide = (!isNaN(v) && v >= 0) ? v : 0; saveSettings(); }); }
  _settingsPaints = paints;
  // Champs calculés (lecture seule) : unité affichée dans le champ.
  [['setPrixPleinHT', '€/L HT'], ['setAchatTTC', '€ TTC'], ['setAmortHT', '€/km HT'], ['setAmortTTC', '€/km TTC'], ['setForfaitTTC', '€ TTC'], ['setSeuilTarif', '€/km HT'], ['setSeuilDepHT', '€ HT'], ['setSeuilDepTTC', '€ TTC'], ['setFourbureTtc', '€ TTC'], ['setNpasTtc', '€ TTC'], ['setInfectionTtc', '€ TTC'], ['setParageTtc', '€ TTC'], ['setPrixHeureTtc', '€ TTC'], ['setTempsKmRo', '€/km']].forEach(([id, u]) => makeReadout($(id), u));
  if ($('setSeuilType')) { $('setSeuilType').value = S.seuilTarifType; $('setSeuilType').addEventListener('change', (e) => { S.seuilTarifType = e.target.value; saveSettings(); }); }
  updateReadouts();
  if ($('setNavApp')) { $('setNavApp').value = S.navApp; $('setNavApp').addEventListener('change', (e) => { S.navApp = e.target.value === 'gmaps' ? 'gmaps' : 'waze'; saveSettings(); if ($('tab-accueil').classList.contains('active')) renderHome(); }); }
  if ($('setGoogleClientId')) { $('setGoogleClientId').value = S.googleClientId || ''; $('setGoogleClientId').addEventListener('input', (e) => { S.googleClientId = e.target.value.trim(); saveSettings(); }); }
  if ($('setGoogleAuto')) { $('setGoogleAuto').checked = !!S.googleAutoSync; $('setGoogleAuto').addEventListener('change', (e) => { S.googleAutoSync = e.target.checked; saveSettings(); }); }
  if ($('setRdvDelai')) { $('setRdvDelai').value = S.rdvDelaiSemaines || 5; $('setRdvDelai').addEventListener('input', (e) => { const v = parseInt(e.target.value, 10); S.rdvDelaiSemaines = (!isNaN(v) && v >= 1) ? v : 5; saveSettings(); }); }
  if ($('setRdvJour')) { $('setRdvJour').value = S.rdvJourSemaine || ''; $('setRdvJour').addEventListener('change', (e) => { S.rdvJourSemaine = e.target.value; saveSettings(); }); }
  if ($('syncSecFile')) $('syncSecFile').addEventListener('change', () => { applySyncMode('file'); saveSettings(); });
  if ($('syncSecDrive')) $('syncSecDrive').addEventListener('change', () => { applySyncMode('drive'); saveSettings(); });
  applySyncMode(S.syncMode);
  if ($('setPays')) $('setPays').addEventListener('change', (e) => { S.pays = e.target.value; S.tvaRate = (PAYS_TVA[S.pays] || PAYS_TVA.be).std; if (paints.setTva) paints.setTva(); saveSettings(); });
  if ($('setDureeMode')) $('setDureeMode').addEventListener('change', (e) => { S.dureeAuto = e.target.value === 'auto'; saveSettings(); updateReglagesUI(); });
  $('setRepartition').addEventListener('change', (e) => { S.repartition = e.target.value; saveSettings(); });
  $('setProvider').addEventListener('change', (e) => { S.provider = e.target.value; saveSettings(); toggleKeyRow(); });
  $('setKey').addEventListener('input', (e) => { S.geoapifyKey = e.target.value.trim(); saveSettings(); });
  $('geocodeHome').addEventListener('click', async () => { const h = $('homeGeoHint'); h.textContent = 'Localisation…'; try { const g = await geocode(S.home); S.home.lat = g.lat; S.home.lon = g.lon; saveSettings(); h.textContent = 'Localisé ✔ (' + addrStr(S.home) + ')'; scheduleGeoRecalc(); } catch (e) { h.textContent = 'Erreur : ' + e.message; } });
}
function toggleKeyRow() { $('keyRow').style.display = S.provider === 'geoapify' ? 'block' : 'none'; }
// Sauvegarde / restauration : exporte réglages + articles + frais + données, ou importe une sauvegarde.
function modalBackup() {
  const dump = JSON.stringify(exportSnapshot(), null, 2);
  openModal(`<div class="modal-head"><b>💾 Sauvegarde / transfert</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Copiez ce texte pour sauvegarder. Pour transférer sur un autre appareil : collez la sauvegarde de l'autre appareil, puis <b>« Importer (fusion) »</b> — les données sont <b>fusionnées</b> (le plus récent gagne, les suppressions sont respectées), <b>sans écraser</b>.</p>
    <textarea id="bkText" class="bk-area" spellcheck="false">${esc(dump)}</textarea>
    <div class="actions two"><button class="btn" id="bkCopy">📋 Copier</button><button class="btn primary" id="bkMerge">🔀 Importer (fusion)</button></div>
    <div class="actions"><button class="btn danger block" id="bkImport">⚠ Importer (remplace tout)</button></div>
    <p class="hint">« Fusion » = recommandé pour synchroniser deux appareils. « Remplace tout » = restauration complète (écrase les données locales).</p>
    <p class="status" id="bkStatus"></p>`);
  $('mX').addEventListener('click', closeModal);
  $('bkCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('bkText').value); $('bkStatus').className = 'status ok'; $('bkStatus').textContent = 'Copié dans le presse-papier.'; } catch { $('bkText').select(); document.execCommand && document.execCommand('copy'); $('bkStatus').textContent = 'Sélectionné — Ctrl+C pour copier.'; } });
  $('bkMerge').addEventListener('click', () => {
    try {
      const o = JSON.parse($('bkText').value);
      // Compat : ancienne sauvegarde {tournees} → convertie en {tours}.
      if (!o.tours && Array.isArray(o.tournees)) o.tours = o.tournees;
      if (!o.settings || !Array.isArray(o.clients) || !Array.isArray(o.tours)) { $('bkStatus').className = 'status err'; $('bkStatus').textContent = 'Format non reconnu (settings/clients/tours attendus).'; return; }
      importSnapshotMerge(o);
      $('bkStatus').className = 'status ok'; $('bkStatus').textContent = 'Fusionné ✔ Rechargement…';
      setTimeout(() => location.reload(), 700);
    } catch (e) { $('bkStatus').className = 'status err'; $('bkStatus').textContent = 'JSON invalide : ' + e.message; }
  });
  $('bkImport').addEventListener('click', () => {
    if (!confirm('Remplacer TOUS vos réglages et données par cette sauvegarde ? (écrase l\'existant)')) return;
    try {
      const o = JSON.parse($('bkText').value);
      if (o.settings && typeof o.settings === 'object') LS.set('ftr.settings', o.settings);
      if (Array.isArray(o.clients)) LS.set('ftr.clients', o.clients);
      const tours = Array.isArray(o.tours) ? o.tours : (Array.isArray(o.tournees) ? o.tournees : null);
      if (tours) {
        const d = new Date(); d.setDate(d.getDate() - 28); const cutoff = d.toISOString().slice(0, 10);
        const isArch = (t) => (t.closed || (t.date || '') < todayStr()) && (t.date || '') < cutoff;
        LS.set('ftr.tournees', tours.filter((t) => !isArch(t)));
        LS.set('ftr.archive', tours.filter(isArch));
      }
      $('bkStatus').className = 'status ok'; $('bkStatus').textContent = 'Importé ✔ Rechargement…';
      setTimeout(() => location.reload(), 700);
    } catch (e) { $('bkStatus').className = 'status err'; $('bkStatus').textContent = 'JSON invalide : ' + e.message; }
  });
}
function refreshTarifTable() {
  const f = fuelPerKmHT(), base = baseVehiculeHT();
  if ($('fuelPerKm')) $('fuelPerKm').textContent = eurkm(f) + '/km';
  const tps = tempsPerKm();
  const comp = { tournee: { temps: 0, urg: 0 }, visite: { temps: tps, urg: 0 }, urgence: { temps: tps, urg: S.urgenceSuppKm } };
  ['tournee', 'visite', 'urgence'].forEach((t) => {
    const cap = t[0].toUpperCase() + t.slice(1);
    if ($('base' + cap)) $('base' + cap).textContent = eurkm(base);
    if ($('fuel' + cap)) $('fuel' + cap).textContent = eurkm(f);
    if ($('tps' + cap)) $('tps' + cap).textContent = comp[t].temps ? eurkm(comp[t].temps) : '—';
    if ($('urg' + cap)) $('urg' + cap).textContent = comp[t].urg ? eurkm(comp[t].urg) : '—';
    if ($('tot' + cap)) $('tot' + cap).textContent = eurkm(tarifHT(t));
    if ($('ttc' + cap)) $('ttc' + cap).textContent = eurkm(ttc(tarifHT(t)));
  });
  if ($('tempsHint')) $('tempsHint').innerHTML = `Temps de déplacement = ${eur(S.prixHeure)}/h ÷ ${S.kmHeure} km/h = <b>${eurkm(tps)}/km</b>.`;
  if ($('urgHint')) $('urgHint').innerHTML = `Supplément urgence ${eurkm(S.urgenceSuppKm)}/km ≈ <b>${eur(S.urgenceSuppKm * (S.kmHeure || 0))}/h</b> (à ${S.kmHeure} km/h).`;
}
// Met à jour tous les champs calculés (lecture seule) des Réglages / page Articles.
function updateReadouts() {
  const r = rate();
  const put = (id, val, dec) => { const e = $(id); if (e) { e.value = fmtNum(val, dec == null ? 2 : dec); fitSize(e); } };
  put('setPrixPleinHT', S.prixPleinL / (1 + r), 3);
  put('setAchatTTC', S.amortissement.achatHT * (1 + r), 0);
  put('setAmortHT', amortContribHT(), 3); put('setAmortTTC', ttc(amortContribHT()), 3);
  put('setForfaitTTC', ttc(S.forfait), 2);
  const seuilType = S.seuilTarifType || 'tournee';
  const tarif = tarifHT(seuilType), dep = S.seuilKm * tarif;
  put('setSeuilTarif', tarif, 3);
  put('setSeuilDepHT', dep, 2); put('setSeuilDepTTC', ttc(dep), 2);
  put('setFourbureTtc', ttc(S.fourbureHT), 2); put('setNpasTtc', ttc(S.npasHT), 2); put('setInfectionTtc', ttc(S.infectionHT), 2);
  put('setParageTtc', S.parage.prixHT * (1 + (S.parage.tvaPct || 0) / 100), 2);
  put('setPrixHeureTtc', ttc(S.prixHeure), 2); put('setTempsKmRo', tempsPerKm(), 3);
}
function updateReglagesUI() {
  const r = rate(); const ht = S.prixPleinL / (1 + r), tva = S.prixPleinL - ht;
  updateReadouts();
  if ($('pleinBreakdown')) $('pleinBreakdown').innerHTML = `Prix au litre — HT : <b>${eur(ht)}</b> · TVA : <b>${eur(tva)}</b> (TVAC ${eur(S.prixPleinL)}).`;
  // « Client proche » actif seulement en mode « par client » : tout le bloc seuil est grisé/inactif sinon (le Rayon reste actif, hors bloc).
  const seuilActive = S.repartition === 'parclient';
  const sb = $('seuilBlock');
  if (sb) { sb.classList.toggle('section-off', !seuilActive); sb.querySelectorAll('input, select').forEach((el) => { el.disabled = !seuilActive; }); }
  const vitMode = !S.dureeAuto;
  if ($('lblVitesse')) $('lblVitesse').style.opacity = vitMode ? '1' : '.45';
  if ($('setVitesse')) $('setVitesse').disabled = !vitMode;
  if ($('forfaitBreakdown')) $('forfaitBreakdown').innerHTML = seuilActive ? `Forfait TTC : <b>${eur(ttc(S.forfait))}</b> (HT ${eur(S.forfait)}).` : '';
  if ($('seuilNote')) $('seuilNote').textContent = seuilActive
    ? '« Client proche » : distance domicile→arrêt < seuil → forfait, sorti du partage.'
    : 'Seuil et forfait inactifs pour ce mode : tous les arrêts partagent le kilométrage.';
  if ($('amortHint')) {
    const dv = S.amortissement.dureeVieKm, kmAn = kmStats().annee;
    const ans = (dv > 0 && kmAn > 0) ? dv / kmAn : null;
    $('amortHint').innerHTML = amortContribHT() > 0
      ? `Amortissement = ${eur(S.amortissement.achatHT)} ÷ ${km(dv)} = <b>${eurkm(amortContribHT())}/km</b> (inclus dans la base).`
        + (ans ? ` À ${km(kmAn)}/an → <b>~${ans.toFixed(1)} an(s)</b> pour atteindre la durée de vie.` : (dv > 0 ? ' Roulez pour estimer la durée en années.' : ''))
      : 'Renseignez l\'achat et la durée de vie pour inclure l\'amortissement dans la base véhicule.';
  }
}
function refreshEverywhere() {
  $('fuelChip').textContent = '⛽ ' + eur(S.prixPleinL) + '/L';
  $('consoChip').textContent = '🚗 ' + (S.consoL100 || 0) + ' L/100';
  if ($('kmMonthChip')) $('kmMonthChip').textContent = '🗓 ' + km(kmStats().mois);
  const actifs = clients.filter(isClientActif);
  const nCh = actifs.reduce((s, c) => s + activeChevaux(c).length, 0);
  const ym = todayStr().slice(0, 7); const nT = allTours().filter((t) => (t.date || '').startsWith(ym)).length;
  if ($('clientsChip')) $('clientsChip').textContent = '👤 ' + actifs.length + ' Clients';
  if ($('chevauxChip')) $('chevauxChip').textContent = '🐴 ' + nCh + ' Chevaux';
  if ($('toursMonthChip')) $('toursMonthChip').textContent = '🗺 ' + nT + ' Tournées';
  refreshTarifTable(); updateReglagesUI();
  if ($('tab-accueil').classList.contains('active')) renderHome();
  // Note : vehicule / materiel / articles ne sont PAS re-rendus ici (édition inline = ne pas détruire les champs en cours de frappe).
  // Les champs calculés (TTC, tarifs) sont mis à jour par updateReglagesUI()/refreshTarifTable() ci-dessus.
  if ($('tab-reglages').classList.contains('active') && currentRsub === 'calcul') renderCalcul();
  if ($('tab-stats') && $('tab-stats').classList.contains('active')) renderStats();
}

// ================= BOOT =================
window.addEventListener('DOMContentLoaded', () => {
  checkForUpdate(); // vérifie une nouvelle version au lancement (ne bloque pas l'ouverture)
  applyTheme(); // couleur du thème (bandeau & boutons)
  const av = $('appVersion'); if (av) av.textContent = 'v' + APP_VERSION;
  const avTop = $('appVerTop'); if (avTop) avTop.textContent = 'v' + APP_VERSION;
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { showTab(b.dataset.goto); if (b.dataset.gsub) showGestion(b.dataset.gsub); if (b.dataset.rsub) showReglages(b.dataset.rsub); }));
  document.querySelectorAll('#gestionSub .subtab').forEach((b) => b.addEventListener('click', () => showGestion(b.dataset.gsub)));
  document.querySelectorAll('#reglagesSub .subtab').forEach((b) => b.addEventListener('click', () => showReglages(b.dataset.rsub)));
  document.querySelectorAll('#comptaSub .subtab').forEach((b) => b.addEventListener('click', () => showCompta(b.dataset.csub)));
  document.querySelectorAll('#agendaSub .subtab').forEach((b) => b.addEventListener('click', () => showAgenda(b.dataset.asub)));
  const agendaRefresh = async (statusEl) => { try { if (statusEl) { statusEl.className = 'status'; statusEl.textContent = 'Chargement du calendrier…'; } _agendaEvents = await fetchCalendarEvents(true); renderAgendaItems(); renderAgendaCalendrier(); if (statusEl) { statusEl.className = 'status ok'; statusEl.textContent = _agendaEvents.length + ' événement(s) chargé(s).'; } } catch (e) { if (statusEl) { statusEl.className = 'status err'; statusEl.textContent = 'Erreur : ' + e.message; } else alert('Erreur : ' + e.message); } };
  if ($('agendaRefresh')) $('agendaRefresh').addEventListener('click', () => agendaRefresh($('agendaStatus')));
  if ($('agendaRefresh2')) $('agendaRefresh2').addEventListener('click', () => agendaRefresh(null));
  if ($('navToggle')) $('navToggle').addEventListener('click', (e) => { e.stopPropagation(); $('mainTabs').classList.toggle('open'); });
  document.querySelectorAll('.subnav-current').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const n = b.closest('.subtabs'); if (n) n.classList.toggle('open'); }));
  document.addEventListener('click', (e) => {
    const t = $('mainTabs'); if (t && t.classList.contains('open') && !t.contains(e.target)) t.classList.remove('open');
    document.querySelectorAll('.subtabs.open').forEach((n) => { if (!n.contains(e.target)) n.classList.remove('open'); });
  });
  window.addEventListener('resize', updateStickyOffsets);
  updateStickyOffsets(); setTimeout(updateStickyOffsets, 300);
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  autoCloseOverdueTours(); // clôture auto des tournées démarrées oubliées (retour + 3 h)
  archiveOldTours(); // D2 : sort les tournées clôturées > 4 semaines du jeu actif
  bindSettings(); refreshEverywhere(); renderHome();

  if ($('btnRefreshTours')) $('btnRefreshTours').addEventListener('click', refreshActiveTours);
  $('btnVehicule').addEventListener('click', modalVehicule);
  $('btnAddFrais').addEventListener('click', () => { S.frais.push({ id: uid(), poste: '', nature: 'recurrent', montantHT: 0, kmPrevus: 0, kmDebut: odometer() }); saveSettings(); renderFraisVehicule(); });
  $('btnAddMateriel').addEventListener('click', () => { S.materiel.push({ id: uid(), libelle: '', montantHT: 0, nbChevaux: 1 }); saveSettings(); renderMateriel(); });
  $('btnNewArticleCat').addEventListener('click', () => { S.articlesCatalogue.push({ id: uid(), libelle: '', prixHT: 0, tvaPct: (PAYS_TVA[S.pays] || PAYS_TVA.be).std }); saveSettings(); renderArticlesCat(); });
  if ($('analyticDragBtn')) $('analyticDragBtn').addEventListener('click', () => toggleTileDrag('analyticOrder', $('analyticTiles'), $('analyticDragBtn')));
  if ($('statDragBtn')) $('statDragBtn').addEventListener('click', () => toggleTileDrag('statOrder', $('statTiles'), $('statDragBtn')));
  $('btnNewTour').addEventListener('click', newTour);
  $('btnNewTour2').addEventListener('click', newTour);
  $('btnNewClient').addEventListener('click', () => editClient(null));
  if ($('btnInstall')) $('btnInstall').addEventListener('click', async () => {
    const h = $('installHint');
    if (_deferredInstall) {
      _deferredInstall.prompt();
      try { const r = await _deferredInstall.userChoice; h.className = 'hint'; h.textContent = r.outcome === 'accepted' ? 'Installation lancée ✔ — l\'icône apparaît sur l\'écran d\'accueil.' : 'Installation annulée.'; } catch { /* ignore */ }
      _deferredInstall = null;
    } else {
      const ua = navigator.userAgent || '';
      if (/iPhone|iPad|iPod/i.test(ua)) h.innerHTML = 'Sur iPhone/iPad (Safari) : bouton <b>Partager</b> ⬆ → <b>« Sur l\'écran d\'accueil »</b>.';
      else if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) h.textContent = 'App déjà installée ✔ (vous l\'utilisez en mode application).';
      else h.innerHTML = 'Menu du navigateur (⋮) → <b>« Installer l\'application »</b> / <b>« Ajouter à l\'écran d\'accueil »</b>.';
    }
  });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); _deferredInstall = e; });
  if ($('btnBackup')) $('btnBackup').addEventListener('click', modalBackup);
  if ($('syncExport')) $('syncExport').addEventListener('click', downloadSnapshot);
  if ($('syncFile')) $('syncFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) importSyncFile(f, $('syncStatus')); e.target.value = ''; });
  if ($('googleConnect')) $('googleConnect').addEventListener('click', async () => { const h = $('googleStatus'); try { h.className = 'status'; h.textContent = 'Connexion…'; await googleToken(true); h.className = 'status ok'; h.textContent = 'Connecté ✔ — cliquez « Synchroniser ».'; } catch (e) { h.className = 'status err'; h.textContent = 'Erreur : ' + e.message; } });
  if ($('googleSyncBtn')) $('googleSyncBtn').addEventListener('click', () => googleSync(true, $('googleStatus'), true));
  // Synchro Drive automatique à l'ouverture (silencieuse, sans rechargement) si le mode Drive est actif et configuré.
  if (S.syncMode === 'drive' && S.googleAutoSync && S.googleClientId) { try { googleSync(false, $('googleStatus'), false); } catch { /* ignore */ } }
  // Agenda Google : rafraîchissement à l'ouverture (peut acquérir le jeton une fois, silencieux si déjà consenti).
  if (S.googleClientId) { try { agendaAutoSync(true); } catch { /* ignore */ } }
  if ($('btnAddAdresse')) $('btnAddAdresse').addEventListener('click', () => modalAdresse(null));
  if ($('edChangeHome')) $('edChangeHome').addEventListener('click', modalTourHome);
  if ($('edChangeArrivee')) $('edChangeArrivee').addEventListener('click', modalTourArrivee);
  if ($('edNom')) $('edNom').addEventListener('input', (e) => { if (currentTour) { currentTour.nom = e.target.value; saveTournees(); } });
  if ($('edClose')) $('edClose').addEventListener('click', () => {
    if (!currentTour || currentTour.closed) return;
    const blk = tourCloseBlock(currentTour);
    if (blk.length) { alert('🔒 Clôture bloquée — paiement à renseigner :\n\n• ' + blk.join('\n• ') + '\n\nOuvrez l\'arrêt concerné (bouton 💶 Paiement), choisissez virement/liquide (+ montant si liquide).'); return; }
    if (!confirm('Clôturer cette tournée ? Elle sera figée et ne pourra plus être modifiée.')) return;
    currentTour.closed = true;
    const i = tournees.findIndex((t) => t.id === currentTour.id); if (i >= 0) tournees[i] = currentTour; else tournees.push(currentTour);
    saveTournees(); openEditor();
  });
  $('edBack').addEventListener('click', () => showTab('tournees'));
  $('edAddArret').addEventListener('click', pickClientForArret);
  $('edMapBtn').addEventListener('click', showMapOnly);
  $('edReloc').addEventListener('click', forceRelocate);
  $('edDate').addEventListener('change', (e) => { currentTour.date = e.target.value; });
  $('edDate').addEventListener('click', (e) => { if (e.target.showPicker) { try { e.target.showPicker(); } catch { } } });
  $('edCalc').addEventListener('click', calcTour);
  $('edDelete').addEventListener('click', () => { if (confirm('Supprimer définitivement cette tournée ? (sa facture, ses stats et ses impayés liés sont aussi retirés)')) { clearTimeout(_geoTimer); const id = currentTour.id; currentTour = null; purgeTourData(id); tournees = tournees.filter((t) => t.id !== id); archive = archive.filter((t) => t.id !== id); saveTournees(); saveArchive(); showTab('tournees'); } });
  $('copyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(recapText(currentTour.result)); $('edStatus').className = 'status ok'; $('edStatus').textContent = 'Récap copié.'; } catch { $('edStatus').textContent = 'Copie impossible.'; } });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});
