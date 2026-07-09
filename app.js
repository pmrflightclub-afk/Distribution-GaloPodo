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
const APP_VERSION = '1.1.136';
const UPDATE_REPO = 'pmrflightclub-afk/Distribution-GaloPodo'; // dépôt GitHub des releases (vérif MAJ au lancement)
// Journal des versions (message de passage de version). Concis : quelques puces max par version.
const CHANGELOG = [
  {
    version: '1.1.136', date: '2026-07-09',
    ajouts: [
      'Compta → Mois en cours : nouveau bouton « 📅 Clôturer la caisse liquide → rattacher au mois précédent ». Coche les paiements liquide (sans facture) du mois en cours et rattache-les à un mois précédent (utile si le dépôt de caisse se fait après le 1ᵉʳ, ex. le 10). Les dates de tournées ne changent pas — seule la caisse comptable est déplacée. Réversible tant que la démarche liquide du mois cible n\'est pas figée.',
      'Déclaration compta : nouveau bouton « 🖨 PDF complet » (sous Trier par / Période) → un seul PDF reprenant TOUTES les sections (Liquide, Virements, Factures pro, Notes de crédit) sur la période choisie, détail par mois + récapitulatif de plage.',
      'Notes de crédit : la section est désormais toujours visible dans « Mois en cours » et « Déclaration compta » (même sans note ce mois-là) et possède son propre bouton 🖨 PDF. Elle est aussi incluse dans le PDF complet.',
      'Synchronisation Google Drive plus rapide : le coffre est désormais compressé (gzip) à l\'envoi (~5-10× plus léger) — lecture rétro-compatible avec les anciens coffres. L\'envoi automatique est sauté quand rien n\'a changé, et la taille envoyée est affichée pendant la synchro manuelle.',
    ],
  },
  {
    version: '1.1.135', date: '2026-07-09',
    ajouts: [
      'Frais véhicule : le champ « km dernier entretien » d\'un poste principal s\'appelle désormais « Kilométrage achat ». Les éléments liés n\'ont pas ce champ (repris automatiquement du principal).',
      'Le tarif au km (base véhicule HT/TTC + tarif indicatif) se recalcule maintenant en direct à chaque champ modifié (plus besoin de quitter la page). La section « prix unitaire » ne contient plus le bouton relevé compteur.',
      'Nouveau bouton en bas de page « ♻ Repartir à zéro » : réinitialise les frais à la structure par défaut (Entretien + Pièces + Réparation ; Pneus + Montage & équilibrage ; Plaquettes + Disques) sans toucher à l\'odomètre ni aux relevés.',
      'Nouvelle installation : frais livrés déjà organisés en types avec leurs éléments liés.',
      'Assistant « Régler l\'historique » : le menu « Lié au type » et les cartes affichent un identifiant #xxxx + le nom + la date, pour choisir le bon poste avec certitude (utile si deux postes ont le même nom).',
    ],
  },
  {
    version: '1.1.134', date: '2026-07-09',
    ajouts: [
      'Frais véhicule — assistant de migration tout-en-un (étape 3/3, Gestion → Statut véhicule → « 🧭 Régler l\'historique »). Pour chaque frais : rattachez-le à un type (Pièces/Réparation → Entretien, Montage → Pneus… pré-remplis) ou laissez-le type à part entière, réglez l\'état (Fait avec km + date, ou seulement la date → km estimé).',
      'Option « Amorcer le journal des frais réels » : enregistre les montants « Fait » comme factures d\'achat passées, pour que la stat « provision vs réel » soit juste dès le départ. À faire en une passe.',
    ],
  },
  {
    version: '1.1.133', date: '2026-07-09',
    ajouts: [
      'Frais véhicule — provision vs réel (étape 2/3) : chaque « Refaire » enregistre le coût réel (facture d\'achat) dans un journal.',
      'Stats → Utilisation véhicule : nouvelle section « 💶 Provision vs réel (charges véhicule) ». Elle compare, par type et au total (avec sélecteur d\'année), les provisions facturées aux clients (base €/km × km) et les frais réels payés → écart en vert (surplus) ou rouge (vous facturez trop peu). Objectif : ne pas travailler à perte.',
    ],
  },
  {
    version: '1.1.132', date: '2026-07-09',
    ajouts: [
      'Frais véhicule — Types (étape 1/3) : chaque frais est un « type » (Entretien, Pneus, Freins…). Un type peut regrouper des éléments (ex. Entretien + Pièces + Réparation ; Pneus + Montage & équilibrage). Champ « Lié au type » sur chaque frais pour le rattacher (ou le laisser type à part entière).',
      'Bouton « 🔄 Refaire ce type » : remet à zéro le poste principal ET tous ses éléments d\'un coup (même km/date). Bouton « ＋ Élément » pour ajouter un poste dans un type.',
      'On peut lier n\'importe quel poste à n\'importe quel type (plus seulement à « Entretien »). Étapes suivantes : journal des frais réels + stat « provision vs réel », puis assistant de migration.',
    ],
  },
  {
    version: '1.1.131', date: '2026-07-09',
    ajouts: [
      'Frais véhicule : un frais individuel (non lié) affiche « Km d\'achat / installation » (le point de départ de son décompte), et un entretien affiche « Km dernier entretien ». Un frais lié n\'a pas de champ km (il suit l\'entretien).',
      'Correction : modifier le km d\'un entretien met bien à jour tous ses frais liés à l\'écran (avant, l\'affichage des frais liés ne se rafraîchissait pas).',
      'Aide « je ne connais pas le km exact » : si vous renseignez une date sur un frais (ou dans l\'assistant de migration), le km est repris d\'un relevé de cette date, sinon estimé à partir de vos relevés et tournées.',
    ],
  },
  {
    version: '1.1.130', date: '2026-07-09',
    ajouts: [
      'Frais véhicule : la jauge affiche désormais « dernier à X km → prochain prévu à Y km (+ intervalle) ». Ce calcul = km du dernier entretien + intervalle, sans l\'odomètre. L\'odomètre actuel ne sert plus qu\'à afficher « ⚠ à renouveler » quand le prochain km est dépassé.',
      'Pré-remplissage : si vous mettez sur un frais une date qui correspond à un relevé compteur, le « km du dernier entretien » est repris automatiquement de ce relevé.',
    ],
  },
  {
    version: '1.1.129', date: '2026-07-09',
    ajouts: [
      'Accueil → carte « Nouveautés » : nouveau bouton « ✓ Tout lu » pour marquer toutes les versions comme lues d\'un coup (la carte disparaît).',
    ],
  },
  {
    version: '1.1.128', date: '2026-07-09',
    ajouts: [
      'Frais véhicule : l\'odomètre actuel estimé est affiché en haut de la page, avec un bouton « ＋ Relevé compteur » pour le déclarer directement.',
      'Si un frais ne peut pas calculer ses « km roulés » (odomètre actuel ≤ km du dernier entretien), il l\'indique clairement (« km actuel manquant… ») au lieu d\'afficher 0. Déclarez le km réel du compteur actuel et le calcul se fait pour tous les frais.',
    ],
  },
  {
    version: '1.1.127', date: '2026-07-09',
    ajouts: [
      'Frais véhicule : la jauge « km roulés / avant échéance » se recalcule maintenant en direct quand vous modifiez le km du dernier entretien ou l\'intervalle (km prévus).',
      'Rappel : « km roulés » = kilométrage actuel du compteur − km du dernier entretien. S\'il reste à 0, c\'est que le compteur actuel n\'est pas (ou plus) renseigné : déclarez un relevé dans Gestion → Statut véhicule (＋ Relevé) pour que les km parcourus s\'affichent.',
    ],
  },
  {
    version: '1.1.126', date: '2026-07-09',
    ajouts: [
      'Frais véhicule : tous les frais liés à un même entretien se regroupent bien sous lui (correction quand un lien pointait vers un entretien devenu introuvable — par ex. après une restauration de sauvegarde). Le regroupement est réappliqué au démarrage.',
      'Si un frais reste séparé, vérifiez son champ « Lié à l\'entretien » : il doit pointer vers le même entretien que les autres.',
    ],
  },
  {
    version: '1.1.125', date: '2026-07-09',
    ajouts: [
      'Frais véhicule : si vous modifiez le km ou la date d\'un entretien, ses frais liés (Pièces, Réparation…) sont mis à jour automatiquement (ils reprennent le km et la date du dernier entretien).',
    ],
  },
  {
    version: '1.1.124', date: '2026-07-09',
    ajouts: [
      'Gestion → Frais véhicule : chaque frais lié à un entretien (Pièces, Réparation…) se range désormais automatiquement juste sous l\'entretien auquel il est lié (légèrement en retrait).',
    ],
  },
  {
    version: '1.1.123', date: '2026-07-09',
    ajouts: [
      'Assistant « 🧭 Régler l\'historique » enrichi : sous chaque entretien, cochez les frais liés (Pièces et Réparation sont pré-cochés sous « Entretien »). Ils héritent du km/date de l\'entretien et se réinitialiseront avec lui — tout se règle en une seule passe.',
      'Réglez « Fait / À faire / Neuf » pour vos entretiens, cochez les frais liés, appliquez : le Statut véhicule devient juste et le couplage est en place pour la suite.',
    ],
  },
  {
    version: '1.1.122', date: '2026-07-09',
    ajouts: [
      'Frais véhicule : un frais exceptionnel (Pièces, Réparation…) peut être « lié à l\'entretien ». Un frais lié se remet à zéro automatiquement quand vous faites l\'entretien (même km + même date), n\'apparaît plus « à renouveler » tout seul, et s\'affiche sous la carte de l\'entretien. Il garde son propre montant et sa durée de vie pour le calcul du coût au km.',
      'Champ « Lié à l\'entretien » sur chaque frais exceptionnel (— indépendant / Entretien / …). Faire « ✅ Entretien fait » réinitialise l\'entretien ET tous ses frais liés d\'un coup.',
    ],
  },
  {
    version: '1.1.121', date: '2026-07-09',
    ajouts: [
      'Assistant « 🧭 Régler l\'historique des entretiens » (Gestion → Statut véhicule) : pour chaque frais, choisissez « Fait » (km + date du dernier entretien), « À faire » (reste à renouveler) ou « Neuf » (repart pour un cycle complet). Corrige d\'un coup les frais affichés « à renouveler » à tort. Idéal pour remettre vos données existantes d\'aplomb.',
    ],
  },
  {
    version: '1.1.120', date: '2026-07-09',
    ajouts: [
      'Frais véhicule : le champ « Km à l\'achat » devient « Km au dernier entretien » (avec une date). C\'est ce couple km + date qui décide si un frais est « à renouveler ».',
      'Nouveau bouton « ✅ Entretien fait » sur chaque frais : saisissez le km (par défaut le compteur actuel) et la date du dernier entretien ; le compteur repart de ce point. Vous pouvez cocher les autres frais faits en même temps (ex. plaquettes + disques, pneus + montage) et mémoriser ce regroupement (champ « Groupe »).',
      'Accueil → Statut véhicule : la section affiche le bouton de relevé, un seul frais à renouveler, puis « + N autre(s) » qui mène à la liste complète (Gestion → Statut véhicule).',
      'Note : pour remettre d\'aplomb vos frais déjà enregistrés (entretiens déjà faits mais affichés « à renouveler »), un assistant de migration arrive à la prochaine mise à jour ; en attendant, vous pouvez déjà utiliser « ✅ Entretien fait ».',
    ],
  },
  {
    version: '1.1.119', date: '2026-07-09',
    ajouts: [
      '« Trajet du jour » remonte encore : il est maintenant placé au-dessus de « Statut véhicule » (juste après le message de version). Ordre : Créer une tournée · version · Trajet du jour · Statut véhicule · Tournées dépassées · Rendez-vous à prendre · Compte rendu photo · À venir.',
    ],
  },
  {
    version: '1.1.118', date: '2026-07-09',
    ajouts: [
      'Accueil réorganisé : « Trajet du jour » remonte juste sous « Tournées dépassées » (après Créer une tournée / Message de version / Statut véhicule / Tournées dépassées). Ordre : Créer une tournée · version · véhicule · dépassées · Trajet du jour · Rendez-vous à prendre · Compte rendu photo · À venir.',
      'S\'il n\'y a pas de tournée aujourd\'hui, la section « Trajet du jour » s\'affiche en version réduite (compacte) ; en version normale dès qu\'il y a une tournée du jour.',
      'Le bouton « ❓ Comment ça marche » n\'apparaît qu\'une seule fois : au premier clic, il vous amène à la page « Calcul » puis disparaît définitivement.',
    ],
  },
  {
    version: '1.1.117', date: '2026-07-09',
    ajouts: [
      'Accueil → « Rendez-vous à prendre » : la section n\'affiche plus qu\'un seul cheval + la ligne « + N autre(s) · voir la liste complète » (2 lignes au lieu de 4), pour rester bien compacte.',
    ],
  },
  {
    version: '1.1.116', date: '2026-07-09',
    ajouts: [
      'Déclarer → Planche de contact : nouveau bouton « 📅 Créer depuis une tournée ». Choisissez une tournée (toutes sont proposées), cochez les clients et chevaux voulus (plusieurs possibles), et l\'app enchaîne une planche — et un PDF séparé — pour CHAQUE cheval.',
      'Les planches s\'enchaînent une par une (« cheval 1/3 », puis « ➡ Planche suivante ») pour ne pas surcharger l\'écran : vous préparez et générez la planche d\'un cheval, puis passez au suivant. Cheval, client et date sont repris automatiquement.',
      'Rappel : dans une tournée (bouton « 📷 Planche / compte rendu » d\'un arrêt), on traite toujours un seul cheval à la fois. Le regroupement multi-clients/chevaux n\'existe que dans « Déclarer » (planche centralisée).',
    ],
  },
  {
    version: '1.1.115', date: '2026-07-09',
    ajouts: [
      'Bandeau du haut : les widgets (⛽ 🚗 🗓 · 👤 🐴 🗺) sont rangés en grille alignée et leur texte est un peu plus petit (l\'icône garde sa taille). Les colonnes des deux lignes sont bien alignées.',
    ],
  },
  {
    version: '1.1.114', date: '2026-07-09',
    ajouts: [
      'Trajet du jour → « Agir » : nouvelle action « 📧 Email au client ». Joignez un PDF ou une image (planche/facture déjà enregistrée) → le partage s\'ouvre pour l\'envoyer par Gmail ; ou, sans pièce jointe, un email est préparé avec l\'adresse du client déjà remplie.',
    ],
  },
  {
    version: '1.1.113', date: '2026-07-09',
    ajouts: [
      'Dans une tournée (même clôturée), chaque arrêt a un bouton « 📷 Planche / compte rendu » : créez une planche de contact préremplie (cheval, client et date repris automatiquement) pour un cheval de l\'arrêt, ou ajoutez-le au « Compte rendu photo ».',
      'Nouvelle section Accueil « 📷 Compte rendu photo » : liste les chevaux dont une planche est à faire. « Créer la planche » ouvre la planche préremplie ; le cheval disparaît de la liste une fois la planche générée ou envoyée.',
      'Accueil → « Rendez-vous à prendre » : la section n\'affiche plus que les 3 premiers chevaux (+ « voir la liste complète ») pour rester compacte.',
    ],
  },
  {
    version: '1.1.112', date: '2026-07-09',
    ajouts: [
      'Planche de contact / avant-après : nouveau bouton « 📧 Envoyer par email ». L\'app génère un PDF de la planche (une page par page de la planche, avec vos photos, l\'en-tête et votre logo) et ouvre le partage → choisissez Gmail, le PDF est déjà joint.',
    ],
  },
  {
    version: '1.1.111', date: '2026-07-09',
    ajouts: [
      'Envoi par email des impayés et notes de crédit : dans Compta → Impayés et Compta → Notes de crédit, un bouton « 📧 Email » génère un PDF (uniquement les données de ce client) et ouvre le partage de votre téléphone → choisissez Gmail, le PDF est déjà joint. L\'adresse du client est rappelée dans le texte du mail.',
      'Une fois envoyé, le bouton passe en grisé avec ✓ et la date d\'envoi s\'affiche. La régularisation d\'un impayé et le remboursement d\'une note de crédit restent à confirmer manuellement (l\'élément quitte alors la liste « en attente » mais reste dans l\'historique).',
      'Astuce : le partage avec pièce jointe fonctionne surtout sur téléphone/tablette (partage natif). Sur ordinateur, le PDF est téléchargé.',
    ],
  },
  {
    version: '1.1.110', date: '2026-07-09',
    ajouts: [
      'Accueil → « Rendez-vous à prendre » : la section liste maintenant juste les noms (cheval — client), sans boutons. Touchez un cheval pour ouvrir la liste complète dans une fenêtre, avec pour chacun les boutons « Prendre un RDV », « Inactif » et « Liste noire ».',
    ],
  },
  {
    version: '1.1.109', date: '2026-07-09',
    ajouts: [
      'Stats : nouveau sous-onglet « Clientèle ». Il compte les clients (total / actifs / inactifs / liste noire), les chevaux (total / actifs / inactifs / liste noire) et les adresses de chevaux répertoriées (total / actives / inactives / liste noire).',
    ],
  },
  {
    version: '1.1.108', date: '2026-07-09',
    ajouts: [
      'Adresse en liste noire : à l\'enregistrement d\'un client, si une de ses adresses (client, société ou cheval) est en liste noire, vous êtes averti (confirmation avant d\'enregistrer).',
      'Dans les tournées : un arrêt situé à une adresse en liste noire est signalé visuellement (bord rouge + étiquette « ⛔ liste noire »), dans l\'éditeur de tournée et dans le Trajet du jour.',
    ],
  },
  {
    version: '1.1.107', date: '2026-07-09',
    ajouts: [
      'Nom d\'adresse par cheval (fiche client) : « même adresse que le client » → nom = nom du client ; « adresse de la société » → nom = société. Pour une adresse spécifique : cochez « Adresse privée » (nom = nom du client) ou saisissez un nom (ex. « Écurie du Nord »).',
      'Nouvelle page Gestion → « Adresses chevaux » (entre Mes adresses et Clients) : liste toutes les adresses des chevaux répertoriées, avec un filtre Actives / Inactives / Liste noire.',
      'Vous pouvez passer une adresse de cheval en Inactive ou en Liste noire depuis cette page (le statut s\'applique à tous les chevaux à cette adresse).',
    ],
  },
  {
    version: '1.1.106', date: '2026-07-09',
    ajouts: [
      'Formulaire (anamnèse / mail) plus lisible : chaque intitulé de référence est encadré et surligné, et la réponse du client s\'affiche en dessous, avec de l\'espace entre chaque question. Fini la confusion entre les questions et les réponses.',
    ],
  },
  {
    version: '1.1.105', date: '2026-07-09',
    ajouts: [
      'Statut des clients : un client peut être Actif, Inactif ou en Liste noire. La fiche client a une case « Liste noire » (client refusé). Seuls les clients ACTIFS sont proposés à la création des tournées et des arrêts.',
      'Gestion → Clients : filtre en haut de page (Actifs par défaut · Inactifs · Liste noire).',
      'Contact mail : deux nouveaux boutons « 💤 Créer (inactif) » et « ⛔ Créer (liste noire) ». Ils importent quand même toutes les infos (client + cheval + formulaire), mais créent le client en inactif (chevaux inactifs aussi) ou en liste noire.',
    ],
  },
  {
    version: '1.1.104', date: '2026-07-09',
    ajouts: [
      'Cohérence des noms : le sous-onglet « Tournée → Replacer un RDV » est renommé « Rendez-vous à prendre » (même nom que la section de l\'Accueil). Cette page reste l\'outil détaillé pour traiter tous les reports d\'un client d\'un coup.',
    ],
  },
  {
    version: '1.1.103', date: '2026-07-09',
    ajouts: [
      'Accueil simplifié : les sections « Replacer un RDV » et « Chevaux sans prochain RDV » sont fusionnées en une seule — « 📅 Rendez-vous à prendre ». Chaque cheval n\'y apparaît qu\'une seule fois (fini le doublon).',
      'Un cheval issu d\'un RDV reporté porte l\'étiquette « ↩ reporté ». Quand vous lui prenez un RDV, il sort automatiquement de la file des reports (marqué « replacé » dans les Annulations), comme avant.',
      'Chaque cheval garde ses actions : « 📅 Prendre un RDV », « 💤 Inactif » et « ⛔ Liste noire ». (La page détaillée Tournée → Replacer reste disponible pour traiter tous les reports d\'un client d\'un coup.)',
    ],
  },
  {
    version: '1.1.102', date: '2026-07-09',
    ajouts: [
      'Accueil réorganisé : « 📅 Replacer un RDV » et « 🐴 Chevaux sans prochain RDV » sont maintenant placés AVANT « Trajet du jour ».',
    ],
  },
  {
    version: '1.1.101', date: '2026-07-09',
    ajouts: [
      'Accueil : nouvelle section « 🐴 Chevaux sans prochain RDV » (visible seulement s\'il y en a). Elle liste tous les chevaux actifs (de clients actifs) qui n\'ont aucun rendez-vous à venir — par exemple ceux ignorés lors d\'un RDV, ou jamais replacés.',
      'Pour chaque cheval de la liste : « 📅 Attribuer un RDV » (choix d\'une date), « 💤 Inactif » (ne plus le proposer), ou « ⛔ Liste noire » (le passe en inactif et ne le propose plus). La liste noire est réversible depuis la fiche du client.',
      'Fiche client : chaque cheval a maintenant une case « Liste noire » (réversible).',
    ],
  },
  {
    version: '1.1.100', date: '2026-07-09',
    ajouts: [
      'RDV : chaque cheval peut maintenant être placé séparément. Par défaut, tous les chevaux vont sur le même RDV (une seule date commune). Devant chaque cheval, cochez « date différente » pour lui choisir un autre jour (un sélecteur de date apparaît), ou « ne pas replacer » pour l\'ignorer (il n\'est pas remis sur un RDV).',
      'Même fonctionnement dans « Replacer » (chevaux reportés depuis une annulation) : RDV commun par défaut, date différente ou ignorer, cheval par cheval.',
      'Comparaison de documents : nouveau choix de disposition — « côte à côte » OU « l\'une au-dessus de l\'autre ».',
    ],
  },
  {
    version: '1.1.99', date: '2026-07-09',
    ajouts: [
      'Le bouton « 🔧 Recalculer cette tournée » a été retiré : son rôle est désormais assuré automatiquement par « ✏️ Corriger les prestations ». Quand vous corrigez les prestations d\'une tournée clôturée, la facture est recalculée toute seule — et, si le calcul figé n\'est plus à jour, un recalcul complet depuis les adresses (via la carte) est fait automatiquement.',
    ],
  },
  {
    version: '1.1.98', date: '2026-07-09',
    ajouts: [
      'Réglages → Configuration → « Logo / identité (documents) » : ajoutez VOTRE logo. Choisissez une image, puis zoomez (curseur ou boutons ➕/➖) et déplacez-la dans le cadre (glisser) pour l\'ajuster. Ce cadrage est repris tel quel en en-tête des planches. Le logo est enregistré dans l\'app (contrairement aux photos de planche).',
      'Les planches de contact affichent désormais VOTRE logo en en-tête (si le logo est activé dans Gestion → Planche), à la place du logo de l\'application.',
      'Planche « Avant / après » (création) : bouton « ＋ Créer une planche » avec le type « Avant / après » sélectionné. Ajoutez une ou plusieurs dates de comparaison ; chaque date crée automatiquement deux lignes « Avant » et « Après ». Les colonnes sont les angles du modèle (3/4/5). Placement des photos, EXIF, aperçu et PDF comme la planche de contact.',
      'Comparaison de documents : bouton « 🔎 Comparaison documents » (Gestion → Planche). Importez deux images (planches déjà enregistrées, captures d\'écran…) : elles sont mises côte à côte, avec légendes et titre, sur une page à enregistrer en PDF. Rien n\'est stocké dans l\'app.',
    ],
  },
  {
    version: '1.1.97', date: '2026-07-08',
    ajouts: [
      'Contact mail : la récupération remonte encore plus loin (jusqu\'à 10 000 mails) pour couvrir toutes vos années d\'activité.',
      'Contact mail : les formulaires VIERGES (le modèle que vous envoyez au client, sans réponse) sont maintenant masqués — même s\'ils ont été envoyés depuis une autre adresse. Seuls les formulaires remplis reçus restent affichés.',
    ],
  },
  {
    version: '1.1.96', date: '2026-07-08',
    ajouts: [
      'Contact mail — mails anciens : la récupération parcourt maintenant TOUTES les pages Gmail (avant, seuls les 100 mails les plus récents remontaient, d\'où « rien avant 2023 »).',
      'Contact mail — vos envois masqués : l\'app mémorise l\'adresse du compte connecté et masque les mails que VOUS avez envoyés (formulaire vierge), y compris ceux importés avant l\'ajout du filtre.',
      'Contact mail — bouton intelligent : chaque mail indique « client connu » ou « nouveau », et met en avant le bon bouton (« Créer le client » pour un nouveau, « Mettre à jour [nom] » pour un client déjà en fiche).',
    ],
  },
  {
    version: '1.1.95', date: '2026-07-08',
    ajouts: [
      'Fenêtre « Arrondi de l\'encaissement liquide » plus claire : elle affiche désormais le TOTAL recalculé de chaque client, avec le détail (déplacement · matériel · articles) et l\'ancien montant encaissé, pour décider du montant arrondi en connaissance de cause.',
    ],
  },
  {
    version: '1.1.94', date: '2026-07-08',
    ajouts: [
      'Correctif clé (montant bloqué à l\'ancien total) : quand le total d\'un client payé en LIQUIDE change (correction de prestations, recalcul, ou annulation), l\'app redemande maintenant le montant liquide arrondi réellement encaissé. Avant, l\'ancien montant encaissé « écrasait » le nouveau total via l\'arrondi caisse (la facture restait par ex. à 74,54 € au lieu de 200,25 €).',
      'Arrondi caisse obligatoire pour tout paiement en liquide (avec ou sans facture) dès que le total change.',
    ],
  },
  {
    version: '1.1.93', date: '2026-07-08',
    ajouts: [
      'Correction « Corriger les prestations » : le recalcul de la facture est désormais TOUJOURS effectué (recalcul complet depuis les adresses si nécessaire) — avant, si la géométrie figée ne correspondait plus, les montants ne bougeaient pas. Un récapitulatif (déplacement, matériel, total) s\'affiche après enregistrement pour vérifier tout de suite.',
    ],
  },
  {
    version: '1.1.92', date: '2026-07-08',
    ajouts: [
      'Push RDV → Google Agenda : activez « Créer/mettre à jour mes RDV dans Google Agenda » (Réglages → Synchro). Chaque RDV pris ou modifié dans l\'app crée/met à jour automatiquement un évènement par client (heure, lieu, chevaux) ; un RDV retiré ou une tournée supprimée retire l\'évènement. L\'import agenda→app et le push app→agenda partagent la même connexion Google.',
      'Heure de RDV obligatoire : quand le push agenda est activé, une tournée ne peut être clôturée que si chaque client a une heure de RDV (l\'app vous indique lesquels il manque).',
      'Bouton « Pousser tous mes RDV à venir maintenant » pour synchroniser d\'un coup les tournées existantes. (Après cette mise à jour, une reconnexion Google unique est demandée pour ajouter le droit d\'écriture à l\'agenda.)',
    ],
  },
  {
    version: '1.1.91', date: '2026-07-08',
    ajouts: [
      'Correctif important (facture à 0 déplacement/matériel) : un cheval d\'une ancienne tournée sans prestation cochée (parage/visite) n\'était pas considéré comme « fait » → son déplacement et son matériel disparaissaient de la facture et ses stats étaient vides. Nouveau bouton « ✏️ Corriger les prestations » sur une tournée clôturée : cochez le parage / la visite réellement effectués (les chevaux concernés sont surlignés en orange), la facture (déplacement + matériel) et les statistiques sont aussitôt recalculées. Le trajet et les kilomètres ne changent pas.',
    ],
  },
  {
    version: '1.1.90', date: '2026-07-08',
    ajouts: [
      'Annulation — note de crédit : tout paiement par VIREMENT annulé génère désormais une note de crédit obligatoire (avec ou sans facture). Le liquide (avec ou sans facture) reste sans note de crédit.',
      'Annulation — arrondi liquide : quand vous annulez une partie de la facture d\'un client qui a payé en liquide (sans facture), l\'app vous demande le nouveau montant liquide arrondi réellement encaissé (le reste que vous gardez après avoir rendu la différence). Pour une facture ou un virement, les montants restent exacts.',
      'Bouton « Recalculer cette tournée » : affiche maintenant un diagnostic (km, tarif/km, déplacement, matériel, total) pour comprendre d\'où vient un montant faux. Envoyez-moi cette fenêtre si un montant reste incorrect.',
    ],
  },
  {
    version: '1.1.89', date: '2026-07-08',
    ajouts: [
      'Annuler une facturation (tournée clôturée) : nouveau bouton « 🚫 Annuler une facturation » sur une tournée figée. Vous choisissez précisément ce que vous retirez de la facture — un cheval, un arrêt, un client, ou toute la tournée (cases à cocher en cascade). Le trajet, les kilomètres, le temps et les autres clients ne changent PAS : seule la part facturée est retirée, et les statistiques (de la tournée et globales) sont mises à jour.',
      'Règles note de crédit à l\'annulation : virement + facture → note de crédit obligatoire (Compta → Notes de crédit). Liquide, liquide + facture, ou virement sans facture → la répartition est simplement retirée, SANS note de crédit (on ne présume pas d\'un remboursement du liquide).',
    ],
  },
  {
    version: '1.1.88', date: '2026-07-08',
    ajouts: [
      'Réparation de facture : sur une tournée clôturée (figée), un bouton « 🔧 Recalculer cette tournée » permet de recalculer entièrement les montants depuis les adresses (via la carte). À utiliser si une facture a été abîmée (frais de déplacement/matériel manquants, arrondi disparu). La tournée reste clôturée ; seuls les montants sont recalculés et refigés.',
    ],
  },
  {
    version: '1.1.87', date: '2026-07-08',
    ajouts: [
      'Contact mail : la récupération ne liste plus que les réponses reçues (vos propres mails envoyés sont exclus) et détecte aussi les formulaires reçus qui n\'ont pas l\'objet « prise de contact » (scan des étiquettes dans le corps). Ces deux comportements sont réglables dans Réglages → Mail.',
      'Contact mail : nouveau bouton « 👁 Voir » pour lire le mail (corps + infos extraites) avant de décider du statut.',
      'Contact mail : nouveau bouton « 🔄 Mettre à jour un client » — propose les infos du mail comme modifications à cocher sur une fiche existante, SANS écraser les données déjà connues (les champs déjà remplis ne sont pas cochés par défaut).',
      'Gestion → Contact mail : le bouton « Connecter Gmail » a été retiré (la connexion se fait dans Réglages → Mail).',
      'Un clic sur le bandeau du haut (logo + widgets) ramène à l\'Accueil.',
    ],
  },
  {
    version: '1.1.86', date: '2026-07-08',
    ajouts: [
      'Google : Drive, Agenda et Gmail partagent maintenant UNE SEULE connexion (un seul jeton mutualisé). Après cette mise à jour, une reconnexion unique est demandée, puis les 3 fonctionnent ensemble sans redemander de jeton. (Pensez à avoir activé l\'API Gmail dans votre console Google Cloud.)',
    ],
  },
  {
    version: '1.1.85', date: '2026-07-08',
    ajouts: [
      'Planche de contact — création (étape 2/4) : le bouton « ＋ Créer une planche » (Gestion → Planche, et Déclarer → « Planche de contact ») ouvre l\'écran de création.',
      'Importez vos photos (bouton « Importer des photos ») : elles restent dans la mémoire de l\'app le temps de la création et ne sont JAMAIS enregistrées ni synchronisées (elles restent dans la galerie du téléphone).',
      'Placez chaque photo dans la grille : touchez une vignette pour la sélectionner, puis touchez la case voulue (ligne = membre/page, colonne = angle du modèle 3/4/5). Touchez une case remplie pour la vider. Le glisser-déposer fonctionne aussi sur ordinateur.',
      'La date de prise de vue est lue automatiquement dans la photo (EXIF), corrigeable à la main, avec une case « jour » (met la date du jour).',
      'En-tête (cheval, client, date), note en bas de page, logo optionnel et orientation (paysage par défaut) repris du paramétrage. Multi-pages géré (une page par groupe de lignes configuré).',
      'Génération du PDF via l\'impression du navigateur (« Enregistrer en PDF ») : l\'appareil choisit le dossier d\'enregistrement. Aucune image ni PDF n\'est conservé dans l\'app.',
      'Correctif important : le bouton « Recalculer toutes les tournées » ne recalcule PLUS les montants (il pouvait faire sauter le déplacement/matériel d\'une facture). Il ne fait plus que rafraîchir les stats et réparer les impayés/arrondis orphelins. Pour recalculer une facture, ouvrez la tournée (recalcul complet à l\'ouverture).',
    ],
  },
  {
    version: '1.1.84', date: '2026-07-08',
    ajouts: [
      'Correctif « Recalculer toutes les tournées » : il ne modifie plus la répartition facture des tournées clôturées/archivées (elle reste figée) ; il ne recalcule les montants que des tournées d\'aujourd\'hui / à venir, et nettoie les stats + impayés orphelins.',
      'Correctif arrondi caisse aberrant : un arrondi devenu incohérent (> 10 €, suite à un recalcul antérieur) est réinitialisé automatiquement. Relancez « Recalculer toutes les tournées » pour corriger un arrondi déjà faussé.',
    ],
  },
  {
    version: '1.1.83', date: '2026-07-08',
    ajouts: [
      'Réglages : le sous-onglet « Sauvegarde » est déplacé en dernière position (après « Changelog »).',
    ],
  },
  {
    version: '1.1.82', date: '2026-07-08',
    ajouts: [
      'Nouveau module Contact mail (Gmail) : Réglages → « Mail » (mots-clés, ex. « prise de contact » + Connecter Gmail + Récupérer) et Gestion → « Contact mail » (liste des mails récupérés, statut, Ignorer, et « Créer le client » pré-rempli). Les mails déjà traités/ignorés ne sont jamais ré-importés (pas de doublon).',
      '« Créer le client » extrait automatiquement du formulaire : nom, prénom, société, TVA, adresse, email (l\'expéditeur), téléphone, et 1 cheval (nom, naissance, race). Le formulaire complet est rangé comme « anamnèse » sur la fiche du cheval (bouton 📄 Formulaire).',
      'Fiche client : nouveaux champs Email et Téléphone. Fiche cheval : champ Race.',
    ],
  },
  {
    version: '1.1.81', date: '2026-07-08',
    ajouts: [
      'Nouveau bouton « 🔄 Recalculer toutes les tournées » (Réglages → Sauvegarde) : recalcule toutes les tournées (même clôturées) avec les tarifs/logique actuels et répare les impayés orphelins — pour rafraîchir factures, stats et compta après une mise à jour, sans repasser par le retour usine.',
      'Correctif impayé fantôme : quand vous supprimez une tournée, l\'impayé de test qui avait été reporté sur une autre tournée est maintenant retiré partout (avant, une ligne « impayé » orpheline pouvait rester et continuer à facturer un montant). Le bouton « Recalculer » nettoie aussi les cas déjà présents.',
    ],
  },
  {
    version: '1.1.80', date: '2026-07-08',
    ajouts: [
      'Menu « Déclarer » réorganisé : Créer un client · Planche de contact · Valider un plein · Corriger la consommation · Frais de matériel · Frais véhicule · Statut véhicule · Synchroniser.',
      'Planche contact (paramétrage) : Avant/après passe en colonnes (angles) avec modèle 3/4/5 comme la planche contact. Gestion multi-pages : chaque type a des pages (page 1 = les pieds, page 2 = le cheval par défaut), avec bouton « Ajouter une page » ; lignes et colonnes toujours renommables, réordonnables, ajoutables.',
    ],
  },
  {
    version: '1.1.79', date: '2026-07-08',
    ajouts: [
      'Nouveau module « Planche contact » (photos) — étape 1 : Gestion → sous-onglet « Planche contact » pour paramétrer les deux types (Planche contact, Avant/après). Orientation (paysage par défaut), logo optionnel, et surtout les lignes (membres) et colonnes (angles de vue) : renommables, réordonnables (▲▼) et ajoutables. Modèles 3 / 4 / 5 incidences pour la planche contact ; 2 / 4 / 6 photos par ligne pour l\'avant/après.',
      'La création des planches (sélection de photos, grille, PDF) arrive à l\'étape suivante. Rappel : les photos et les PDF ne sont jamais stockés dans l\'app.',
    ],
  },
  {
    version: '1.1.78', date: '2026-07-08',
    ajouts: [
      'Durée de tournée : la tuile « Durée » utilise maintenant le temps de trajet RÉEL encodé (bouton Route par arrêt + retour) là où il existe, et l\'estimation ailleurs — au lieu d\'une estimation pure.',
      'Arrondi de caisse (liquide) : le Total HT, la TVA, le Total TTC en haut de la tournée ET la section Analytique tiennent maintenant compte de l\'arrondi (avant, seul le pied de facture le faisait). Le montant se recalcule bien partout.',
    ],
  },
  {
    version: '1.1.77', date: '2026-07-08',
    ajouts: [
      'Stats → Suivi chevaux : nouvelle section « Offerts & remises » (sous le filtre Mois/Trim/Sem/Année) — nombre de prestations offertes et remisées, part en % des lignes facturées, total offert et total des remises accordées, avec le détail (date, client, prestation, cheval, offert ou %).',
    ],
  },
  {
    version: '1.1.76', date: '2026-07-08',
    ajouts: [
      'Trajet du jour → ⚡ Agir : la modale affiche maintenant le statut ✓ vert des boutons déjà faits/encodés (Heure RDV, Route, Prêt, Paiement, RDV), comme dans la carte d\'arrêt.',
      '⚡ Agir enrichi : nouveaux boutons Heure RDV (saisie de l\'heure de chaque cheval), Prêt, Paiement et RDV, en plus de Waze / Route / SMS / Ticket.',
      'Éditeur de tournée : le bouton « Prêt » est remonté sur la barre de l\'arrêt, à droite de « RDV ».',
    ],
  },
  {
    version: '1.1.75', date: '2026-07-08',
    ajouts: [
      'Facture d\'un arrêt : Parage, Visite, Fourbure, NPAS et Infection s\'affichent maintenant comme lignes d\'articles distinctes, une par cheval, dans l\'ordre des cases (avant les articles manuels).',
      'Nouvelle case « Offrir » sur chaque ligne (à côté de « Remise »), cheval par cheval : elle met le montant de la ligne à 0. La facture, le récap et le ticket se mettent à jour automatiquement.',
    ],
  },
  {
    version: '1.1.74', date: '2026-07-08',
    ajouts: [
      'Correctif « Trajet du jour » vide : l\'app utilise désormais votre date LOCALE pour « aujourd\'hui » (avant : heure UTC). En fuseau +1/+2, une tournée du jour pouvait être considérée comme « à venir » et ne pas apparaître dans le Trajet du jour — c\'est corrigé.',
    ],
  },
  {
    version: '1.1.73', date: '2026-07-08',
    ajouts: [
      'Statut véhicule : le relevé du compteur a maintenant un champ Date. Vous pouvez saisir une date passée pour ajouter un relevé antérieur (rétroactif) — pratique au démarrage. Les écarts (usage privé) sont recalculés automatiquement, y compris entre relevés.',
    ],
  },
  {
    version: '1.1.72', date: '2026-07-08',
    ajouts: [
      'Gestion → Statut véhicule : les frais à renouveler (épuisés) sont aussi listés ici, avec leur bouton « ♻ Renouveler » — ils restent traçables même après avoir été traités depuis l\'Accueil.',
    ],
  },
  {
    version: '1.1.71', date: '2026-07-08',
    ajouts: [
      'Stats → Suivi chevaux : nouvelles statistiques générales par Mois / Trimestre / Semestre / Année (tournées, déplacements, chevaux servis, parage, visite, fourbure, NPAS, infection).',
      'Répartition des chevaux par tranche d\'âge et par durée de prise en charge (comptages).',
      'Réglages → « Statistiques » (nouveau, entre Analyse et Thème) : modifiez et ajoutez librement les tranches d\'âge et de prise en charge utilisées pour ces comptages.',
    ],
  },
  {
    version: '1.1.70', date: '2026-07-08',
    ajouts: [
      'Réglages → Configuration : suivi de l\'amortissement du véhicule. Nouveaux champs date d\'achat et mise en circulation, et un récap : progression (odomètre estimé ÷ durée de vie), montant amorti / reste à amortir, âge du véhicule, km/an, et usage privé cumulé.',
    ],
  },
  {
    version: '1.1.69', date: '2026-07-08',
    ajouts: [
      'Statut véhicule (km réel) : nouveau bouton dans « Déclarer » et section en tête d\'Accueil pour saisir le kilométrage réel du compteur. L\'app affiche un odomètre ESTIMÉ (dernier relevé réel + km des tournées depuis) et se recale à chaque relevé — le réel et l\'estimé ne sont jamais confondus.',
      'Rappel mensuel : la section Accueil « Statut véhicule » réapparaît chaque mois tant que le relevé du mois n\'est pas saisi, et affiche aussi les frais à renouveler (bouton par frais). Elle disparaît une fois tout traité.',
      'Nouvelle page Gestion → « Statut véhicule » (après Frais véhicule) : historique mensuel des relevés (km + date) et « usage privé » (écart estimé/réel = km hors tournées).',
    ],
  },
  {
    version: '1.1.68', date: '2026-07-08',
    ajouts: [
      'Frais véhicule : chaque frais a maintenant un champ « Date » (achat / installation), en plus du « Km à l\'achat ».',
      'Un frais exceptionnel épuisé devient inactif (grisé) et sort automatiquement de la base véhicule au km — le prix unitaire HT/TTC en haut de page se met à jour. Bouton « ♻ Renouveler » pour repartir sur un nouveau cycle (nouvelle date + km actuel), ou créez-en un nouveau.',
    ],
  },
  {
    version: '1.1.67', date: '2026-07-08',
    ajouts: [
      'Manque à gagner plus juste : un cheval reporté puis replacé (servi à une autre date) n\'est plus compté comme une perte dans les Annulations et les Statistiques. Il reste visible, marqué « replacé ».',
      'Accueil → Tournées dépassées : les boutons « Récupérer / Reporter / Supprimer » sont désormais empilés l\'un au-dessus de l\'autre, alignés à droite, pour ne plus écraser le titre de chaque ligne.',
    ],
  },
  {
    version: '1.1.66', date: '2026-07-07',
    ajouts: [
      'Fiche cheval : nouveau champ « Date de naissance » (Gestion → client).',
      'Statistiques : nouveau sous-onglet « Suivi chevaux » (en 1ʳᵉ position) qui liste chaque cheval avec son âge (depuis la date de naissance) et sa durée de prise en charge, en mois ou en années et mois.',
    ],
  },
  {
    version: '1.1.65', date: '2026-07-07',
    ajouts: [
      'Temps de travail (tournées récupérées) : la durée de consultation saisie pour chaque cheval est désormais attribuée exactement à ce cheval (plus de moyenne entre clients d\'un même arrêt). Le temps de trajet, lui, reste réparti par arrêt.',
    ],
  },
  {
    version: '1.1.64', date: '2026-07-07',
    ajouts: [
      'Tournées dépassées : nouveau bouton « ♻ Récupérer » pour une ancienne tournée (encodée & clôturée avant le suivi de tournée) qui apparaissait à tort comme « non démarrée ». Elle est figée à sa date (arrêts non modifiables) et sort de la liste des dépassées.',
      'Compléter les stats d\'une tournée récupérée : un panneau permet de saisir, par arrêt, l\'heure de RDV et le temps de route réel, et par cheval la durée de consultation, plus le temps de retour. Ces données alimentent le Temps de travail et le Temps de trajet (rouvrable via « 📊 Compléter les stats » dans la tournée).',
    ],
  },
  {
    version: '1.1.63', date: '2026-07-07',
    ajouts: [
      'Tournée → Annulations : la page s\'ouvre par défaut sur le trimestre en cours, classée par mois. Une 2ᵉ section « Autres annulations (hors période) » liste, toujours classées par mois/année, toutes les annulations encore présentes (non supprimées) en dehors de la période choisie — plus rien n\'est caché.',
    ],
  },
  {
    version: '1.1.62', date: '2026-07-07',
    ajouts: [
      'SMS (Trajet du jour → ⚡ Agir → SMS) : une petite fenêtre s\'ouvre avant la copie pour choisir la formule « Politesse » (Mr/Mme + nom) ou « Standard » (prénom), avec aperçu. Le choix est pré-coché selon la fiche du client (par défaut : politesse) et il est mémorisé dans la fiche pour les prochaines fois.',
    ],
  },
  {
    version: '1.1.61', date: '2026-07-07',
    ajouts: [
      'Statistiques : la vue « Km & heures par client › cheval » a son propre sous-onglet « Véhicule par cheval » (entre « Utilisation véhicule » et « Temps de trajet »), pour une lecture plus claire.',
    ],
  },
  {
    version: '1.1.60', date: '2026-07-07',
    ajouts: [
      'Règle comptable clarifiée : un RDV DÉJÀ PAYÉ puis annulé ne peut plus être « rétabli » (on ne modifie jamais une facture encaissée ni sa note de crédit). Si vous devez refacturer ce cheval, ajoutez-le manuellement à un arrêt d\'une tournée — la comptabilité repart alors proprement.',
      'Rétablir reste possible normalement pour un RDV annulé NON payé.',
    ],
  },
  {
    version: '1.1.59', date: '2026-07-07',
    ajouts: [
      'Import « Données seules » plus sûr : le statut comptable (période verrouillée, démarche effectuée, paiements reçus) est désormais conservé lors de l\'import — après un retour usine, une période déjà validée reste protégée (on ne peut pas y annuler par erreur).',
      'Nettoyage interne (aucun changement visible) : suppression d\'un ancien écran de report de tournée devenu inutilisé depuis la page « Replacer un RDV ».',
    ],
  },
  {
    version: '1.1.58', date: '2026-07-07',
    ajouts: [
      'Statistiques plus justes : un RDV payé puis annulé (remboursé par note de crédit) n\'est plus compté dans les analyses de vente (Analyse par client, Analyse par cheval) — il n\'y fausse plus le chiffre réel.',
      'Nouvelle section dans Stats → Annulations : « ↩ Factures payées annulées (note de crédit) » qui liste ces RDV à part (montant réellement facturé, remboursé ou non), séparément du « manque à gagner » (annulations non payées).',
    ],
  },
  {
    version: '1.1.57', date: '2026-07-07',
    ajouts: [
      'Correctif comptable important : quand vous annulez un RDV déjà payé, la note de crédit et la facture ne se déduisent plus deux fois. La facture encaissée reste intacte et la note de crédit la neutralise exactement (chiffre d\'affaires net juste, même après avoir rouvert la tournée).',
      'La note de crédit reprend désormais le montant RÉELLEMENT facturé au cheval (réduction liquide/client incluse), pas le tarif plein : le remboursement colle à ce qui a été encaissé.',
      'Rétablir un RDV payé annulé supprime automatiquement sa note de crédit (bloqué proprement si elle a déjà été remboursée).',
    ],
  },
  {
    version: '1.1.56', date: '2026-07-07',
    ajouts: [
      'Sauvegarde / transfert enrichi : bouton « ⬇️ Télécharger » (fichier daté), « 🏭 Retour réglages d\'usine » (repart à zéro après export), et import « 📥 Données seules » (récupère tournées + clients + annulations + notes de crédit en gardant vos réglages actuels — idéal pour repartir sur une base saine).',
      'Les tournées importées sont « à revalider » : ouvrez-les une par une (même clôturées) pour vérifier chaque arrêt, puis « ✓ Valider » pour recalculer et figer. Vous contrôlez chaque encodage.',
    ],
  },
  {
    version: '1.1.55', date: '2026-07-07',
    ajouts: [
      'Notes de crédit : annuler un RDV DÉJÀ PAYÉ crée automatiquement une note de crédit (la facture encaissée n\'est jamais modifiée). Nouveau sous-onglet Compta « Notes de crédit » : liste « à rembourser » / « remboursées », bouton « ✓ Remboursée » (virement) qui fige la note, et PDF imprimable à envoyer au client.',
      'Les notes de crédit réduisent le chiffre d\'affaires de leur période (Compta + Déclaration affichent le total net).',
      'Sécurité comptable : impossible d\'annuler un RDV dont la démarche comptable de la période est déjà validée.',
    ],
  },
  {
    version: '1.1.54', date: '2026-07-07',
    ajouts: [
      'Replacer un RDV : les chevaux dont le RDV a été reporté sont regroupés par client, dans un nouveau sous-onglet « Replacer un RDV » (onglet Tournée) et dans une section « 📅 Replacer un RDV » sur l\'Accueil (entre Trajet du jour et À venir). Un bouton « Fixer une date » place tous les chevaux reportés du client sur une tournée (existante ou nouvelle) ; le client quitte alors la liste.',
      'Une tournée dépassée jamais démarrée : le bouton « Reporter » bascule désormais tous ses RDV en « reporté » → ils rejoignent « Replacer un RDV ».',
    ],
  },
  {
    version: '1.1.53', date: '2026-07-07',
    ajouts: [
      'Statistiques : nouveau sous-onglet « Annulations » — manque à gagner par client et par cheval (détaillé), comptage annulés / reportés et par motif (client / pro), graphiques par mois et répartition, avec le filtre Mois / Trimestre / Semestre / Année.',
    ],
  },
  {
    version: '1.1.52', date: '2026-07-07',
    ajouts: [
      'Onglet Tournée réorganisé en sous-onglets : Tournées · Replacer un RDV · Annulations.',
      'Nouvelle page « Annulations » : la liste de tous les RDV annulés / reportés (cheval, client, date, motif, montant « manque à gagner »), avec filtre Mois / Trimestre / Semestre / Année et un bouton pour supprimer définitivement une ligne (elle disparaît alors des listes et des stats).',
    ],
  },
  {
    version: '1.1.51', date: '2026-07-07',
    ajouts: [
      'Annulation / report (2ᵉ étape) : un RDV annulé retire aussi les éventuels articles/produits liés à ce cheval de la facture. L\'annulation se répercute désormais partout — facture, stats, compta, graphiques, ticket — sans toucher aux autres clients ni au calcul de la tournée.',
    ],
  },
  {
    version: '1.1.50', date: '2026-07-07',
    ajouts: [
      'Annulation / report d\'un RDV (1ʳᵉ étape) : dans un arrêt, un bouton ⊘ par cheval permet d\'ANNULER ou de REPORTER son rendez-vous, avec le motif (client / professionnel) et une note. Le cheval reste listé (barré, badge « annulé » / « reporté ») mais sa part est retirée de la facture et des stats — sans changer les autres clients ni le calcul de la tournée. « ↩ Rétablir » possible.',
      'Si le RDV a déjà été payé, l\'annulation renverra vers une note de crédit (fonction ajoutée dans la prochaine mise à jour).',
    ],
  },
  {
    version: '1.1.49', date: '2026-07-07',
    ajouts: [
      'Section « Tournées dépassées » (au-dessus du Trajet du jour) : elle n\'apparaît plus pendant une tournée normale du jour — uniquement pour les tournées dont le jour est passé sans clôture.',
      'Tournée dépassée démarrée → bouton « Finaliser » (les arrêts restants). Tournée dépassée jamais démarrée → « Reporter » (replacer chaque client à une nouvelle date : inséré dans la tournée de cette date, ou nouvelle tournée) ou « Supprimer ».',
      'Trajet du jour : chaque arrêt affiche son statut d\'avancement (à finaliser / en attente / à cocher un cheval / clôturé) et l\'arrêt en cours est mis en évidence, pour voir d\'un coup d\'œil ce qu\'il reste à faire.',
    ],
  },
  {
    version: '1.1.48', date: '2026-07-07',
    ajouts: [
      'Une tournée démarrée mais non finalisée reste modifiable (elle n\'est plus figée automatiquement le lendemain), pour que vous puissiez toujours finaliser ses arrêts restants. Elle reste visible dans « Trajet du jour » jusqu\'à sa clôture.',
      'Dans une telle tournée, seuls les arrêts déjà clôturés sont verrouillés (🔒 clôturé, lecture seule) ; les arrêts encore ouverts restent modifiables.',
    ],
  },
  {
    version: '1.1.47', date: '2026-07-07',
    ajouts: [
      'Prêt d\'un objet au client : bouton « ＋ Prêt » dans l\'arrêt (au-dessus de « + Article »). Vous notez l\'objet prêté ; il est rappelé aux prochaines tournées de ce client, sous les articles (hors facture), avec les boutons « Maintenir » et « Récupéré ». Une fois récupéré, la mémoire du prêt disparaît.',
      'Sécurité : on ne peut pas payer/clôturer un arrêt tant qu\'aucun cheval n\'a « Parage » ou « Visite » coché (sauf client sans cheval = déplacement seul).',
      'Un arrêt clôturé est verrouillé dans « Trajet du jour » (l\'heure de fin de visite ne bouge plus) ; les corrections se font en rouvrant la tournée ou via la Compta.',
      'Section « Arrêts à finaliser » élargie : elle couvre les tournées en cours et dépassées (démarrées, non clôturées), jamais les tournées à venir.',
    ],
  },
  {
    version: '1.1.46', date: '2026-07-07',
    ajouts: [
      'Ordre de tournée imposé : dans « Trajet du jour », tant qu\'un arrêt n\'est pas finalisé (💶 Paiement & clôture), les boutons de l\'arrêt SUIVANT (Agir, Paiement) restent désactivés. On valide chaque arrêt avant de passer au suivant.',
      'Clôture de tournée verrouillée : une tournée ne peut être clôturée — ni manuellement, ni automatiquement (+3 h) — que si TOUS ses arrêts sont finalisés. Sinon elle reste ouverte jusqu\'à ce que vous régliez les arrêts manquants.',
      'Nouvelle section « ⚠ Arrêts à finaliser » au-dessus du Trajet du jour : elle apparaît quand une tournée dépassée est bloquée par des arrêts non finalisés, et propose un bouton pour finaliser directement le prochain arrêt.',
    ],
  },
  {
    version: '1.1.45', date: '2026-07-07',
    ajouts: [
      'Visite : cocher « Visite » sur un cheval ouvre désormais une fenêtre pour choisir la prestation dans le catalogue. Une fois choisie, elle s\'affiche sous le tableau de l\'arrêt avec un bouton « Modifier » pour la changer.',
      'Fenêtre de paiement sécurisée : le bouton « Enregistrer » reste bloqué tant qu\'un champ obligatoire manque (mode de paiement non choisi, montant liquide vide, ou — si « paiement partiel » est coché — montant impayé non renseigné). Un message indique ce qu\'il reste à compléter.',
      'Trajet du jour : le paiement clôture l\'arrêt. Le bouton devient « 💶 Paiement & clôture » ; enregistrer un paiement valide marque l\'arrêt comme terminé (heure de fin = 1ʳᵉ validation). Impossible de clôturer un arrêt tant que le paiement est incomplet. On peut clôturer avec un reste impayé, à condition d\'en saisir le montant.',
    ],
  },
  {
    version: '1.1.44', date: '2026-07-07',
    ajouts: [
      'Grille de l\'arrêt simplifiée : la colonne « Présent » disparaît. Tous les chevaux du client sont listés ; un cheval est compté et facturé dès que « Parage » OU « Visite » est coché (les deux prestations qui rattachent un cheval à la tournée).',
      'La colonne « Visite » est placée juste après « Parage ».',
      'Fourbure / NPAS / Infection s\'activent désormais dès que Parage OU Visite est coché (avant : Parage seul).',
      'Paiement partiel : si « reste impayé » est coché sans montant, le paiement reste non finalisé (bouton pas en ✓) et la clôture de la tournée est bloquée tant que le montant impayé n\'est pas renseigné.',
    ],
  },
  {
    version: '1.1.43', date: '2026-07-07',
    ajouts: [
      'Bouton « 💶 Paiement » d\'un arrêt : une fois le paiement complètement renseigné (mode choisi, et montant liquide si liquide) pour tous les clients de l\'arrêt, il s\'affiche grisé avec ✓ — comme Route et RDV. Il reste cliquable pour corriger.',
    ],
  },
  {
    version: '1.1.42', date: '2026-07-07',
    ajouts: [
      'Grille de l\'arrêt : la colonne « Parage/Équil. » est raccourcie en « Parage » (gagne de la largeur). Nouvelle légende sous le tableau qui explique chaque colonne : Présent, Parage, Fourbure/NPAS/Infection, Visite.',
    ],
  },
  {
    version: '1.1.41', date: '2026-07-07',
    ajouts: [
      'Nouveau bouton « ⬇️ Mettre à jour l\'application » dans « Déclarer un événement » (en dernier) : il cherche une version plus récente publiée et met l\'app à jour à la demande. Si vous avez déjà la dernière, un « Forcer le rechargement » est proposé. Vos données sont conservées (seul le cache de l\'app est rafraîchi).',
      'Dans un arrêt de tournée, le bouton « 📅 RDV » est déplacé après le bouton « 💶 Paiement ».',
    ],
  },
  {
    version: '1.1.40', date: '2026-07-07',
    ajouts: [
      'Correction : la répartition de la facture se met à jour immédiatement quand on modifie ou supprime une réduction (champ « Réduction articles » du client, ou case « Remise » d\'un article). Si la géométrie de la tournée n\'était pas encore prête, un recalcul complet est déclenché automatiquement.',
      'Correction d\'affichage : dans un arrêt, les boutons (heure, Waze, Route, RDV, Paiement) reviennent proprement à la ligne et ne débordent plus à droite, hors du cadre de la section.',
    ],
  },
  {
    version: '1.1.39', date: '2026-07-07',
    ajouts: [
      'Saisie d\'adresse corrigée : une proposition choisie depuis n\'importe quel champ (Rue, Code postal ou Localité) remplit désormais la rue, le N°, le code postal ET la localité. Le filtre par type (qui empêchait la rue de remonter) est retiré.',
      'Le numéro tapé dans le champ Rue (ex. « Rue de la Loi 16 ») est extrait automatiquement vers le champ N°. Fonctionne avec OpenStreetMap (par défaut) et Geoapify.',
    ],
  },
  {
    version: '1.1.38', date: '2026-07-07',
    ajouts: [
      'Trajet du jour : les boutons Waze / Route / SMS / Ticket de chaque arrêt sont regroupés sous un seul bouton « ⚡ Agir » (modale) — l\'écran est plus lisible.',
      'Le bouton « Valider » est renommé « Clôture arrêt » et reste toujours visible (grisé/inactif tant que la tournée n\'est pas démarrée).',
      'La ligne « Retour » suit le même principe : bouton « ⚡ Agir » (Waze + Route du retour) + bouton « Clôturer tournée » (inactif tant que la tournée n\'est pas démarrée).',
    ],
  },
  {
    version: '1.1.37', date: '2026-07-07',
    ajouts: [
      'Heure de RDV : désormais UNE heure par arrêt, saisie directement sur la ligne des boutons (à côté de Waze / Route). La colonne « Heure RDV » par cheval est retirée. L\'heure sert au « départ estimé » et à l\'agenda.',
      'Boutons « faits » : une fois le temps réel encodé, le bouton « Route » s\'affiche grisé avec ✓ ; une fois le prochain RDV programmé, le bouton « RDV » s\'affiche grisé avec ✓ ; l\'heure saisie apparaît en vert. Ils restent cliquables pour corriger.',
      'Bouton « 📅 RDV » ajouté sur la ligne des boutons de l\'arrêt (en plus de la modale de paiement).',
    ],
  },
  {
    version: '1.1.36', date: '2026-07-07',
    ajouts: [
      'Éditeur de tournée : la répartition de la facture de chaque client s\'affiche maintenant directement SOUS son arrêt (paramétrage de l\'arrêt puis facture du client, ensemble). Plus besoin de descendre jusqu\'au panneau global. Le bas de page ne garde que le total général de la tournée.',
    ],
  },
  {
    version: '1.1.35', date: '2026-07-07',
    ajouts: [
      'Visite par cheval : dans un arrêt, une case « Visite » par cheval fait apparaître un menu déroulant des prestations « Visite » du catalogue. La prestation choisie est ajoutée à la facture de ce cheval, à son prix, sans changer le tarif d\'arrêt (Tournée/Visite/Urgence).',
      'Trois prestations sont fournies par défaut : Visite 1h (50 €), Visite 30 min (30 €), Visite 15 min (20 €). Vous pouvez en ajouter d\'autres via Gestion → Articles en cochant « Visite ».',
    ],
  },
  {
    version: '1.1.34', date: '2026-07-07',
    ajouts: [
      'Présence par cheval : dans un arrêt, tous les chevaux actifs du client à cette adresse sont listés avec une case « Présent ». Décochez un cheval absent : il n\'est plus compté ni facturé (ni dans les stats). Cocher/décocher met à jour la facture en direct.',
    ],
  },
  {
    version: '1.1.33', date: '2026-07-07',
    ajouts: [
      'Onglet Statistiques réorganisé en sous-onglets : Utilisation véhicule · Temps de trajet · Temps de travail · Analyse cheval · Analyse client · Graphiques.',
      'Utilisation véhicule : nouvelle section « Pièces & usage » — pour chaque frais véhicule, le kilométrage à l\'achat et les km parcourus depuis. Le km à l\'achat est modifiable dans Gestion → Frais véhicule (nouveau champ « Km à l\'achat »).',
      'Graphiques (nouveau) : filtre de période Mois / Trimestre / Semestre / Année (comme la Déclaration compta), puis un graphe par indicateur — chiffre d\'affaires, kilomètres et nombre de tournées en barres, encaissements (liquide / virement / facture) en barres empilées, et répartition des encaissements en anneau. Rendu intégré, sans connexion.',
    ],
  },
  {
    version: '1.1.32', date: '2026-07-07',
    ajouts: [
      'Correction « cheval fantôme » dans les statistiques : un cheval non pris en charge à un arrêt (aucun parage, aucune pathologie, aucune visite cochés) n\'est plus compté dans les temps de travail, les temps de trajet, l\'utilisation du véhicule ni les analyses financières par cheval et par client. Seuls les chevaux réellement faits sont désormais imputés.',
      'Les tournées déjà enregistrées sont nettoyées automatiquement au lancement (les montants facturés restent identiques — seule la répartition par cheval est corrigée).',
    ],
  },
  {
    version: '1.1.31', date: '2026-07-07',
    ajouts: [
      'Article : on peut définir une quantité par cheval (au lieu d\'une par cheval coché). Chaque cheval sélectionné a son propre champ quantité ; la répartition financière par cheval en tient compte.',
    ],
  },
  {
    version: '1.1.30', date: '2026-07-07',
    ajouts: [
      'Heure de départ estimée : calculée à partir de l\'heure de RDV la plus tôt du 1ᵉʳ arrêt moins le temps de trajet (réel ou estimé) pour y arriver. Affichée dans « Trajet du jour » (avant de démarrer) et dans l\'éditeur de tournée.',
    ],
  },
  {
    version: '1.1.29', date: '2026-07-07',
    ajouts: [
      'Catalogue d\'articles (Gestion → Articles) : 3 cases par article — « Remise produit » (autorise la réduction manuelle), « Remise liquide » (éligibilité à la réduction automatique en liquide), « Visite » (marque l\'article comme prestation de visite).',
      'Les deux réductions sont désormais indépendantes ligne par ligne : la remise manuelle du client (case « Remise » de la ligne + « remise produit ») et la remise liquide auto (« remise liquide »). Si « remise produit » est décochée, la case « Remise » de la ligne est verrouillée.',
    ],
  },
  {
    version: '1.1.28', date: '2026-07-07',
    ajouts: [
      'Facture : les forfaits Fourbure / NPAS / Infection apparaissent maintenant dans la section « Articles » (une ligne par cheval) au lieu d\'être fondus dans le « Matériel ». Les totaux sont identiques ; le Matériel ne contient plus que la base consommable.',
    ],
  },
  {
    version: '1.1.27', date: '2026-07-07',
    ajouts: [
      'Fiche client : Civilité (Mr/Mme) + case « Politesse dans le SMS » (activée par défaut).',
      'SMS : deux modèles — « standard » (au prénom, si la politesse est désactivée) et « politesse » (Mr/Mme + nom, si activée). Le bon modèle est choisi automatiquement selon le client.',
    ],
  },
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
// Purge le cache applicatif (Service Worker + Cache Storage) puis recharge → récupère les fichiers à jour.
// N'EFFACE PAS localStorage : toutes les données (clients, tournées, réglages, agenda) sont conservées.
async function purgeAndReload() {
  try {
    if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((x) => x.unregister())); }
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
  } catch { /* ignore */ }
  location.reload();
}
// Récupère le numéro de la dernière release publiée (sans « v »), ou null si indisponible.
async function fetchLatestRelease() {
  if (!UPDATE_REPO) return null;
  const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { cache: 'no-store' });
  if (!r.ok) return null;
  const j = await r.json();
  return String(j.tag_name || '').replace(/^v/i, '') || null;
}
// Au lancement : vérifie la dernière release GitHub. Si plus récente → purge + recharge (MAJ). Sinon → ouverture normale.
async function checkForUpdate() {
  if (!UPDATE_REPO) return;
  try {
    const latest = await fetchLatestRelease();
    if (latest && isNewerVersion(latest, APP_VERSION) && sessionStorage.getItem('ftr.updated') !== latest) {
      sessionStorage.setItem('ftr.updated', latest); // anti-boucle
      await purgeAndReload();
    }
  } catch { /* hors-ligne / API indisponible → ouverture normale */ }
}
// Vérification MANUELLE (bouton « Mettre à jour ») avec retour visible. Ignore le garde-fou anti-boucle du lancement.
async function manualCheckForUpdate(statusEl) {
  const set = (cls, txt) => { if (statusEl) { statusEl.className = 'status ' + cls; statusEl.innerHTML = txt; } };
  if (!UPDATE_REPO) { set('err', 'Mise à jour non configurée.'); return; }
  set('', 'Recherche d\'une nouvelle version…');
  let latest;
  try { latest = await fetchLatestRelease(); }
  catch { set('err', 'Impossible de vérifier (hors-ligne ou GitHub indisponible).'); return; }
  if (latest && isNewerVersion(latest, APP_VERSION)) {
    set('ok', `Nouvelle version v${esc(latest)} trouvée — téléchargement et mise à jour…`);
    setTimeout(purgeAndReload, 600);
    return;
  }
  // À jour selon la dernière release publiée → proposer quand même un rechargement forcé (le site peut être en avance sur la release).
  set('ok', `Vous avez déjà la dernière version publiée (v${esc(APP_VERSION)}).<br><button class="btn small" id="forceReload" style="margin-top:6px">Forcer le rechargement</button>`);
  const fr = document.getElementById('forceReload'); if (fr) fr.addEventListener('click', () => { set('', 'Rechargement…'); purgeAndReload(); });
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
  smsTemplate: 'Bonjour {prenom}, je passe aujourd\'hui pour {cheval}. J\'arrive dans environ {trajet}. À tout de suite !',
  smsTemplatePolitesse: 'Bonjour {civilite} {nom}, je passe aujourd\'hui pour {cheval}. J\'arrive dans environ {trajet}. À tout de suite !',
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
if (!Array.isArray(S.fraisJournal)) S.fraisJournal = []; // journal des frais réels (factures d'achat) : { id, date, km, fraisId, poste, montant } — pour la stat « provision vs réel »
normalizeFraisOrder(); // au démarrage : groupe les frais liés sous leur entretien et répare les liens périmés
S.materiel = Array.isArray(S.materiel) ? S.materiel : [];
S.articlesCatalogue = Array.isArray(S.articlesCatalogue) ? S.articlesCatalogue : [];
S.amortissement = Object.assign({ achatHT: 0, dureeVieKm: 0 }, S.amortissement || {});
S.vehicule = Object.assign({ dateAchat: '', dateMiseEnCirculation: '' }, S.vehicule || {}); // dates véhicule (amortissement / âge)
if (!Array.isArray(S.odoReleves)) S.odoReleves = []; // relevés RÉELS du compteur : { ym:'YYYY-MM', date:'YYYY-MM-DD', km, ecart } ; ecart = usage privé (réel − estimé depuis le relevé précédent)
// Tranches (configurables) pour la page Stats → Suivi chevaux. max = borne haute EXCLUSIVE en mois ; null = « et plus » (dernière tranche).
const DEF_TRANCHES_AGE = [{ label: 'Poulain (< 1 an)', max: 12 }, { label: '1–3 ans', max: 48 }, { label: '4–7 ans', max: 96 }, { label: '8–15 ans', max: 192 }, { label: '16–20 ans', max: 252 }, { label: '> 20 ans', max: null }];
const DEF_TRANCHES_SUIVI = [{ label: '< 6 mois', max: 6 }, { label: '6–12 mois', max: 12 }, { label: '1–2 ans', max: 24 }, { label: '2–5 ans', max: 60 }, { label: '> 5 ans', max: null }];
S.statTranchesAge = (Array.isArray(S.statTranchesAge) && S.statTranchesAge.length) ? S.statTranchesAge : DEF_TRANCHES_AGE.map((x) => Object.assign({}, x));
S.statTranchesSuivi = (Array.isArray(S.statTranchesSuivi) && S.statTranchesSuivi.length) ? S.statTranchesSuivi : DEF_TRANCHES_SUIVI.map((x) => Object.assign({}, x));
// Paramétrage des planches contact / avant-après (JSON persisté ; les images et PDF ne sont JAMAIS stockés dans l'app).
// Structure : { orientation, logo, modeles:{3,4,5:[angles]} (=colonnes), pages:[{membres:[…]}] (=lignes, réparties en pages) }.
if (!S.planche || typeof S.planche !== 'object') S.planche = {};
const _plModeles = () => ({ '3': ['Latéral', 'Dorsal', 'Solaire'], '4': ['Latéral', 'Dorsal', 'Solaire', 'Médial'], '5': ['Latéral', 'Dorsal', 'Solaire', 'Médial', 'Caudal'] });
S.planche.contact = Object.assign({ orientation: 'paysage', logo: false, modeles: _plModeles(), pages: [{ membres: ['Antérieur gauche', 'Antérieur droit', 'Postérieur gauche', 'Postérieur droit'] }, { membres: ['Cheval'] }] }, S.planche.contact || {});
if (!Array.isArray(S.planche.contact.pages)) S.planche.contact.pages = [{ membres: ['Antérieur gauche', 'Antérieur droit', 'Postérieur gauche', 'Postérieur droit'] }, { membres: ['Cheval'] }];
if (!S.planche.contact.modeles) S.planche.contact.modeles = _plModeles();
delete S.planche.contact.membres;
S.planche.avantapres = Object.assign({ orientation: 'paysage', logo: false, modeles: _plModeles(), pages: [{ membres: [] }, { membres: ['Cheval'] }] }, S.planche.avantapres || {});
if (!Array.isArray(S.planche.avantapres.pages)) S.planche.avantapres.pages = [{ membres: [] }, { membres: ['Cheval'] }];
if (!S.planche.avantapres.modeles) S.planche.avantapres.modeles = _plModeles();
delete S.planche.avantapres.angles; delete S.planche.avantapres.photosParLigne;
// Logo / identité du pro pour les documents (planches). SEUL le logo (petit, redimensionné) est persisté — pas les photos de planche.
// { data:dataURL, zoom:multiplicateur, x/y:décalage en FRACTION du cadre (pan) } — cadrage repris à l'identique dans l'en-tête PDF.
if (!S.proLogo || typeof S.proLogo !== 'object') S.proLogo = { data: '', zoom: 1, x: 0, y: 0 };
// Statut des adresses de chevaux (clé = adresse normalisée) : { [addrKey]: 'inactif' | 'noir' } (absent = actif). Partagé par tous les chevaux à cette adresse.
if (!S.addrStatus || typeof S.addrStatus !== 'object') S.addrStatus = {};
// Chevaux en attente de planche photo (« Compte rendu photo » sur l'Accueil) : { id, clientId, chevalId, chevalNom, date, tourId }. Aucune image stockée.
if (!Array.isArray(S.plancheTodo)) S.plancheTodo = [];
// Contact mail (Gmail) : mots-clés de tri + liste des mails « prise de contact » récupérés (données PARSÉES persistées, pas le mail brut).
if (!Array.isArray(S.mailKeywords) || !S.mailKeywords.length) S.mailKeywords = ['prise de contact'];
if (!Array.isArray(S.contactMails)) S.contactMails = []; // { id(gmailMsgId), from, fromRaw, subject, date, fields{}, body, status:'nouveau'|'client'|'ignore', clientId, chevalNom }
if (typeof S.mailExcludeSelf !== 'boolean') S.mailExcludeSelf = true; // n'inclut pas les mails que VOUS avez envoyés (seulement les réponses reçues)
if (typeof S.mailScanForm !== 'boolean') S.mailScanForm = true;       // détecte aussi les formulaires sans le mot-clé (étiquettes distinctives)
if (typeof S.mailSelf !== 'string') S.mailSelf = '';                  // adresse du compte Gmail connecté (pour masquer VOS mails envoyés déjà importés)
if (typeof S.tempsKm !== 'number') S.tempsKm = 0;
if (typeof S.urgenceSuppKm !== 'number') S.urgenceSuppKm = 0;
if (typeof S.fourbureHT !== 'number') S.fourbureHT = 0;
if (typeof S.npasHT !== 'number') S.npasHT = 0;
if (typeof S.infectionHT !== 'number') S.infectionHT = 0;
S.changelogRead = Array.isArray(S.changelogRead) ? S.changelogRead : [];
if (!S.comptaStatus || typeof S.comptaStatus !== 'object') S.comptaStatus = {}; // { 'YYYY-MM': { liquide, virement, facture } }
if (!S.comptaRecu || typeof S.comptaRecu !== 'object') S.comptaRecu = {};       // { 'tourId:clientId': true } — paiement reçu (virement/facture)
if (!S.comptaDemarche || typeof S.comptaDemarche !== 'object') S.comptaDemarche = {}; // { 'tourId:clientId': true } — démarche comptable effectuée (mois archivé)
if (!Array.isArray(S.notesCredit)) S.notesCredit = []; // notes de crédit : { id, clientId, clientNom, tourId, tourDate, chevalNom, montantTTC, motif, note, date, rembourse, rembourseAt }
S.parage = Object.assign({ prixHT: 0, tvaPct: 21 }, S.parage || {});
if (!S.pays) S.pays = 'be';
if (S.navApp !== 'gmaps') S.navApp = 'waze';
if (typeof S.googleClientId !== 'string') S.googleClientId = '';
if (typeof S.googleAutoSync !== 'boolean') S.googleAutoSync = false;
if (typeof S.calPush !== 'boolean') S.calPush = false;                 // pousser automatiquement les RDV de l'app vers Google Agenda (écriture)
if (!S.calPushed || typeof S.calPushed !== 'object') S.calPushed = {}; // { 'tourId:clientId' : googleEventId } → mise à jour / suppression du bon évènement
if (typeof S.calDureeMin !== 'number' || S.calDureeMin < 5) S.calDureeMin = 60; // durée par défaut d'un RDV poussé (minutes)
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
if (typeof S.smsTemplatePolitesse !== 'string') S.smsTemplatePolitesse = DEFAULTS.smsTemplatePolitesse;
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
    { id: 'idmr4vkk6vi6ne', libelle: 'Visite 15 min', prixHT: 20, tvaPct: 21, visite: true },
    { id: 'idmr4vl08gi77k', libelle: 'Visite 30 min', prixHT: 30, tvaPct: 21, visite: true },
    { id: 'idmr4vlo0verc1', libelle: 'Visite 1h', prixHT: 50, tvaPct: 21, visite: true },
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
// Frais par défaut organisés en TYPES : un poste principal + ses éléments liés (réinitialisés en refaisant le type).
function mkFrais() {
  const out = [];
  const addType = (head, children) => { const h = Object.assign({ id: uid(), kmDebut: 0 }, head); out.push(h); (children || []).forEach((c) => out.push(Object.assign({ id: uid(), kmDebut: 0, parentId: h.id }, c))); };
  addType({ poste: 'Entretien', nature: 'recurrent', montantHT: 800, kmPrevus: 30000 }, [
    { poste: 'Pièces', nature: 'exceptionnel', montantHT: 0, kmPrevus: 30000 },
    { poste: 'Réparation', nature: 'exceptionnel', montantHT: 0, kmPrevus: 30000 },
  ]);
  addType({ poste: 'Pneus', nature: 'recurrent', montantHT: 450, kmPrevus: 40000 }, [
    { poste: 'Montage & équilibrage', nature: 'exceptionnel', montantHT: 150, kmPrevus: 40000 },
  ]);
  addType({ poste: 'Plaquettes de frein', nature: 'recurrent', montantHT: 450, kmPrevus: 30000 }, [
    { poste: 'Disques de frein', nature: 'exceptionnel', montantHT: 500, kmPrevus: 60000 },
  ]);
  return out;
}
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
// Articles « Visite » (prestation) : flag `visite:true` → proposés dans la case Visite par cheval de l'arrêt.
// Marque les 3 articles visite d'usine (prix normalisés 15min 20 / 30min 30 / 1h 50 s'ils n'ont pas été personnalisés) ; sinon seed 3 canoniques.
if (!S.visiteSeeded) {
  S.visiteSeeded = true;
  const byId = (id) => (S.articlesCatalogue || []).find((x) => x.id === id);
  const upd = (id, lib, oldP, newP) => { const a = byId(id); if (a) { a.visite = true; a.libelle = lib; if (Math.abs((a.prixHT || 0) - oldP) < 0.005) a.prixHT = newP; } };
  upd('idmr4vkk6vi6ne', 'Visite 15 min', 10, 20);
  upd('idmr4vl08gi77k', 'Visite 30 min', 25, 30);
  upd('idmr4vlo0verc1', 'Visite 1h', 40, 50);
  if (!(S.articlesCatalogue || []).some((x) => x.visite)) {
    const tv = S.tvaRate || 21;
    S.articlesCatalogue = (S.articlesCatalogue || []).concat([
      { id: uid(), libelle: 'Visite 1h', prixHT: 50, tvaPct: tv, visite: true, remiseProduit: true, remiseLiquide: true },
      { id: uid(), libelle: 'Visite 30 min', prixHT: 30, tvaPct: tv, visite: true, remiseProduit: true, remiseLiquide: true },
      { id: uid(), libelle: 'Visite 15 min', prixHT: 20, tvaPct: tv, visite: true, remiseProduit: true, remiseLiquide: true },
    ]);
  }
  LS.set('ftr.settings', S);
}
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
  merged.calPushed = Object.assign({}, (localS && localS.calPushed) || {}, (remoteS && remoteS.calPushed) || {}); // évènements Google poussés : union des mappings (pas de doublon entre appareils)
  // Adresse de départ (domicile) : ne jamais la perdre si l'appareil « gagnant » l'avait vide → reprendre celle qui est renseignée.
  const hasAddr = (a) => { try { return !!addrStr(a).trim(); } catch { return false; } };
  if (!hasAddr(merged.home)) { if (localS && hasAddr(localS.home)) merged.home = localS.home; else if (remoteS && hasAddr(remoteS.home)) merged.home = remoteS.home; }
  // Carnet « Mes adresses » de départ : union par id (ne pas perdre celles saisies sur l'autre appareil).
  { const byId = {}; ((localS && localS.adresses) || []).forEach((a) => { if (a && a.id) byId[a.id] = a; }); ((remoteS && remoteS.adresses) || []).forEach((a) => { if (a && a.id) byId[a.id] = a; }); merged.adresses = Object.values(byId); }
  // Relevés compteur (statut véhicule) : union par mois (ne jamais perdre un relevé fait sur l'autre appareil ; le plus récent gagne pour un même mois).
  { const byYm = {}; const add = (r) => { if (r && r.ym) { const ex = byYm[r.ym]; if (!ex || (r.date || '') >= (ex.date || '')) byYm[r.ym] = r; } }; ((localS && localS.odoReleves) || []).forEach(add); ((remoteS && remoteS.odoReleves) || []).forEach(add); merged.odoReleves = Object.values(byYm).sort((a, b) => (a.date || '').localeCompare(b.date || '')); }
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
// ======= Push RDV app → Google Agenda (écriture) : 1 évènement par client par tournée, heure obligatoire. =======
let _calTimer = null;
function scheduleCalPush(t) { if (!S.calPush || !S.googleClientId || !t) return; clearTimeout(_calTimer); const id = t.id; _calTimer = setTimeout(() => { const tt = allTours().find((x) => x.id === id); if (tt) pushTourToCalendar(tt, { interactive: false }); }, 1500); } // débattu : évite de spammer l'API à chaque frappe
// Heure de RDV d'un client sur une tournée = la plus tôt de ses arrêts.
function clientRdvHeure(t, clientId) { let best = ''; (t.arrets || []).forEach((a) => { if ((a.clients || []).some((cl) => cl.clientId === clientId)) { const h = arretHeure(a); if (h && (!best || h < best)) best = h; } }); return best; }
// Lieu d'un client sur une tournée : 1er arrêt où il figure.
function clientTourAddr(t, clientId) { for (const a of (t.arrets || [])) { if ((a.clients || []).some((cl) => cl.clientId === clientId)) return addrStr(a.addr); } return ''; }
// Clients « facturables » d'une tournée (≥1 cheval fait), dédupliqués.
function tourBillableClients(t) { const seen = new Set(), out = []; (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => { if (seen.has(cl.clientId)) return; if (!(cl.chevaux || []).some(chevalBilled)) return; seen.add(cl.clientId); out.push(cl.clientId); })); return out; }
// Clients facturables sans heure de RDV (bloque la clôture quand la synchro Agenda est active).
function calMissingHeure(t) { return tourBillableClients(t).filter((cid) => !clientRdvHeure(t, cid)).map((cid) => clientName(cid)); }
// Crée / met à jour 1 évènement Google par client (heure obligatoire), et supprime ceux qui n'ont plus lieu.
async function pushTourToCalendar(t, opts) {
  opts = opts || {};
  if (!S.calPush || !S.googleClientId || !t) return;
  if (!opts.interactive && !gTokenValid(GSCOPE_CAL)) return; // navigation : jamais d'écran d'auth
  const st = opts.statusEl; const setSt = (cls, txt) => { if (st) { st.className = 'status ' + cls; st.textContent = txt; } };
  let token; try { token = await googleToken(!!opts.interactive, GSCOPE_CAL); } catch (e) { setSt('err', 'Connexion Agenda impossible : ' + (e && e.message || e)); return; }
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels'; } catch { return 'Europe/Brussels'; } })();
  const times = (heure) => { const [Y, M, D] = (t.date || '').split('-').map(Number); const [h, mi] = heure.split(':').map(Number); const s = new Date(Y, (M || 1) - 1, D || 1, h || 0, mi || 0, 0); const e = new Date(s.getTime() + (S.calDureeMin || 60) * 60000); return { start: { dateTime: s.toISOString(), timeZone: tz }, end: { dateTime: e.toISOString(), timeZone: tz } }; };
  const req = (method, path, body) => fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const wanted = tourBillableClients(t).map((cid) => ({ cid, heure: clientRdvHeure(t, cid) })).filter((x) => x.heure);
  const wantedIds = new Set(wanted.map((x) => x.cid));
  let nOk = 0, nDel = 0;
  for (const w of wanted) {
    const key = t.id + ':' + w.cid; const chevaux = [];
    (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => { if (cl.clientId === w.cid) (cl.chevaux || []).filter(chevalBilled).forEach((cv) => chevaux.push(cv.nom)); }));
    const ev = Object.assign({ summary: '🐴 ' + clientName(w.cid) + (chevaux.length ? ' — ' + chevaux.join(', ') : ''), location: clientTourAddr(t, w.cid), description: 'Rendez-vous GaloPodo' + (t.nom ? ' · ' + t.nom : ''), extendedProperties: { private: { galopodo: '1', tourId: t.id, clientId: w.cid } } }, times(w.heure));
    const evId = S.calPushed[key];
    try { let r = evId ? await req('PATCH', '/' + encodeURIComponent(evId), ev) : await req('POST', '', ev); if (evId && r.status === 404) r = await req('POST', '', ev); if (r.ok) { const j = await r.json(); S.calPushed[key] = j.id; nOk++; } } catch { /* réseau : réessai au prochain push */ }
  }
  for (const key of Object.keys(S.calPushed)) {
    if (!key.startsWith(t.id + ':')) continue;
    if (wantedIds.has(key.slice(t.id.length + 1))) continue;
    try { const r = await req('DELETE', '/' + encodeURIComponent(S.calPushed[key])); if (r.ok || r.status === 404 || r.status === 410) { delete S.calPushed[key]; nDel++; } } catch { /* réessai plus tard */ }
  }
  saveSettings();
  setSt('ok', `Agenda Google à jour : ${nOk} RDV${nDel ? ', ' + nDel + ' retiré(s)' : ''}.`);
}
// Supprime tous les évènements Google d'une tournée (à sa suppression).
async function deleteTourCalendar(tourId) {
  const keys = Object.keys(S.calPushed || {}).filter((k) => k.startsWith(tourId + ':'));
  if (!keys.length) return;
  if (!S.googleClientId || !gTokenValid(GSCOPE_CAL)) { keys.forEach((k) => delete S.calPushed[k]); saveSettings(); return; }
  let token; try { token = await googleToken(false, GSCOPE_CAL); } catch { return; }
  for (const k of keys) { try { await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(S.calPushed[k]), { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }); } catch { /* ignore */ } delete S.calPushed[k]; }
  saveSettings();
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
// UN SEUL jeton mutualisé Drive + Calendar + Gmail : les 3 constantes sont volontairement IDENTIQUES → même clé de cache, une seule connexion couvre tout.
const GSCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly';
const GSCOPE_CAL = GSCOPE_DRIVE;
// Lecture Gmail (scope RESTREINT) — connexion séparée, à activer dans la console Google Cloud de l'utilisateur.
const GSCOPE_MAIL = GSCOPE_DRIVE; // Gmail mutualisé avec Drive/Calendar (même jeton, une seule connexion)
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
// Compresse une chaîne en gzip (octets) si le navigateur le supporte, sinon renvoie null (repli JSON brut).
async function gzipBytes(str) {
  if (typeof CompressionStream === 'undefined') return null;
  try { const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip')); return new Uint8Array(await new Response(stream).arrayBuffer()); } catch { return null; }
}
// Taille (octets) du coffre tel qu'il sera envoyé (gzip si dispo) — pour l'afficher à l'utilisateur.
async function snapshotUploadSize(data) { const json = JSON.stringify(data); const gz = await gzipBytes(json); return { gz: gz ? gz.length : 0, json: json.length }; }
function humanSize(b) { if (!b) return '0 o'; if (b < 1024) return b + ' o'; if (b < 1048576) return (b / 1024).toFixed(0) + ' Ko'; return (b / 1048576).toFixed(1) + ' Mo'; }
// Lecture du coffre : détecte le gzip (octets magiques 1f 8b) → décompresse ; sinon JSON brut (RÉTRO-COMPATIBLE avec les anciens coffres non compressés).
async function driveDownload(token, id) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Drive téléchargement ' + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  let text;
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('coffre compressé mais navigateur incompatible (mettez l\'app à jour)');
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else { text = new TextDecoder().decode(buf); }
  return JSON.parse(text);
}
async function driveUpload(token, id, data) {
  const meta = { name: GDRIVE_FILE }; if (!id) meta.parents = ['appDataFolder'];
  const boundary = 'gp' + Math.floor(Math.random() * 1e9).toString(36);
  const gz = await gzipBytes(JSON.stringify(data));
  let body;
  if (gz) { // envoi compressé (gzip) : ~5-10× plus léger
    const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/gzip\r\nContent-Transfer-Encoding: binary\r\n\r\n`;
    body = new Blob([pre, gz, `\r\n--${boundary}--`]);
  } else { // repli JSON brut (navigateur sans CompressionStream)
    body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
  }
  const url = id ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const r = await fetch(url, { method: id ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
  if (!r.ok) throw new Error('Drive envoi ' + r.status); return r.json();
}
// Hash de contenu du coffre (ignore l'horodatage volatil `at` et `settings.updatedAt`) → détecte « rien de neuf à envoyer ».
function snapshotHash(snap) {
  const s = Object.assign({}, snap && snap.settings); delete s.updatedAt;
  const str = JSON.stringify([s, snap && snap.clients, snap && snap.tours, snap && snap.tomb]);
  let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return str.length + ':' + h.toString(36);
}
let _lastPushHash = null; // hash du dernier coffre effectivement envoyé (E2 : saute l'upload auto si inchangé)
// Synchro Drive : télécharge le distant, FUSIONNE, renvoie le tout (le coffre porte l'état fusionné). interactive = autorise l'écran de connexion.
async function googleSync(interactive, statusEl, reload) {
  const setS = (cls, txt) => { if (statusEl) { statusEl.className = 'status ' + cls; statusEl.textContent = txt; } };
  try {
    setS('', 'Connexion à Google…'); const token = await googleToken(interactive);
    setS('', 'Synchronisation Drive…'); const f = await driveFindFile(token);
    if (f) { const remote = await driveDownload(token, f.id); if (remote && Array.isArray(remote.tours)) importSnapshotMerge(remote); }
    const snap = exportSnapshot(); const sz = await snapshotUploadSize(snap);
    setS('', 'Envoi… ' + humanSize(sz.gz || sz.json) + (sz.gz ? ' (compressé)' : ''));
    await driveUpload(token, f ? f.id : null, snap); _lastPushHash = snapshotHash(snap);
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
    if (f) { const remote = await driveDownload(token, f.id); if (remote && Array.isArray(remote.tours)) importSnapshotMerge(remote); }
    const snap = exportSnapshot(); const h = snapshotHash(snap);
    if (h === _lastPushHash) return; // E2 : rien de neuf depuis le dernier envoi → on évite un aller-retour inutile
    await driveUpload(token, f ? f.id : null, snap); _lastPushHash = h;
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
// « Aujourd'hui » en date LOCALE (comme les sélecteurs de date et fmtDateFr) — évite qu'en fuseau +1/+2, près de minuit, « aujourd'hui » soit décalé d'un jour (UTC) et qu'une tournée du jour tombe à tort en « à venir ».
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function tourStatus(date) { const t = todayStr(); if (!date) return 'avenir'; if (date < t) return 'cloturee'; if (date === t) return 'active'; return 'avenir'; }
// Statut d'une tournée : clôturée si fermée manuellement OU date passée ; sinon selon la date.
// Une tournée DÉMARRÉE et non clôturée reste « active » (modifiable) même si sa date est passée — pour pouvoir finaliser ses arrêts ouverts.
// (Le gel par date ne s'applique qu'aux tournées jamais démarrées : simples RDV passés non honorés.)
function statusOf(tour) { if (!tour) return 'avenir'; if (tour.closed) return 'cloturee'; if (tour.startedAt && !tour.endedAt) return 'active'; return tourStatus(tour.date); }
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
// ---- Odomètre RÉEL / ESTIMÉ ----
// Réel = relevés compteur saisis par l'utilisateur (Statut véhicule). Estimé = dernier relevé réel + Σ km des tournées faites APRÈS ce relevé.
// Sans aucun relevé : repli sur Σ de toutes les tournées (comportement d'origine, base 0). On ne confond jamais réel et estimé.
function lastOdoReleve() { const r = (S.odoReleves || []).filter((x) => x && x.date); return r.length ? r.reduce((a, b) => ((a.date || '') >= (b.date || '') ? a : b)) : null; }
const tourKmAfter = (dateStr) => allTours().reduce((s, t) => s + ((t.result && (t.date || '') > dateStr) ? t.result.totalKm : 0), 0);
const tourKmBetween = (from, to) => allTours().reduce((s, t) => s + ((t.result && (t.date || '') > from && (t.date || '') <= to) ? t.result.totalKm : 0), 0);
const odometer = () => { const last = lastOdoReleve(); return last ? (last.km + tourKmAfter(last.date)) : allTours().reduce((s, t) => s + (t.result ? t.result.totalKm : 0), 0); };
const usagePriveTotal = () => (S.odoReleves || []).reduce((s, r) => s + (typeof r.ecart === 'number' ? r.ecart : 0), 0); // km hors tournées (privé), cumulé sur les relevés
// Estimé du compteur À une date = dernier relevé réel AVANT cette date + tournées jusqu'à la date (sinon Σ tournées jusqu'à la date).
function estOdoAt(date) { const prev = (S.odoReleves || []).filter((r) => r && (r.date || '') < date).sort((a, b) => (a.date || '').localeCompare(b.date || '')).pop(); return prev ? (prev.km + tourKmBetween(prev.date, date)) : allTours().reduce((s, t) => s + ((t.result && (t.date || '') <= date) ? t.result.totalKm : 0), 0); }
// Recalcule l'écart (usage privé) de chaque relevé = réel − estimé depuis le relevé précédent (à refaire après tout ajout, y compris rétroactif).
function recomputeOdoEcarts() {
  const list = (S.odoReleves || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let prev = null;
  list.forEach((r) => { r.ecart = prev ? (r.km - (prev.km + tourKmBetween(prev.date, r.date))) : null; prev = r; });
  S.odoReleves = list;
}
// Enregistre un relevé compteur réel à une DATE (défaut aujourd'hui ; une date passée = ajout rétroactif). 1 relevé par mois. Recalcule tous les écarts.
function declareOdo(km, date) {
  date = date || todayStr(); const ym = date.slice(0, 7);
  S.odoReleves = (S.odoReleves || []).filter((r) => (r.ym || (r.date || '').slice(0, 7)) !== ym); // un relevé par mois
  S.odoReleves.push({ ym, date, km, ecart: null });
  recomputeOdoEcarts();
  saveSettings();
}
const odoDeclarationDue = () => { const last = lastOdoReleve(); return !last || (last.ym || (last.date || '').slice(0, 7)) < todayStr().slice(0, 7); };
const fraisActif = (f) => (f.nature === 'recurrent' || f.parentId) ? true : (odometer() - (f.kmDebut || 0)) < (f.kmPrevus || 0); // les frais liés à un entretien suivent le parent → toujours actifs (réinitialisés avec lui)
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
// Extrait un numéro de maison d'un texte tapé (« Rue de la Loi 16 » → { street:'Rue de la Loi', numero:'16' }).
function splitHouseNumber(text) {
  const m = String(text || '').match(/^\s*(.+?)[\s,]+(\d+\s?[a-zA-Z]?)\s*$/);
  if (m) return { street: m[1].trim(), numero: m[2].replace(/\s/g, '') };
  return { street: String(text || '').trim(), numero: '' };
}
// Suggestions d'adresse (autocomplete). Aucun filtre `type` : chaque proposition renvoie l'adresse COMPLÈTE (rue + CP + localité),
// pour qu'un choix depuis n'importe quel champ remplisse les 4 champs (le filtre par type masquait la rue).
async function suggestAddress(text) {
  if (S.provider === 'geoapify') {
    if (!S.geoapifyKey) throw new Error('Clé Geoapify manquante');
    const r = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&limit=6&lang=fr&filter=countrycode:be,fr,lu&apiKey=${S.geoapifyKey}`);
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

// ---------- Widget d'adresse (suggestion depuis n'importe quel champ → remplit les 4 champs) ----------
function attachAuto(input, kind, addr, onPick, onEdit) {
  let deb, box;
  const close = () => { if (box) { box.remove(); box = null; } };
  const run = async () => {
    const raw = input.value.trim(); if (raw.length < 2) { close(); return; }
    // Dans le champ Rue, on extrait le N° tapé (« Rue X 16 » → cherche « Rue X », N°=16) pour le réappliquer au choix.
    let searchBase = raw, extractedNum = '';
    if (kind === 'street') { const sp = splitHouseNumber(raw); searchBase = sp.street; extractedNum = sp.numero; }
    // Contexte pour affiner (CP/localité connus), sans filtrer par type → la proposition reste une adresse complète.
    const parts = [searchBase];
    if (kind !== 'postcode' && addr.cp) parts.push(addr.cp);
    if (kind !== 'city' && addr.localite) parts.push(addr.localite);
    const text = parts.filter(Boolean).join(' ');
    close(); box = document.createElement('div'); box.className = 'aw-sugg'; input.parentElement.appendChild(box); box.innerHTML = '<div class="aw-item">Recherche…</div>';
    try {
      const res = await suggestAddress(text); if (!box) return; box.innerHTML = '';
      if (!res.length) { box.innerHTML = '<div class="aw-item">Aucun résultat</div>'; return; }
      res.forEach((s) => { const d = document.createElement('div'); d.className = 'aw-item'; d.textContent = s.label; d.addEventListener('mousedown', (e) => { e.preventDefault(); onPick(Object.assign({}, s, (extractedNum && !s.numero) ? { numero: extractedNum } : {})); close(); }); box.appendChild(d); });
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
  // Choix d'une proposition (depuis n'importe quel champ) : remplit rue + N° + CP + localité (garde l'ancien si la proposition ne fournit pas le champ).
  const fill = (s) => {
    addr.rue = s.rue || addr.rue;
    addr.numero = s.numero || addr.numero; // N° = celui de la proposition, sinon N° extrait du texte tapé, sinon inchangé
    addr.cp = s.cp || addr.cp;
    addr.localite = s.localite || addr.localite;
    addr.lat = s.lat; addr.lon = s.lon;
    el.rue.value = addr.rue; el.numero.value = addr.numero; el.cp.value = addr.cp; el.localite.value = addr.localite;
    onChange && onChange(addr);
  };
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
  if (name === 'tournees') showTournees(currentTsub);
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
  if (currentRsub === 'config') { renderAmortStats(); renderProLogoEditor(); }
  if (currentRsub === 'mail') renderMailConfig();
  if (currentRsub === 'statistiques') renderStatConfig();
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
  if (currentGsub === 'adrchev') renderChevAddresses();
  if (currentGsub === 'articles') renderArticlesPage();
  if (currentGsub === 'materiel') renderMateriel();
  if (currentGsub === 'vehicule') renderFraisVehicule();
  if (currentGsub === 'statut') renderStatutVehiculePage();
  if (currentGsub === 'planche') renderPlancheConfig();
  if (currentGsub === 'contactmail') renderContactMail();
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
  allTours().forEach((t) => { if (t.date !== day) return; (t.arrets || []).forEach((a) => { const hh = arretHeure(a); (a.clients || []).forEach((cl) => out.push({ heure: hh, type: 'tour', label: clientLabel(cl.clientId) })); }); });
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
const isClientActif = (c) => !!c && c.actif !== false && !c.blacklist;     // défaut = actif ; ni inactif ni liste noire
const isClientNoir = (c) => !!(c && c.blacklist);                          // client en liste noire (refusé)
const activeChevaux = (c) => ((c && c.chevaux) || []).filter((h) => h.actif !== false && !h.blacklist);
let clientsFilter = 'actifs'; // actifs (défaut) | inactifs | noir
function renderClients() {
  const seg = $('clientsFilterSeg'); if (seg) seg.querySelectorAll('.seg-btn').forEach((b) => { if (!b._cfw) { b._cfw = true; b.addEventListener('click', () => { clientsFilter = b.dataset.cf; renderClients(); }); } b.classList.toggle('on', b.dataset.cf === clientsFilter); });
  const list = $('clientsList'); list.innerHTML = '';
  const match = (c) => clientsFilter === 'noir' ? isClientNoir(c) : clientsFilter === 'inactifs' ? (c.actif === false && !c.blacklist) : isClientActif(c);
  const shown = clients.filter(match).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  if ($('clientsEmpty')) { $('clientsEmpty').style.display = shown.length ? 'none' : 'block'; $('clientsEmpty').textContent = clients.length ? 'Aucun client dans cette catégorie.' : 'Aucun client. Créez-en un.'; }
  shown.forEach((c) => {
    const nAdr = new Set((c.chevaux || []).map((h) => norm(addrStr(chevalAddr(c, h))))).size || 1;
    const soc = c.societe ? ' — ' + esc(c.societe) : '';
    const off = isClientNoir(c) || c.actif === false;
    const badge = isClientNoir(c) ? ' <span class="badge">liste noire</span>' : (c.actif === false ? ' <span class="badge">inactif</span>' : '');
    const nChev = (c.chevaux || []).length, nChevInact = (c.chevaux || []).filter((h) => h.actif === false).length;
    const el = document.createElement('div'); el.className = 'list-item clickable' + (off ? ' item-off' : '');
    el.innerHTML = `<div class="li-main"><b>${esc(fullName(c)) || '<i>sans nom</i>'}${soc}${badge}</b><span class="li-sub">${esc(addrStr(c.addr)) || '<i>adresse ?</i>'} · ${nChev} cheval(aux)${nChevInact ? ' (' + nChevInact + ' inactif' + (nChevInact > 1 ? 's' : '') + ')' : ''}${nAdr > 1 ? ' · ' + nAdr + ' adresses' : ''}</span></div><div class="li-act"><span class="li-chev">›</span></div>`;
    el.addEventListener('click', () => editClient(c));
    list.appendChild(el);
  });
}
function editClient(existing, onSaved, prefillNom, prefill) {
  const key = 'client:' + (existing ? existing.id : 'new');
  const draft = DRAFTS.get(key);
  const w = draft ? draft : (existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), civilite: '', politesse: true, prenom: '', nom: (prefillNom || ''), email: '', tel: '', societe: '', assujettiTva: false, tvaNum: '', entrepriseNum: '', societeMemeAdresse: true, addr: emptyAddr(), societeAddr: emptyAddr(), chevaux: [] });
  // Pré-remplissage depuis un mail « prise de contact » (nouveau client, sans brouillon en cours).
  if (!existing && !draft && prefill) {
    if (prefill.prenom) w.prenom = prefill.prenom; if (prefill.nom) w.nom = prefill.nom;
    if (prefill.societe) { w.societe = prefill.societe; w.assujettiTva = true; }
    if (prefill.tvaNum) w.tvaNum = prefill.tvaNum;
    if (prefill.email) w.email = prefill.email; if (prefill.tel) w.tel = prefill.tel;
    if (prefill.rue || prefill.cpVille) { const cpm = (prefill.cpVille || '').match(/\d{4,5}/); const loc = (prefill.cpVille || '').replace(/\d{4,5}/, '').replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim(); w.addr = Object.assign(emptyAddr(), { rue: prefill.rue || '', cp: cpm ? cpm[0] : '', localite: loc }); }
    const chOff = prefill.status === 'inactif' || prefill.status === 'noir'; // client inactif/liste noire → chevaux importés inactifs
    if (prefill.cheval && (prefill.cheval.nom || prefill.cheval.anamnese)) { (w.chevaux = w.chevaux || []).push({ id: uid(), nom: prefill.cheval.nom || '', dateNaissance: prefill.cheval.dateNaissance || '', race: prefill.cheval.race || '', anamnese: prefill.cheval.anamnese || null, actif: !chOff, addrSource: 'client', addr: emptyAddr() }); }
    if (prefill.status === 'inactif') w.actif = false;
    else if (prefill.status === 'noir') { w.blacklist = true; w.actif = false; }
  }
  w.addr = toAddr(w.addr); w.societeAddr = toAddr(w.societeAddr);
  if (w.prenom === undefined) w.prenom = '';
  if (w.societe === undefined) w.societe = '';
  if (w.societeMemeAdresse === undefined) w.societeMemeAdresse = true;
  const saveDraft = () => DRAFTS.set(key, w); // mémorise la saisie en cours
  openModal(`
    <div class="modal-head"><b>${existing ? 'Éditer' : 'Nouveau'} client</b><button class="x" id="mX">✕</button></div>
    ${draft ? '<div class="draft-bar">✏️ Brouillon en cours restauré<button class="btn small" id="cDraftReset">Effacer le brouillon</button></div>' : ''}
    <div class="row"><label style="flex:0 0 90px">Civilité<select id="cCivilite"><option value="">—</option><option value="Mr"${w.civilite === 'Mr' ? ' selected' : ''}>Mr</option><option value="Mme"${w.civilite === 'Mme' ? ' selected' : ''}>Mme</option></select></label><label class="grow">Prénom<input type="text" id="cPrenom" value="${esc(w.prenom || '')}" /></label><label class="grow">Nom<input type="text" id="cNom" value="${esc(w.nom)}" /></label></div>
    <div class="row"><label class="grow">Email<input type="email" id="cEmail" value="${esc(w.email || '')}" placeholder="contact@exemple.be" /></label><label class="grow">Téléphone<input type="text" id="cTel" value="${esc(w.tel || '')}" /></label></div>
    <label>Société<input type="text" id="cSociete" value="${esc(w.societe)}" placeholder="Raison sociale (facultatif)" /></label>
    <label class="chk2"><input type="checkbox" id="cPolitesse" ${w.politesse !== false ? 'checked' : ''}/> Politesse dans le SMS (Mr/Mme + nom ; sinon prénom)</label>
    <label class="chk2"><input type="checkbox" id="cActif" ${w.actif !== false && !w.blacklist ? 'checked' : ''}/> Client actif</label>
    <label class="chk2"><input type="checkbox" id="cNoir" ${w.blacklist ? 'checked' : ''}/> Liste noire (client refusé — non proposé pour les tournées)</label>
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
        <label class="chk2"><input type="checkbox" data-bl ${h.blacklist ? 'checked' : ''}/> Liste noire (ne plus proposer de RDV)</label>
        <label>Date de naissance<input type="date" data-naiss value="${h.dateNaissance || ''}"/></label>
        <label>Race<input type="text" data-race value="${esc(h.race || '')}" placeholder="Race (facultatif)"/></label>
        <label>Date de prise en charge<input type="date" data-pec value="${h.datePriseEnCharge || ''}"/></label>
        ${h.anamnese ? '<button class="btn small" data-anam>📄 Formulaire (anamnèse)</button>' : ''}
        <label>Adresse du cheval<select data-src>
          <option value="client">Même adresse que le client</option>
          <option value="societe">Adresse de la société</option>
          <option value="specifique">Adresse spécifique</option>
        </select></label>
        ${h.addrSource === 'specifique'
    ? `<label class="chk2"><input type="checkbox" data-priv ${h.addrPrivee ? 'checked' : ''}/> Adresse privée (nom = nom du client)</label>${h.addrPrivee ? '' : `<label>Nom de l'adresse<input type="text" data-addrnom value="${esc(h.addrNom || '')}" placeholder="Écurie du Nord, pré de…"/></label>`}`
    : `<p class="hint">Nom de l'adresse : <b>${esc(chevalAddrNom(w, h))}</b> (repris ${h.addrSource === 'societe' ? 'de la société' : 'du client'}).</p>`}
        <div data-addrmount ${h.addrSource === 'specifique' ? '' : 'style="display:none"'}></div>`;
      row.querySelector('[data-src]').value = h.addrSource;
      row.querySelector('[data-nom]').addEventListener('input', (e) => { h.nom = e.target.value; saveDraft(); });
      row.querySelector('[data-actif]').addEventListener('change', (e) => { h.actif = e.target.checked; saveDraft(); });
      row.querySelector('[data-bl]').addEventListener('change', (e) => { h.blacklist = e.target.checked; if (e.target.checked) { h.actif = false; const ac = row.querySelector('[data-actif]'); if (ac) ac.checked = false; } saveDraft(); });
      row.querySelector('[data-naiss]').addEventListener('change', (e) => { h.dateNaissance = e.target.value || ''; saveDraft(); });
      row.querySelector('[data-race]').addEventListener('input', (e) => { h.race = e.target.value; saveDraft(); });
      { const ab = row.querySelector('[data-anam]'); if (ab) ab.addEventListener('click', () => modalAnamnese(h)); }
      row.querySelector('[data-pec]').addEventListener('change', (e) => { h.datePriseEnCharge = e.target.value || ''; saveDraft(); });
      row.querySelector('[data-del]').addEventListener('click', () => { if (!confirm('Supprimer ce cheval ?')) return; w.chevaux.splice(i, 1); renderCh(); saveDraft(); });
      row.querySelector('[data-src]').addEventListener('change', (e) => { h.addrSource = e.target.value; renderCh(); saveDraft(); });
      { const pv = row.querySelector('[data-priv]'); if (pv) pv.addEventListener('change', (e) => { h.addrPrivee = e.target.checked; renderCh(); saveDraft(); }); }
      { const an = row.querySelector('[data-addrnom]'); if (an) an.addEventListener('input', (e) => { h.addrNom = e.target.value; saveDraft(); }); }
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
  if ($('cEmail')) $('cEmail').addEventListener('input', (e) => { w.email = e.target.value; saveDraft(); });
  if ($('cTel')) $('cTel').addEventListener('input', (e) => { w.tel = e.target.value; saveDraft(); });
  $('cSociete').addEventListener('input', (e) => { w.societe = e.target.value; updateLegalState(); saveDraft(); });
  if ($('cActif')) $('cActif').addEventListener('change', (e) => { w.actif = e.target.checked; if (e.target.checked) { w.blacklist = false; if ($('cNoir')) $('cNoir').checked = false; } saveDraft(); });
  if ($('cNoir')) $('cNoir').addEventListener('change', (e) => { w.blacklist = e.target.checked; if (e.target.checked) { w.actif = false; if ($('cActif')) $('cActif').checked = false; } saveDraft(); });
  if ($('cCivilite')) $('cCivilite').addEventListener('change', (e) => { w.civilite = e.target.value; saveDraft(); });
  if ($('cPolitesse')) $('cPolitesse').addEventListener('change', (e) => { w.politesse = e.target.checked; saveDraft(); });
  $('cAssuj').addEventListener('change', (e) => { w.assujettiTva = e.target.checked; saveDraft(); });
  $('cTvaNum').addEventListener('input', (e) => { w.tvaNum = e.target.value; saveDraft(); });
  $('cEntNum').addEventListener('input', (e) => { w.entrepriseNum = e.target.value; saveDraft(); });
  $('cSocMeme').addEventListener('change', (e) => { w.societeMemeAdresse = e.target.checked; $('cSocAddrWrap').style.display = e.target.checked ? 'none' : ''; saveDraft(); });
  $('cAddCheval').addEventListener('click', () => { w.chevaux.push({ id: uid(), nom: '', addrSource: 'specifique', addr: emptyAddr() }); renderCh(); saveDraft(); });
  if (existing) $('cDel').addEventListener('click', () => { if (confirm('Supprimer ce client ?')) { DRAFTS.clear(key); clients = clients.filter((x) => x.id !== w.id); saveClients(); closeModal(); renderClients(); } });
  $('cSave').addEventListener('click', () => {
    if (!(w.nom || '').trim() && !(w.prenom || '').trim()) { $('cErr').textContent = 'Le nom (ou le prénom) est obligatoire.'; return; }
    if (!addrStr(w.addr).trim()) { $('cErr').textContent = 'L\'adresse du client est obligatoire.'; return; }
    // Avertissement : adresse(s) en liste noire repérée(s) sur ce client / ses chevaux.
    const noirs = []; const chk = (a, lbl) => { if (a && addrStr(a).trim() && isAddrNoir(a)) noirs.push(lbl + ' — ' + addrStr(a)); };
    chk(w.addr, 'Adresse du client'); if (w.societe && w.societeMemeAdresse === false) chk(w.societeAddr, 'Adresse société');
    (w.chevaux || []).forEach((h) => chk(chevalAddr(w, h), '🐴 ' + (h.nom || 'cheval')));
    if (noirs.length && !confirm('⚠ Adresse(s) en LISTE NOIRE détectée(s) :\n\n' + noirs.join('\n') + '\n\nEnregistrer ce client quand même ?')) return;
    const i = clients.findIndex((x) => x.id === w.id); if (i >= 0) clients[i] = w; else clients.push(w);
    DRAFTS.clear(key); saveClients(); reconcileActiveTours(); closeModal();
    if (onSaved) onSaved(w); else renderClients();
  });
}

// Mise en page d'un formulaire (anamnèse / mail) : chaque champ = l'intitulé de référence encadré/surligné, puis la réponse du client en dessous, avec de l'espace pour bien les distinguer.
function anamneseRowsHtml(f) {
  const keys = Object.keys(f || {});
  if (!keys.length) return '<p class="hint">Formulaire vide.</p>';
  return keys.map((k) => `<div class="anam-item"><div class="anam-q">${esc(k)}</div><div class="anam-a">${f[k] ? esc(f[k]) : '<span class="anam-empty">— (non renseigné)</span>'}</div></div>`).join('');
}
// Formulaire d'anamnèse (issu d'un mail « prise de contact ») rangé sur la fiche cheval — visualisation.
function modalAnamnese(h) {
  const f = (h && h.anamnese) || {};
  openModal(`<div class="modal-head"><b>📄 Formulaire — ${esc((h && h.nom) || 'cheval')}</b><button class="x" id="mX">✕</button></div><div class="anam-list" style="max-height:64vh;overflow:auto">${anamneseRowsHtml(f)}</div><div class="actions"><button class="btn block" id="anClose">Fermer</button></div>`);
  $('mX').addEventListener('click', closeModal); $('anClose').addEventListener('click', closeModal);
}
// ================= GESTION → ADRESSES CHEVAUX =================
let adrChevFilter = 'actives'; // actives (défaut) | inactifs | noir
function renderChevAddresses() {
  const seg = $('adrChevFilterSeg'); if (seg) seg.querySelectorAll('.seg-btn').forEach((b) => { if (!b._afw) { b._afw = true; b.addEventListener('click', () => { adrChevFilter = b.dataset.af; renderChevAddresses(); }); } b.classList.toggle('on', b.dataset.af === adrChevFilter); });
  const box = $('adrChevList'); if (!box) return; box.innerHTML = '';
  const all = chevalAddresses();
  const match = (e) => { const st = addrStatusOf(e.addr); return adrChevFilter === 'noir' ? st === 'noir' : adrChevFilter === 'inactifs' ? st === 'inactif' : st === 'actif'; };
  const shown = all.filter(match).sort((a, b) => addrStr(a.addr).localeCompare(addrStr(b.addr)));
  if ($('adrChevEmpty')) { $('adrChevEmpty').style.display = shown.length ? 'none' : 'block'; $('adrChevEmpty').textContent = all.length ? 'Aucune adresse dans cette catégorie.' : 'Aucune adresse.'; }
  shown.forEach((e) => {
    const st = addrStatusOf(e.addr);
    const noms = Array.from(e.noms).filter(Boolean).join(' · ');
    const badge = st === 'noir' ? ' <span class="badge badge-noir">liste noire</span>' : st === 'inactif' ? ' <span class="badge">inactive</span>' : '';
    const el = document.createElement('div'); el.className = 'list-item stack-act' + (st !== 'actif' ? ' item-off' : '');
    el.innerHTML = `<div class="li-main"><b>${esc(noms || 'Adresse')}${badge}</b><span class="li-sub">${esc(addrStr(e.addr))} · ${e.usages.length} cheval(aux)</span></div><div class="li-act li-act-col">${st !== 'actif' ? '<button class="btn small" data-st="actif">✅ Activer</button>' : ''}${st !== 'inactif' ? '<button class="btn small" data-st="inactif">💤 Inactive</button>' : ''}${st !== 'noir' ? '<button class="btn small danger" data-st="noir">⛔ Liste noire</button>' : ''}</div>`;
    el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { setAddrStatus(e.addr, b.dataset.st); renderChevAddresses(); }));
    box.appendChild(el);
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
// ---------- Onglet Tournée : sous-onglets [Tournées] [Replacer un RDV] [Annulations] ----------
let currentTsub = 'liste';
function showTournees(sub) {
  currentTsub = sub || 'liste';
  document.querySelectorAll('#tournSub .subtab').forEach((b) => b.classList.toggle('active', b.dataset.tsub === currentTsub));
  document.querySelectorAll('#tab-tournees .subpanel').forEach((p) => p.classList.toggle('active', p.id === 'tsub-' + currentTsub));
  const cb = document.querySelector('#tournSub .subtab[data-tsub="' + currentTsub + '"]'), cl = document.querySelector('#tournSub .subnav-label');
  if (cb && cl) cl.textContent = cb.textContent;
  if ($('tournSub')) $('tournSub').classList.remove('open');
  if (currentTsub === 'annul') renderAnnulations();
  else if (currentTsub === 'replacer') { if (typeof renderReplacer === 'function') renderReplacer(); }
  else renderTours();
  window.scrollTo(0, 0);
}
// Somme des lignes qu'un cheval AURAIT été facturé (manque à gagner d'une annulation), au tarif courant.
function chevalWouldBeLines(cv) {
  const lines = []; const r = rate();
  if (cv.parage && S.parage && S.parage.prixHT > 0) lines.push({ libelle: 'Parage et équilibrage', ttc: S.parage.prixHT * (1 + (S.parage.tvaPct || 0) / 100) });
  const baseMat = baseMateriel(); if (cv.parage && baseMat > 0) lines.push({ libelle: 'Matériel', ttc: baseMat * (1 + r) });
  [['fourbure', 'Fourbure', S.fourbureHT], ['npas', 'NPAS', S.npasHT], ['infection', 'Infection', S.infectionHT]].forEach(([k, l, p]) => { if (cv[k] && p > 0) lines.push({ libelle: l, ttc: p * (1 + r) }); });
  if (cv.visite && cv.visiteArtId) { const av = (S.articlesCatalogue || []).find((x) => x.id === cv.visiteArtId); if (av) lines.push({ libelle: av.libelle, ttc: (av.prixHT || 0) * (1 + (av.tvaPct || 0) / 100) }); }
  return lines;
}
const chevalWouldBeTTC = (cv) => chevalWouldBeLines(cv).reduce((s, l) => s + l.ttc, 0);
// Toutes les annulations/reports (scan des tournées).
function allCancellations() {
  const out = [];
  allTours().forEach((t) => (t.arrets || []).forEach((a, ai) => (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => {
    if (!chevalCancelled(cv)) return;
    out.push({ tour: t, arretIdx: ai, clientId: cl.clientId, clientNom: clientName(cl.clientId), cheval: cv.nom, cv, status: cv.cancel.status, reason: cv.cancel.reason, note: cv.cancel.note || '', at: cv.cancel.at, date: t.date, replaced: !!cv.cancel.replacedTourId, ttc: chevalWouldBeTTC(cv) });
  }))));
  return out.sort((x, y) => (y.date || '').localeCompare(x.date || ''));
}
// Options de période (Mois/Trim/Sem/Année) à partir d'une liste de mois 'YYYY-MM'.
function periodOptionsFrom(type, months) {
  if (type === 'mois') return months.map((m) => ({ key: m, label: monthLabel(m) }));
  const ys = [...new Set(months.map((m) => m.slice(0, 4)))].sort().reverse();
  if (type === 'annee') return ys.map((y) => ({ key: y, label: 'Année ' + y }));
  if (type === 'semestre') return ys.flatMap((y) => [{ key: y + '-S1', label: '1ᵉʳ semestre ' + y }, { key: y + '-S2', label: '2ᵉ semestre ' + y }]);
  return ys.flatMap((y) => [1, 2, 3, 4].map((q) => ({ key: y + '-T' + q, label: 'Trimestre ' + q + ' ' + y })));
}
// Suppression définitive d'un cheval annulé : le retire de la tournée (déjà hors facture) sans toucher aux autres.
function deleteCancelledCheval(c) {
  const t = c.tour; const a = (t.arrets || [])[c.arretIdx]; if (!a) return;
  const cl = (a.clients || []).find((x) => x.clientId === c.clientId); if (!cl) return;
  cl.chevaux = (cl.chevaux || []).filter((cv) => !(norm(cv.nom) === norm(c.cheval) && chevalCancelled(cv)));
  const i = tournees.findIndex((x) => x.id === t.id); if (i >= 0) { tournees[i] = t; saveTournees(); } else { const ai = archive.findIndex((x) => x.id === t.id); if (ai >= 0) { archive[ai] = t; saveArchive(); } }
}
let annulType = 'trimestre', annulPeriodKey = null;
function renderAnnulations() {
  const seg = $('annulTypeSeg'), perSel = $('annulPeriod'), box = $('annulList'); if (!seg || !perSel || !box) return;
  seg.querySelectorAll('.seg-btn').forEach((b) => { if (!b._aw) { b._aw = true; b.addEventListener('click', () => { annulType = b.dataset.atype; annulPeriodKey = null; renderAnnulations(); }); } b.classList.toggle('on', b.dataset.atype === annulType); });
  const all = allCancellations();
  const months = [...new Set(all.map((c) => (c.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const opts = periodOptionsFrom(annulType, months);
  if (!opts.length) { perSel.innerHTML = ''; box.innerHTML = ''; if ($('annulEmpty')) $('annulEmpty').style.display = 'block'; if ($('annulTot')) $('annulTot').textContent = ''; return; }
  if (annulPeriodKey == null && annulType === 'trimestre') { const ts = todayStr(); const cur = ts.slice(0, 4) + '-T' + Math.ceil(parseInt(ts.slice(5, 7), 10) / 3); if (opts.some((o) => o.key === cur)) annulPeriodKey = cur; } // défaut : trimestre en cours (s'il contient des annulations)
  if (!opts.some((o) => o.key === annulPeriodKey)) annulPeriodKey = opts[0].key;
  perSel.innerHTML = opts.map((o) => `<option value="${o.key}"${o.key === annulPeriodKey ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  perSel.onchange = () => { annulPeriodKey = perSel.value; renderAnnulations(); };
  const range = new Set(monthsOfRange(annulType, annulPeriodKey));
  const list = all.filter((c) => range.has((c.date || '').slice(0, 7)));       // section 1 : période sélectionnée
  const others = all.filter((c) => !range.has((c.date || '').slice(0, 7)));     // section 2 : toutes les autres (non supprimées)
  if ($('annulEmpty')) $('annulEmpty').style.display = all.length ? 'none' : 'block';
  const perte = list.filter((c) => !c.replaced); // un cheval replacé a été servi ailleurs → hors « manque à gagner »
  const totA = perte.filter((c) => c.status === 'annule').reduce((s, c) => s + c.ttc, 0), totR = perte.filter((c) => c.status === 'reporte').reduce((s, c) => s + c.ttc, 0);
  if ($('annulTot')) $('annulTot').innerHTML = list.length ? `Période : annulés <b>${eur(totA)}</b> · reportés <b>${eur(totR)}</b> (manque à gagner, replacés exclus)` : (all.length ? 'Aucune annulation dans cette période — voir « Autres annulations » ci-dessous.' : '');
  box.innerHTML = '';
  const mkItem = (c) => {
    const el = document.createElement('div'); el.className = 'list-item';
    const stLbl = c.status === 'reporte' ? '↩ reporté' : '🚫 annulé';
    const paid = chevalCredited(c.cv);
    el.innerHTML = `<div class="li-main"><b>🐴 ${esc(c.cheval)} <span class="li-sub">— ${esc(c.clientNom)}</span></b><span class="li-sub">${esc(fmtDateFr(c.date))} · ${stLbl} · motif ${c.reason === 'pro' ? 'pro' : 'client'}${c.note ? ' · ' + esc(c.note) : ''}${c.replaced ? ' · <b>replacé</b>' : ''}${paid ? ' · <b>payé (note de crédit)</b>' : ''} · ${eur(c.ttc)}</span></div><div class="li-act"><button class="btn small danger" data-del title="Supprimer définitivement">🗑</button></div>`;
    el.querySelector('[data-del]').addEventListener('click', () => { if (!confirm('Supprimer définitivement cet arrêt annulé (' + c.cheval + ') ? Il disparaît des listes et des stats.')) return; deleteCancelledCheval(c); renderAnnulations(); });
    return el;
  };
  const addGroups = (items) => { const g = {}; items.forEach((c) => { const k = (c.date || '').slice(0, 7); (g[k] = g[k] || []).push(c); }); Object.keys(g).sort().reverse().forEach((k) => { const h = document.createElement('h3'); h.className = 'rsub'; h.textContent = monthLabel(k); box.appendChild(h); g[k].forEach((c) => box.appendChild(mkItem(c))); }); }; // classé par mois/année
  if (list.length) addGroups(list);
  if (others.length) { const sep = document.createElement('div'); sep.innerHTML = '<h2 class="rsub" style="margin-top:18px;border-top:1px solid var(--line);padding-top:12px">Autres annulations (hors période)</h2><p class="hint">Toutes les annulations encore présentes (non supprimées définitivement), en dehors de la période sélectionnée.</p>'; box.appendChild(sep); addGroups(others); }
}
// ---------- Replacer un RDV (chevaux reportés, non encore replacés), groupés par client ----------
function reportedByClient() {
  const map = {};
  allCancellations().forEach((c) => { if (c.status === 'reporte' && !c.replaced) { (map[c.clientId] = map[c.clientId] || { clientId: c.clientId, nom: c.clientNom, items: [] }).items.push(c); } });
  return Object.values(map).sort((a, b) => a.nom.localeCompare(b.nom));
}
function renderReplacer() {
  const box = $('replacerList'); if (!box) return; box.innerHTML = '';
  const groups = reportedByClient();
  if ($('replacerEmpty')) $('replacerEmpty').style.display = groups.length ? 'none' : 'block';
  groups.forEach((g) => {
    const el = document.createElement('div'); el.className = 'list-item';
    el.innerHTML = `<div class="li-main"><b>${esc(g.nom)}</b><span class="li-sub">🐴 ${esc(g.items.map((c) => c.cheval).join(', '))} · ${g.items.length} RDV reporté(s)</span></div><div class="li-act"><button class="btn small primary" data-fix>📅 Fixer une date</button></div>`;
    el.querySelector('[data-fix]').addEventListener('click', () => modalReplacerDate(g));
    box.appendChild(el);
  });
}
// Replace les chevaux reportés d'un client : par défaut sur le MÊME RDV (date commune) ; chaque cheval peut aller à une DATE DIFFÉRENTE ou être IGNORÉ (non replacé).
function modalReplacerDate(g) {
  const client = clients.find((x) => x.id === g.clientId); if (!client) { renderReplacer(); return; }
  const proposed = proposedRdvDate(todayStr());
  const common = { date: proposed };
  const entries = g.items.map((it) => ({ item: it, nom: it.cheval, cvObj: (client.chevaux || []).find((x) => norm(x.nom) === norm(it.cheval)) || null, ignore: false, sep: false, date: proposed }));
  const previewHtml = (d) => { const pv = rdvDayPreview(d); return `<b>${d ? fmtDateFr(d) : '—'}</b> — arrêts déjà prévus : ${pv.arrets.length ? esc(pv.arrets.join(' · ')) : 'aucune tournée'}`; };
  const render = () => {
    openModal(`<div class="modal-head"><b>📅 Replacer — ${esc(g.nom)}</b><button class="x" id="mX">✕</button></div>
      <p class="hint">Par défaut, tous les chevaux reportés sont replacés sur le <b>même RDV</b>. Cochez « date différente » pour en placer un un autre jour, ou « ne pas replacer » pour l'ignorer.</p>
      <div class="card" style="margin-bottom:8px"><label>Date du RDV commun<input type="date" id="rpCommon" value="${common.date}"/></label><p class="hint" id="rpCommonPrev"></p></div>
      <div id="rpChevaux"></div>
      <div class="actions"><button class="btn primary block" id="rpOk">Fixer les RDV</button></div>`);
    $('mX').addEventListener('click', closeModal);
    const cp = $('rpCommonPrev'); const upCommon = () => { if (cp) cp.innerHTML = previewHtml(common.date); };
    $('rpCommon').addEventListener('change', (e) => { common.date = e.target.value; upCommon(); }); upCommon();
    const box = $('rpChevaux');
    entries.forEach((en) => {
      const wrap = document.createElement('div'); wrap.className = 'card rdv-cheval' + (en.ignore ? ' rdv-ignored' : ''); wrap.style.marginBottom = '8px';
      let inner = `<div class="rdv-ch-head"><b>🐴 ${esc(en.nom)}</b>${en.cvObj ? '' : ' <span class="li-sub">(cheval introuvable)</span>'}<label class="rdv-ch-opt"><input type="checkbox" data-ign ${en.ignore ? 'checked' : ''}/> ne pas replacer</label></div>`;
      if (!en.ignore && en.cvObj) { inner += `<label class="rdv-ch-opt"><input type="checkbox" data-sep ${en.sep ? 'checked' : ''}/> date différente</label>`; inner += en.sep ? `<label>Date du RDV<input type="date" data-date value="${en.date}"/></label><p class="hint" data-prev></p>` : `<p class="hint">→ sur le RDV commun</p>`; }
      wrap.innerHTML = inner;
      wrap.querySelector('[data-ign]').addEventListener('change', (e) => { en.ignore = e.target.checked; render(); });
      const sep = wrap.querySelector('[data-sep]'); if (sep) sep.addEventListener('change', (e) => { en.sep = e.target.checked; render(); });
      const dt = wrap.querySelector('[data-date]'), prev = wrap.querySelector('[data-prev]');
      if (dt) { const up = () => { if (prev) prev.innerHTML = previewHtml(dt.value); }; dt.addEventListener('change', (e) => { en.date = e.target.value; up(); }); up(); }
      box.appendChild(wrap);
    });
    $('rpOk').addEventListener('click', () => {
      const groups = {};
      entries.forEach((en) => { if (en.ignore || !en.cvObj) return; const d = en.sep ? en.date : common.date; if (!d) return; (groups[d] = groups[d] || []).push(en); });
      Object.keys(groups).forEach((d) => {
        const res = scheduleClientOnDate(d, client, groups[d].map((en) => en.cvObj));
        groups[d].forEach((en) => { if (en.item.cv && en.item.cv.cancel) en.item.cv.cancel.replacedTourId = res.tour.id; }); // marque replacé (sort de la liste, reste dans Annulations)
      });
      saveTournees(); saveArchive(); closeModal(); renderHome();
    });
  };
  render();
}
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
// Migration ponctuelle (montant INCHANGÉ) : retire les chevaux non faits des résultats DÉJÀ calculés
// (clôturées/archivées gardent leur `result` figé) pour que les stats/analyses n'imputent plus de « cheval fantôme ».
// On ne touche qu'aux LISTES de chevaux (rows + déplacement), jamais aux montants/matériel/articles.
function sanitizeTourStats(t) {
  const R = t.result; if (!R || !R.rows) return false;
  let changed = false; const faitByClient = {};
  (R.rows || []).forEach((r) => (r.clients || []).forEach((cl) => {
    const set = faitByClient[cl.clientId] || (faitByClient[cl.clientId] = new Set());
    const kept = (cl.chevaux || []).filter(chevalFait);
    if (kept.length !== (cl.chevaux || []).length) changed = true;
    cl.chevaux = kept; kept.forEach((c) => set.add(c.nom));
  }));
  (R.parClient || []).forEach((m) => (m.deplacement || []).forEach((l) => {
    const set = faitByClient[m.clientId]; if (!set) return;
    const kept = (l.chevaux || []).filter((n) => set.has(n));
    if (kept.length !== (l.chevaux || []).length) changed = true;
    l.chevaux = kept;
  }));
  return changed;
}
function sanitizeAllTourStats() {
  let a = false, b = false;
  (tournees || []).forEach((t) => { if (sanitizeTourStats(t)) a = true; });
  (archive || []).forEach((t) => { if (sanitizeTourStats(t)) b = true; });
  if (a) saveTournees(); if (b) saveArchive();
}
// Migration 1.1.57 : un cheval annulé qui porte une note de crédit doit être marqué « credited »
// (facturé dans le result figé, la NC le neutralise). Sans ça, l'ancienne donnée le sortait de la facture ET la NC le soustrayait → double réduction.
function migrateCreditedCancellations() {
  const ncByKey = {};
  (S.notesCredit || []).forEach((n) => { ncByKey[n.tourId + '|' + n.clientId + '|' + norm(n.chevalNom)] = n; });
  let ta = false, tb = false;
  const scan = (list) => { let ch = false; (list || []).forEach((t) => (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => {
    if (!chevalCancelled(cv) || cv.cancel.credited) return;
    const nc = ncByKey[t.id + '|' + cl.clientId + '|' + norm(cv.nom)];
    if (nc) { cv.cancel.credited = true; cv.cancel.creditNoteId = nc.id; ch = true; }
  })))); return ch; };
  if (scan(tournees)) ta = true; if (scan(archive)) tb = true;
  if (ta) saveTournees(); if (tb) saveArchive();
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
        if (!ncl.chevaux.some((x) => (x.id && x.id === h.id) || norm(x.nom) === norm(h.nom))) ncl.chevaux.push({ id: h.id, nom: h.nom, fourbure: !!cv.fourbure, npas: !!cv.npas, infection: !!cv.infection, parage: !!cv.parage, heure: cv.heure || '', present: cv.present, visite: !!cv.visite, visiteArtId: cv.visiteArtId || null, cancel: cv.cancel || null, parageOffert: !!cv.parageOffert, visiteOffert: !!cv.visiteOffert, fourbureOffert: !!cv.fourbureOffert, npasOffert: !!cv.npasOffert, infectionOffert: !!cv.infectionOffert });
      });
    });
  });
  newArrets.forEach((na) => { const old = oldArrets.find((o) => norm(addrStr(o.addr)) === norm(addrStr(na.addr))); if (old) { if (typeof old.realMin === 'number') na.realMin = old.realMin; if (typeof old.validatedAt === 'number') na.validatedAt = old.validatedAt; if (old.heure) na.heure = old.heure; if (old.rdvDone) na.rdvDone = old.rdvDone; } });
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

// Ce qui manque au paiement d'un client (chaîne) ou null si complet. Règle UNIQUE, partagée par le bouton « fait » et la clôture.
// Mode choisi ; en liquide : montant encaissé requis ; si « paiement partiel » coché : le montant impayé doit être renseigné (> 0).
function clientPaiementIssue(t, cid) {
  const p = (t.payments || {})[cid]; const method = p ? p.method : null;
  if (method !== 'virement' && method !== 'liquide') return 'mode de paiement non choisi';
  if (method === 'liquide') {
    if (!(p.rectifie != null || p.montantPaye != null)) return 'montant liquide non renseigné';
    if (p.partiel && !(p.impaye != null && p.impaye > 0)) return 'montant impayé non renseigné';
  }
  return null;
}
function clientPaiementDone(t, cid) { return !clientPaiementIssue(t, cid); }
// Le paiement de l'arrêt est « fait » si TOUS ses clients ont un paiement complet.
function arretPaiementDone(t, a) {
  const cls = (a.clients || []); if (!cls.length) return false;
  return cls.every((cl) => clientPaiementDone(t, cl.clientId));
}
function tourCloseBlock(t) {
  const out = []; const seen = new Set();
  (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => {
    if (seen.has(cl.clientId)) return; seen.add(cl.clientId);
    const iss = clientPaiementIssue(t, cl.clientId); if (iss) out.push(clientName(cl.clientId) + ' : ' + iss);
  }));
  return out;
}
// Sécurité « au moins un cheval fait » : chaque client de l'arrêt QUI A des chevaux à cette adresse doit en avoir ≥1 coché (parage OU visite).
// Un client SANS cheval à l'adresse (déplacement seul) est OK. Empêche de payer/clôturer un arrêt où aucun cheval n'a été pris en charge.
function arretActeOK(a) {
  return (a.clients || []).every((cl) => {
    if ((cl.chevaux || []).some(chevalBilled)) return true;
    const c = clients.find((x) => x.id === cl.clientId);
    const hasHorsesHere = c ? activeChevaux(c).some((h) => norm(addrStr(chevalAddr(c, h))) === norm(addrStr(a.addr))) : (cl.chevaux || []).length > 0;
    return !hasHorsesHere;
  });
}
// Un arrêt est « finalisé » = au moins un cheval fait, clôturé (validatedAt via Paiement & clôture) ET paiement complet.
function arretFinalise(t, a) { return arretActeOK(a) && typeof a.validatedAt === 'number' && arretPaiementDone(t, a); }
// Ce qui empêche de finaliser/figer une tournée : arrêt sans cheval coché, non clôturé, ou paiement incomplet (dans l'ordre).
function tourFinalizeBlock(t) {
  const out = [];
  (t.arrets || []).forEach((a, i) => {
    const lbl = (i + 1) + '. ' + (labelFor(a) || 'arrêt');
    if (!arretActeOK(a)) { out.push(lbl + ' : aucun cheval coché (Parage ou Visite obligatoire)'); return; }
    if (typeof a.validatedAt !== 'number') { out.push(lbl + ' : arrêt non clôturé (💶 Paiement & clôture à valider)'); return; }
    (a.clients || []).forEach((cl) => { const iss = clientPaiementIssue(t, cl.clientId); if (iss) out.push(lbl + ' — ' + clientName(cl.clientId) + ' : ' + iss); });
  });
  return out;
}
// Index du 1ᵉʳ arrêt non finalisé (pour imposer l'ordre) ; = nb d'arrêts si tous finalisés.
function firstOpenArret(t) { const A = t.arrets || []; for (let i = 0; i < A.length; i++) { if (!arretFinalise(t, A[i])) return i; } return A.length; }
function openEditor() {
  const st = statusOf(currentTour); const locked = st === 'cloturee' && !currentTour._review; // tournée importée « à revalider » → éditable même clôturée
  reconcileTour(currentTour); // resync chevaux/clients (non clôturée)
  const dateLbl = currentTour.date ? fmtDateFr(currentTour.date) : '';
  $('edTitle').textContent = currentTour.result ? ('Tournée — ' + dateLbl + (currentTour.nom ? ' : ' + currentTour.nom : '')) : 'Nouvelle tournée';
  $('edStatusBadge').textContent = STATUS_LBL[st];
  $('edDate').value = currentTour.date; $('edDate').disabled = locked;
  if ($('edNom')) { $('edNom').value = currentTour.nom || ''; $('edNom').disabled = locked; }
  const H = tourHome();
  const hasHome = addrStr(H).trim();
  const depEst = estimatedDepartureHM(currentTour);
  $('edHome').textContent = hasHome ? ('Départ : ' + addrStr(H) + (currentTour.home && addrStr(currentTour.home).trim() ? ' (propre à cette tournée)' : ' (domicile)') + (depEst ? ' · 🚕 départ estimé ' + depEst : '')) : '⚠️ Départ non défini — cliquez « Changer le départ », ou renseignez-le dans Gestion → Mes adresses → Point de départ.';
  if ($('edHome')) $('edHome').classList.toggle('err', !hasHome);
  // Arrivée : distincte si définie, sinon retour au départ.
  const hasArr = currentTour.arrivee && addrStr(currentTour.arrivee).trim();
  if ($('edArrivee')) $('edArrivee').textContent = hasArr ? ('Arrivée : ' + addrStr(currentTour.arrivee) + ' (propre à cette tournée)') : (hasHome ? 'Arrivée : retour au départ' : 'Arrivée : non définie');
  if ($('edChangeHome')) $('edChangeHome').style.display = locked ? 'none' : '';
  if ($('edChangeArrivee')) $('edChangeArrivee').style.display = locked ? 'none' : '';
  if ($('edCloseWrap')) $('edCloseWrap').style.display = locked ? 'none' : '';
  if ($('edCloseWarn')) { const blk = locked ? [] : tourFinalizeBlock(currentTour); $('edCloseWarn').innerHTML = blk.length ? '🔒 Clôture bloquée — finalisez chaque arrêt dans « Trajet du jour » (💶 Paiement & clôture) :<br>• ' + blk.map(esc).join('<br>• ') : ''; $('edCloseWarn').classList.toggle('hidden', !blk.length); }
  const review = !!currentTour._review;
  $('edLockBanner').classList.toggle('hidden', !locked && !review);
  if ($('edLockBanner')) { if (review) $('edLockBanner').textContent = '📥 Tournée importée « à revalider » — vérifiez chaque arrêt puis « ✓ Valider » ci-dessous pour recalculer et figer.'; else if (locked) $('edLockBanner').textContent = currentTour.autoClosedAt ? '🤖 Tournée clôturée automatiquement · ' + hm(currentTour.autoClosedAt) + ' (retour + 3 h). Lecture seule.' : '🔒 Tournée clôturée (figée). Lecture seule.'; }
  if ($('edRevalider')) $('edRevalider').style.display = review ? '' : 'none';
  if ($('edRecoverWrap')) $('edRecoverWrap').style.display = currentTour.recovered ? '' : 'none'; // tournée récupérée : compléter les données manquantes pour les stats
  if ($('edActesWrap')) $('edActesWrap').style.display = (locked && !review) ? '' : 'none'; // tournée figée : corriger les prestations (réactiver un cheval non facturé + recalcul auto complet si géométrie périmée)
  if ($('edCancelBillWrap')) $('edCancelBillWrap').style.display = (locked && !review) ? '' : 'none'; // tournée figée : annuler une facturation (cheval/arrêt/client/tournée)
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
  const pickList = clients.filter(isClientActif); // seuls les clients actifs sont proposés (ni inactifs, ni liste noire)
  if (pickList.length) mountClientPicker($('pickPicker'), { list: pickList, highlightId, onPick: (c) => chooseClientTargets(c) });
}
const societeAddrOf = (c) => (c.societeMemeAdresse !== false || !addrStr(c.societeAddr)) ? c.addr : c.societeAddr;
const chevalAddr = (c, h) => {
  const src = h.addrSource || (h.memeAdresse === false ? 'specifique' : 'client');
  if (src === 'societe') return societeAddrOf(c);
  if (src === 'specifique') return addrStr(h.addr) ? h.addr : c.addr;
  return c.addr;
};
// Nom d'affichage de l'adresse d'un cheval, selon la source : client → nom du client ; société → nom de la société ; spécifique → « adresse privée » (= nom du client) ou nom saisi.
function chevalAddrNom(c, h) {
  const src = h.addrSource || 'client';
  if (src === 'societe') return c.societe || fullName(c);
  if (src === 'specifique') { if (h.addrPrivee) return fullName(c); return (h.addrNom || '').trim() || fullName(c) || 'Adresse'; }
  return fullName(c) || 'Adresse';
}
// Statut d'une adresse PHYSIQUE (clé = adresse normalisée), partagé par tous les chevaux à cette adresse : 'actif' (défaut) | 'inactif' | 'noir' (liste noire).
const addrKey = (a) => norm(addrStr(a));
function addrStatusOf(a) { const k = addrKey(a); return (k && S.addrStatus && S.addrStatus[k]) || 'actif'; }
function setAddrStatus(a, st) { const k = addrKey(a); if (!k) return; if (!S.addrStatus || typeof S.addrStatus !== 'object') S.addrStatus = {}; if (st === 'actif') delete S.addrStatus[k]; else S.addrStatus[k] = st; saveSettings(); }
const isAddrNoir = (a) => addrStatusOf(a) === 'noir';
// Toutes les adresses de chevaux répertoriées, agrégées par adresse physique.
function chevalAddresses() {
  const map = {};
  clients.forEach((c) => (c.chevaux || []).forEach((h) => {
    const a = chevalAddr(c, h); const k = addrKey(a); if (!k) return;
    if (!map[k]) map[k] = { key: k, addr: a, noms: new Set(), usages: [] };
    map[k].noms.add(chevalAddrNom(c, h)); map[k].usages.push({ client: c, cheval: h });
  }));
  return Object.values(map);
}
function chooseClientTargets(c) {
  const chs = activeChevaux(c); // seuls les chevaux actifs (hors inactif / liste noire) sont proposés
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
    const aFinal = !locked && arretFinalise(currentTour, a); // arrêt finalisé dans une tournée encore ouverte → figé (lecture seule), les autres restent modifiables
    const addrNoir = isAddrNoir(a.addr);
    const el = document.createElement('div'); el.className = 'arret' + (aFinal ? ' arret-locked' : '') + (addrNoir ? ' arret-noir' : ''); el.dataset.idx = i;
    el.innerHTML = `
      <div class="a-top">
        ${locked ? '' : '<div class="a-drag" title="Glisser pour réordonner">⠿</div>'}
        ${locked ? `<span class="a-num">${i + 1}</span>` : `<input class="a-num-in" data-order type="number" min="1" max="${N}" value="${i + 1}" title="N° d'ordre de passage (modifiable)"/>`}
        <div class="grow"><b>${esc(labelFor(a))}</b>${aFinal ? ' <span class="badge badge-lock">🔒 clôturé</span>' : ''}${addrNoir ? ' <span class="badge badge-noir">⛔ adresse liste noire</span>' : ''}<div class="li-sub">${esc(addrStr(a.addr))}${nb > 1 ? ' · <span class="badge">' + nb + ' clients ici</span>' : ''}</div></div>
        ${locked ? '' : '<button class="a-del" data-del title="Retirer">✕</button>'}
      </div>
      ${(!locked && single) ? `<label class="a-reduc-row"><span>Réduction articles</span><span class="fu"><input type="number" data-reduc-h min="0" max="100" step="1" value="${currentTour.reductions && currentTour.reductions[single.clientId] || ''}" placeholder="0"/><span class="fu-unit">%</span></span></label>` : ''}
      <div class="a-grid"><label class="grow">Tarif appliqué<select data-type ${locked ? 'disabled' : ''}><option value="tournee">Tournée</option><option value="visite">Visite</option><option value="urgence">Urgence</option></select></label></div>`;
    el.querySelector('[data-type]').value = a.type || 'tournee';
    // Temps trajet + (tournée non clôturée) Waze / Route / Paiement. Tournée clôturée = figée : aucun bouton (paiement se gère en Compta).
    const nav = document.createElement('div'); nav.className = 'a-nav';
    const estMin = legMins[i] != null ? Math.round(legMins[i]) : null;
    const realMin = (typeof a.realMin === 'number') ? a.realMin : null;
    const routeDone = realMin != null; const hhv = arretHeure(a); const payDone = arretPaiementDone(currentTour, a);
    // Heure de RDV de l'arrêt (1 par arrêt), Waze, Route (grisé ✓ si temps réel encodé), RDV (grisé ✓ si suivant programmé), Paiement.
    nav.innerHTML = `<span class="a-nav-t">🕒 ${estMin != null ? durMin(estMin) + ' est.' : '—'}${realMin != null ? ' · <b>' + durMin(realMin) + ' réel</b>' : ''}</span>${locked ? '' : `<span class="a-nav-b"><label class="a-heure${hhv ? ' done' : ''}" title="Heure de RDV de l'arrêt">🕘 <input type="time" data-aheure value="${hhv}"/></label> <button class="btn small" data-waze>${navLabel()}</button> <button class="btn small${routeDone ? ' done' : ''}" data-route>Route${routeDone ? ' ✓' : ''}</button> <button class="btn small${payDone ? ' done' : ''}" data-pay>💶 Paiement${payDone ? ' ✓' : ''}</button> <button class="btn small${a.rdvDone ? ' done' : ''}" data-rdv>📅 RDV${a.rdvDone ? ' ✓' : ''}</button> <button class="btn small" data-add-pret>＋ Prêt</button></span>`}`;
    if (!locked) {
      nav.querySelector('[data-waze]').addEventListener('click', () => openNav(a.addr));
      nav.querySelector('[data-route]').addEventListener('click', () => modalRouteTime(currentTour, a, estMin, () => renderEditorArrets()));
      nav.querySelector('[data-pay]').addEventListener('click', () => modalPayment(currentTour, a, () => renderEditorArrets())); // classer le paiement pour la Compta
      const rdvB = nav.querySelector('[data-rdv]'); if (rdvB) rdvB.addEventListener('click', () => { const cid = (a.clients && a.clients[0]) ? a.clients[0].clientId : null; if (cid) modalRDV(currentTour, a, cid, () => renderEditorArrets()); });
      const prB = nav.querySelector('[data-add-pret]'); if (prB) prB.addEventListener('click', () => { if (a.clients.length === 1) modalPret(a.clients[0].clientId, currentTour); else modalActions('Prêt — quel client ?', a.clients.map((cl) => ({ label: clientName(cl.clientId), onClick: () => modalPret(cl.clientId, currentTour) }))); });
      const ah = nav.querySelector('[data-aheure]'); if (ah) ah.addEventListener('change', (e) => { a.heure = e.target.value || ''; saveTournees(); scheduleCalPush(currentTour); const lab = ah.closest('.a-heure'); if (lab) lab.classList.toggle('done', !!a.heure); if (i === 0 && $('edHome')) { const de = estimatedDepartureHM(currentTour); const cur = $('edHome').textContent.replace(/ · 🚕 départ estimé .*/, ''); $('edHome').textContent = cur + (de ? ' · 🚕 départ estimé ' + de : ''); } });
    }
    el.appendChild(nav);
    // Bouton planche / compte rendu photo — disponible même sur une tournée clôturée (récupère cheval/client/date).
    const pb = document.createElement('div'); pb.className = 'a-planche';
    pb.innerHTML = '<button class="btn small" data-planche>📷 Planche / compte rendu</button>';
    pb.querySelector('[data-planche]').addEventListener('click', () => modalArretPlanche(currentTour, a));
    el.appendChild(pb);
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
        const cObj = clients.find((x) => x.id === cl.clientId);
        const arretAddrN = norm(addrStr(a.addr));
        // Présence : TOUS les chevaux ACTIFS du client à l'adresse de cet arrêt (repli sur les chevaux déjà enregistrés).
        let pool = cObj ? activeChevaux(cObj).filter((hh) => norm(addrStr(chevalAddr(cObj, hh))) === arretAddrN) : [];
        if (!pool.length) pool = (cl.chevaux || []).map((cv) => ({ id: cv.id, nom: cv.nom }));
        if (!pool.length) return;
        const cvOf = (ph) => (cl.chevaux || []).find((x) => (x.id != null && ph.id != null && x.id === ph.id) || norm(x.nom) === norm(ph.nom));
        const ensureCv = (ph) => { let cv = cvOf(ph); if (!cv) { cv = { id: ph.id, nom: ph.nom, fourbure: false, npas: false, infection: false, parage: false, heure: '', present: true }; cl.chevaux.push(cv); } return cv; };
        const wrap = document.createElement('div'); wrap.className = 'a-patho';
        // Nom + réduction affichés ici SEULEMENT si plusieurs clients (sinon c'est dans l'en-tête de l'arrêt).
        let h = single ? '' : `<div class="patho-client">${esc(clientName(cl.clientId))}</div>`;
        if (!single) h += `<label class="reduc-row"><span class="grow">Réduction articles</span><input type="number" data-reduc step="1" min="0" max="100" value="${currentTour.reductions[cl.clientId] || ''}" placeholder="0" style="width:70px"/><span>%</span></label>`;
        // Colonnes : Parage puis Visite (les 2 prestations qui rattachent un cheval), puis pathologies. Pas de colonne « Présent » : la présence est IMPLICITE (parage OU visite).
        const pathoCols = [];
        if (S.fourbureHT > 0) pathoCols.push({ key: 'fourbure', label: 'Fourbure' });
        if (S.npasHT > 0) pathoCols.push({ key: 'npas', label: 'NPAS' });
        if (S.infectionHT > 0) pathoCols.push({ key: 'infection', label: 'Infection' });
        // Prestations « visite » du catalogue (case Visite par cheval → modale de choix).
        const visArts = (S.articlesCatalogue || []).filter((x) => x.visite);
        h += `<table class="patho-tbl"><thead><tr><th>Cheval</th><th>Parage</th><th>Visite</th>${pathoCols.map((c) => '<th>' + c.label + '</th>').join('')}</tr></thead><tbody>`;
        pool.forEach((ph, pi) => {
          const cv = cvOf(ph); const cancelled = chevalCancelled(cv); const acte = !cancelled && !!(cv && (cv.parage || cv.visite)); // parage OU visite = cheval pris en charge
          const tag = cancelled ? ` <span class="badge badge-cancel">${cv.cancel.status === 'reporte' ? '↩ reporté' : '🚫 annulé'}</span>` : '';
          h += `<tr${cancelled ? ' class="ch-cancel"' : ''}><td>🐴 ${esc(ph.nom)}${tag} <button type="button" class="mini-x" data-cancel="${pi}" title="${cancelled ? 'RDV annulé/reporté — gérer' : 'Annuler / reporter ce RDV'}">${cancelled ? '✎' : '⊘'}</button></td>`;
          h += `<td><input type="checkbox" data-key="parage" data-pi="${pi}" ${cv && cv.parage ? 'checked' : ''}${cancelled ? ' disabled' : ''}/></td>`;
          h += `<td><input type="checkbox" data-vis data-pi="${pi}" ${cv && cv.visite ? 'checked' : ''}${(cancelled || !visArts.length) ? ' disabled' : ''}/></td>`;
          h += pathoCols.map((c) => `<td><input type="checkbox" data-key="${c.key}" data-pi="${pi}" ${cv && cv[c.key] ? 'checked' : ''}${acte ? '' : ' disabled'}/></td>`).join('');
          h += '</tr>';
        });
        h += '</tbody></table>';
        // Prestation visite choisie (affichée sous le tableau, modifiable) — par cheval dont la case Visite est cochée.
        pool.forEach((ph, pi) => { const cv = cvOf(ph); if (cv && cv.visite) { const art = cv.visiteArtId ? visArts.find((x) => x.id === cv.visiteArtId) : null; h += `<div class="reduc-row"><span class="grow">🐴 ${esc(ph.nom)} — Visite : <b>${art ? esc(art.libelle) + ' (' + eur(art.prixHT) + ')' : '<i>à choisir</i>'}</b></span><button class="btn small" data-vispick="${pi}">${art ? 'Modifier' : 'Choisir'}</button></div>`; } });
        h += `<p class="hint" style="margin-top:2px"><b>Parage</b> et <b>Visite</b> sont les 2 prestations qui rattachent un cheval à la tournée : un cheval sans parage ni visite n'est ni compté ni facturé. Fourbure / NPAS / Infection s'activent dès que Parage <b>ou</b> Visite est coché. « Visite » ouvre la liste des prestations « Visite » du catalogue et l'ajoute à la facture (section Articles), sans changer le tarif de déplacement de l'arrêt.</p>`;
        wrap.innerHTML = h;
        const rin = wrap.querySelector('[data-reduc]');
        if (rin) rin.addEventListener('input', (e) => { currentTour.reductions[cl.clientId] = parseFloat(e.target.value) || 0; saveTournees(); recomputeMoney(); });
        wrap.querySelectorAll('[data-key]').forEach((inp) => inp.addEventListener('change', (e) => {
          const cv = ensureCv(pool[+inp.dataset.pi]), key = inp.dataset.key;
          cv[key] = e.target.checked;
          // Parage (dé)coché : recharge la grille (verrouille/déverrouille les pathologies) ; si plus de parage NI visite → efface les pathologies.
          if (key === 'parage') { if (!e.target.checked && !cv.visite) { cv.fourbure = false; cv.npas = false; cv.infection = false; } recomputeMoney(); renderEditorArrets(locked); return; }
          recomputeMoney();
        }));
        wrap.querySelectorAll('[data-vis]').forEach((inp) => inp.addEventListener('change', (e) => {
          const pi = +inp.dataset.pi, ph = pool[pi], cv = ensureCv(ph);
          cv.visite = e.target.checked;
          if (!cv.visite) { cv.visiteArtId = null; if (!cv.parage) { cv.fourbure = false; cv.npas = false; cv.infection = false; } saveTournees(); recomputeMoney(); renderEditorArrets(locked); return; }
          if (visArts.length === 1) { cv.visiteArtId = visArts[0].id; saveTournees(); recomputeMoney(); renderEditorArrets(locked); return; } // une seule prestation → pas de modale
          saveTournees();
          modalVisitePick(ph.nom, cv.visiteArtId, visArts, (vid) => { if (vid !== undefined) cv.visiteArtId = vid || null; saveTournees(); recomputeMoney(); renderEditorArrets(locked); }); // ouvre la modale de choix
        }));
        wrap.querySelectorAll('[data-vispick]').forEach((b) => b.addEventListener('click', () => { const ph = pool[+b.dataset.vispick], cv = ensureCv(ph); modalVisitePick(ph.nom, cv.visiteArtId, visArts, (vid) => { if (vid !== undefined) cv.visiteArtId = vid || null; saveTournees(); recomputeMoney(); renderEditorArrets(locked); }); }));
        wrap.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { const ph = pool[+b.dataset.cancel], cv = ensureCv(ph); const paid = clientPaiementDone(currentTour, cl.clientId); modalCancelRdv(ph.nom, { cv, clientId: cl.clientId, tour: currentTour, paid, locked: comptaLocked(currentTour, cl.clientId), onDone: () => { saveTournees(); if (!paid) recomputeMoney(); renderEditorArrets(locked); } }); })); // payé → facture figée (note de crédit) ; non payé → recalcul de la facture
        el.appendChild(wrap);
      });
    }
    // ----- Articles de cet arrêt (couplés au client de l'arrêt) -----
    const artWrap = document.createElement('div'); artWrap.className = 'a-articles';
    const arts = articlesForArret(a);
    artWrap.innerHTML = `<div class="a-art-head"><span>🧾 Articles</span>${locked ? '' : '<span><button class="btn small" data-add-art>+ Article</button></span>'}</div>`;
    const alist = document.createElement('div'); alist.className = 'list';
    // Case « Remise » (à cocher) = la réduction client s'applique à cette ligne. Cochée par défaut.
    const remiseChkHtml = (off, dis) => locked ? '' : `<label class="chk2 art-remise" title="${dis ? 'Remise produit désactivée (catalogue) — ligne non remisable manuellement' : 'La réduction client s\'applique à cette ligne'}"><input type="checkbox" data-remise ${off ? '' : 'checked'}${dis ? ' disabled' : ''}/> Remise</label>`;
    // Case « Offrir » = cette prestation est offerte (montant mis à 0).
    const offrirChkHtml = (on) => locked ? '' : `<label class="chk2 art-offert" title="Offrir cette prestation (montant mis à 0)"><input type="checkbox" data-offert ${on ? 'checked' : ''}/> Offrir</label>`;
    // Lignes d'acte PAR CHEVAL (dans l'ordre des cases : Parage · Visite · Fourbure · NPAS · Infection), avec Remise (si applicable) + Offrir (par cheval).
    if (!currentTour.parageRemiseOff) currentTour.parageRemiseOff = {};
    const acteRate = (S.tvaRate || 0) / 100;
    a.clients.forEach((cl) => {
      (cl.chevaux || []).filter(chevalPresent).forEach((c) => {
        const items = [];
        if (c.parage && S.parage && S.parage.prixHT > 0) items.push({ key: 'parage', lbl: 'Parage et équilibrage', unit: S.parage.prixHT, tva: (S.parage.tvaPct || 0) / 100, remise: true });
        if (c.visite && c.visiteArtId) { const av = (S.articlesCatalogue || []).find((x) => x.id === c.visiteArtId); if (av) items.push({ key: 'visite', lbl: av.libelle, unit: av.prixHT || 0, tva: (av.tvaPct || 0) / 100, remise: false }); }
        [['fourbure', 'Fourbure', S.fourbureHT], ['npas', 'NPAS', S.npasHT], ['infection', 'Infection', S.infectionHT]].forEach(([k, l, p]) => { if (c[k] && p > 0) items.push({ key: k, lbl: l, unit: p, tva: acteRate, remise: false }); });
        items.forEach((it) => {
          const off = !!c[it.key + 'Offert'];
          const ttcv = it.unit * (1 + it.tva);
          const row = document.createElement('div'); row.className = 'list-item' + (off ? ' art-off' : '');
          const remiseHtml = it.remise ? remiseChkHtml(!!currentTour.parageRemiseOff[cl.clientId]) : '';
          row.innerHTML = `<div class="li-main"><b>${esc(it.lbl)}</b><span class="li-sub">${esc(clientName(cl.clientId))} · 🐴 ${esc(c.nom)} · ${off ? '<b>offert</b>' : eur(ttcv) + ' TTC'} · <i>auto</i></span></div><div class="li-act">${remiseHtml}${offrirChkHtml(off)}</div>`;
          if (it.remise) { const rc = row.querySelector('[data-remise]'); if (rc) rc.addEventListener('change', (e) => { if (!currentTour.parageRemiseOff) currentTour.parageRemiseOff = {}; if (e.target.checked) delete currentTour.parageRemiseOff[cl.clientId]; else currentTour.parageRemiseOff[cl.clientId] = true; saveTournees(); recomputeMoney(); renderEditorArrets(locked); }); }
          const oc = row.querySelector('[data-offert]'); if (oc) oc.addEventListener('change', (e) => { c[it.key + 'Offert'] = e.target.checked; saveTournees(); recomputeMoney(); renderEditorArrets(locked); });
          alist.appendChild(row);
        });
      });
    });
    arts.forEach((art) => {
      const rr = (art.tvaPct || 0) / 100, qte = Math.max(1, (art.chevalNoms || []).length || 1), ttcv = (art.prixHT || 0) * qte * (1 + rr);
      const row = document.createElement('div'); row.className = 'list-item';
      const chn = (art.chevalNoms || []).join(', ');
      const remiseChk = art.impaye ? '' : remiseChkHtml(!!art.remiseOff, art.remiseProduit === false); // impayé jamais remisé ; verrouillé si « remise produit » off au catalogue
      const offrirChk = art.impaye ? '' : offrirChkHtml(!!art.offert);
      const artOff = !art.impaye && !!art.offert;
      row.className = 'list-item' + (artOff ? ' art-off' : '');
      row.innerHTML = `<div class="li-main"><b>${esc(art.libelle)}</b><span class="li-sub">${esc(clientName(art.clientId))} · ×${qte}${chn ? ' · 🐴 ' + esc(chn) : ''} · ${artOff ? '<b>offert</b>' : eur(ttcv) + ' TTC'}</span></div>${locked ? '' : `<div class="li-act">${remiseChk}${offrirChk}<button class="btn small" data-e>Éditer</button> <button class="btn small danger" data-d>✕</button></div>`}`;
      if (!locked) {
        const oc = row.querySelector('[data-offert]'); if (oc) oc.addEventListener('change', (e) => { art.offert = e.target.checked; saveTournees(); recomputeMoney(); renderEditorArrets(locked); });
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
    // ----- Prêts en cours du/des client(s) (mémoire par client, hors facture) : affichés SOUS les articles -----
    let pretHtml = '';
    a.clients.forEach((cl) => { const c = clients.find((x) => x.id === cl.clientId); (c && c.prets || []).forEach((pr) => { pretHtml += `<div class="list-item" data-pretcid="${cl.clientId}" data-pretid="${pr.id}"><div class="li-main"><b>🎁 ${esc(pr.text)}</b><span class="li-sub">${esc(clientName(cl.clientId))} · prêté le ${esc(fmtDateFr(pr.date))}</span></div>${locked ? '' : '<div class="li-act"><button class="btn small" data-pret-keep>Maintenir</button> <button class="btn small danger" data-pret-back>Récupéré</button></div>'}</div>`; }); });
    if (pretHtml) {
      const pretBox = document.createElement('div'); pretBox.className = 'a-prets';
      pretBox.innerHTML = '<div class="a-art-head"><span>🎁 Prêts en cours</span></div>' + pretHtml;
      el.appendChild(pretBox);
      if (!locked) {
        pretBox.querySelectorAll('[data-pret-back]').forEach((b) => b.addEventListener('click', () => { const row = b.closest('[data-pretcid]'); const c = clients.find((x) => x.id === row.dataset.pretcid); if (c) { c.prets = (c.prets || []).filter((p) => p.id !== row.dataset.pretid); saveClients(); } renderEditorArrets(locked); })); // récupéré → mémoire effacée
        pretBox.querySelectorAll('[data-pret-keep]').forEach((b) => b.addEventListener('click', () => { b.textContent = 'Maintenu ✓'; setTimeout(() => { b.textContent = 'Maintenir'; }, 1200); })); // maintenu → reste lié au client (aucune donnée à changer)
      }
    }
    // Répartition facture par client, fusionnée sous l'arrêt (remplie par renderArretInvoices).
    const invBox = document.createElement('div'); invBox.className = 'a-invoices'; invBox.dataset.aidx = i; el.appendChild(invBox);
    box.appendChild(el);
  });
  if (!locked) enableDrag(box);
  renderArretInvoices();
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
// Présence IMPLICITE : un cheval est « pris en charge » dès qu'il a un acte (parage OU visite OU pathologie).
// Plus de case « Présent » : un cheval sans acte reste listé mais n'est ni compté (stats) ni facturé (corrige le « cheval fantôme »).
function chevalPresent(c) { return !!c; } // conservé pour compat : la présence ne dépend plus d'un drapeau
// RDV annulé/reporté : le cheval reste dans l'arrêt (traçabilité) mais est EXCLU du calcul (facture/stats/compta). Cf. cv.cancel = { status:'annule'|'reporte', reason, note, at, replacedTourId }.
function chevalCancelled(c) { return !!(c && c.cancel && c.cancel.status); }
function chevalFait(c) { return !chevalCancelled(c) && !!(c && (c.parage || c.fourbure || c.npas || c.infection || c.visite)); }
// Annulé APRÈS paiement : la facture encaissée reste figée (le cheval RESTE facturé) et une note de crédit neutralise le CA. « credited » posé à la création de la NC.
function chevalCredited(c) { return !!(c && c.cancel && c.cancel.credited); }
// « Facturé » = pris en charge OU payé-puis-annulé (facture figée). Sert au recalcul argent : un cheval crédité ne doit JAMAIS sortir de la facture (sinon double réduction avec la NC).
function chevalBilled(c) { return chevalFait(c) || chevalCredited(c); }
// Client entièrement annulé à un arrêt = avait des chevaux, aucun facturé (→ pas de déplacement facturé, mais compte toujours dans la géométrie figée).
function clientAllCancelled(cl) { const ch = (cl && cl.chevaux) || []; return ch.length > 0 && !ch.some(chevalBilled); }
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
      if (cl.cancelled) return; // client entièrement annulé : compté dans nbClients (géométrie figée) mais NI déplacement NI acte facturés (manque à gagner)
      const m = getC(cl.clientId, cl.nom);
      m.deplacement.push({ adresse: r.adresse, type: r.type, partHT, partTTC, km: kmClient, tarifHT: r.tarifHT || 0, proche: !!r.proche, chevaux: cl.chevaux.map((c) => c.nom) });
      m.htDep += partHT;
      cl.chevaux.forEach((c) => {
        // Parage & équilibrage (par cheval) → 1ʳᵉ ligne d'article (remisable). « Offrir » (c.parageOffert) → montant 0 (prixHT conservé pour les stats).
        if (c.parage && S.parage && S.parage.prixHT > 0) {
          const rr = (S.parage.tvaPct || 0) / 100, off = !!c.parageOffert, unit = S.parage.prixHT;
          m.articles.push({ libelle: 'Parage et équilibrage', chevaux: [c.nom], qte: 1, prixHT: unit, tvaPct: S.parage.tvaPct || 0, ht: off ? 0 : unit, tva: off ? 0 : unit * rr, ttc: off ? 0 : unit * (1 + rr), parage: true, offert: off, remiseOff: !!parageNoRemise[cl.clientId], remiseProduit: true, remiseLiquide: true });
          m.htArt += off ? 0 : unit; m.tvaArt += off ? 0 : unit * rr;
        }
        // Visite par cheval (INDÉPENDANTE du parage) : article catalogue. « Offrir » (c.visiteOffert) → 0.
        if (c.visite && c.visiteArtId) {
          const av = (S.articlesCatalogue || []).find((x) => x.id === c.visiteArtId);
          if (av) { const rr = (av.tvaPct || 0) / 100, off = !!c.visiteOffert, unit = av.prixHT || 0; m.articles.push({ libelle: av.libelle, chevaux: [c.nom], qte: 1, prixHT: unit, tvaPct: av.tvaPct || 0, ht: off ? 0 : unit, tva: off ? 0 : unit * rr, ttc: off ? 0 : unit * (1 + rr), visite: true, offert: off, remiseOff: false, remiseProduit: av.remiseProduit !== false, remiseLiquide: av.remiseLiquide !== false }); m.htArt += off ? 0 : unit; m.tvaArt += off ? 0 : unit * rr; }
        }
        // Matériel consommable = base seule, facturé UNIQUEMENT avec un parage.
        if (c.parage && baseMat > 0) { m.materiel.push({ nom: c.nom, adresse: r.adresse, baseHT: baseMat, fourbure: false, npas: false, infection: false, ht: baseMat, ttc: baseMat * (1 + stdRate) }); m.htMat += baseMat; }
        // Fourbure / NPAS / Infection → lignes d'ARTICLE (par cheval). « Offrir » (c.<key>Offert) → 0.
        if (c.parage || c.visite) {
          [['fourbure', 'Fourbure', S.fourbureHT], ['npas', 'NPAS', S.npasHT], ['infection', 'Infection', S.infectionHT]].forEach(([key, lbl, prix]) => {
            if (c[key] && prix > 0) { const rr = stdRate, off = !!c[key + 'Offert']; m.articles.push({ libelle: lbl, chevaux: [c.nom], qte: 1, prixHT: prix, tvaPct: S.tvaRate, ht: off ? 0 : prix, tva: off ? 0 : prix * rr, ttc: off ? 0 : prix * (1 + rr), patho: true, offert: off, remiseOff: true, remiseProduit: false, remiseLiquide: false }); m.htArt += off ? 0 : prix; m.tvaArt += off ? 0 : prix * rr; }
          });
        }
      });
    });
  });
  // Chevaux annulés par client (pour retirer aussi leurs articles manuels — produit non livré).
  const cancelByClient = {};
  rows.forEach((r) => r.clients.forEach((cl) => { if (cl.cancelledNoms && cl.cancelledNoms.length) { (cancelByClient[cl.clientId] = cancelByClient[cl.clientId] || new Set()); cl.cancelledNoms.forEach((n) => cancelByClient[cl.clientId].add(n)); } }));
  // Articles (lignes manuelles) — TVA par ligne
  (articles || []).forEach((a) => {
    const orig = a.chevalNoms || [];
    if (!a.impaye && !orig.length) return; // article normal : lié à ≥1 cheval ; impayé : sans cheval, quantité 1
    // Quantité PAR cheval (chevalQtes id→qté) ; à défaut 1/cheval. Carte nom→qté pour la répartition dans les stats.
    const qByNom = {}; if (!a.impaye) orig.forEach((n, idx) => { const id = (a.chevalIds || [])[idx]; qByNom[n] = Math.max(1, (a.chevalQtes && id != null && a.chevalQtes[id]) || 1); });
    const cancelSet = cancelByClient[a.clientId];
    const noms = (cancelSet && !a.impaye) ? orig.filter((n) => !cancelSet.has(norm(n))) : orig; // retire les chevaux annulés
    if (!a.impaye && !noms.length) return; // toutes les cibles annulées → ligne retirée
    const qte = a.impaye ? 1 : noms.reduce((s, n) => s + (qByNom[n] || 1), 0);
    const off = !a.impaye && !!a.offert; // « Offrir » : ligne mise à 0 (prixHT conservé pour les stats)
    const lineHT = off ? 0 : (a.prixHT || 0) * qte, rr = (a.tvaPct || 0) / 100;
    const m = getC(a.clientId, clientName(a.clientId));
    m.articles.push({ libelle: a.libelle, chevaux: a.impaye ? [] : noms, qte, qtesByNom: a.impaye ? null : qByNom, prixHT: a.prixHT || 0, tvaPct: a.tvaPct || 0, ht: lineHT, tva: lineHT * rr, ttc: lineHT * (1 + rr), impaye: !!a.impaye, offert: off, remiseOff: !!(a.remiseOff || a.impaye), remiseProduit: a.impaye ? false : (a.remiseProduit !== false), remiseLiquide: a.impaye ? false : (a.remiseLiquide !== false) }); // impayé (créance) jamais remisé
    m.htArt += lineHT; m.tvaArt += lineHT * rr;
  });
  const parClient = Object.values(cmap).map((m) => {
    // Deux réductions INDÉPENDANTES, par ligne :
    //  • MANUELLE (réduction client) : ligne éligible si case « Remise » cochée (!remiseOff) ET produit remisable (remiseProduit).
    //  • LIQUIDE auto (Réglages → Articles → Réduction) si paiement liquide : ligne éligible si « remise liquide » (remiseLiquide).
    // On applique la plus forte des deux qui s'appliquent, ligne par ligne.
    const manual = reducs[m.clientId] || 0;
    const liq = ((payments[m.clientId] || {}).method === 'liquide') ? (S.reducLiquide || 0) : 0;
    const htArtBrut = m.articles.reduce((s, a) => s + a.ht, 0), tvaArtBrut = m.articles.reduce((s, a) => s + a.tva, 0); // tarif plein AVANT remise
    let anyReduc = 0;
    m.articles.forEach((a) => {
      let pct = 0;
      if (manual && !a.remiseOff && a.remiseProduit !== false) pct = Math.max(pct, manual); // remise manuelle
      if (liq && a.remiseLiquide !== false) pct = Math.max(pct, liq);                        // remise liquide auto
      if (pct <= 0) return;
      const rf = pct / 100; a.remisePct = pct; a.htBrut = a.ht; a.ht *= (1 - rf); a.tva *= (1 - rf); a.ttc *= (1 - rf); anyReduc = Math.max(anyReduc, pct);
    });
    const rpct = anyReduc;
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
    clients: (a.clients || []).map((cl) => ({ clientId: cl.clientId, nom: clientName(cl.clientId), cancelled: clientAllCancelled(cl), cancelledNoms: (cl.chevaux || []).filter((c) => chevalCancelled(c) && !chevalCredited(c)).map((c) => norm(c.nom)), chevaux: (cl.chevaux || []).filter(chevalBilled).map((c) => ({ nom: c.nom, fourbure: !!c.fourbure, npas: !!c.npas, infection: !!c.infection, parage: !!c.parage, visite: !!c.visite, visiteArtId: c.visiteArtId || null, parageOffert: !!c.parageOffert, visiteOffert: !!c.visiteOffert, fourbureOffert: !!c.fourbureOffert, npasOffert: !!c.npasOffert, infectionOffert: !!c.infectionOffert })) })),
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
  if (!R || !R.rows || R.rows.length !== currentTour.arrets.length) { if (currentTour && currentTour.arrets && currentTour.arrets.length) scheduleGeoRecalc(); return; } // géométrie absente/périmée → recalcul complet différé (la réduction/l'article sera alors reflété)
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
// Recalcule TOUTES les tournées (y compris clôturées/archivées) avec la logique/les tarifs ACTUELS,
// et RÉPARE les impayés orphelins (source disparue) et les articles d'impayé orphelins. Évite un retour usine après une évolution de l'app.
function recalcAllTours() {
  const tourIds = new Set(allTours().map((t) => t.id));
  // 1) Impayés dont la tournée SOURCE n'existe plus → retirés ; impayé perçu par une tournée disparue → redevient « à percevoir ».
  clients.forEach((c) => {
    if (!Array.isArray(c.impayes)) return;
    c.impayes = c.impayes.filter((im) => !im.sourceTourId || tourIds.has(im.sourceTourId));
    c.impayes.forEach((im) => { if (im.collectedTourId && !tourIds.has(im.collectedTourId)) { im.collected = false; im.collectedTourId = null; } });
  });
  // 2) Articles d'impayé orphelins (référencent un impayé qui n'existe plus) → retirés de toutes les tournées.
  const live = new Set(); clients.forEach((c) => (c.impayes || []).forEach((im) => live.add(im.id)));
  allTours().forEach((t) => { if (Array.isArray(t.articles)) t.articles = t.articles.filter((a) => !a.impaye || (a.impayeId && live.has(a.impayeId))); });
  // 3) On NE recalcule PLUS les montants ici (ça pouvait casser une facture : déplacement/matériel qui sautaient).
  //    On rafraîchit seulement les listes de chevaux pour les stats (sanitizeTourStats ne touche jamais les montants)
  //    et on répare les arrondis caisse devenus aberrants. Pour recalculer une facture, ouvrez la tournée (recalcul complet à l'ouverture).
  let n = 0;
  allTours().forEach((t) => {
    if (sanitizeTourStats(t)) n++;
    // Arrondi caisse aberrant (|arrondi| > 10 € : un vrai arrondi caisse est de l'ordre de l'euro) → on retire le montant rectifié.
    if (t.payments) Object.keys(t.payments).forEach((cid) => { const p = t.payments[cid]; const m = (t.result && t.result.parClient) ? t.result.parClient.find((x) => x.clientId === cid) : null; if (p && p.method === 'liquide' && m && Math.abs(payRectifie(m, p) - (m.totalTTC || 0)) > 10) { p.rectifie = null; p.montantPaye = null; } });
  });
  saveClients(); saveTournees(); saveArchive();
  return { n };
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
    scheduleCalPush(currentTour); // miroir RDV → Google Agenda (si activé)
  } catch (e) { st.className = 'status err'; st.textContent = 'Erreur : ' + e.message; }
}

// Répartition facture FUSIONNÉE dans l'éditeur : le bloc de chaque client s'affiche juste sous son arrêt.
// Un client présent à plusieurs arrêts (adresses différentes) : sa facture (agrégée) n'apparaît qu'une fois, sous son 1ᵉʳ arrêt.
function renderArretInvoices() {
  if (!currentTour) return;
  const R = currentTour.result;
  const pays = currentTour.payments || {};
  const shown = new Set();
  document.querySelectorAll('#edArrets .a-invoices').forEach((box) => {
    box.innerHTML = '';
    const i = +box.dataset.aidx; const a = currentTour.arrets[i]; if (!a) return;
    if (!R || !R.parClient) return;
    (a.clients || []).forEach((cl) => {
      if (shown.has(cl.clientId)) return;
      const m = R.parClient.find((x) => x.clientId === cl.clientId); if (!m) return;
      shown.add(cl.clientId);
      const div = document.createElement('div'); div.className = 'inv-client'; div.innerHTML = clientInvoiceHtml(m, pays[m.clientId]);
      box.appendChild(div);
    });
  });
}
// Rendu : tuiles (haut) + factures fusionnées sous chaque arrêt + total général (bloc bas).
// Durée de tournée = temps réel encodé (Route par arrêt + retour) là où il existe, sinon estimé — même logique que le Temps de travail.
function blendedTourMin(t) {
  const R = t && t.result; if (!R) return null;
  const mpk = (R.totalKm > 0 && R.totalMin) ? (R.totalMin / R.totalKm) : (60 / (S.vitesseKmh || 50));
  let total = 0;
  (t.arrets || []).forEach((a, i) => { total += (typeof a.realMin === 'number') ? a.realMin : ((R.rows && R.rows[i]) ? (R.rows[i].segKm || 0) * mpk : 0); });
  total += (typeof t.returnRealMin === 'number') ? t.returnRealMin : ((R.kmLastHome != null) ? R.kmLastHome * mpk : 0);
  return total;
}
function renderResultUI(R) {
  let arHT = 0, arTVA = 0, arTTC = 0;
  if (R) {
    const pays = (currentTour && currentTour.payments) || {};
    (R.parClient || []).forEach((m) => { const ar = cashRounding(m, pays[m.clientId]); arHT += ar.ht; arTVA += ar.tva; arTTC += ar.ttc; });
    $('rKm').textContent = km(R.totalKm);
    const dmin = (currentTour && currentTour.result === R) ? blendedTourMin(currentTour) : null; // réel encodé sinon estimé
    $('rMin').textContent = durMin(dmin != null ? dmin : R.totalMin);
    $('rHT').textContent = eur(R.totalHT + arHT) + ' HT'; $('rTVA').textContent = eur(R.totalTVA + arTVA);
    $('rTTC').textContent = eur(R.totalTTC + arTTC) + ' TTC';
  } else { ['rKm', 'rMin', 'rHT', 'rTVA', 'rTTC'].forEach((id) => { if ($(id)) $(id).textContent = '—'; }); }
  renderAnalytique(R, arHT);
  renderArretInvoices();
  const box = $('edInvoice'); if (!box) return; box.innerHTML = '';
  if (!R || !R.parClient || !R.parClient.length) { if ($('edInvoiceEmpty')) $('edInvoiceEmpty').style.display = 'block'; box.style.display = 'none'; return; }
  if ($('edInvoiceEmpty')) $('edInvoiceEmpty').style.display = 'none'; box.style.display = '';
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
    m.articles.forEach((a) => { const noms = a.chevaux.length ? ' — ' + a.chevaux.map(esc).join(', ') : ''; const rem = a.offert ? ' <span class="rem-tag">offert</span>' : (a.remisePct ? ` <span class="rem-tag">−${a.remisePct}%</span>` : ''); rows += row(`🧾 ${esc(a.libelle)} ×${a.qte}${noms} (TVA ${a.tvaPct}%)${rem}`, eur(a.prixHT), a.ht, a.tva, a.ttc); });
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
    m.articles.forEach((a) => { const ch = a.chevaux.length ? ' (' + a.chevaux.join(', ') + ')' : ''; const rem = a.offert ? ' (offert)' : (a.remisePct ? ` −${a.remisePct}%` : ''); L.push(`  ${a.libelle} ×${a.qte}${ch}${rem} : ${eur(a.ht)} HT · ${eur(a.tva)} TVA · ${eur(a.ttc)} TTC`); });
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
function renderAnalytique(R, arrondiHT) {
  const box = $('analyticTiles'); if (!box) return;
  box.innerHTML = '';
  orderedKeys(S.analyticOrder, ANALYTIC_DEFS.map((d) => d.key)).forEach((key) => {
    const d = ANALYTIC_DEFS.find((x) => x.key === key); if (!d) return;
    const el = document.createElement('div'); el.className = 'tile draggable'; el.dataset.key = key;
    el.innerHTML = `<span class="t-label">${esc(tileLabel(key, d.label))}</span><span class="t-val">${R ? eur(d.get(R)) + ' HT' : '—'}</span>`;
    box.appendChild(el);
  });
  // Arrondi caisse (liquide) : tuile informative (non réordonnable) quand un arrondi est appliqué.
  if (R && Math.abs(arrondiHT || 0) >= 0.005) { const el = document.createElement('div'); el.className = 'tile'; el.innerHTML = `<span class="t-label">Arrondi caisse</span><span class="t-val">${eur(arrondiHT)} HT</span>`; box.appendChild(el); }
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
// --- Sous-navigation Stats : Utilisation véhicule / Temps de trajet / Temps de travail / Analyse cheval / Analyse client / Graphiques ---
let currentSsub = 'vehicule';
function showStats(sub) {
  currentSsub = sub || 'vehicule';
  document.querySelectorAll('#statsSub .subtab').forEach((b) => b.classList.toggle('active', b.dataset.ssub === currentSsub));
  document.querySelectorAll('#tab-stats .subpanel').forEach((p) => p.classList.toggle('active', p.id === 'ssub-' + currentSsub));
  const cb = document.querySelector('#statsSub .subtab[data-ssub="' + currentSsub + '"]'), cl = document.querySelector('#statsSub .subnav-label');
  if (cb && cl) cl.textContent = cb.textContent;
  if ($('statsSub')) $('statsSub').classList.remove('open');
  renderStatsSub(currentSsub);
  window.scrollTo(0, 0);
}
function renderStatsSub(sub) {
  if (sub === 'clientele') renderClienteleStats();
  else if (sub === 'chevaux') renderChevauxSuivi();
  else if (sub === 'vehcheval') renderVehiculeCheval();
  else if (sub === 'trajet') renderTrajetTemps();
  else if (sub === 'travail') renderTravail();
  else if (sub === 'cheval') renderFinanceCheval();
  else if (sub === 'client') renderFinance();
  else if (sub === 'graph') renderGraphiques();
  else if (sub === 'annul') renderStatsAnnul();
  else renderVehiculePanel();
}
// Stats → Clientèle : dénombrement clients / chevaux / adresses par statut.
function renderClienteleStats() {
  const box = $('clienteleStats'); if (!box) return;
  const cAct = clients.filter(isClientActif).length, cNoir = clients.filter(isClientNoir).length, cInact = clients.filter((c) => c.actif === false && !c.blacklist).length;
  let hTot = 0, hAct = 0, hInact = 0, hNoir = 0;
  clients.forEach((c) => (c.chevaux || []).forEach((h) => { hTot++; if (h.blacklist) hNoir++; else if (h.actif === false) hInact++; else hAct++; }));
  const addrs = chevalAddresses();
  const aNoir = addrs.filter((e) => addrStatusOf(e.addr) === 'noir').length, aInact = addrs.filter((e) => addrStatusOf(e.addr) === 'inactif').length, aAct = addrs.filter((e) => addrStatusOf(e.addr) === 'actif').length;
  const tile = (lbl, val, cls) => `<div class="cl-tile${cls ? ' ' + cls : ''}"><div class="cl-num">${val}</div><div class="cl-lbl">${lbl}</div></div>`;
  box.innerHTML = `
    <h3 class="rsub">Clients</h3>
    <div class="cl-grid">${tile('Total', clients.length)}${tile('Actifs', cAct, 'cl-ok')}${tile('Inactifs', cInact)}${tile('Liste noire', cNoir, 'cl-bad')}</div>
    <h3 class="rsub">Chevaux</h3>
    <div class="cl-grid">${tile('Total', hTot)}${tile('Actifs', hAct, 'cl-ok')}${tile('Inactifs', hInact)}${tile('Liste noire', hNoir, 'cl-bad')}</div>
    <h3 class="rsub">Adresses chevaux</h3>
    <div class="cl-grid">${tile('Répertoriées', addrs.length)}${tile('Actives', aAct, 'cl-ok')}${tile('Inactives', aInact)}${tile('Liste noire', aNoir, 'cl-bad')}</div>`;
}
// Point d'entrée depuis l'onglet Stats : affiche le sous-onglet courant.
function renderStats() { showStats(currentSsub); }
// Sous-onglet « Utilisation véhicule » : tuiles + pièces & usage km + km/heures par client › cheval.
function renderVehiculePanel() {
  applyStatOrder();
  const st = kmStats();
  if ($('kmMonth')) $('kmMonth').textContent = km(st.mois);
  if ($('kmYear')) $('kmYear').textContent = km(st.annee);
  if ($('kmOdo')) $('kmOdo').textContent = km(st.odo);
  if ($('baseVeh')) $('baseVeh').textContent = eurkm(baseVehiculeHT());
  if ($('tCarb')) $('tCarb').textContent = eurkm(fuelPerKmHT()) + ' HT';
  if ($('tTournee')) $('tTournee').textContent = eurkm(tarifHT('tournee')) + ' HT';
  renderVehiculePieces();
  renderProvisionVsReel();
}
// Tête de type d'un frais (lui-même s'il est top-level, sinon son parent).
function fraisTypeHeadId(fid) { const f = (S.frais || []).find((x) => x.id === fid); return f ? (f.parentId || f.id) : fid; }
// Provision facturée (base €/km × km de la période) vs coût réel (journal) — global et par type.
function provisionVsReel(monthsSet) {
  const inRange = (d) => !monthsSet || monthsSet.has((d || '').slice(0, 7));
  const kmPeriode = allTours().reduce((s, t) => s + ((t.result && inRange(t.date)) ? (t.result.totalKm || 0) : 0), 0);
  const heads = (S.frais || []).filter((f) => !f.parentId);
  const rows = heads.map((h) => {
    const groupe = [h].concat((S.frais || []).filter((x) => x.parentId === h.id));
    const rate = groupe.reduce((s, f) => s + (fraisActif(f) ? fraisContribHT(f) : 0), 0);
    const provision = rate * kmPeriode;
    const reel = (S.fraisJournal || []).filter((j) => inRange(j.date) && fraisTypeHeadId(j.fraisId) === h.id).reduce((s, j) => s + (j.montant || 0), 0);
    return { poste: h.poste || 'Type', provision, reel, ecart: provision - reel };
  }).filter((r) => r.provision > 0.005 || r.reel > 0.005);
  const amortProv = amortContribHT() * kmPeriode;
  const totProv = rows.reduce((s, r) => s + r.provision, 0) + amortProv;
  const totReel = rows.reduce((s, r) => s + r.reel, 0);
  return { kmPeriode, rows, amortProv, totProv, totReel, ecart: totProv - totReel };
}
let pvrYear = ''; // '' = toutes années
function renderProvisionVsReel() {
  const sel = $('pvrPeriod'), box = $('pvrBox'); if (!box) return;
  const years = [...new Set(allTours().map((t) => (t.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  if (sel && !sel._pvrw) { sel._pvrw = true; sel.addEventListener('change', () => { pvrYear = sel.value; renderProvisionVsReel(); }); }
  if (sel) sel.innerHTML = '<option value="">Toutes les années</option>' + years.map((y) => `<option value="${y}"${y === pvrYear ? ' selected' : ''}>Année ${y}</option>`).join('');
  const monthsSet = pvrYear ? new Set(Array.from({ length: 12 }, (_, m) => pvrYear + '-' + String(m + 1).padStart(2, '0'))) : null;
  const d = provisionVsReel(monthsSet);
  const line = (lbl, prov, reel, ecart, strong) => `<div class="inv-line"${strong ? ' style="font-weight:700;border-top:1px solid var(--line)"' : ''}><span>${esc(lbl)}</span><span>prov. ${eur(prov)} · réel ${eur(reel)} · <b style="color:${ecart >= 0 ? '#2e9e5b' : '#c0392b'}">${ecart >= 0 ? '+' : ''}${eur(ecart)}</b></span></div>`;
  let h = `<p class="hint">Km facturés sur la période : <b>${km(d.kmPeriode)}</b>.</p>`;
  if (d.amortProv > 0.005) h += `<div class="inv-line"><span>Amortissement véhicule</span><span>prov. ${eur(d.amortProv)} · réel — · <b style="color:#2e9e5b">provision</b></span></div>`;
  d.rows.forEach((r) => { h += line(r.poste, r.provision, r.reel, r.ecart); });
  if (!d.rows.length && d.amortProv <= 0.005) h += '<p class="empty">Aucune donnée sur la période.</p>';
  h += line('TOTAL véhicule', d.totProv, d.totReel, d.ecart, true);
  box.innerHTML = h;
}
// Classe un nombre de mois dans une tranche : 1ʳᵉ dont max==null (et plus) ou months < max.
function trancheOf(tranches, months) { if (months == null) return null; for (const t of (tranches || [])) { if (t.max == null || months < t.max) return t.label; } const l = (tranches || [])[(tranches || []).length - 1]; return l ? l.label : null; }
// Compteurs d'actes sur une période (ensemble de mois 'YYYY-MM') : tournées, déplacements (arrêts), chevaux servis distincts, parage/visite/pathologies.
function chevGenStats(range) {
  let nTour = 0, nArret = 0, parage = 0, visite = 0, fourbure = 0, npas = 0, infection = 0; const chevSet = new Set();
  allTours().forEach((t) => {
    if (!t.result || !range.has((t.date || '').slice(0, 7))) return;
    nTour++;
    (t.arrets || []).forEach((a) => { nArret++; (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => {
      if (!chevalFait(cv)) return;
      chevSet.add(cl.clientId + '|' + norm(cv.nom));
      if (cv.parage) parage++; if (cv.visite) visite++; if (cv.fourbure) fourbure++; if (cv.npas) npas++; if (cv.infection) infection++;
    })); });
  });
  return { nTour, nArret, chevaux: chevSet.size, parage, visite, fourbure, npas, infection };
}
function renderChevGenStats(range) {
  const g = chevGenStats(range); const box = $('chevGenStats'); if (!box) return;
  if ($('chevGenEmpty')) $('chevGenEmpty').style.display = g.nTour ? 'none' : 'block';
  box.innerHTML = `<div class="tiles tiles-3" style="margin:8px 0">
    <div class="tile"><span class="t-label">Tournées</span><span class="t-val">${g.nTour}</span></div>
    <div class="tile"><span class="t-label">Déplacements</span><span class="t-val">${g.nArret}</span></div>
    <div class="tile"><span class="t-label">Chevaux servis</span><span class="t-val">${g.chevaux}</span></div>
    <div class="tile"><span class="t-label">Parage</span><span class="t-val">${g.parage}</span></div>
    <div class="tile"><span class="t-label">Visite</span><span class="t-val">${g.visite}</span></div>
    <div class="tile"><span class="t-label">Fourbure</span><span class="t-val">${g.fourbure}</span></div>
    <div class="tile"><span class="t-label">NPAS</span><span class="t-val">${g.npas}</span></div>
    <div class="tile"><span class="t-label">Infection</span><span class="t-val">${g.infection}</span></div></div>`;
}
// Prestations OFFERTES / REMISÉES sur une période (scan des lignes d'articles figées).
function offreRemiseStats(range) {
  let offCount = 0, remCount = 0, lineCount = 0, offTTC = 0, remTTC = 0, grossTTC = 0; const detail = [];
  allTours().forEach((t) => {
    if (!t.result || !t.result.parClient || !range.has((t.date || '').slice(0, 7))) return;
    t.result.parClient.forEach((m) => {
      (m.articles || []).forEach((a) => {
        if (a.impaye) return;
        const rr = (a.tvaPct || 0) / 100, plein = (a.prixHT || 0) * (a.qte || 1) * (1 + rr); // valeur pleine TTC (prixHT conservé même si offert)
        lineCount++; grossTTC += plein;
        if (a.offert) { offCount++; offTTC += plein; detail.push({ date: t.date, client: m.nom, libelle: a.libelle, chevaux: a.chevaux || [], type: 'offert', pct: 100, valeur: plein }); }
        else if (a.remisePct) { remCount++; const redTTC = (a.htBrut != null ? (a.htBrut - a.ht) : 0) * (1 + rr); remTTC += redTTC; detail.push({ date: t.date, client: m.nom, libelle: a.libelle, chevaux: a.chevaux || [], type: 'remise', pct: a.remisePct, valeur: redTTC }); }
      });
    });
  });
  return { offCount, remCount, lineCount, offTTC, remTTC, grossTTC, detail };
}
function renderOffreRemise(range) {
  const box = $('offreRemise'); if (!box) return;
  const s = offreRemiseStats(range);
  const pctOff = s.lineCount ? (s.offCount / s.lineCount * 100) : 0, pctRem = s.lineCount ? (s.remCount / s.lineCount * 100) : 0;
  let h = `<div class="tiles tiles-3" style="margin:8px 0">
    <div class="tile"><span class="t-label">Prestations offertes</span><span class="t-val">${s.offCount}</span></div>
    <div class="tile"><span class="t-label">Prestations remisées</span><span class="t-val">${s.remCount}</span></div>
    <div class="tile"><span class="t-label">% lignes concernées</span><span class="t-val">${(pctOff + pctRem).toFixed(0)} %</span></div>
    <div class="tile strong"><span class="t-label">Total offert</span><span class="t-val">${eur(s.offTTC)}</span></div>
    <div class="tile strong"><span class="t-label">Total remises</span><span class="t-val">${eur(s.remTTC)}</span></div>
    <div class="tile"><span class="t-label">Manque à gagner total</span><span class="t-val">${eur(s.offTTC + s.remTTC)}</span></div></div>`;
  h += `<p class="hint">Offerts : ${pctOff.toFixed(0)} % des lignes · Remisés : ${pctRem.toFixed(0)} % des lignes (sur ${s.lineCount} ligne${s.lineCount > 1 ? 's' : ''} facturée${s.lineCount > 1 ? 's' : ''}).</p>`;
  if (!s.detail.length) { h += '<p class="empty">Aucun offert ni remise sur la période.</p>'; box.innerHTML = h; return; }
  h += '<h3 class="rsub">Détail</h3>';
  s.detail.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach((d) => {
    const ch = (d.chevaux && d.chevaux.length) ? ' · 🐴 ' + esc(d.chevaux.join(', ')) : '';
    const tag = d.type === 'offert' ? '<b>offert</b>' : ('remise −' + d.pct + '%');
    h += `<div class="inv-line"><span>${esc(fmtDateFr(d.date))} · ${esc(d.client)} · ${esc(d.libelle)}${ch} · ${tag}</span><span>−${eur(d.valeur)}</span></div>`;
  });
  box.innerHTML = h;
}
function renderChevGroupes() {
  const box = $('chevGroupes'); if (!box) return;
  const chevaux = []; clients.forEach((c) => (c.chevaux || []).forEach((h) => chevaux.push(h)));
  const countBy = (tranches, key) => { const m = {}; (tranches || []).forEach((t) => m[t.label] = 0); let sans = 0; chevaux.forEach((h) => { const d = h[key]; if (!d) { sans++; return; } const lbl = trancheOf(tranches, monthsBetween(d)); if (lbl != null) m[lbl] = (m[lbl] || 0) + 1; }); return { m, sans }; };
  const sec = (titre, tranches, res, sansLbl) => { let h = `<h3 class="rsub">${esc(titre)}</h3>`; (tranches || []).forEach((t) => { h += `<div class="inv-line"><span>${esc(t.label)}</span><span>${res.m[t.label] || 0}</span></div>`; }); if (res.sans) h += `<div class="inv-line" style="color:var(--muted)"><span>${esc(sansLbl)}</span><span>${res.sans}</span></div>`; return h; };
  box.innerHTML = sec('Par tranche d\'âge', S.statTranchesAge, countBy(S.statTranchesAge, 'dateNaissance'), 'Sans date de naissance')
    + sec('Par durée de prise en charge', S.statTranchesSuivi, countBy(S.statTranchesSuivi, 'datePriseEnCharge'), 'Sans date de prise en charge');
}
let chevPtype = 'mois', chevPkey = null;
// Sous-onglet « Suivi chevaux » : stats générales (période) + répartition (âge / prise en charge) + liste par cheval (âge = naissance ; prise en charge = date de début, distincts).
function renderChevauxSuivi() {
  const seg = $('chevPeriodSeg'), perSel = $('chevPeriod');
  if (seg) seg.querySelectorAll('.seg-btn').forEach((b) => { if (!b._cw) { b._cw = true; b.addEventListener('click', () => { chevPtype = b.dataset.cptype; chevPkey = null; renderChevauxSuivi(); }); } b.classList.toggle('on', b.dataset.cptype === chevPtype); });
  const opts = comptaPeriodOptions(chevPtype);
  if (perSel) {
    if (!opts.length) perSel.innerHTML = '';
    else { if (!opts.some((o) => o.key === chevPkey)) chevPkey = opts[0].key; perSel.innerHTML = opts.map((o) => `<option value="${o.key}"${o.key === chevPkey ? ' selected' : ''}>${esc(o.label)}</option>`).join(''); perSel.onchange = () => { chevPkey = perSel.value; renderChevauxSuivi(); }; }
    perSel.style.display = opts.length ? '' : 'none';
  }
  const chevRange = new Set(opts.length ? monthsOfRange(chevPtype, chevPkey) : []);
  renderChevGenStats(chevRange);
  renderChevGroupes();
  renderOffreRemise(chevRange);
  const box = $('chevauxSuiviList'); if (!box) return; box.innerHTML = '';
  const rows = [];
  clients.forEach((c) => (c.chevaux || []).forEach((h) => rows.push({ h, c })));
  if ($('chevauxSuiviEmpty')) $('chevauxSuiviEmpty').style.display = rows.length ? 'none' : 'block';
  rows.sort((a, b) => norm(a.h.nom).localeCompare(norm(b.h.nom)));
  rows.forEach(({ h, c }) => {
    const age = h.dateNaissance ? durMonthsLabel(monthsBetween(h.dateNaissance)) : '<i>date de naissance non renseignée</i>';
    const pec = h.datePriseEnCharge ? durMonthsLabel(monthsBetween(h.datePriseEnCharge)) : '<i>non renseignée</i>';
    const el = document.createElement('div'); el.className = 'inv-client';
    let hh = `<div class="inv-head"><span>🐴 ${esc(h.nom)} <span class="li-sub">— ${esc(fullName(c))}</span></span>${h.actif === false ? '<span class="li-sub">inactif</span>' : ''}</div>`;
    hh += `<div class="inv-line"><span>Âge</span><span>${age}${h.dateNaissance ? ' <span class="li-sub">(né le ' + esc(fmtDateFr(h.dateNaissance)) + ')</span>' : ''}</span></div>`;
    hh += `<div class="inv-line"><span>Prise en charge</span><span>${pec}${h.datePriseEnCharge ? ' <span class="li-sub">(depuis le ' + esc(fmtDateFr(h.datePriseEnCharge)) + ')</span>' : ''}</span></div>`;
    el.innerHTML = hh; box.appendChild(el);
  });
}
// Réglages → Statistiques : éditer/ajouter les tranches (âge, prise en charge).
function renderStatConfig() {
  const build = (boxId, key, addId) => {
    const box = $(boxId);
    if (box) { box.innerHTML = '';
      (S[key] || []).forEach((t) => {
        const row = document.createElement('div'); row.className = 'edit-row';
        row.innerHTML = `<div class="er-top"><input class="grow er-title" data-lbl value="${esc(t.label)}" placeholder="Libellé"/><button class="a-del" data-del title="Supprimer">✕</button></div>
          <div class="er-grid"><label>Jusqu'à (mois · vide = et plus)<input data-max type="number" min="0" step="1" value="${t.max == null ? '' : t.max}"/></label></div>`;
        row.querySelector('[data-lbl]').addEventListener('input', (e) => { t.label = e.target.value; saveSettings(); });
        row.querySelector('[data-max]').addEventListener('change', (e) => { const v = (e.target.value || '').trim(); t.max = v === '' ? null : Math.max(0, Math.round(parseNum(v))); saveSettings(); });
        row.querySelector('[data-del]').addEventListener('click', () => { if (!confirm('Supprimer cette tranche ?')) return; S[key] = (S[key] || []).filter((x) => x !== t); saveSettings(); renderStatConfig(); });
        box.appendChild(row);
      });
    }
    if ($(addId)) $(addId).onclick = () => { S[key] = (S[key] || []).concat([{ label: 'Nouvelle tranche', max: null }]); saveSettings(); renderStatConfig(); };
  };
  build('statAgeList', 'statTranchesAge', 'statAgeAdd');
  build('statSuiviList', 'statTranchesSuivi', 'statSuiviAdd');
}
// Sous-onglet « Véhicule par cheval » : km & durée attribués par client, détaillés par cheval.
function renderVehiculeCheval() {
  const st = kmStats();
  const box = $('kmParClient'); if (!box) return;
  box.innerHTML = ''; if ($('kmParClientEmpty')) $('kmParClientEmpty').style.display = st.parClient.length ? 'none' : 'block';
  st.parClient.forEach((c) => {
    const el = document.createElement('div'); el.className = 'inv-client';
    let h = `<div class="inv-head"><span>${esc(c.nom)}</span><span>${km(c.km)} · ${durMin(c.min)}</span></div>`;
    c.chevaux.forEach((cv) => { h += `<div class="fin-cheval"><span>🐴 ${esc(cv.nom)}</span><span>${km(cv.km)} · ${durMin(cv.min)}</span></div>`; });
    el.innerHTML = h; box.appendChild(el);
  });
}
// Pièces & usage : par frais véhicule, km à l'achat (frais.kmDebut) et km parcourus depuis (odomètre − kmDebut).
function renderVehiculePieces() {
  const box = $('vehiculePieces'); if (!box) return; box.innerHTML = '';
  const odo = odometer();
  if ($('vehiculePiecesEmpty')) $('vehiculePiecesEmpty').style.display = (S.frais && S.frais.length) ? 'none' : 'block';
  (S.frais || []).forEach((f) => {
    const kmDebut = f.kmDebut || 0; const usage = Math.max(0, odo - kmDebut);
    const reste = f.kmPrevus ? Math.max(0, f.kmPrevus - usage) : null;
    const el = document.createElement('div'); el.className = 'inv-client';
    let h = `<div class="inv-head"><span>${esc(f.poste || 'Pièce')}</span><span>${km(usage)} d'usage</span></div>`;
    h += `<div class="inv-line"><span>Km au dernier entretien</span><span>${km(kmDebut)}</span></div>`;
    h += `<div class="inv-line"><span>Km parcourus depuis l'achat</span><span>${km(usage)}</span></div>`;
    if (f.kmPrevus) h += `<div class="inv-line"><span>${f.nature === 'recurrent' ? 'Avant échéance' : 'Reste avant épuisement'}</span><span>${km(f.kmPrevus)} prévus · ${reste != null ? km(reste) + ' restants' : '—'}</span></div>`;
    el.innerHTML = h; box.appendChild(el);
  });
}
// ---------- Graphiques (Proposition 1 : tous ensemble, 1 graphe par indicateur) — SVG intégré, 100 % offline ----------
const GRAPH_ENC = [{ key: 'liquide', color: '#2e9e5b', label: 'Liquide' }, { key: 'virement', color: '#3b82c4', label: 'Virement' }, { key: 'facture', color: '#e0912f', label: 'Facture pro' }];
const shortMonthLabel = (ym) => { const d = new Date(ym + '-01T00:00:00'); return isNaN(d.getTime()) ? ym : d.toLocaleDateString('fr-FR', { month: 'short' }); };
// Agrégats par mois : CA (Σ m.totalTTC), km (Σ result.totalKm), nb tournées, encaissements (comptaData).
function graphMonthData(months) {
  return months.map((ym) => {
    let ca = 0, kmv = 0, tours = 0;
    allTours().forEach((t) => {
      if (!(t.date || '').startsWith(ym) || !t.result) return;
      if (!(t.result.parClient && t.result.parClient.length)) return;
      tours++; kmv += t.result.totalKm || 0;
      (t.result.parClient || []).forEach((m) => { ca += m.totalTTC || 0; });
    });
    const d = comptaData(ym);
    const enc = { liquide: d.liquideTotal.ttc, virement: d.virementTotal.ttc, facture: d.factureLiqTotal.ttc + d.factureVirTotal.ttc };
    return { ym, label: shortMonthLabel(ym), ca, km: kmv, tours, enc };
  });
}
// Diagramme en barres simple.
function gBars(items, valOf, fmt, color, showVals) {
  const W = 340, H = 180, pl = 8, pr = 8, pt = 14, pb = 32, iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(1, ...items.map(valOf));
  const n = items.length || 1, bw = iw / n, gap = Math.min(10, bw * 0.28);
  let g = `<line x1="${pl}" y1="${pt + ih}" x2="${pl + iw}" y2="${pt + ih}" style="stroke:var(--line)"/>`;
  [0.5, 1].forEach((f) => { const y = (pt + ih - ih * f).toFixed(1); g += `<line x1="${pl}" y1="${y}" x2="${pl + iw}" y2="${y}" style="stroke:var(--line);opacity:.35"/>`; });
  items.forEach((it, i) => {
    const v = valOf(it), bh = max ? v / max * ih : 0, x = pl + i * bw + gap / 2, y = pt + ih - bh, w = Math.max(0, bw - gap);
    g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" style="fill:${color}"/>`;
    if (showVals && v > 0) g += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle" style="fill:var(--ink);font-size:9px;font-weight:700">${esc(fmt(v))}</text>`;
    g += `<text x="${(x + w / 2).toFixed(1)}" y="${(pt + ih + 13).toFixed(1)}" text-anchor="middle" style="fill:var(--muted);font-size:9px">${esc(it.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}
// Barres empilées (encaissements par mode).
function gStacked(items, series) {
  const W = 340, H = 180, pl = 8, pr = 8, pt = 14, pb = 32, iw = W - pl - pr, ih = H - pt - pb;
  const totals = items.map((it) => series.reduce((s, se) => s + (it.enc[se.key] || 0), 0));
  const max = Math.max(1, ...totals);
  const n = items.length || 1, bw = iw / n, gap = Math.min(10, bw * 0.28);
  let g = `<line x1="${pl}" y1="${pt + ih}" x2="${pl + iw}" y2="${pt + ih}" style="stroke:var(--line)"/>`;
  items.forEach((it, i) => {
    const x = pl + i * bw + gap / 2, w = Math.max(0, bw - gap); let acc = 0;
    series.forEach((se) => { const v = it.enc[se.key] || 0; if (v <= 0) return; const bh = v / max * ih; const y = pt + ih - (acc + v) / max * ih; g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${bh.toFixed(1)}" style="fill:${se.color}"/>`; acc += v; });
    g += `<text x="${(x + w / 2).toFixed(1)}" y="${(pt + ih + 13).toFixed(1)}" text-anchor="middle" style="fill:var(--muted);font-size:9px">${esc(it.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}
// Anneau (donut) de répartition + légende intégrée.
function gDonut(segs) {
  const total = segs.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return '';
  const W = 340, H = 180, cx = 78, cy = H / 2, r = 62, ir = 36;
  let a = -Math.PI / 2, g = '';
  segs.forEach((se) => {
    if (se.value <= 0) return; const ang = se.value / total * Math.PI * 2, a2 = a + ang, large = ang > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(a), y1 = cy + r * Math.sin(a), x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const xi1 = cx + ir * Math.cos(a), yi1 = cy + ir * Math.sin(a), xi2 = cx + ir * Math.cos(a2), yi2 = cy + ir * Math.sin(a2);
    g += `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${xi2.toFixed(1)} ${yi2.toFixed(1)} A ${ir} ${ir} 0 ${large} 0 ${xi1.toFixed(1)} ${yi1.toFixed(1)} Z" style="fill:${se.color}"/>`;
    a = a2;
  });
  let lx = cx + r + 18, yy = 34;
  segs.forEach((se) => { if (se.value <= 0) return; const pct = Math.round(se.value / total * 100); g += `<rect x="${lx}" y="${yy}" width="11" height="11" rx="2" style="fill:${se.color}"/><text x="${lx + 16}" y="${yy + 10}" style="fill:var(--ink);font-size:10px">${esc(se.label)} — ${pct}%</text>`; yy += 22; });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}
const gBlock = (title, svg) => `<div style="margin:16px 0 6px"><h3 class="rsub" style="margin-bottom:6px">${esc(title)}</h3>${svg}</div>`;
const gLegend = (series) => `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:4px">${series.map((s) => `<span style="display:inline-flex;align-items:center;gap:5px;font-size:.82rem;color:var(--muted)"><span style="width:11px;height:11px;border-radius:2px;background:${s.color};display:inline-block"></span>${esc(s.label)}</span>`).join('')}</div>`;
let graphType = 'mois', graphPeriodKey = null;
function renderGraphiques() {
  const seg = $('graphTypeSeg'), perSel = $('graphPeriod'), box = $('graphBody'); if (!seg || !perSel || !box) return;
  seg.querySelectorAll('.seg-btn').forEach((b) => { if (!b._gw) { b._gw = true; b.addEventListener('click', () => { graphType = b.dataset.gtype; graphPeriodKey = null; renderGraphiques(); }); } b.classList.toggle('on', b.dataset.gtype === graphType); });
  const opts = comptaPeriodOptions(graphType);
  if (!opts.length) { perSel.innerHTML = ''; box.innerHTML = ''; if ($('graphEmpty')) $('graphEmpty').style.display = 'block'; return; }
  if (!opts.some((o) => o.key === graphPeriodKey)) graphPeriodKey = opts[0].key;
  perSel.innerHTML = opts.map((o) => `<option value="${o.key}"${o.key === graphPeriodKey ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  perSel.onchange = () => { graphPeriodKey = perSel.value; renderGraphiques(); };
  const withData = comptaMonths();
  const months = monthsOfRange(graphType, graphPeriodKey);
  const hasAny = months.some((m) => withData.includes(m));
  if ($('graphEmpty')) $('graphEmpty').style.display = hasAny ? 'none' : 'block';
  if (!hasAny) { box.innerHTML = ''; return; }
  const data = graphMonthData(months);
  const showVals = data.length <= 6;
  const encTot = { liquide: 0, virement: 0, facture: 0 };
  data.forEach((d) => { encTot.liquide += d.enc.liquide; encTot.virement += d.enc.virement; encTot.facture += d.enc.facture; });
  box.innerHTML =
    gBlock('Chiffre d\'affaires (TTC)', gBars(data, (d) => d.ca, (v) => eur(v), '#3b82c4', showVals))
    + gBlock('Kilomètres', gBars(data, (d) => d.km, (v) => km(v), '#7a869a', showVals))
    + gBlock('Nombre de tournées', gBars(data, (d) => d.tours, (v) => String(Math.round(v)), '#8a63c4', showVals))
    + gBlock('Encaissements par mode', gStacked(data, GRAPH_ENC) + gLegend(GRAPH_ENC))
    + gBlock('Répartition des encaissements (période)', gDonut(GRAPH_ENC.map((s) => ({ label: s.label, value: encTot[s.key], color: s.color }))));
}
// Sous-onglet Stats « Annulations » : manque à gagner par client/cheval, comptage par statut/motif, graphiques — filtré par période.
let saType = 'mois', saPeriodKey = null;
function renderStatsAnnul() {
  const seg = $('saTypeSeg'), perSel = $('saPeriod'), body = $('saBody'); if (!seg || !perSel || !body) return;
  seg.querySelectorAll('.seg-btn').forEach((b) => { if (!b._saw) { b._saw = true; b.addEventListener('click', () => { saType = b.dataset.satype; saPeriodKey = null; renderStatsAnnul(); }); } b.classList.toggle('on', b.dataset.satype === saType); });
  const all = allCancellations();
  const months = [...new Set(all.map((c) => (c.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const opts = periodOptionsFrom(saType, months);
  if (!opts.length) { perSel.innerHTML = ''; body.innerHTML = ''; if ($('saEmpty')) $('saEmpty').style.display = 'block'; return; }
  if (!opts.some((o) => o.key === saPeriodKey)) saPeriodKey = opts[0].key;
  perSel.innerHTML = opts.map((o) => `<option value="${o.key}"${o.key === saPeriodKey ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  perSel.onchange = () => { saPeriodKey = perSel.value; renderStatsAnnul(); };
  const range = new Set(monthsOfRange(saType, saPeriodKey));
  const listAll = all.filter((c) => range.has((c.date || '').slice(0, 7)));
  const list = listAll.filter((c) => !chevalCredited(c.cv) && !c.replaced); // manque à gagner = annulations NON payées ET NON replacées (un cheval replacé a été servi ailleurs → pas une perte)
  const credited = listAll.filter((c) => chevalCredited(c.cv)); // RDV payés annulés = note de crédit (facture figée)
  if ($('saEmpty')) $('saEmpty').style.display = listAll.length ? 'none' : 'block';
  if (!listAll.length) { body.innerHTML = ''; return; }
  let html = '';
  if (list.length) {
    const nA = list.filter((c) => c.status === 'annule').length, nR = list.filter((c) => c.status === 'reporte').length;
    const nCl = list.filter((c) => c.reason === 'client').length, nPr = list.filter((c) => c.reason === 'pro').length;
    const totTtc = list.reduce((s, c) => s + c.ttc, 0);
    html += `<div class="tiles tiles-3" style="margin:8px 0">
      <div class="tile"><span class="t-label">Annulés</span><span class="t-val">${nA}</span></div>
      <div class="tile"><span class="t-label">Reportés</span><span class="t-val">${nR}</span></div>
      <div class="tile strong"><span class="t-label">Manque à gagner</span><span class="t-val">${eur(totTtc)}</span></div>
      <div class="tile"><span class="t-label">Motif client</span><span class="t-val">${nCl}</span></div>
      <div class="tile"><span class="t-label">Motif pro</span><span class="t-val">${nPr}</span></div></div>`;
    const byClient = {}; list.forEach((c) => { const k = c.clientId; (byClient[k] = byClient[k] || { nom: c.clientNom, ttc: 0, items: [] }).ttc += c.ttc; byClient[k].items.push(c); });
    html += '<h3 class="rsub">Manque à gagner par client</h3>';
    Object.values(byClient).sort((a, b) => b.ttc - a.ttc).forEach((cl) => { html += `<div class="inv-client"><div class="inv-head"><span>${esc(cl.nom)}</span><span class="inv-amt">${eur(cl.ttc)}</span></div>` + cl.items.map((c) => `<div class="fin-cheval"><span>🐴 ${esc(c.cheval)} · ${esc(fmtDateFr(c.date))} · ${c.status === 'reporte' ? 'reporté' : 'annulé'} (${c.reason === 'pro' ? 'pro' : 'client'})</span><span>${eur(c.ttc)}</span></div>`).join('') + '</div>'; });
    const byCheval = {}; list.forEach((c) => { const k = c.clientId + '|' + norm(c.cheval); (byCheval[k] = byCheval[k] || { nom: c.cheval, client: c.clientNom, ttc: 0, items: [] }).ttc += c.ttc; byCheval[k].items.push(c); });
    html += '<h3 class="rsub">Manque à gagner par cheval (détail)</h3>';
    Object.values(byCheval).sort((a, b) => b.ttc - a.ttc).forEach((cv) => { html += `<div class="inv-client"><div class="inv-head"><span>🐴 ${esc(cv.nom)} <span class="li-sub">— ${esc(cv.client)}</span></span><span class="inv-amt">${eur(cv.ttc)}</span></div>` + cv.items.map((c) => chevalWouldBeLines(c.cv).map((l) => `<div class="fin-detail"><span>${esc(fmtDateFr(c.date))} · ${esc(l.libelle)}</span><span>${eur(l.ttc)}</span></div>`).join('')).join('') + '</div>'; });
    const gMonths = [...new Set(list.map((c) => (c.date || '').slice(0, 7)))].sort();
    const barItems = gMonths.map((m) => ({ label: shortMonthLabel(m), v: list.filter((c) => (c.date || '').slice(0, 7) === m).reduce((s, c) => s + c.ttc, 0) }));
    html += gBlock('Manque à gagner par mois', gBars(barItems, (d) => d.v, (v) => eur(v), '#e0912f', barItems.length <= 6));
    html += gBlock('Répartition annulés / reportés', gDonut([{ label: 'Annulés', value: list.filter((c) => c.status === 'annule').reduce((s, c) => s + c.ttc, 0), color: '#c0453b' }, { label: 'Reportés', value: list.filter((c) => c.status === 'reporte').reduce((s, c) => s + c.ttc, 0), color: '#3b82c4' }]));
  }
  // Section dédiée : RDV payés puis annulés (facture figée + note de crédit), retirés des analyses de vente.
  if (credited.length) {
    const ncOf = (c) => (S.notesCredit || []).find((n) => n.id === (c.cv.cancel && c.cv.cancel.creditNoteId)) || null;
    const rows = credited.map((c) => ({ c, nc: ncOf(c) }));
    const tot = rows.reduce((s, r) => s + (r.nc ? r.nc.montantTTC : 0), 0);
    const nRemb = rows.filter((r) => r.nc && r.nc.rembourse).length;
    html += '<h3 class="rsub">↩ Factures payées annulées (note de crédit)</h3>';
    html += `<p class="hint">Ces RDV avaient été payés : la facture encaissée reste figée et une note de crédit (<b>${eur(tot)}</b> TTC, ${nRemb}/${rows.length} remboursée${nRemb > 1 ? 's' : ''}) neutralise le chiffre d'affaires. Ils sont retirés des analyses de vente ; le détail des remboursements est en Compta → Notes de crédit.</p>`;
    const byC = {}; rows.forEach((r) => { const k = r.c.clientId; (byC[k] = byC[k] || { nom: r.c.clientNom, ttc: 0, items: [] }); byC[k].ttc += r.nc ? r.nc.montantTTC : 0; byC[k].items.push(r); });
    Object.values(byC).sort((a, b) => b.ttc - a.ttc).forEach((cl) => { html += `<div class="inv-client"><div class="inv-head"><span>${esc(cl.nom)}</span><span class="inv-amt">−${eur(cl.ttc)}</span></div>` + cl.items.map((r) => `<div class="fin-cheval"><span>🐴 ${esc(r.c.cheval)} · ${esc(fmtDateFr(r.c.date))} · ${r.nc && r.nc.rembourse ? '✔ remboursée' : 'à rembourser'}</span><span>−${eur(r.nc ? r.nc.montantTTC : 0)}</span></div>`).join('') + '</div>'; });
  }
  body.innerHTML = html;
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
// Tournée « récupérée » (ancienne, figée sans suivi temps réel) : temps reconstruit à partir des données
// saisies manuellement — Route réel par arrêt (a.realMin) + durée de consultation par cheval (cv.consultMin).
function travailForRecovered(t) {
  const R = t.result;
  const mpk = (R && R.totalKm > 0 && R.totalMin) ? (R.totalMin / R.totalKm) : (60 / (S.vitesseKmh || 90));
  const per = []; let complete = true;
  (t.arrets || []).forEach((a, i) => {
    const hasRoute = typeof a.realMin === 'number';
    if (!hasRoute) complete = false;
    const travelMin = hasRoute ? a.realMin : ((R && R.rows && R.rows[i]) ? (R.rows[i].segKm || 0) * mpk : 0);
    let consult = 0;
    (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => { if (!chevalFait(cv)) return; if (typeof cv.consultMin === 'number') consult += cv.consultMin; else complete = false; }));
    per.push({ travelMs: travelMin * 60000, visitMs: consult * 60000, arrival: null, dep: null });
  });
  const returnMinEst = (R && R.kmLastHome != null) ? R.kmLastHome * mpk : 0;
  const hasRet = typeof t.returnRealMin === 'number';
  if (!hasRet) complete = false;
  const returnMs = hasRet ? t.returnRealMin * 60000 : returnMinEst * 60000;
  const totalMs = per.reduce((s, p) => s + p.travelMs + p.visitMs, 0) + returnMs;
  return { per, returnMs, complete, totalMs, endTs: null };
}
function travailForTour(t) {
  if (!(t.arrets || []).length) return null;
  if (t.recovered) return travailForRecovered(t);
  if (!t.startedAt) return null;
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
      const travelPer = w.per[i].travelMs / nc;                                    // trajet = commun à l'arrêt → réparti par client
      const visitPerEqual = (w.per[i].visitMs != null ? w.per[i].visitMs : 0) / nc; // tournées normales : visite mesurée (arrêt) répartie
      (a.clients || []).forEach((cl) => {
        const c = cmap[cl.clientId] = cmap[cl.clientId] || { clientId: cl.clientId, nom: clientName(cl.clientId), travelMs: 0, visitMs: 0, chevaux: {} };
        c.travelMs += travelPer;
        const faits = (cl.chevaux || []).filter(chevalFait); // seuls les chevaux réellement pris en charge portent le temps
        const chn = faits.length || 1;
        if (t.recovered) {
          // Tournée récupérée : la consultation est saisie PAR CHEVAL (cv.consultMin) → attribuée exactement à chaque cheval, pas de moyenne.
          faits.forEach((cv) => { const v = (typeof cv.consultMin === 'number' ? cv.consultMin : 0) * 60000; c.visitMs += v; const ch = c.chevaux[cv.nom] = c.chevaux[cv.nom] || { nom: cv.nom, ms: 0 }; ch.ms += travelPer / chn + v; });
        } else {
          c.visitMs += visitPerEqual;
          faits.forEach((cv) => { const ch = c.chevaux[cv.nom] = c.chevaux[cv.nom] || { nom: cv.nom, ms: 0 }; ch.ms += (travelPer + visitPerEqual) / chn; });
        }
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
    if (Date.now() > deadline) {
      if (tourFinalizeBlock(t).length) return; // arrêts non finalisés → NE PAS clôturer automatiquement (l'utilisateur doit finaliser ; alerte « Arrêts à finaliser »)
      t.endedAt = deadline; t.closed = true; t.autoClosedAt = deadline; changed = true;
    }
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
// Part TTC d'un article attribuée à chaque cheval, pondérée par la quantité par cheval (à défaut : parts égales).
function artPerCheval(a) {
  const q = a.qtesByNom, noms = a.chevaux || [];
  const tot = q ? noms.reduce((s, n) => s + (q[n] || 1), 0) : noms.length;
  return (n) => tot ? a.ttc * (q ? (q[n] || 1) : 1) / tot : 0;
}
// Chevaux payés-annulés (note de crédit) d'une tournée → EXCLUS des analyses de vente (mais restent dans la facture figée + neutralisés par la NC en Compta). Clé « clientId|normNom ».
function creditedKeySet(t) {
  const s = new Set();
  (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => { if (chevalCredited(cv)) s.add(cl.clientId + '|' + norm(cv.nom)); })));
  return s;
}
function financeStats() {
  const cmap = {};
  allTours().forEach((t) => {
    if (!t.result || !t.result.parClient) return;
    const cred = creditedKeySet(t);
    t.result.parClient.forEach((m) => {
      const isCred = (n) => cred.has(m.clientId + '|' + norm(n));
      const c = cmap[m.clientId] = cmap[m.clientId] || { nom: m.nom, dep: 0, mat: 0, art: 0, arrondi: 0, impaye: 0, chevaux: {} };
      const dep = (m.deplacement || []).reduce((s, l) => s + l.partTTC, 0);
      const mat = (m.materiel || []).reduce((s, x) => s + x.ttc, 0);
      const art = (m.articles || []).reduce((s, a) => s + a.ttc, 0); // remise déjà appliquée ligne par ligne
      // Part des chevaux payés-annulés à retirer des analyses (comptée via la note de crédit en Compta) :
      const depCred = (m.deplacement || []).reduce((s, l) => { const nn = l.chevaux || []; return nn.length ? s + (l.partTTC / nn.length) * nn.filter(isCred).length : s; }, 0);
      const matCred = (m.materiel || []).reduce((s, x) => s + (isCred(x.nom) ? x.ttc : 0), 0);
      const artCred = (m.articles || []).reduce((s, a) => { const share = artPerCheval(a); return s + (a.chevaux || []).filter(isCred).reduce((ss, n) => ss + share(n), 0); }, 0);
      c.dep += dep - depCred; c.mat += mat - matCred; c.art += art - artCred;
      // Arrondi caisse (liquide) : le total facturé = total rectifié. Impayé (partiel) suivi à part (créance, ne change pas le CA).
      const pay = (t.payments || {})[m.clientId];
      c.arrondi += payArrondi(m, pay);
      c.impaye += payImpaye(m, pay);
      (m.materiel || []).forEach((x) => { if (isCred(x.nom)) return; const ch = c.chevaux[x.nom] = c.chevaux[x.nom] || { nom: x.nom, dep: 0, mat: 0, art: 0 }; ch.mat += x.ttc; });
      (m.deplacement || []).forEach((l) => { const per = l.chevaux.length ? l.partTTC / l.chevaux.length : 0; l.chevaux.forEach((n) => { if (isCred(n)) return; const ch = c.chevaux[n] = c.chevaux[n] || { nom: n, dep: 0, mat: 0, art: 0 }; ch.dep += per; }); });
      (m.articles || []).forEach((a) => { const share = artPerCheval(a); a.chevaux.forEach((n) => { if (isCred(n)) return; const ch = c.chevaux[n] = c.chevaux[n] || { nom: n, dep: 0, mat: 0, art: 0 }; ch.art += share(n); }); });
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
  allTours().forEach((t) => {
    if ((t.date || '') && t.result && t.result.parClient && t.result.parClient.length) set.add(t.date.slice(0, 7));
    // Un paiement liquide rattaché à un autre mois (caisse) doit faire apparaître ce mois dans la liste.
    Object.values(t.payments || {}).forEach((p) => { if (p && p.method === 'liquide' && !p.facture && p.comptaPeriod) set.add(p.comptaPeriod); });
  });
  return [...set].sort().reverse();
}
// Retrouve une tournée (active ou archivée) par id.
function tourById(id) { return tournees.find((t) => t.id === id) || archive.find((t) => t.id === id) || null; }
// Classe le paiement d'un client d'une tournée depuis la Compta (virement/facture arrivent après la clôture).
function setComptaPayment(tourId, clientId, method) {
  const t = tourById(tourId); if (!t) return;
  if (!t.payments) t.payments = {};
  const prev = t.payments[clientId] || {};
  const keepLiq = { rectifie: prev.rectifie != null ? prev.rectifie : (prev.montantPaye != null && !prev.partiel ? prev.montantPaye : null), partiel: !!prev.partiel, impaye: prev.impaye != null ? prev.impaye : null, resteMode: prev.resteMode || null, comptaPeriod: prev.comptaPeriod || null };
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
    if (!t.result || !t.result.parClient) return;
    const tourYm = (t.date || '').slice(0, 7); // mois « naturel » (date de la tournée)
    t.result.parClient.forEach((m) => {
      const p = (t.payments || {})[m.clientId];
      const method = p ? p.method : null; const fac = !!(p && p.facture);
      const mode = method === 'liquide' ? (fac ? 'facliq' : 'liquide') : method === 'virement' ? (fac ? 'facvir' : 'virement') : 'aclasser';
      // Rattachement caisse : SEUL le liquide sans facture peut être rattaché à un autre mois (comptaPeriod). Tout le reste suit la date de tournée.
      const effYm = (mode === 'liquide' && p && p.comptaPeriod) ? p.comptaPeriod : tourYm;
      const entry = { tourId: t.id, tourDate: t.date, clientId: m.clientId, nom: m.nom, ht: m.totalHT, tva: m.totalTVA, ttc: m.totalTTC, mode, m, payment: p };
      if (mode === 'aclasser') { if (tourYm === ym) aclasserClients.push(entry); return; }
      if (mode === 'virement') { if (tourYm === ym) virementClients.push(entry); return; }
      if (mode === 'facvir') { if (tourYm === ym) factureVirClients.push(entry); return; }
      if (mode === 'facliq') { if (tourYm !== ym) return; const cash = payRecu(m, p); factureLiqClients.push(Object.assign({}, entry, { ht: cash / (1 + r), tva: cash - cash / (1 + r), ttc: cash })); return; }
      // mode === 'liquide' (caisse globalisée, sans facture) — part cash rattachable via effYm.
      if (p && p.partiel) {
        // Un éventuel reste (virement) N'EST PAS de la caisse : il reste au mois de la tournée.
        const reste = payImpaye(m, p);
        if (reste > 0.005 && p.resteMode === 'virement' && tourYm === ym) virementClients.push({ tourId: t.id, clientId: m.clientId, nom: m.nom + ' — reste impayé', ht: reste / (1 + r), tva: reste - reste / (1 + r), ttc: reste, mode: 'virement', derived: true, recuKey: t.id + ':' + m.clientId + ':reste' });
      }
      if (effYm !== ym) return; // la part cash est comptée dans son mois de rattachement
      const cash = payRecu(m, p); const cHT = cash / (1 + r); liquideClients.push({ nom: m.nom, ht: cHT, tva: cash - cHT, ttc: cash });
      if (p && p.partiel) {
        addPost('Acompte liquide (partiel)', cHT, cash - cHT, cash);
      } else {
        (m.articles || []).forEach((a) => addPost(a.libelle, a.ht, a.tva, a.ttc));
        if (m.htMat > 0) addPost('Matériel', m.htMat, m.htMat * r, m.htMat * (1 + r));
        const depHT = (m.deplacement || []).reduce((s, l) => s + l.partHT, 0); if (depHT > 0) addPost('Déplacement', depHT, depHT * r, depHT * (1 + r));
        const diff = payArrondi(m, p); if (Math.abs(diff) >= 0.005) { const dHT = diff / (1 + r); addPost('Arrondi caisse', dHT, diff - dHT, diff); }
      }
    });
  });
  const sum = (arr) => arr.reduce((a, x) => ({ ht: a.ht + x.ht, tva: a.tva + x.tva, ttc: a.ttc + x.ttc }), { ht: 0, tva: 0, ttc: 0 });
  // Notes de crédit du mois (émission) → réduisent le CA (montant négatif).
  const rr = rate();
  const ncMonth = (S.notesCredit || []).filter((n) => (n.date || '').startsWith(ym));
  const ncTTC = ncMonth.reduce((s, n) => s + (n.montantTTC || 0), 0);
  const notesCreditTotal = { ht: -ncTTC / (1 + rr), tva: -(ncTTC - ncTTC / (1 + rr)), ttc: -ncTTC };
  return { liquideClients, virementClients, factureLiqClients, factureVirClients, aclasserClients,
    liquidePosts: Object.values(posts), liquideTotal: sum(liquideClients), virementTotal: sum(virementClients),
    factureLiqTotal: sum(factureLiqClients), factureVirTotal: sum(factureVirClients), aclasserTotal: sum(aclasserClients),
    notesCredit: ncMonth, notesCreditTotal };
}
// Génère le PDF via l'impression du navigateur, dans le document courant (compatible PWA installée,
// contrairement à window.open('_blank') qui est bloqué / ferme l'app sur mobile).
// ================= PDF (généré dans l'app) + partage natif (email avec pièce jointe) =================
// Octets Latin-1 d'une chaîne (les PDF texte n'utilisent que des caractères ≤ 255).
function latin1Bytes(s) { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff; return a; }
// Ramène tout caractère > 255 à un équivalent ASCII simple (le PDF Helvetica/WinAnsi ne gère que Latin-1).
function pdfText(s) { return String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/€/g, 'EUR').replace(/[^\x00-\xFF]/g, '?').replace(/([\\()])/g, '\\$1'); }
// Assemble un PDF (objets = corps sérialisés, 1-indexés) → chaîne Latin-1 (xref au bon offset d'octets car tous les caractères sont ≤ 255).
function buildPdfString(objs) {
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offsets.forEach((off) => { pdf += String(off).padStart(10, '0') + ' 00000 n \n'; });
  pdf += 'trailer\n<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF';
  return pdf;
}
// PDF texte A4 portrait (Helvetica). lines = [{text, size?, bold?, gap?} | 'texte'].
function pdfFromText(lines) {
  const W = 595, H = 842, left = 56; let y = H - 64;
  let content = 'BT\n';
  (lines || []).forEach((ln) => {
    const t = (typeof ln === 'string') ? { text: ln } : (ln || {});
    const size = t.size || 12, gap = (t.gap != null) ? t.gap : size + 7;
    if (t.text != null && t.text !== '') { content += '/F' + (t.bold ? '2' : '1') + ' ' + size + ' Tf\n1 0 0 1 ' + left + ' ' + Math.round(y) + ' Tm\n(' + pdfText(t.text) + ') Tj\n'; }
    y -= gap;
  });
  content += 'ET';
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + W + ' ' + H + ']/Contents 4 0 R/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>>>',
    '<</Length ' + latin1Bytes(content).length + '>>\nstream\n' + content + '\nendstream',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>',
  ];
  return new Blob([latin1Bytes(buildPdfString(objs))], { type: 'application/pdf' });
}
// Partage natif d'un fichier (email avec pièce jointe via la feuille de partage). Repli : téléchargement.
// Renvoie true si le partage/téléchargement a eu lieu (→ marquer « envoyé »), false si annulé.
async function shareDoc(blob, filename, title, text) {
  try {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || filename, text: text || '' });
      return true;
    }
  } catch (e) { if (e && e.name === 'AbortError') return false; /* sinon : repli téléchargement */ }
  try { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); return true; } catch (e) { alert('Impossible de générer le fichier.'); return false; }
}
// Texte du mail (destinataire non préréglable via le partage natif → on le rappelle dans le corps).
function mailBodyFor(client, docLabel) { return `Bonjour${client && fullName(client) ? ' ' + fullName(client) : ''},\n\nVeuillez trouver ci-joint : ${docLabel}.\n\nBien à vous.${client && client.email ? '\n\n(Destinataire : ' + client.email + ')' : ''}`; }
function concatBytes(parts) { let len = 0; parts.forEach((p) => len += p.length); const out = new Uint8Array(len); let o = 0; parts.forEach((p) => { out.set(p, o); o += p.length; }); return out; }
function dataUrlToBytes(u) { const b64 = (u || '').split(',')[1] || ''; const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
// PDF binaire : une image JPEG par page (DCTDecode), mise à l'échelle A4 (paysage/portrait). pages = [{bytes,w,h}].
function pdfFromJpegPages(pages, land) {
  const PW = land ? 842 : 595, PH = land ? 595 : 842, m = 20;
  const parts = []; let len = 0; const offsets = [];
  const add = (b) => { parts.push(b); len += b.length; };
  const addStr = (s) => add(latin1Bytes(s));
  const writeObj = (num, headStr, streamBytes) => { offsets[num] = len; addStr(num + ' 0 obj\n' + headStr); if (streamBytes) { addStr('stream\n'); add(streamBytes); addStr('\nendstream'); } addStr('\nendobj\n'); };
  addStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length, kids = pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ');
  writeObj(1, '<</Type/Catalog/Pages 2 0 R>>');
  writeObj(2, '<</Type/Pages/Kids[' + kids + ']/Count ' + n + '>>');
  pages.forEach((p, i) => {
    const pageN = 3 + i * 3, contN = 4 + i * 3, imgN = 5 + i * 3;
    const scale = Math.min((PW - 2 * m) / p.w, (PH - 2 * m) / p.h), dw = p.w * scale, dh = p.h * scale, x = (PW - dw) / 2, y = (PH - dh) / 2;
    const cbytes = latin1Bytes('q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' cm /Im0 Do Q');
    writeObj(pageN, '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + PW + ' ' + PH + ']/Contents ' + contN + ' 0 R/Resources<</XObject<</Im0 ' + imgN + ' 0 R>>>>>>');
    writeObj(contN, '<</Length ' + cbytes.length + '>>\n', cbytes);
    writeObj(imgN, '<</Type/XObject/Subtype/Image/Width ' + p.w + '/Height ' + p.h + '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ' + p.bytes.length + '>>\n', p.bytes);
  });
  const xref = len, totalObjs = 2 + 3 * n;
  let xr = 'xref\n0 ' + (totalObjs + 1) + '\n0000000000 65535 f \n';
  for (let k = 1; k <= totalObjs; k++) xr += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
  xr += 'trailer\n<</Size ' + (totalObjs + 1) + '/Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF';
  addStr(xr);
  return new Blob([concatBytes(parts)], { type: 'application/pdf' });
}
function plLoadImg(src) { return new Promise((res) => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
function plTrunc(ctx, s, maxW) { s = String(s || ''); if (ctx.measureText(s).width <= maxW) return s; while (s.length && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
// Rend une page de planche sur un canvas (en-tête + grille + photos) → pour l'export PDF image / email.
async function planchePageCanvas(pi) {
  const st = plCreate, land = st.orientation !== 'portrait', W = land ? 1400 : 990, H = land ? 990 : 1400;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.textBaseline = 'top';
  const M = 28, headH = 86; let hx = M;
  if (st.logo && S.proLogo && S.proLogo.data) { const lg = await plLoadImg(S.proLogo.data); if (lg) { const lw = 190, lh = 64; ctx.save(); ctx.beginPath(); ctx.rect(M, M, lw, lh); ctx.clip(); const z = S.proLogo.zoom || 1, s = Math.min(lw / lg.width, lh / lg.height) * z, dw = lg.width * s, dh = lg.height * s, cx = M + lw / 2 + (S.proLogo.x || 0) * lw, cy = M + lh / 2 + (S.proLogo.y || 0) * lh; ctx.drawImage(lg, cx - dw / 2, cy - dh / 2, dw, dh); ctx.restore(); hx = M + lw + 14; } }
  ctx.fillStyle = '#111'; ctx.font = 'bold 26px sans-serif';
  ctx.fillText(st.type === 'avantapres' ? 'Avant / apres (parage)' : 'Planche de contact', hx, M + 8);
  ctx.font = '15px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText((st.cheval || '-') + '  ·  ' + (st.client || '-'), W - M, M + 8);
  ctx.fillText(fmtDateFr(st.date), W - M, M + 30); ctx.textAlign = 'left';
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, M + headH); ctx.lineTo(W - M, M + headH); ctx.stroke();
  const angles = st.angles || [], rows = plPageRows(pi), gx = M, gw = W - 2 * M, top = M + headH + 10, noteH = st.note ? 56 : 0, gh = H - top - M - noteH;
  const labelW = Math.min(180, gw * 0.18), colW = (gw - labelW) / Math.max(1, angles.length), headerRowH = 30, rowH = (gh - headerRowH) / Math.max(1, rows.length);
  ctx.fillStyle = '#eee'; ctx.fillRect(gx, top, gw, headerRowH);
  ctx.fillStyle = '#111'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
  angles.forEach((a, ci) => ctx.fillText(plTrunc(ctx, a, colW - 8), gx + labelW + ci * colW + colW / 2, top + 8)); ctx.textAlign = 'left';
  const imgs = {};
  for (const r of rows) for (let ci = 0; ci < angles.length; ci++) { const pid = st.cells[plCellKey(pi, r, ci)], ph = pid && st.photos.find((p) => p.id === pid); if (ph && ph.url) imgs[r.ri + '_' + r.pj + '_' + ci] = await plLoadImg(ph.url); }
  ctx.font = 'bold 13px sans-serif';
  rows.forEach((r, ri) => {
    const ry = top + headerRowH + ri * rowH;
    ctx.fillStyle = (r.pj === 1) ? '#e7eef7' : '#f5f5f5'; ctx.fillRect(gx, ry, labelW, rowH);
    ctx.fillStyle = '#111'; ctx.save(); ctx.beginPath(); ctx.rect(gx + 3, ry, labelW - 6, rowH); ctx.clip(); ctx.fillText(plTrunc(ctx, r.label, labelW - 8), gx + 5, ry + rowH / 2 - 7); ctx.restore();
    angles.forEach((a, ci) => { const cx = gx + labelW + ci * colW, im = imgs[r.ri + '_' + r.pj + '_' + ci]; if (im) { const s = Math.min((colW - 6) / im.width, (rowH - 6) / im.height), dw = im.width * s, dh = im.height * s; ctx.drawImage(im, cx + (colW - dw) / 2, ry + (rowH - dh) / 2, dw, dh); } });
  });
  ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.beginPath();
  const gridBottom = top + headerRowH + rows.length * rowH;
  for (let ci = 0; ci <= angles.length; ci++) { const xx = gx + labelW + ci * colW; ctx.moveTo(xx, top); ctx.lineTo(xx, gridBottom); }
  ctx.moveTo(gx, top); ctx.lineTo(gx, gridBottom);
  for (let ri = 0; ri <= rows.length; ri++) { const yy = top + headerRowH + ri * rowH; ctx.moveTo(gx, yy); ctx.lineTo(gx + gw, yy); }
  ctx.moveTo(gx, top); ctx.lineTo(gx + gw, top); ctx.stroke();
  if (st.note) { ctx.fillStyle = '#111'; ctx.font = '13px sans-serif'; ctx.save(); ctx.beginPath(); ctx.rect(gx, H - M - noteH + 6, gw, noteH); ctx.clip(); ctx.fillText(plTrunc(ctx, 'Note : ' + st.note, gw), gx, H - M - noteH + 10); ctx.restore(); }
  return cv;
}
async function planchePdfBlob() {
  const land = plCreate.orientation !== 'portrait', pages = [];
  for (let pi = 0; pi < (plCreate.pages || []).length; pi++) { const cv = await planchePageCanvas(pi); pages.push({ bytes: dataUrlToBytes(cv.toDataURL('image/jpeg', 0.85)), w: cv.width, h: cv.height }); }
  return pdfFromJpegPages(pages, land);
}
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
  if (currentCsub === 'decl') renderComptaDecl(); else if (currentCsub === 'impayes') renderComptaImpayes(); else if (currentCsub === 'nc') renderComptaNC(); else if (currentCsub === 'avenir') renderComptaAvenir(); else renderComptaMois();
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
    const el = document.createElement('div'); el.className = 'list-item stack-act';
    const sent = im.sentAt ? ' · <span class="badge">📧 envoyé le ' + esc(fmtDateFr(im.sentAt)) + '</span>' : '';
    el.innerHTML = `<div class="li-main"><b>${esc(fullName(c))}</b> <b class="li-amount">${eur(im.ttc)}</b><span class="li-sub">Impayé du ${esc(fmtDateFr(im.date))} · <span class="badge">en attente</span>${sent}</span></div><div class="li-act li-act-col"><button class="btn small${im.sentAt ? ' done' : ' primary'}" data-mail>📧 Email${im.sentAt ? ' ✓' : ''}</button></div>`;
    el.querySelector('[data-mail]').addEventListener('click', () => { if (!c.email && !confirm('Ce client n\'a pas d\'adresse email en fiche. Continuer quand même (vous choisirez le destinataire dans le mail) ?')) return; sendClientDoc(c, impayePdfBlob(c, im), 'impaye-' + norm(fullName(c)).replace(/\s+/g, '-') + '.pdf', "facture d'impayé", () => { im.sentAt = todayStr(); saveClients(); renderComptaImpayes(); }); });
    attente.appendChild(el);
  });
  regularises.forEach(({ c, im }) => {
    const rt = im.collectedTourId ? tourById(im.collectedTourId) : null;
    const el = document.createElement('div'); el.className = 'list-item';
    el.innerHTML = `<div class="li-main"><b>${esc(fullName(c))}</b><span class="li-sub">Impayé du ${esc(fmtDateFr(im.date))} · <span class="badge">paiement reçu</span>${rt ? ' · régularisé le ' + esc(fmtDateFr(rt.date)) : ''}</span></div><div class="li-act"><b>${eur(im.ttc)}</b></div>`;
    regul.appendChild(el);
  });
}
// Sous-onglet Compta « Notes de crédit » : à rembourser (virement) / remboursées ; PDF + marquage figé.
function renderComptaNC() {
  const pend = $('ncPending'), done = $('ncDone'); if (!pend || !done) return;
  pend.innerHTML = ''; done.innerHTML = '';
  const list = (S.notesCredit || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const enAtt = list.filter((n) => !n.rembourse), fait = list.filter((n) => n.rembourse);
  const totAtt = enAtt.reduce((s, n) => s + (n.montantTTC || 0), 0);
  if ($('ncPendingEmpty')) $('ncPendingEmpty').style.display = enAtt.length ? 'none' : 'block';
  if ($('ncDoneEmpty')) $('ncDoneEmpty').style.display = fait.length ? 'none' : 'block';
  if ($('ncTot')) $('ncTot').innerHTML = enAtt.length ? `À rembourser (virement) : <b>${eur(totAtt)}</b>` : '';
  const row = (n, isDone) => {
    const el = document.createElement('div'); el.className = 'list-item stack-act';
    const sent = n.sentAt ? ' · <span class="badge">📧 envoyé le ' + esc(fmtDateFr(n.sentAt)) + '</span>' : '';
    el.innerHTML = `<div class="li-main"><b>Note de crédit · ${esc(n.clientNom)}</b> <b class="li-amount">${eur(n.montantTTC)}</b><span class="li-sub">🐴 ${esc(n.chevalNom)} · RDV du ${esc(fmtDateFr(n.tourDate))} · émise le ${esc(fmtDateFr(n.date))} · motif ${n.motif === 'pro' ? 'pro' : 'client'}${n.rembourse ? ' · remboursée le ' + esc(fmtDateFr(n.rembourseAt)) : ''}${sent}</span></div><div class="li-act li-act-col"><button class="btn small${n.sentAt ? ' done' : ' primary'}" data-mail>📧 Email${n.sentAt ? ' ✓' : ''}</button><button class="btn small" data-pdf>🖨 PDF</button>${isDone ? '' : ' <button class="btn small" data-rmb>✓ Remboursée</button>'}</div>`;
    const cli = clients.find((x) => x.id === n.clientId);
    el.querySelector('[data-mail]').addEventListener('click', () => { if (!(cli && cli.email) && !confirm('Ce client n\'a pas d\'adresse email en fiche. Continuer quand même ?')) return; sendClientDoc(cli, ncPdfBlob(n), 'note-credit-' + norm(n.clientNom).replace(/\s+/g, '-') + '.pdf', 'note de crédit', () => { n.sentAt = todayStr(); saveSettings(); renderComptaNC(); }); });
    el.querySelector('[data-pdf]').addEventListener('click', () => creditNotePdf(n));
    const rb = el.querySelector('[data-rmb]'); if (rb) rb.addEventListener('click', () => { if (!confirm('Marquer cette note de crédit comme remboursée (virement) ? Elle sera figée.')) return; n.rembourse = true; n.rembourseAt = todayStr(); saveSettings(); renderComptaNC(); });
    return el;
  };
  enAtt.forEach((n) => pend.appendChild(row(n, false)));
  fait.forEach((n) => done.appendChild(row(n, true)));
}
// PDF d'une note de crédit (à imprimer/envoyer au client).
function creditNotePdf(n) {
  const r = rate(); const ht = n.montantTTC / (1 + r);
  printHtml('Note de crédit — ' + n.clientNom, `<h1>Note de crédit</h1>
    <h2>${esc(n.clientNom)} — émise le ${esc(fmtDateFr(n.date))}</h2>
    <p>Annulation du RDV du <b>${esc(fmtDateFr(n.tourDate))}</b> — cheval <b>${esc(n.chevalNom)}</b>.</p>
    <table><thead><tr><th>Libellé</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead>
    <tbody><tr><td>Avoir (annulation de prestation)</td><td>${eur(ht)}</td><td>${eur(n.montantTTC - ht)}</td><td>${eur(n.montantTTC)}</td></tr></tbody></table>
    <h2 style="margin-top:12px">Montant à rembourser par virement : ${eur(n.montantTTC)} TTC</h2>`);
}
// PDF (Blob) d'une facture d'impayé — ne contient QUE les données de ce client (confidentialité).
function impayePdfBlob(c, im) {
  const r = rate(), ht = im.ttc / (1 + r);
  return pdfFromText([
    { text: "Facture d'impayé", size: 20, bold: true, gap: 30 },
    { text: fullName(c) + (c.societe ? ' - ' + c.societe : ''), size: 13, bold: true, gap: 18 },
    { text: addrStr(c.addr), size: 11, gap: 24 },
    { text: 'Impayé du ' + fmtDateFr(im.date), size: 12, gap: 26 },
    { text: 'Montant HT : ' + eur(ht), gap: 16 },
    { text: 'TVA : ' + eur(im.ttc - ht), gap: 16 },
    { text: 'Montant dû TTC : ' + eur(im.ttc), size: 14, bold: true, gap: 26 },
    { text: 'Merci de régulariser ce montant.', size: 11 },
  ]);
}
// PDF (Blob) d'une note de crédit — ne contient QUE les données de ce client (confidentialité).
function ncPdfBlob(n) {
  const r = rate(), ht = n.montantTTC / (1 + r);
  return pdfFromText([
    { text: 'Note de crédit (avoir)', size: 20, bold: true, gap: 30 },
    { text: n.clientNom, size: 13, bold: true, gap: 18 },
    { text: 'Emise le ' + fmtDateFr(n.date), size: 11, gap: 24 },
    { text: 'Annulation du RDV du ' + fmtDateFr(n.tourDate) + ' - cheval ' + n.chevalNom, size: 12, gap: 26 },
    { text: 'Avoir HT : ' + eur(ht), gap: 16 },
    { text: 'TVA : ' + eur(n.montantTTC - ht), gap: 16 },
    { text: 'Montant a rembourser TTC : ' + eur(n.montantTTC), size: 14, bold: true },
  ]);
}
// Email libre au client (depuis « Agir ») : joindre un PDF/image (→ partage natif vers Gmail) ou email prérempli (mailto, destinataire rempli, sans pièce jointe).
function modalEmailClient(client) {
  if (!client) { alert('Client introuvable.'); return; }
  let file = null;
  openModal(`<div class="modal-head"><b>📧 Email — ${esc(fullName(client))}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Destinataire : <b>${client.email ? esc(client.email) : '⚠ aucune adresse email en fiche client'}</b>. Joignez un PDF (planche ou facture déjà enregistrée) puis choisissez Gmail dans le partage, ou ouvrez un email prérempli sans pièce jointe.</p>
    <input type="file" id="emFile" accept="application/pdf,image/*" hidden/>
    <button class="btn block" id="emPick">📎 Joindre un fichier (PDF / image)</button>
    <p class="hint" id="emFileName"></p>
    <div class="actions"><button class="btn primary block" id="emSend">📧 Ouvrir l'email</button><button class="btn block" id="emClose">Fermer</button></div>`);
  $('mX').onclick = closeModal; $('emClose').onclick = closeModal;
  $('emPick').onclick = () => $('emFile').click();
  $('emFile').addEventListener('change', (e) => { file = (e.target.files && e.target.files[0]) || null; if ($('emFileName')) $('emFileName').textContent = file ? '📎 ' + file.name : ''; });
  $('emSend').onclick = async () => {
    const body = mailBodyFor(client, file ? file.name : 'notre échange');
    if (file) { await shareDoc(file, file.name, 'Document — ' + fullName(client), body); closeModal(); return; }
    location.href = 'mailto:' + encodeURIComponent(client.email || '') + '?subject=' + encodeURIComponent('Message') + '&body=' + encodeURIComponent(body);
    closeModal();
  };
}
// Partage un document client par email (pièce jointe), puis exécute onSent() si l'envoi a bien été lancé.
async function sendClientDoc(client, blob, filename, docLabel, onSent) {
  const ok = await shareDoc(blob, filename, docLabel, mailBodyFor(client, docLabel));
  if (ok && onSent) onSent();
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
  const ncTbl = d.notesCredit.length ? `<div class="table-wrap"><table><thead><tr><th>Client</th><th>Cheval</th><th>TTC</th></tr></thead><tbody>${d.notesCredit.map((n) => `<tr><td>${esc(n.clientNom)}</td><td>${esc(n.chevalNom)}</td><td>−${eur(n.montantTTC)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucune.</p>';
  const ncSec = `<section class="card"><div class="card-head"><h3 style="margin:0">↩ Notes de crédit (réduction du CA)</h3><button class="btn small" data-print="nc" data-ym="${ym}">🖨 PDF</button></div><p class="hint">${tot(d.notesCreditTotal)}</p>${ncTbl}</section>`;
  return liquideSec
    + section('🏦 Virements', 'virement', d.virementTotal, clientTbl(d.virementClients), d.virementClients)
    + section('🧾 Facture pro — liquide', 'facliq', d.factureLiqTotal, clientTbl(d.factureLiqClients), d.factureLiqClients)
    + section('🧾 Facture pro — virement', 'facvir', d.factureVirTotal, clientTbl(d.factureVirClients), d.factureVirClients)
    + ncSec;
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
  else if (k === 'facvir') printHtml('Factures pro virement — ' + ml, detailPdf(d.factureVirClients, d.factureVirTotal, 'Factures pro payées par virement', ml + ' — par client et par cheval', 'Aucune facture virement ce mois.'));
  else if (k === 'nc') printHtml('Notes de crédit — ' + ml, `<h1>Notes de crédit (avoirs)</h1><h2>${ml} — réduction du chiffre d'affaires</h2>` + (d.notesCredit.length ? `<table><thead><tr><th>Client</th><th>Cheval</th><th>Émise le</th><th>TTC</th></tr></thead><tbody>${d.notesCredit.map((n) => `<tr><td>${esc(n.clientNom)}</td><td>${esc(n.chevalNom)}</td><td>${esc(fmtDateFr(n.date))}</td><td>−${eur(n.montantTTC)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td></td><td></td><td>${eur(d.notesCreditTotal.ttc)}</td></tr></tfoot></table>` : '<p>Aucune note de crédit ce mois.</p>'));
}
// PDF « complet » : toutes les sections (Liquide · Virements · Factures pro · Notes de crédit) sur la période sélectionnée (mois/trimestre/semestre/année), détail par mois + récap de plage.
function comptaPrintFull(type, key) {
  const months = monthsOfRange(type, key).filter((m) => comptaMonths().includes(m)).sort();
  if (!months.length) { alert('Aucune donnée sur cette période.'); return; }
  const perLabel = (comptaPeriodOptions(type).find((o) => o.key === key) || {}).label || key;
  const sum = (arr) => arr.reduce((a, x) => ({ ht: a.ht + x.ht, tva: a.tva + x.tva, ttc: a.ttc + x.ttc }), { ht: 0, tva: 0, ttc: 0 });
  const foot = (tt) => `<tfoot><tr><td>Total</td><td>${eur(tt.ht)}</td><td>${eur(tt.tva)}</td><td>${eur(tt.ttc)}</td></tr></tfoot>`;
  const postTbl = (arr) => arr.length ? `<table><thead><tr><th>Poste</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead><tbody>${arr.map((x) => `<tr><td>${esc(x.libelle)}</td><td>${eur(x.ht)}</td><td>${eur(x.tva)}</td><td>${eur(x.ttc)}</td></tr>`).join('')}</tbody>${foot(sum(arr))}</table>` : '<p>Aucun.</p>';
  const cliTbl = (arr) => arr.length ? `<table><thead><tr><th>Client</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead><tbody>${arr.map((e) => `<tr><td>${esc(e.nom)}</td><td>${eur(e.ht)}</td><td>${eur(e.tva)}</td><td>${eur(e.ttc)}</td></tr>`).join('')}</tbody>${foot(sum(arr))}</table>` : '<p>Aucun.</p>';
  const ncTbl = (arr) => arr.length ? `<table><thead><tr><th>Client</th><th>Cheval</th><th>Émise le</th><th>TTC</th></tr></thead><tbody>${arr.map((n) => `<tr><td>${esc(n.clientNom)}</td><td>${esc(n.chevalNom)}</td><td>${esc(fmtDateFr(n.date))}</td><td>−${eur(n.montantTTC)}</td></tr>`).join('')}</tbody></table>` : '<p>Aucune.</p>';
  const gt = months.reduce((a, m) => { const d = comptaData(m); a.liq += d.liquideTotal.ttc; a.vir += d.virementTotal.ttc; a.fac += d.factureLiqTotal.ttc + d.factureVirTotal.ttc; a.nc += d.notesCreditTotal.ttc; return a; }, { liq: 0, vir: 0, fac: 0, nc: 0 });
  let body = `<h1>Déclaration comptable — ${esc(perLabel)}</h1><h2>Toutes les sections (TTC)</h2>
    <table><thead><tr><th>Récapitulatif de la plage</th><th>TTC</th></tr></thead><tbody>
      <tr><td>💶 Liquide</td><td>${eur(gt.liq)}</td></tr>
      <tr><td>🏦 Virements</td><td>${eur(gt.vir)}</td></tr>
      <tr><td>🧾 Factures pro</td><td>${eur(gt.fac)}</td></tr>
      <tr><td>↩ Notes de crédit</td><td>${eur(gt.nc)}</td></tr>
    </tbody><tfoot><tr><td>Net</td><td>${eur(gt.liq + gt.vir + gt.fac + gt.nc)}</td></tr></tfoot></table>`;
  months.forEach((m) => {
    const d = comptaData(m);
    body += `<h2 style="margin-top:18px">${monthLabel(m)}</h2>`;
    body += `<h3>💶 Liquide (globalisé, sans nom de client)</h3>${postTbl(d.liquidePosts)}`;
    body += `<h3>🏦 Virements</h3>${cliTbl(d.virementClients)}`;
    body += `<h3>🧾 Facture pro — liquide</h3>${cliTbl(d.factureLiqClients)}`;
    body += `<h3>🧾 Facture pro — virement</h3>${cliTbl(d.factureVirClients)}`;
    body += `<h3>↩ Notes de crédit</h3>${ncTbl(d.notesCredit)}`;
  });
  printHtml('Déclaration complète — ' + perLabel, body);
}
function renderComptaMois() {
  const box = $('comptaMoisBody'); if (!box) return;
  const ym = todayStr().slice(0, 7);
  // Récap des paiements liquide de ce mois déjà rattachés à un mois précédent (caisse).
  let outN = 0, outT = 0;
  allTours().forEach((t) => { if ((t.date || '').slice(0, 7) !== ym || !t.result || !t.result.parClient) return; t.result.parClient.forEach((m) => { const p = (t.payments || {})[m.clientId]; if (p && p.method === 'liquide' && !p.facture && p.comptaPeriod && p.comptaPeriod !== ym) { outN++; outT += payRecu(m, p); } }); });
  const rebaseInfo = outN ? `<p class="hint">↩ <b>${outN}</b> paiement(s) liquide (${eur(outT)}) rattaché(s) à un mois précédent — hors caisse de ${monthLabel(ym)}.</p>` : '';
  box.innerHTML = `<div class="actions" style="margin-bottom:6px"><button class="btn small block" id="cmRebaseBtn">📅 Clôturer la caisse liquide → rattacher au mois précédent</button></div>${rebaseInfo}` + comptaSectionsHtml(ym);
  const rb = $('cmRebaseBtn'); if (rb) rb.onclick = () => modalRebaseLiquide();
  comptaWire(box, renderComptaMois);
}
// Rattache des paiements LIQUIDE (sans facture) du mois en cours à un mois précédent (dépôt de caisse décalé). Ne touche pas aux dates de tournées.
function modalRebaseLiquide() {
  const cur = todayStr().slice(0, 7);
  const shiftMonth = (ym, delta) => { const [y, mo] = ym.split('-').map(Number); const idx = (y * 12 + (mo - 1)) + delta; return Math.floor(idx / 12) + '-' + String((idx % 12) + 1).padStart(2, '0'); };
  const shortD = (d) => (d && d.length >= 10) ? d.slice(8, 10) + '/' + d.slice(5, 7) : (d || '');
  const rows = [];
  allTours().forEach((t) => {
    if ((t.date || '').slice(0, 7) !== cur || !t.result || !t.result.parClient) return;
    t.result.parClient.forEach((m) => { const p = (t.payments || {})[m.clientId]; if (!p || p.method !== 'liquide' || p.facture) return; rows.push({ key: t.id + ':' + m.clientId, tourId: t.id, clientId: m.clientId, date: t.date, nom: m.nom, cash: payRecu(m, p) }); });
  });
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.nom).localeCompare(String(b.nom)));
  const targets = [1, 2, 3, 4, 5, 6].map((d) => shiftMonth(cur, -d));
  let target = targets[0];
  const payOf = (r) => (((tourById(r.tourId) || {}).payments) || {})[r.clientId] || null;
  const isLocked = () => !!(S.comptaStatus && S.comptaStatus[target] && S.comptaStatus[target].liquide === 'encode');
  const sel = new Set();
  const initSel = () => { sel.clear(); rows.forEach((r) => { const p = payOf(r); if (p && p.comptaPeriod === target) sel.add(r.key); }); };
  initSel();
  const render = () => {
    const locked = isLocked();
    const chosen = rows.filter((r) => sel.has(r.key));
    const totSel = chosen.reduce((s, r) => s + r.cash, 0), totRest = rows.filter((r) => !sel.has(r.key)).reduce((s, r) => s + r.cash, 0);
    openModal(`<div class="modal-head"><b>📅 Clôturer la caisse liquide</b><button class="x" id="mX">✕</button></div>
      <p class="hint">Rattache des paiements <b>liquide</b> de ${monthLabel(cur)} à un mois précédent (ex. dépôt du 10). Les dates de tournées ne changent pas ; seule la caisse comptable est déplacée.</p>
      <label>Rattacher au mois<select id="rbTarget">${targets.map((mm) => `<option value="${mm}"${mm === target ? ' selected' : ''}>${monthLabel(mm)}</option>`).join('')}</select></label>
      ${locked ? `<p class="hint" style="color:var(--warn);font-weight:700">⚠ La démarche liquide de ${monthLabel(target)} est déjà validée (figée) : rattachement impossible tant qu'elle est encodée.</p>` : ''}
      <div id="rbList" style="max-height:50vh;overflow:auto;margin:8px 0">${rows.length ? rows.map((r) => `<label class="chk2" style="display:flex;gap:8px;align-items:center;justify-content:space-between"><span><input type="checkbox" data-k="${r.key}"${sel.has(r.key) ? ' checked' : ''}${locked ? ' disabled' : ''}/> ${esc(shortD(r.date))} · ${esc(r.nom)}</span><b>${eur(r.cash)}</b></label>`).join('') : '<p class="empty">Aucun paiement liquide ce mois.</p>'}</div>
      <p class="hint">→ <b>${chosen.length}</b> paiement(s) · <b>${eur(totSel)}</b> rattaché(s) à ${monthLabel(target)} · reste en ${monthLabel(cur)} : <b>${eur(totRest)}</b></p>
      <div class="actions"><button class="btn primary block" id="rbOk"${locked || !rows.length ? ' disabled' : ''}>Appliquer</button><button class="btn block" id="rbClose">Fermer</button></div>`);
    $('mX').onclick = closeModal; $('rbClose').onclick = closeModal;
    $('rbTarget').addEventListener('change', (e) => { target = e.target.value; initSel(); render(); });
    $('rbList').querySelectorAll('[data-k]').forEach((cb) => cb.addEventListener('change', (e) => { const k = e.target.dataset.k; if (e.target.checked) sel.add(k); else sel.delete(k); render(); }));
    const ok = $('rbOk'); if (ok) ok.onclick = () => {
      if (isLocked()) return;
      let touched = false;
      rows.forEach((r) => {
        const t = tourById(r.tourId); if (!t || !t.payments || !t.payments[r.clientId]) return;
        const p = t.payments[r.clientId];
        if (sel.has(r.key)) { if (p.comptaPeriod !== target) { p.comptaPeriod = target; touched = true; } }
        else if (p.comptaPeriod === target) { delete p.comptaPeriod; touched = true; }
      });
      if (touched) { saveTournees(); saveArchive(); }
      closeModal(); renderComptaMois();
      alert(chosen.length + ' paiement(s) rattaché(s) à ' + monthLabel(target) + ' (' + eur(totSel) + '). Caisse de ' + monthLabel(cur) + ' : ' + eur(totRest) + '.');
    };
  };
  render();
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
  if ($('declFullPdf')) $('declFullPdf').onclick = () => comptaPrintFull(typeSel.value || 'mois', declPeriod);
  if (!opts.length) { perSel.innerHTML = ''; box.innerHTML = ''; if ($('comptaDeclEmpty')) $('comptaDeclEmpty').style.display = 'block'; return; }
  if (!opts.some((o) => o.key === declPeriod)) declPeriod = opts[0].key;
  perSel.innerHTML = opts.map((o) => `<option value="${o.key}"${o.key === declPeriod ? ' selected' : ''}>${o.label}</option>`).join('');
  const withData = comptaMonths();
  const months = monthsOfRange(type, declPeriod).filter((m) => withData.includes(m));
  if ($('comptaDeclEmpty')) $('comptaDeclEmpty').style.display = months.length ? 'none' : 'block';
  const rt = months.reduce((a, m) => { const d = comptaData(m); a.liq += d.liquideTotal.ttc; a.vir += d.virementTotal.ttc; a.fac += d.factureLiqTotal.ttc + d.factureVirTotal.ttc; a.nc += d.notesCreditTotal.ttc; return a; }, { liq: 0, vir: 0, fac: 0, nc: 0 });
  box.innerHTML = (months.length ? `<p class="banner">Total plage — Liquide <b>${eur(rt.liq)}</b> · Virements <b>${eur(rt.vir)}</b> · Factures pro <b>${eur(rt.fac)}</b>${rt.nc ? ' · Notes de crédit <b>' + eur(rt.nc) + '</b>' : ''} · <b>Net ${eur(rt.liq + rt.vir + rt.fac + rt.nc)}</b> (TTC)</p>` : '')
    + months.sort().reverse().map((m) => `<h2 class="rsub" style="margin-top:16px">${monthLabel(m)}${m < todayStr().slice(0, 7) ? '' : ' (en cours — pas de démarche)'}</h2>` + comptaSectionsHtml(m)).join('');
  comptaWire(box, renderComptaDecl);
}
// Analyse financière PAR CHEVAL avec le DÉTAIL par date (chaque ligne facturée) pour Articles / Matériel / Déplacement.
function chevalFinanceDetail() {
  const map = {}; // clé = clientId|chevalNom
  const get = (cid, nom, cnom) => { const k = cid + '|' + nom; return map[k] || (map[k] = { clientId: cid, nom, client: cnom, art: [], mat: [], dep: [], total: 0 }); };
  allTours().forEach((t) => {
    if (!t.result || !t.result.parClient) return; const date = t.date;
    const cred = creditedKeySet(t); // chevaux payés-annulés (NC) → hors analyse cheval
    t.result.parClient.forEach((m) => {
      const isCred = (n) => cred.has(m.clientId + '|' + norm(n));
      (m.articles || []).forEach((a) => { const share = artPerCheval(a); (a.chevaux || []).forEach((n) => { if (isCred(n)) return; const per = share(n); const g = get(m.clientId, n, m.nom); g.art.push({ date, libelle: a.libelle + (a.qtesByNom && a.qtesByNom[n] > 1 ? ' ×' + a.qtesByNom[n] : '') + (a.remisePct ? ' (−' + a.remisePct + '%)' : ''), ttc: per }); g.total += per; }); });
      (m.materiel || []).forEach((x) => { if (isCred(x.nom)) return; const tags = [x.fourbure ? 'Fourbure' : '', x.npas ? 'NPAS' : '', x.infection ? 'Infection' : ''].filter(Boolean).join('+'); const g = get(m.clientId, x.nom, m.nom); g.mat.push({ date, libelle: 'Matériel' + (tags ? ' (' + tags + ')' : ''), ttc: x.ttc }); g.total += x.ttc; });
      (m.deplacement || []).forEach((l) => { const per = (l.chevaux && l.chevaux.length) ? l.partTTC / l.chevaux.length : 0; (l.chevaux || []).forEach((n) => { if (isCred(n)) return; const g = get(m.clientId, n, m.nom); g.dep.push({ date, libelle: (l.adresse || 'Déplacement') + ' ' + (TYPES[l.type] || ''), ttc: per }); g.total += per; }); });
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
// Range chaque frais lié (enfant) juste après son entretien (parent) dans S.frais. Répare les liens périmés. Renvoie true si quelque chose a changé.
function normalizeFraisOrder() {
  const frais = S.frais || [];
  // Auto-réparation : un enfant dont le parent n'existe plus (ou n'est pas récurrent) redevient indépendant (sinon il resterait « lié » et coincé en bas).
  let healed = false;
  frais.forEach((f) => { if (f.parentId) { const p = frais.find((x) => x.id === f.parentId); if (!p || p.parentId) { f.parentId = null; healed = true; } } }); // le parent doit exister et être une tête de type (pas lui-même un élément lié)
  const out = []; const placed = new Set();
  frais.forEach((f) => { if (f.parentId) return; if (placed.has(f.id)) return; out.push(f); placed.add(f.id); frais.forEach((c) => { if (c.parentId === f.id && !placed.has(c.id)) { out.push(c); placed.add(c.id); } }); });
  frais.forEach((f) => { if (!placed.has(f.id)) { out.push(f); placed.add(f.id); } });
  const reordered = out.some((f, i) => frais[i] !== f);
  if (reordered) S.frais = out;
  return healed || reordered;
}
// Texte de la jauge d'un frais. Calcul principal = prochain entretien à (km dernier entretien + intervalle) — sans l'odomètre.
// L'odomètre actuel ne sert qu'à signaler « ⚠ à renouveler » (dépassé).
function fraisJaugeText(f) {
  if (f.parentId) { const p = (S.frais || []).find((x) => x.id === f.parentId); return `🔗 élément du type « ${p ? p.poste : '?'} » — réinitialisé en refaisant ce type${f.date ? ' · dernier ' + fmtDateFr(f.date) : ''}`; }
  const kd = f.kmDebut || 0, interval = f.kmPrevus || 0, nat = f.nature === 'recurrent' ? 'récurrent' : 'exceptionnel';
  if (!interval) return `${nat} · renseignez l'intervalle (km prévus)`;
  if (!kd) return `${nat} · renseignez le km du dernier entretien / achat`;
  const target = kd + interval, echu = odometer() >= target;
  return `${nat} · dernier à ${km(kd)} → prochain prévu à ${km(target)} (+${km(interval)})${echu ? ' · ⚠ à renouveler' : ''}`;
}
function renderFraisVehicule() {
  if (normalizeFraisOrder()) saveSettings();
  const odo = odometer();
  if ($('kmIndicatif')) $('kmIndicatif').innerHTML = `Tarif indicatif tournée : <b>${eurkm(tarifHT('tournee'))} HT</b> · <b>${eurkm(ttc(tarifHT('tournee')))} TVAC</b> (base véhicule + carburant).`;
  if ($('fraisUnitHT')) { makeReadout($('fraisUnitHT'), '€/km HT'); $('fraisUnitHT').value = fmtNum(baseVehiculeHT(), 3); fitSize($('fraisUnitHT')); }
  if ($('fraisUnitTTC')) { makeReadout($('fraisUnitTTC'), '€/km TTC'); $('fraisUnitTTC').value = fmtNum(ttc(baseVehiculeHT()), 3); fitSize($('fraisUnitTTC')); }
  const box = $('fraisList'); if (!box) return; box.innerHTML = '';
  $('fraisEmpty').style.display = S.frais.length ? 'none' : 'block';
  const dl = document.createElement('datalist'); dl.id = 'fraisGrpList'; dl.innerHTML = fraisGroupes().map((g) => `<option value="${esc(g)}"></option>`).join(''); box.appendChild(dl);
  S.frais.forEach((f, i) => {
    const isChild = !!f.parentId;
    const parent = isChild ? S.frais.find((x) => x.id === f.parentId) : null;
    const children = !isChild ? S.frais.filter((x) => x.parentId === f.id) : []; // tout poste de tête (type) peut avoir des éléments liés
    const typeHeads = S.frais.filter((x) => !x.parentId && x.id !== f.id); // têtes de type auxquelles se lier
    const epuise = f.nature === 'exceptionnel' && !isChild && !fraisActif(f); // épuisé → inactif : ne contribue plus à la base véhicule
    const jauge = esc(fraisJaugeText(f));
    const el = document.createElement('div'); el.className = 'edit-row' + (epuise ? ' frais-off' : '') + (isChild ? ' frais-child' : ''); el.dataset.idx = i;
    el.innerHTML = `<div class="er-top"><span class="drag-h">⠿</span><span class="li-sub" title="Identifiant du frais">#${f.id.slice(-4)}</span>
        <input class="grow er-title" data-k="poste" value="${esc(f.poste)}" placeholder="Poste (entretien, assurance…)"/>
        <button class="a-del" data-del title="Supprimer">✕</button></div>
      <div class="er-grid">
        <label>Nature<select data-k="nature"><option value="recurrent">Récurrent</option><option value="exceptionnel">Exceptionnel</option></select></label>
        ${isChild ? '' : `<label>Date entretien<input data-k="date" type="date" value="${f.date || ''}"/></label>`}
        <label>Montant<input data-k="montantHT" type="number" step="1" min="0" value="${f.montantHT || ''}"/></label>
        <label>Km prévus (intervalle)<input data-k="kmPrevus" type="number" step="1000" min="0" value="${f.kmPrevus || ''}"/></label>
        ${isChild ? '' : `<label>Kilométrage achat<input data-k="kmDebut" type="number" step="1000" min="0" value="${f.kmDebut || ''}"/></label>`}
        ${!children.length ? `<label>Lié au type<select data-k="parentId"><option value="">— type à part entière</option>${typeHeads.map((p) => `<option value="${p.id}"${f.parentId === p.id ? ' selected' : ''}>#${p.id.slice(-4)} · ${esc(p.poste || 'Type')}${p.date ? ' · ' + esc(fmtDateFr(p.date)) : ''}</option>`).join('')}</select></label>` : ''}
        <label>Contribution<input data-ro="contrib" readonly/></label>
      </div>
      <p class="hint er-jauge">${jauge}</p>
      ${children.length ? `<p class="hint">🔗 Éléments du type (réinitialisés en refaisant ce type) : <b>${children.map((c) => esc(c.poste || 'Frais')).join(', ')}</b>.</p>` : ''}
      ${isChild ? '' : `<div class="er-renew"><button class="btn small" data-done>${children.length ? '🔄 Refaire ce type (remet à zéro)' : '✅ Fait (km + date)'}</button><button class="btn small" data-add-elem>＋ Élément</button></div>`}`;
    el.querySelector('[data-k="nature"]').value = f.nature;
    const ro = el.querySelector('[data-ro="contrib"]');
    const montEl = el.querySelector('[data-k="montantHT"]'), kmEl = el.querySelector('[data-k="kmPrevus"]'), kmDebEl = el.querySelector('[data-k="kmDebut"]');
    addUnit(montEl, '€ HT'); addUnit(kmEl, 'km'); if (kmDebEl) addUnit(kmDebEl, 'km'); makeReadout(ro, '€/km');
    // Recalcul live : jauge de la ligne + base véhicule €/km (haut de page) + tarif indicatif, à chaque champ modifié.
    const refreshJauge = () => { const p = el.querySelector('.er-jauge'); if (p) p.textContent = fraisJaugeText(f); };
    const refreshBase = () => { if ($('fraisUnitHT')) { $('fraisUnitHT').value = fmtNum(baseVehiculeHT(), 3); fitSize($('fraisUnitHT')); } if ($('fraisUnitTTC')) { $('fraisUnitTTC').value = fmtNum(ttc(baseVehiculeHT()), 3); fitSize($('fraisUnitTTC')); } if ($('kmIndicatif')) $('kmIndicatif').innerHTML = `Tarif indicatif tournée : <b>${eurkm(tarifHT('tournee'))} HT</b> · <b>${eurkm(ttc(tarifHT('tournee')))} TVAC</b> (base véhicule + carburant).`; };
    wireNum(montEl, { get: () => f.montantHT, dec: 0, set: (v) => { f.montantHT = v; ro.value = fmtNum(fraisContribHT(f), 3); fitSize(ro); refreshBase(); }, after: () => saveSettings() });
    wireNum(kmEl, { get: () => f.kmPrevus, dec: 0, set: (v) => { f.kmPrevus = v; ro.value = fmtNum(fraisContribHT(f), 3); fitSize(ro); refreshJauge(); refreshBase(); }, after: () => saveSettings() });
    const syncChildren = () => { (S.frais || []).forEach((c) => { if (c.parentId === f.id) { c.kmDebut = f.kmDebut || 0; c.date = f.date || ''; } }); }; // un entretien propage son km/date à ses frais liés
    if (kmDebEl) wireNum(kmDebEl, { get: () => f.kmDebut, dec: 0, set: (v) => { f.kmDebut = v; refreshJauge(); }, after: () => { syncChildren(); saveSettings(); if (children.length) renderFraisVehicule(); } }); // re-render pour actualiser les frais liés
    ro.value = fmtNum(fraisContribHT(f), 3); fitSize(ro);
    el.querySelector('[data-k="poste"]').addEventListener('input', (e) => { f.poste = e.target.value; saveSettings(); });
    { const de = el.querySelector('[data-k="date"]'); if (de) de.addEventListener('change', (e) => { f.date = e.target.value || ''; if (f.date) { const rel = (S.odoReleves || []).find((r) => r && r.date === f.date && typeof r.km === 'number'); if (rel) f.kmDebut = rel.km; else { const est = Math.round(estOdoAt(f.date)); if (est > 0) f.kmDebut = est; } } /* km repris d'un relevé de même date, sinon estimé (relevés + tournées) à cette date */ syncChildren(); saveSettings(); renderFraisVehicule(); }); }
    { const pe = el.querySelector('[data-k="parentId"]'); if (pe) pe.addEventListener('change', (e) => { f.parentId = e.target.value || null; if (f.parentId) { const p = S.frais.find((x) => x.id === f.parentId); if (p) { f.kmDebut = p.kmDebut || 0; f.date = p.date || ''; } } saveSettings(); renderFraisVehicule(); }); }
    { const db = el.querySelector('[data-done]'); if (db) db.addEventListener('click', () => modalFraisDone(f)); }
    { const ae = el.querySelector('[data-add-elem]'); if (ae) ae.addEventListener('click', () => { S.frais.push({ id: uid(), poste: 'Nouvel élément', nature: 'exceptionnel', montantHT: 0, kmPrevus: f.kmPrevus || 0, kmDebut: f.kmDebut || 0, date: f.date || '', parentId: f.id }); saveSettings(); renderFraisVehicule(); }); }
    el.querySelector('[data-k="nature"]').addEventListener('change', (e) => { f.nature = e.target.value; saveSettings(); renderFraisVehicule(); });
    el.querySelector('[data-del]').addEventListener('click', () => { if (!confirm('Supprimer ce frais véhicule ?')) return; S.frais = S.frais.filter((x) => x.id !== f.id); (S.frais || []).forEach((x) => { if (x.parentId === f.id) x.parentId = null; }); saveSettings(); renderFraisVehicule(); });
    box.appendChild(el);
  });
  enableRowDrag(box, S.frais, () => saveSettings());
  const reset = document.createElement('div'); reset.className = 'actions'; reset.style.marginTop = '16px';
  reset.innerHTML = '<button class="btn small danger block" id="fraisResetBtn">♻ Repartir à zéro (frais par défaut, sans toucher l\'odomètre ni les relevés)</button>';
  reset.querySelector('#fraisResetBtn').addEventListener('click', () => {
    if (!confirm('Remettre les frais véhicule à la structure par défaut (Entretien+Pièces+Réparation, Pneus+Montage, Plaquettes+Disques) ? Vos relevés compteur et l\'amortissement sont conservés. Le journal des frais réels est vidé.')) return;
    S.frais = mkFrais(); S.fraisJournal = []; saveSettings(); renderFraisVehicule(); renderStatutVehiculePage(); renderHome();
  });
  box.appendChild(reset);
}
// Page Articles = catalogue + forfaits pathologie + tableau des tarifs
function renderArticlesPage() {
  refreshTarifTable();
  updateReadouts();
  renderArticlesCat();
}
const fraisGroupes = () => [...new Set((S.frais || []).map((f) => f.groupe).filter(Boolean))];
// Assistant de migration tout-en-un : régler km/date de référence, organiser les frais en Types (lier les éléments), et amorcer le journal des frais réels — en une passe.
function modalFraisMigration() {
  const odo = odometer();
  const frais = (S.frais || []).filter((f) => f.kmPrevus > 0);
  if (!frais.length) { alert('Aucun frais avec un intervalle (km prévus) à régler.'); return; }
  const st = {};
  frais.forEach((f) => { st[f.id] = { mode: (f.kmDebut > 0 && (odo - f.kmDebut) < f.kmPrevus) ? 'fait' : 'afaire', km: f.kmDebut || Math.max(0, Math.round(odo - (f.kmPrevus || 0))), date: f.date || todayStr() }; });
  const link = {}; const findHead = (re) => frais.find((f) => re.test(f.poste || ''));
  const ent = findHead(/entretien/i), pneu = findHead(/pneu/i);
  frais.forEach((f) => { if (f.parentId) link[f.id] = f.parentId; else if (ent && f.id !== ent.id && /pi[eè]ce|r[ée]para/i.test(f.poste || '')) link[f.id] = ent.id; else if (pneu && f.id !== pneu.id && /montage|[ée]quilibr/i.test(f.poste || '')) link[f.id] = pneu.id; });
  const seed = { on: true };
  const modeSel = (id) => { const s = st[id]; return `<label>État<select data-mode="${id}"><option value="fait"${s.mode === 'fait' ? ' selected' : ''}>Fait (dernier)</option><option value="afaire"${s.mode === 'afaire' ? ' selected' : ''}>À faire (reste à renouveler)</option><option value="neuf"${s.mode === 'neuf' ? ' selected' : ''}>Neuf / repart maintenant</option></select></label>${s.mode === 'fait' ? `<div class="row"><label class="grow">Km<input type="number" data-km="${id}" step="1" min="0" inputmode="numeric" value="${s.km}"/></label><label class="grow">Date<input type="date" data-date="${id}" value="${s.date}" max="${todayStr()}"/></label></div>` : ''}`; };
  const render = () => {
    openModal(`<div class="modal-head"><b>🧭 Régler l'historique (types + km/date)</b><button class="x" id="mX">✕</button></div>
      <p class="hint">Pour chaque frais : rattachez-le à un <b>type</b> (ex. Pièces/Réparation → Entretien ; Montage → Pneus) ou laissez-le « type à part entière ». Puis réglez l'état (Fait = km + date ; à défaut de km exact, la date suffit → estimé). Un élément lié hérite du km/date de son type.</p>
      <div id="fmList" style="max-height:58vh;overflow:auto"></div>
      <label class="chk2"><input type="checkbox" id="fmSeed" ${seed.on ? 'checked' : ''}/> Amorcer le journal des frais réels avec les montants « Fait » (pour la stat provision vs réel)</label>
      <div class="actions"><button class="btn primary block" id="fmOk">Appliquer</button><button class="btn block" id="fmClose">Fermer</button></div>`);
    $('mX').onclick = closeModal; $('fmClose').onclick = closeModal;
    const box = $('fmList');
    frais.forEach((f) => {
      const linked = !!link[f.id];
      const parents = frais.filter((x) => x.id !== f.id && !link[x.id]); // un frais lié ne peut pas être un type parent
      const el = document.createElement('div'); el.className = 'card' + (linked ? ' frais-child' : ''); el.style.margin = '8px 0';
      const optLbl = (p) => `#${p.id.slice(-4)} · ${p.poste || 'Frais'}${p.date ? ' · ' + fmtDateFr(p.date) : ''}`;
      el.innerHTML = `<div class="a-art-head"><span><b>#${f.id.slice(-4)} · ${esc(f.poste || 'Frais')}</b> <span class="li-sub">(tous les ${km(f.kmPrevus)}${f.date ? ' · ' + esc(fmtDateFr(f.date)) : ''})</span></span></div>
        <label>Lié au type<select data-link="${f.id}"><option value="">— type à part entière</option>${parents.map((p) => `<option value="${p.id}"${link[f.id] === p.id ? ' selected' : ''}>${esc(optLbl(p))}</option>`).join('')}</select></label>
        ${linked ? '<p class="hint">→ hérite du km / date de son type.</p>' : modeSel(f.id)}`;
      box.appendChild(el);
    });
    $('fmSeed').addEventListener('change', (e) => { seed.on = e.target.checked; });
    box.querySelectorAll('[data-link]').forEach((sel) => sel.addEventListener('change', (e) => { const id = e.target.dataset.link; if (e.target.value) link[id] = e.target.value; else delete link[id]; render(); }));
    box.querySelectorAll('[data-mode]').forEach((sel) => sel.addEventListener('change', (e) => { st[e.target.dataset.mode].mode = e.target.value; render(); }));
    box.querySelectorAll('[data-km]').forEach((i) => i.addEventListener('input', (e) => { st[e.target.dataset.km].km = parseNum(e.target.value); }));
    box.querySelectorAll('[data-date]').forEach((i) => i.addEventListener('change', (e) => { const id = e.target.dataset.date; st[id].date = e.target.value; if (st[id].date) { const rel = (S.odoReleves || []).find((r) => r && r.date === st[id].date && typeof r.km === 'number'); if (rel) st[id].km = rel.km; else { const est = Math.round(estOdoAt(st[id].date)); if (est > 0) st[id].km = est; } } render(); }));
    $('fmOk').onclick = () => {
      const applyMode = (f) => { const s = st[f.id]; if (s.mode === 'neuf') { f.kmDebut = Math.round(odo); f.date = todayStr(); } else if (s.mode === 'afaire') { f.kmDebut = Math.max(0, Math.round(odo - (f.kmPrevus || 0))); } else { f.kmDebut = Math.max(0, Math.round(s.km || 0)); f.date = s.date || todayStr(); } };
      frais.filter((f) => !link[f.id]).forEach((f) => { f.parentId = null; applyMode(f); }); // les têtes de type d'abord
      frais.filter((f) => link[f.id]).forEach((f) => { f.parentId = link[f.id]; const p = S.frais.find((x) => x.id === f.parentId); if (p) { f.kmDebut = p.kmDebut || 0; f.date = p.date || ''; } });
      if (seed.on) { if (!Array.isArray(S.fraisJournal)) S.fraisJournal = []; frais.forEach((f) => { const headId = link[f.id] || f.id; const headFait = st[headId] && st[headId].mode === 'fait'; if (headFait && (f.montantHT || 0) > 0 && f.date) { if (!S.fraisJournal.some((j) => j.fraisId === f.id && j.date === f.date)) S.fraisJournal.push({ id: uid(), date: f.date, km: f.kmDebut || 0, fraisId: f.id, poste: f.poste || 'Frais', montant: f.montantHT || 0 }); } }); }
      saveSettings(); closeModal(); renderFraisVehicule(); renderStatutVehiculePage(); renderHome();
      alert('Types organisés, historique réglé, journal amorcé — le Statut véhicule est à jour.');
    };
  };
  render();
}
// Enregistre le km + la date du dernier entretien pour un ensemble de frais (récurrents et/ou exceptionnels).
function markFraisDone(ids, kmVal, dateVal) {
  const idset = new Set(ids);
  (S.frais || []).forEach((f) => { if (f.parentId && idset.has(f.parentId)) idset.add(f.id); }); // refaire un type réinitialise aussi ses éléments liés
  if (!Array.isArray(S.fraisJournal)) S.fraisJournal = [];
  const dt = dateVal || todayStr(), kmv = Math.max(0, Math.round(kmVal || 0));
  (S.frais || []).forEach((f) => { if (idset.has(f.id)) { f.kmDebut = kmv; f.date = dt; if ((f.montantHT || 0) > 0) S.fraisJournal.push({ id: uid(), date: dt, km: kmv, fraisId: f.id, poste: f.poste || 'Frais', montant: f.montantHT || 0 }); } }); // journal : coût réel de cet événement (facture d'achat)
  saveSettings();
}
// « Entretien fait » : km + date du dernier entretien d'un frais, en cochant les autres frais faits en même temps (groupe mémorisable).
function modalFraisDone(f) {
  const linked = (S.frais || []).filter((x) => x.parentId === f.id); // frais liés (réinitialisés automatiquement)
  const others = (S.frais || []).filter((x) => x.id !== f.id && x.parentId !== f.id);
  const pre = new Set(f.groupe ? others.filter((x) => x.groupe === f.groupe).map((x) => x.id) : []);
  openModal(`<div class="modal-head"><b>✅ Entretien fait — ${esc(f.poste || 'Frais')}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Enregistre le kilométrage et la date du dernier entretien de ce frais. Le compteur « à renouveler » repart de ce point.</p>
    <div class="row"><label class="grow">${f.nature === 'recurrent' ? 'Km au dernier entretien' : "Km d'achat / remplacement"}<input type="number" id="fdKm" step="1" min="0" inputmode="numeric" value="${Math.round(odometer())}"/></label><label class="grow">Date<input type="date" id="fdDate" value="${todayStr()}" max="${todayStr()}"/></label></div>
    ${linked.length ? `<p class="hint">🔗 Éléments du type réinitialisés automatiquement : <b>${linked.map((x) => esc(x.poste || 'Frais')).join(', ')}</b>.</p>` : ''}
    ${others.length ? `<p class="hint">Autres frais faits <b>en même temps</b> (même km / date) :</p><div id="fdOthers" style="max-height:30vh;overflow:auto"></div><label class="chk2"><input type="checkbox" id="fdRemember" ${pre.size ? 'checked' : ''}/> 🔗 Se souvenir de ce regroupement</label>` : ''}
    <div class="actions"><button class="btn primary block" id="fdOk">Enregistrer</button></div>`);
  $('mX').addEventListener('click', closeModal);
  const ob = $('fdOthers');
  if (ob) others.forEach((x) => { const row = document.createElement('label'); row.className = 'chk'; row.style.display = 'flex'; row.style.margin = '3px 0'; row.innerHTML = `<input type="checkbox" data-id="${x.id}" ${pre.has(x.id) ? 'checked' : ''}/> ${esc(x.poste || 'Frais')} <span class="li-sub">(${x.nature === 'recurrent' ? 'récurrent' : 'exceptionnel'})</span>`; ob.appendChild(row); });
  $('fdOk').addEventListener('click', () => {
    const kmVal = parseNum($('fdKm').value), dateVal = $('fdDate').value || todayStr();
    if (dateVal > todayStr()) { alert('La date ne peut pas être dans le futur.'); return; }
    const ids = [f.id]; if (ob) ob.querySelectorAll('[data-id]').forEach((c) => { if (c.checked) ids.push(c.dataset.id); });
    markFraisDone(ids, kmVal, dateVal);
    if ($('fdRemember') && $('fdRemember').checked && ids.length > 1) { const g = f.groupe || ('grp' + Date.now().toString(36)); const idset = new Set(ids); (S.frais || []).forEach((x) => { if (idset.has(x.id)) x.groupe = g; }); saveSettings(); }
    closeModal(); if (typeof renderFraisVehicule === 'function') renderFraisVehicule(); if (typeof renderStatutVehiculePage === 'function') renderStatutVehiculePage(); renderHome();
  });
}
function modalFrais(existing) {
  const w = existing ? Object.assign({}, existing) : { id: uid(), poste: '', nature: 'recurrent', montantHT: 0, kmPrevus: 0, kmDebut: odometer(), date: todayStr() };
  openModal(`<div class="modal-head"><b>${existing ? 'Éditer' : 'Nouveau'} frais véhicule</b><button class="x" id="mX">✕</button></div>
    <label>Poste<input type="text" id="fPoste" value="${esc(w.poste)}" placeholder="Entretien annuel, assurance, réparation…" /></label>
    <label>Nature<select id="fNature">
      <option value="recurrent">Récurrent (facture annuelle : entretien, assurance…)</option>
      <option value="exceptionnel">Exceptionnel (réparation ponctuelle…)</option>
    </select></label>
    <div class="row"><label class="grow">Montant HT (€)<input type="number" id="fMontant" step="1" min="0" value="${w.montantHT || ''}" /></label><label class="grow">Km prévus (intervalle)<input type="number" id="fKm" step="1000" min="0" value="${w.kmPrevus || ''}" /></label></div>
    <div class="row"><label class="grow">Km au dernier entretien<input type="number" id="fKmDebut" step="1000" min="0" value="${w.kmDebut || ''}" /></label><label class="grow">Date du dernier entretien<input type="date" id="fDate" value="${w.date || ''}" /></label></div>
    <label>Groupe (fait en même temps que…)<input type="text" id="fGroupe" list="fraisGrpModal" value="${esc(w.groupe || '')}" placeholder="Freins, Pneus…" /><datalist id="fraisGrpModal">${fraisGroupes().map((g) => `<option value="${esc(g)}"></option>`).join('')}</datalist></label>
    <p class="hint" id="fBreak"></p>
    ${existing ? '<button class="btn small danger" id="fDel">Supprimer ce frais</button>' : ''}
    <div class="actions"><button class="btn primary block" id="fOk">Enregistrer</button></div>`);
  $('fNature').value = w.nature;
  const upd = () => { const m = parseFloat($('fMontant').value) || 0, k = parseFloat($('fKm').value) || 0; $('fBreak').innerHTML = k > 0 ? `Contribution = ${eur(m)} ÷ ${km(k)} = <b>${eurkm(m / k)}/km</b>` : ''; };
  upd(); $('fMontant').addEventListener('input', upd); $('fKm').addEventListener('input', upd);
  $('mX').addEventListener('click', closeModal);
  if (existing) $('fDel').addEventListener('click', () => { if (!confirm('Supprimer ce frais véhicule ?')) return; S.frais = S.frais.filter((x) => x.id !== w.id); saveSettings(); closeModal(); renderFraisVehicule(); });
  $('fOk').addEventListener('click', () => {
    w.poste = $('fPoste').value.trim() || 'Frais'; w.nature = $('fNature').value; w.date = $('fDate').value || '';
    w.montantHT = parseFloat($('fMontant').value) || 0; w.kmPrevus = parseFloat($('fKm').value) || 0;
    w.kmDebut = parseFloat($('fKmDebut').value) || 0; w.groupe = ($('fGroupe').value || '').trim();
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
      </div>
      <div class="er-flags">
        <label class="chk2"><input type="checkbox" data-f="remiseProduit" ${a.remiseProduit !== false ? 'checked' : ''}/> Remise produit</label>
        <label class="chk2"><input type="checkbox" data-f="remiseLiquide" ${a.remiseLiquide !== false ? 'checked' : ''}/> Remise liquide</label>
        <label class="chk2"><input type="checkbox" data-f="visite" ${a.visite ? 'checked' : ''}/> Visite</label>
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
    el.querySelectorAll('[data-f]').forEach((cb) => cb.addEventListener('change', (e) => { a[cb.dataset.f] = e.target.checked; saveSettings(); }));
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
    <label>Chevaux concernés (quantité par cheval)</label><div id="aChevaux"></div>
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
  const qtes = {}; picked.forEach((id) => { qtes[id] = (w.chevalQtes && w.chevalQtes[id]) || 1; }); // quantité par cheval
  const totalQte = () => { let q = 0; picked.forEach((id) => q += Math.max(1, qtes[id] || 1)); return Math.max(1, q); };
  const upd = () => { const qte = totalQte(), p = parseNum($('aPrix').value), rr = (parseFloat($('aTva').value) || 0) / 100; $('aBreak').innerHTML = `Quantité totale ${qte} · HT ${eur(p * qte)} · TVA ${eur(p * qte * rr)} · <b>TTC ${eur(p * qte * (1 + rr))}</b>`; };
  const renderCh = () => {
    const box = $('aChevaux'); box.innerHTML = ''; const chs = idsFor(selClient);
    if (!chs.length) { box.innerHTML = '<p class="hint" style="color:var(--danger)">Ce client n\'a pas de cheval à cet arrêt — un article doit être lié à au moins un cheval.</p>'; return; }
    chs.forEach((c) => {
      const on = picked.has(c.id);
      const row = document.createElement('div'); row.className = 'chk-qrow';
      row.innerHTML = `<label class="chk" style="flex:1"><input type="checkbox" ${on ? 'checked' : ''}/> 🐴 ${esc(c.nom)}</label><input type="number" class="qty-in" min="1" step="1" value="${qtes[c.id] || 1}" title="Quantité"${on ? '' : ' style="visibility:hidden"'}/>`;
      const cb = row.querySelector('input[type=checkbox]'), qi = row.querySelector('.qty-in');
      cb.addEventListener('change', (e) => { if (e.target.checked) { picked.add(c.id); if (!qtes[c.id]) qtes[c.id] = 1; qi.style.visibility = ''; } else { picked.delete(c.id); qi.style.visibility = 'hidden'; } upd(); });
      qi.addEventListener('input', () => { qtes[c.id] = Math.max(1, parseInt(qi.value, 10) || 1); upd(); });
      box.appendChild(row);
    });
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
    const chevalQtes = {}; chs.forEach((c) => { chevalQtes[c.id] = Math.max(1, qtes[c.id] || 1); });
    const art = { id: w.id || uid(), clientId: cid, chevalIds: chs.map((c) => c.id), chevalNoms: chs.map((c) => c.nom), chevalQtes, libelle: $('aLib').value.trim() || 'Article', prixHT: parseNum($('aPrix').value), tvaPct: parseFloat($('aTva').value) || 0 };
    // Éligibilité remise (héritée du catalogue si connu, sinon de l'article existant, sinon défaut) : remiseProduit (remise manuelle), remiseLiquide (remise auto liquide).
    const cat = mode === 'catalogue' ? S.articlesCatalogue.find((x) => x.id === $('aCat').value) : S.articlesCatalogue.find((x) => norm(x.libelle) === norm(art.libelle));
    const src = cat || w || {};
    art.remiseProduit = src.remiseProduit !== false; art.remiseLiquide = src.remiseLiquide !== false; art.visite = !!src.visite;
    if (!currentTour.articles) currentTour.articles = [];
    const i = currentTour.articles.findIndex((x) => x.id === art.id); if (i >= 0) currentTour.articles[i] = art; else currentTour.articles.push(art);
    // Ajout au catalogue seulement en mode « nouvel article » (case cochée) et si le libellé n'y est pas déjà.
    if (mode === 'nouveau' && $('aSaveCat') && $('aSaveCat').checked && !S.articlesCatalogue.some((x) => norm(x.libelle) === norm(art.libelle))) { S.articlesCatalogue.push({ id: uid(), libelle: art.libelle, prixHT: art.prixHT, tvaPct: art.tvaPct, remiseProduit: true, remiseLiquide: true, visite: false }); saveSettings(); }
    saveTournees(); closeModal(); renderEditorArrets(); recomputeMoney();
  });
}

// ================= CONTACT MAIL (Gmail) — récupération + parsing du formulaire « prise de contact » =================
// Parse un mail « prise de contact » (étiquettes « Label : valeur »). Renvoie un dictionnaire { labelNormalisé: valeur }. Testé sur le modèle réel.
function parseContactMail(text) {
  const fields = {}; const lines = (text || '').split(/\r?\n/);
  const normLabel = (s) => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  let cur = null;
  lines.forEach((line) => {
    const idx = line.indexOf(':');
    if (idx > 0 && idx < 80) { const lab = normLabel(line.slice(0, idx)); if (lab && lab.length <= 60) { fields[lab] = line.slice(idx + 1).trim(); cur = lab; return; } }
    if (!line.trim()) { cur = null; return; }
    if (cur) fields[cur] = (fields[cur] ? fields[cur] + ' ' : '') + line.trim();
  });
  return fields;
}
const mailField = (f, ...labels) => { for (const l of labels) { const n = l.toLowerCase().replace(/[’‘`]/g, "'").replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(); if (f && f[n] != null && f[n] !== '') return f[n]; } return ''; };
const mailExtractEmail = (from) => { const m = /<([^>]+)>/.exec(from || ''); return (m ? m[1] : (from || '')).trim(); };
function gmailHeader(msg, name) { const h = (msg && msg.payload && msg.payload.headers) || []; const x = h.find((y) => (y.name || '').toLowerCase() === name.toLowerCase()); return x ? x.value : ''; }
function b64urlDecode(data) { try { let s = (data || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); try { return decodeURIComponent(escape(bin)); } catch { return bin; } } catch { return ''; } }
function gmailPlainBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) return b64urlDecode(payload.body.data);
  if (payload.parts) { for (const p of payload.parts) { const t = gmailPlainBody(p); if (t) return t; } }
  if (payload.mimeType === 'text/html' && payload.body && payload.body.data) return b64urlDecode(payload.body.data).replace(/<\/(p|div|br|tr|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  if (payload.body && payload.body.data) return b64urlDecode(payload.body.data);
  return '';
}
async function gmailConnect(statusEl) {
  try { if (statusEl) { statusEl.className = 'status'; statusEl.textContent = 'Connexion à Gmail…'; } await googleToken(true, GSCOPE_MAIL); if (statusEl) { statusEl.className = 'status ok'; statusEl.textContent = 'Gmail connecté ✔ — vous pouvez récupérer les mails.'; } }
  catch (e) { if (statusEl) { statusEl.className = 'status err'; statusEl.textContent = 'Connexion Gmail impossible : ' + (e && e.message || e); } }
}
async function gmailFetch(statusEl, after) {
  if (!S.googleClientId) { if (statusEl) { statusEl.className = 'status err'; statusEl.textContent = 'Renseignez d\'abord votre ID client Google (Réglages → Synchro).'; } return; }
  try {
    if (statusEl) { statusEl.className = 'status'; statusEl.textContent = 'Récupération des mails…'; }
    const token = await googleToken(true, GSCOPE_MAIL);
    // Adresse du compte connecté → masquer les mails que VOUS avez envoyés (y compris ceux importés avant le filtre -from:me).
    try { const pr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: 'Bearer ' + token } }); if (pr.ok) { const pj = await pr.json(); if (pj.emailAddress) { S.mailSelf = pj.emailAddress; saveSettings(); } } } catch { /* profil indisponible : le filtre -from:me joue quand même */ }
    const kws = (S.mailKeywords || []).filter(Boolean).map((k) => '"' + k.replace(/"/g, '') + '"');
    if (S.mailScanForm !== false) kws.push('"Nom du cheval"', '"Adresse de l\'écurie"'); // détecte aussi les FORMULAIRES sans le mot-clé (étiquettes distinctives)
    const orPart = kws.length ? '(' + kws.join(' OR ') + ')' : '"prise de contact"';
    const q = orPart + (S.mailExcludeSelf !== false ? ' -from:me' : ''); // n'inclut PAS les mails que VOUS avez envoyés, seulement les réponses reçues
    // Pagination : Gmail ne renvoie que 100 résultats par page → on parcourt toutes les pages (sinon seuls les plus récents remontent, rien d'ancien).
    const ids = []; let pageToken = '', pages = 0;
    do {
      const lr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=' + encodeURIComponent(q) + (pageToken ? '&pageToken=' + pageToken : ''), { headers: { Authorization: 'Bearer ' + token } });
      if (!lr.ok) throw new Error('API Gmail (' + lr.status + ')');
      const list = await lr.json();
      (list.messages || []).forEach((mm) => ids.push(mm.id));
      pageToken = list.nextPageToken || ''; pages++;
      if (statusEl) statusEl.textContent = 'Recherche des mails… (' + ids.length + ' trouvés)';
    } while (pageToken && pages < 100); // garde-fou : 100 pages = 10 000 mails max (couvre plusieurs années)
    const seen = new Set((S.contactMails || []).map((x) => x.id)); // déjà récupérés OU ignorés → jamais ré-importés (pas de doublon)
    const toFetch = ids.filter((id) => !seen.has(id));
    let added = 0;
    for (const id of toFetch) {
      const mr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=full', { headers: { Authorization: 'Bearer ' + token } });
      if (!mr.ok) continue;
      const msg = await mr.json();
      const fromRaw = gmailHeader(msg, 'From'); const body = gmailPlainBody(msg.payload);
      S.contactMails.push({ id, from: mailExtractEmail(fromRaw), fromRaw, subject: gmailHeader(msg, 'Subject'), date: gmailHeader(msg, 'Date'), fields: parseContactMail(body), body: (body || '').slice(0, 8000), status: 'nouveau', clientId: null, chevalNom: '' });
      added++;
      if (statusEl && added % 10 === 0) statusEl.textContent = 'Import… (' + added + '/' + toFetch.length + ')';
    }
    saveSettings();
    if (statusEl) { statusEl.className = 'status ok'; statusEl.textContent = added ? (added + ' nouveau(x) mail(s) récupéré(s) sur ' + ids.length + ' trouvé(s).') : (ids.length + ' mail(s) trouvé(s), tous déjà traités.'); }
    if (after) after();
  } catch (e) { if (statusEl) { statusEl.className = 'status err'; statusEl.textContent = 'Récupération impossible : ' + (e && e.message || e); } }
}
// Réglages → Mail : mots-clés + connexion + récupération.
function renderMailConfig() {
  const kb = $('mailKeywords'); if (kb) plancheList(kb, S.mailKeywords, renderMailConfig, '+ Ajouter un mot-clé');
  const es = $('mailExcludeSelf'); if (es) { es.checked = S.mailExcludeSelf !== false; es.onchange = (e) => { S.mailExcludeSelf = e.target.checked; saveSettings(); }; }
  const sf = $('mailScanForm'); if (sf) { sf.checked = S.mailScanForm !== false; sf.onchange = (e) => { S.mailScanForm = e.target.checked; saveSettings(); }; }
  const c = $('mailConnect'); if (c) c.onclick = () => gmailConnect($('mailStatus'));
  const f = $('mailFetch'); if (f) f.onclick = () => gmailFetch($('mailStatus'));
}
// Visualisation d'un mail « prise de contact » (corps + champs détectés) pour décider du statut.
function modalMailView(m) {
  const f = m.fields || {};
  openModal(`<div class="modal-head"><b>✉️ ${esc(m.from || 'Mail')}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">${esc(m.subject || '')}${m.date ? ' · ' + esc(String(m.date).slice(0, 24)) : ''}</p>
    <h3 class="rsub">Champs détectés</h3><div class="anam-list">${anamneseRowsHtml(f)}</div>
    <h3 class="rsub">Corps du mail</h3><pre style="white-space:pre-wrap;font-size:.8rem;max-height:40vh;overflow:auto;background:var(--bg);padding:8px;border-radius:8px">${esc(m.body || '(corps non disponible)')}</pre>
    <div class="actions"><button class="btn block" id="mvClose">Fermer</button></div>`);
  $('mX').addEventListener('click', closeModal); $('mvClose').addEventListener('click', closeModal);
}
// Gestion → Contact mail : liste des mails récupérés (nouveaux) + section « Ignorés ».
// Mail envoyé PAR l'utilisateur (à masquer) : from = adresse du compte connecté.
function mailIsSelf(m) { return !!(S.mailExcludeSelf !== false && S.mailSelf && m && m.from && norm(m.from) === norm(S.mailSelf)); }
// Formulaire VIERGE (le modèle que VOUS envoyez au client) : les étiquettes du formulaire sont présentes mais SANS valeur remplie.
// Catch fiable même si le mail a été envoyé depuis une autre adresse/alias (contrairement à mailIsSelf).
function mailIsBlankForm(m) {
  if (S.mailExcludeSelf === false) return false;
  const f = (m && m.fields) || {};
  const hasLabel = ('nom du cheval' in f) || ("adresse de l'écurie" in f) || ('race' in f && 'age' in f);
  if (!hasLabel) return false;
  return !(mailField(f, 'Nom du cheval') || mailField(f, 'Nom') || mailField(f, 'Prénom') || mailField(f, 'Numéro de téléphone'));
}
// Clients existants correspondant à un mail (par e-mail expéditeur, ou nom + prénom). Sert au bouton « connu/nouveau » et à la mise à jour.
function findClientForMail(m) {
  const f = (m && m.fields) || {};
  const email = (m && m.from) || '', nomM = norm(mailField(f, 'Nom')), prenomM = norm(mailField(f, 'Prénom'));
  return clients.filter((c) => (email && c.email && norm(c.email) === norm(email)) || (nomM && norm(c.nom) === nomM && (!prenomM || !c.prenom || norm(c.prenom) === prenomM)));
}
function renderContactMail() {
  const c = $('cmConnect'); if (c) c.onclick = () => gmailConnect($('cmStatus'));
  const f = $('cmFetch'); if (f) f.onclick = () => gmailFetch($('cmStatus'), renderContactMail);
  const box = $('cmList'); if (!box) return;
  const hidden = (m) => mailIsSelf(m) || mailIsBlankForm(m);
  const nouveaux = (S.contactMails || []).filter((m) => m.status === 'nouveau' && !hidden(m));
  const ignores = (S.contactMails || []).filter((m) => m.status === 'ignore' && !hidden(m));
  const traites = (S.contactMails || []).filter((m) => m.status === 'client').length;
  if ($('cmTraites')) $('cmTraites').textContent = traites ? (traites + ' mail(s) déjà transformé(s) en client.') : '';
  box.innerHTML = ''; if ($('cmEmpty')) $('cmEmpty').style.display = nouveaux.length ? 'none' : 'block';
  nouveaux.forEach((m) => box.appendChild(contactMailRow(m, false)));
  const ib = $('cmIgnored'); if (ib) { ib.innerHTML = ''; ignores.forEach((m) => ib.appendChild(contactMailRow(m, true))); if ($('cmIgnoredEmpty')) $('cmIgnoredEmpty').style.display = ignores.length ? 'none' : 'block'; }
}
function contactMailRow(m, ignored) {
  const f = m.fields || {};
  const nom = (mailField(f, 'Prénom') + ' ' + mailField(f, 'Nom')).trim() || m.from || '(inconnu)';
  const cheval = mailField(f, 'Nom du cheval'), soc = mailField(f, "Nom de l'entreprise");
  const known = findClientForMail(m); const isKnown = known.length > 0; // client déjà en fiche → on met « Mettre à jour » en avant
  const el = document.createElement('div'); el.className = 'list-item';
  el.className = 'list-item stack-act';
  const badge = isKnown ? ' <span class="rem-tag">client connu : ' + esc(fullName(known[0])) + '</span>' : ' <span class="rem-tag">nouveau</span>';
  el.innerHTML = `<div class="li-main"><b>${esc(nom)}${cheval ? ' · 🐴 ' + esc(cheval) : ''}</b>${badge}<span class="li-sub">${esc(m.from || '')}${soc ? ' · ' + esc(soc) : ''}${m.date ? ' · ' + esc(String(m.date).slice(0, 16)) : ''}</span></div>`
    + (ignored ? '<div class="li-act li-act-col"><button class="btn small" data-view>👁 Voir</button><button class="btn small" data-restore>↩ Réactiver</button></div>'
      : `<div class="li-act li-act-col"><button class="btn small" data-view>👁 Voir</button><button class="btn small${isKnown ? '' : ' primary'}" data-create>👤 Créer le client</button><button class="btn small" data-create-inact>💤 Créer (inactif)</button><button class="btn small" data-create-noir>⛔ Créer (liste noire)</button><button class="btn small${isKnown ? ' primary' : ''}" data-update>🔄 Mettre à jour${isKnown ? ' ' + esc(fullName(known[0])) : ' un client'}</button><button class="btn small" data-ignore>Ignorer</button></div>`);
  el.querySelector('[data-view]').addEventListener('click', () => modalMailView(m));
  if (ignored) el.querySelector('[data-restore]').addEventListener('click', () => { m.status = 'nouveau'; saveSettings(); renderContactMail(); });
  else {
    el.querySelector('[data-create]').addEventListener('click', () => createClientFromMail(m, 'normal'));
    el.querySelector('[data-create-inact]').addEventListener('click', () => createClientFromMail(m, 'inactif'));
    el.querySelector('[data-create-noir]').addEventListener('click', () => createClientFromMail(m, 'noir'));
    el.querySelector('[data-update]').addEventListener('click', () => updateClientFromMail(m));
    el.querySelector('[data-ignore]').addEventListener('click', () => { m.status = 'ignore'; saveSettings(); renderContactMail(); });
  }
  return el;
}
// Normalise une date saisie librement (« 2015-04-01 », « 01/04/2015 », « 2015 ») en 'YYYY-MM-DD' si possible.
function parseDateLoose(s) {
  s = (s || '').trim(); if (!s) return '';
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[0];
  m = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/.exec(s); if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return '';
}
// « Créer le client » depuis un mail : ouvre la fiche client pré-remplie + 1 cheval (anamnèse = formulaire complet).
// status : 'normal' (défaut) · 'inactif' (client + chevaux inactifs) · 'noir' (client en liste noire, chevaux inactifs). Les infos sont toujours importées.
function createClientFromMail(m, status) {
  const f = m.fields || {};
  const prefill = {
    prenom: mailField(f, 'Prénom'), nom: mailField(f, 'Nom'),
    societe: mailField(f, "Nom de l'entreprise"), tvaNum: mailField(f, 'Numéro de TVA', 'N° de TVA'),
    email: m.from || '', tel: mailField(f, 'Numéro de téléphone'),
    rue: mailField(f, 'Votre adresse (domicile) N° et rue', 'Adresse de facturation'), cpVille: mailField(f, 'Code postal et localité'),
    cheval: { nom: mailField(f, 'Nom du cheval'), dateNaissance: parseDateLoose(mailField(f, 'Date de naissance')), race: mailField(f, 'Race'), anamnese: f },
    status: status || 'normal',
  };
  editClient(null, (saved) => { m.status = 'client'; m.clientId = saved && saved.id; m.chevalNom = prefill.cheval.nom; saveSettings(); if (currentGsub === 'contactmail') renderContactMail(); }, null, prefill);
}
// « Mettre à jour un client » depuis un mail : trouve le client existant puis propose des modifications à valider (sans écraser).
function updateClientFromMail(m) {
  const cand = findClientForMail(m);
  if (cand.length === 1) return modalUpdateClientFields(m, cand[0]);
  const list = (cand.length ? cand : clients).slice().sort((a, b) => fullName(a).localeCompare(fullName(b)));
  modalActions(cand.length ? 'Quel client mettre à jour ?' : 'Aucune correspondance — choisir le client', list.map((c) => ({ label: fullName(c) + (c.societe ? ' — ' + c.societe : ''), onClick: () => modalUpdateClientFields(m, c) })));
}
function modalUpdateClientFields(m, c) {
  const f = m.fields || {}; const all = [];
  const add = (label, cur, val, apply) => { if (val && norm(val) !== norm(cur || '')) all.push({ label, cur: cur || '', val, apply, on: !(cur && String(cur).trim()) }); };
  add('Prénom', c.prenom, mailField(f, 'Prénom'), (v) => c.prenom = v);
  add('Nom', c.nom, mailField(f, 'Nom'), (v) => c.nom = v);
  add('Email', c.email, m.from, (v) => c.email = v);
  add('Téléphone', c.tel, mailField(f, 'Numéro de téléphone'), (v) => c.tel = v);
  add('Société', c.societe, mailField(f, "Nom de l'entreprise"), (v) => { c.societe = v; c.assujettiTva = true; });
  add('N° TVA', c.tvaNum, mailField(f, 'Numéro de TVA', 'N° de TVA'), (v) => c.tvaNum = v);
  add('Adresse (rue)', c.addr && c.addr.rue, mailField(f, 'Votre adresse (domicile) N° et rue', 'Adresse de facturation'), (v) => { c.addr = toAddr(c.addr); c.addr.rue = v; c.addr.lat = null; c.addr.lon = null; });
  const cpVille = mailField(f, 'Code postal et localité'); const cpm = (cpVille || '').match(/\d{4,5}/); const loc = (cpVille || '').replace(/\d{4,5}/, '').replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cpm) add('Code postal', c.addr && c.addr.cp, cpm[0], (v) => { c.addr = toAddr(c.addr); c.addr.cp = v; c.addr.lat = null; c.addr.lon = null; });
  if (loc) add('Localité', c.addr && c.addr.localite, loc, (v) => { c.addr = toAddr(c.addr); c.addr.localite = v; c.addr.lat = null; c.addr.lon = null; });
  const chNom = mailField(f, 'Nom du cheval');
  const chObj = chNom ? (c.chevaux || []).find((h) => norm(h.nom) === norm(chNom)) : null;
  if (chNom && !chObj) all.push({ label: 'Ajouter le cheval « ' + chNom + ' »', cur: '', val: chNom, on: true, apply: () => { (c.chevaux = c.chevaux || []).push({ id: uid(), nom: chNom, dateNaissance: parseDateLoose(mailField(f, 'Date de naissance')), race: mailField(f, 'Race'), anamnese: f, addrSource: 'client', addr: emptyAddr() }); } });
  else if (chObj) {
    add('🐴 ' + chNom + ' — Naissance', chObj.dateNaissance, parseDateLoose(mailField(f, 'Date de naissance')), (v) => chObj.dateNaissance = v);
    add('🐴 ' + chNom + ' — Race', chObj.race, mailField(f, 'Race'), (v) => chObj.race = v);
    all.push({ label: '🐴 ' + chNom + ' — ranger le formulaire (anamnèse)', cur: '', val: 'formulaire', on: !chObj.anamnese, apply: () => chObj.anamnese = f });
  }
  if (!all.length) { alert('Rien de nouveau à mettre à jour pour ' + fullName(c) + '.'); return; }
  openModal(`<div class="modal-head"><b>🔄 Mettre à jour — ${esc(fullName(c))}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Cochez ce que vous voulez appliquer. Les champs déjà remplis ne sont <b>pas</b> cochés par défaut (aucun écrasement involontaire).</p>
    <div id="upList"></div>
    <div class="actions"><button class="btn primary block" id="upOk">Appliquer les modifications cochées</button></div>`);
  const box = $('upList');
  all.forEach((p, i) => { const row = document.createElement('label'); row.className = 'chk2'; row.style.display = 'block'; row.innerHTML = `<input type="checkbox" data-i="${i}" ${p.on ? 'checked' : ''}/> <b>${esc(p.label)}</b> <span class="li-sub">${p.cur ? esc(p.cur) + ' → ' : ''}${esc(p.val || '')}</span>`; box.appendChild(row); });
  $('mX').addEventListener('click', closeModal);
  $('upOk').addEventListener('click', () => {
    box.querySelectorAll('[data-i]').forEach((cb) => { if (cb.checked) { const p = all[+cb.dataset.i]; p.apply(p.val); } });
    saveClients(); reconcileActiveTours(); m.status = 'client'; m.clientId = c.id; m.chevalNom = chNom; saveSettings();
    closeModal(); renderContactMail();
  });
}
// ================= PLANCHES CONTACT / AVANT-APRÈS — paramétrage =================
let plancheType = 'contact', plancheModele = '3';
const moveInArr = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; };
// Éditeur d'une liste de libellés : renommer · réordonner (▲▼) · supprimer · ajouter.
function plancheList(box, arr, onChange, addLabel, allowEmpty) {
  box.innerHTML = '';
  arr.forEach((val, i) => {
    const row = document.createElement('div'); row.className = 'edit-row';
    row.innerHTML = `<div class="er-top"><input class="grow er-title" value="${esc(val)}" placeholder="Libellé"/><button class="btn small" data-up${i === 0 ? ' disabled' : ''}>▲</button><button class="btn small" data-down${i === arr.length - 1 ? ' disabled' : ''}>▼</button><button class="a-del" data-del title="Supprimer">✕</button></div>`;
    row.querySelector('.er-title').addEventListener('input', (e) => { arr[i] = e.target.value; saveSettings(); });
    row.querySelector('[data-up]').addEventListener('click', () => { moveInArr(arr, i, -1); onChange(); });
    row.querySelector('[data-down]').addEventListener('click', () => { moveInArr(arr, i, 1); onChange(); });
    row.querySelector('[data-del]').addEventListener('click', () => { if (!allowEmpty && arr.length <= 1) { alert('Au moins un élément est requis.'); return; } arr.splice(i, 1); onChange(); });
    box.appendChild(row);
  });
  const add = document.createElement('button'); add.className = 'btn small'; add.style.marginTop = '6px'; add.textContent = addLabel || '+ Ajouter';
  add.addEventListener('click', () => { arr.push('Nouveau'); onChange(); });
  box.appendChild(add);
}
function renderPlancheConfig() {
  const seg = $('plType'); if (seg) seg.querySelectorAll('.seg-btn').forEach((b) => { if (!b._plw) { b._plw = true; b.addEventListener('click', () => { plancheType = b.dataset.plt; renderPlancheConfig(); }); } b.classList.toggle('on', b.dataset.plt === plancheType); });
  const btn = $('plCreateBtn'); if (btn) btn.onclick = () => modalPlancheCreate(plancheType);
  const cbtn = $('plCompareBtn'); if (cbtn) cbtn.onclick = () => modalPlancheCompare();
  const body = $('plancheBody'); if (!body) return; body.innerHTML = '';
  const P = plancheType === 'contact' ? S.planche.contact : S.planche.avantapres;
  // Orientation + logo
  const head = document.createElement('section'); head.className = 'card';
  head.innerHTML = `<label>Orientation<select id="plOri"><option value="paysage">Paysage</option><option value="portrait">Portrait</option></select></label>
    <label class="chk2"><input type="checkbox" id="plLogo" ${P.logo ? 'checked' : ''}/> Afficher le logo / l'identité du pro en en-tête</label>`;
  body.appendChild(head);
  $('plOri').value = P.orientation || 'paysage';
  $('plOri').addEventListener('change', (e) => { P.orientation = e.target.value; saveSettings(); });
  $('plLogo').addEventListener('change', (e) => { P.logo = e.target.checked; saveSettings(); });
  // Colonnes = angles de vue, par modèle 3/4/5
  const sc = document.createElement('section'); sc.className = 'card';
  sc.innerHTML = `<h3 class="rsub">Colonnes — angles de vue (par modèle)</h3>
    <div class="seg" id="plMod"><button type="button" class="seg-btn" data-plm="3">3 colonnes</button><button type="button" class="seg-btn" data-plm="4">4 colonnes</button><button type="button" class="seg-btn" data-plm="5">5 colonnes</button></div>
    <div id="plAngles" style="margin-top:8px"></div>`;
  body.appendChild(sc);
  sc.querySelectorAll('#plMod .seg-btn').forEach((b) => { b.classList.toggle('on', b.dataset.plm === plancheModele); b.addEventListener('click', () => { plancheModele = b.dataset.plm; renderPlancheConfig(); }); });
  if (!P.modeles[plancheModele]) P.modeles[plancheModele] = [];
  plancheList($('plAngles'), P.modeles[plancheModele], renderPlancheConfig, '+ Ajouter un angle');
  // Pages & lignes (membres) + bouton « ajouter une page »
  const sp = document.createElement('section'); sp.className = 'card';
  sp.innerHTML = `<div class="card-head"><h3 class="rsub" style="margin:0">Pages & lignes</h3><button class="btn small" id="plAddPage">＋ Ajouter une page</button></div>`
    + (plancheType === 'avantapres'
      ? '<p class="hint">Avant/après : sur la 1ʳᵉ page, les <b>lignes sont les dates</b> (comparaison) ajoutées à la création. Les pages suivantes (ex. « Cheval ») ont leurs propres lignes.</p>'
      : '<p class="hint">Chaque page a ses lignes (membres). Par défaut : page 1 = les 4 pieds, page 2 = le cheval. Réordonnez, renommez, ajoutez.</p>');
  const pagesBox = document.createElement('div'); sp.appendChild(pagesBox); body.appendChild(sp);
  P.pages.forEach((pg, pi) => {
    if (!Array.isArray(pg.membres)) pg.membres = [];
    const pd = document.createElement('div'); pd.className = 'card'; pd.style.margin = '8px 0';
    pd.innerHTML = `<div class="card-head"><b>Page ${pi + 1}</b>${P.pages.length > 1 ? '<button class="btn small danger" data-delpage>Supprimer la page</button>' : ''}</div><div class="pgMembres"></div>`;
    pagesBox.appendChild(pd);
    plancheList(pd.querySelector('.pgMembres'), pg.membres, renderPlancheConfig, '+ Ajouter une ligne', true);
    const dp = pd.querySelector('[data-delpage]'); if (dp) dp.addEventListener('click', () => { P.pages.splice(pi, 1); saveSettings(); renderPlancheConfig(); });
  });
  $('plAddPage').addEventListener('click', () => { P.pages.push({ membres: [] }); saveSettings(); renderPlancheConfig(); });
}

// ================= Création de planche (contact + avant/après) =================
// IMPORTANT : les images sélectionnées restent EN MÉMOIRE uniquement, le temps de la création.
// Elles ne sont JAMAIS écrites dans localStorage/S ni synchronisées (décision produit verrouillée).
let plCreate = null; // état de la planche en cours de création : { type, modele, angles, pages, cheval, client, date, note, photos:[{id,url,date,jour}], cells:{'page_row_col':photoId}, sel }

// Réduit une image (canvas) pour l'intégration au PDF, sans jamais la persister. Renvoie un data-URL (JPEG par défaut, PNG si mime='image/png' — texte plus net).
function plResizeImage(file, maxDim, cb, mime) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
    let data = '';
    try { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); data = mime === 'image/png' ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.82); } catch (e) { data = ''; }
    URL.revokeObjectURL(url); cb(data);
  };
  img.onerror = () => { URL.revokeObjectURL(url); cb(''); };
  img.src = url;
}

// Mini-parseur EXIF : extrait la date de prise de vue (DateTimeOriginal 0x9003, repli DateTime 0x0132) d'un JPEG → 'YYYY-MM-DD' (ou '' si absente).
function plExifDate(file, cb) {
  const r = new FileReader();
  r.onload = () => {
    let out = '';
    try {
      const dv = new DataView(r.result);
      if (dv.getUint16(0) === 0xFFD8) { // JPEG
        let off = 2, tiff = -1;
        while (off < dv.byteLength - 4) {
          const marker = dv.getUint16(off);
          if (marker === 0xFFE1) { if (dv.getUint32(off + 4) === 0x45786966) tiff = off + 10; break; } // APP1 « Exif »
          if ((marker & 0xFF00) !== 0xFF00) break;
          off += 2 + dv.getUint16(off + 2);
        }
        if (tiff > 0) {
          const little = dv.getUint16(tiff) === 0x4949;
          const g16 = (o) => dv.getUint16(o, little), g32 = (o) => dv.getUint32(o, little);
          const strAt = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const ch = dv.getUint8(o + i); if (!ch) break; s += String.fromCharCode(ch); } return s; };
          const findInIfd = (ifd, tag) => { const n = g16(ifd); for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (g16(e) === tag) { const cnt = g32(e + 4); return { e, vOff: cnt > 4 ? tiff + g32(e + 8) : e + 8 }; } } return null; };
          const ifd0 = tiff + g32(tiff + 4);
          let dateStr = '';
          const exifPtr = findInIfd(ifd0, 0x8769);
          if (exifPtr) { const exifIfd = tiff + g32(exifPtr.vOff); const dto = findInIfd(exifIfd, 0x9003) || findInIfd(exifIfd, 0x9004); if (dto) dateStr = strAt(dto.vOff, 19); }
          if (!dateStr) { const dt = findInIfd(ifd0, 0x0132); if (dt) dateStr = strAt(dt.vOff, 19); }
          const m = dateStr.match(/^(\d{4}):(\d{2}):(\d{2})/);
          if (m && m[1] !== '0000') out = m[1] + '-' + m[2] + '-' + m[3];
        }
      }
    } catch (e) { /* fichier non lisible / EXIF absent → pas de date */ }
    cb(out);
  };
  r.readAsArrayBuffer(file.slice(0, 262144)); // 256 Ko suffisent largement pour l'en-tête EXIF
}

// ---- Logo / identité du pro pour les documents (planches). Seul le logo est persisté (S.proLogo). ----
const PRO_LOGO_FRAME_W = 260, PRO_LOGO_FRAME_H = 110; // cadre de référence ; le pan est stocké en FRACTION du cadre → cadrage valable à toute taille (éditeur / en-tête PDF).

// Charge un fichier image comme logo : redimensionné (PNG pour garder la transparence) puis stocké dans S.proLogo.data.
function proLogoLoadFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type || '')) { alert('Choisissez un fichier image.'); return; }
  plResizeImage(file, 520, (data) => { if (!data) { alert('Image illisible.'); return; } S.proLogo = { data, zoom: 1, x: 0, y: 0 }; saveSettings(); renderProLogoEditor(); }, 'image/png');
}

// HTML d'un cadre contenant le logo, cadrage (zoom + pan) appliqué. '' si pas de logo. Utilisé dans l'en-tête PDF.
function proLogoBox(boxW, boxH, extraStyle) {
  const L = S.proLogo || {};
  if (!L.data) return '';
  const tx = (L.x || 0) * boxW, ty = (L.y || 0) * boxH, z = L.zoom || 1;
  return `<div style="width:${boxW}px;height:${boxH}px;overflow:hidden;display:inline-block;vertical-align:middle;${extraStyle || ''}"><img src="${L.data}" alt="" style="width:100%;height:100%;object-fit:contain;transform:translate(${tx}px,${ty}px) scale(${z});transform-origin:center center;display:block"/></div>`;
}

function renderProLogoEditor() {
  const box = $('proLogoEditor'); if (!box) return;
  const L = S.proLogo || { data: '', zoom: 1, x: 0, y: 0 };
  box.innerHTML = `
    <div class="pro-logo-frame" id="proLogoFrame" style="width:${PRO_LOGO_FRAME_W}px;height:${PRO_LOGO_FRAME_H}px;max-width:100%">${L.data ? `<img id="proLogoImg" src="${L.data}" alt="" draggable="false"/>` : '<span class="pro-logo-empty">Aucun logo</span>'}</div>
    <input type="file" id="proLogoFile" accept="image/*" hidden/>
    ${L.data ? `<label class="pro-logo-zoom">Zoom<input type="range" id="proLogoZoom" min="0.3" max="4" step="0.05" value="${L.zoom || 1}"/></label>
    <div class="pro-logo-btns"><button class="btn small" id="proLogoZoomOut">➖ Dézoomer</button><button class="btn small" id="proLogoZoomIn">➕ Zoomer</button><button class="btn small" id="proLogoCenter">Recentrer</button><button class="btn small danger" id="proLogoRemove">Retirer</button></div>
    <p class="hint">Glissez le logo dans le cadre pour le déplacer. Le cadrage (zoom + position) est repris tel quel sur le PDF.</p>` : ''}
    <button class="btn ${L.data ? '' : 'primary '}block" id="proLogoChoose" style="margin-top:8px">${L.data ? 'Changer de logo' : '📷 Choisir un logo'}</button>`;
  const applyImg = () => { const im = $('proLogoImg'); if (im) { const tx = (S.proLogo.x || 0) * PRO_LOGO_FRAME_W, ty = (S.proLogo.y || 0) * PRO_LOGO_FRAME_H; im.style.transform = `translate(${tx}px,${ty}px) scale(${S.proLogo.zoom || 1})`; } };
  applyImg();
  $('proLogoChoose').onclick = () => $('proLogoFile').click();
  $('proLogoFile').addEventListener('change', (e) => { proLogoLoadFile(e.target.files && e.target.files[0]); e.target.value = ''; });
  if (L.data) {
    $('proLogoZoom').addEventListener('input', (e) => { S.proLogo.zoom = parseFloat(e.target.value) || 1; applyImg(); saveSettings(); });
    $('proLogoZoomIn').onclick = () => { S.proLogo.zoom = Math.min(4, (S.proLogo.zoom || 1) + 0.15); $('proLogoZoom').value = S.proLogo.zoom; applyImg(); saveSettings(); };
    $('proLogoZoomOut').onclick = () => { S.proLogo.zoom = Math.max(0.3, (S.proLogo.zoom || 1) - 0.15); $('proLogoZoom').value = S.proLogo.zoom; applyImg(); saveSettings(); };
    $('proLogoCenter').onclick = () => { S.proLogo.x = 0; S.proLogo.y = 0; S.proLogo.zoom = 1; $('proLogoZoom').value = 1; applyImg(); saveSettings(); };
    $('proLogoRemove').onclick = () => { if (!confirm('Retirer le logo ?')) return; S.proLogo = { data: '', zoom: 1, x: 0, y: 0 }; saveSettings(); renderProLogoEditor(); };
    const frame = $('proLogoFrame'); let drag = null;
    frame.addEventListener('pointerdown', (e) => { if (!S.proLogo.data) return; drag = { sx: e.clientX, sy: e.clientY, ox: S.proLogo.x || 0, oy: S.proLogo.y || 0 }; try { frame.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault(); });
    frame.addEventListener('pointermove', (e) => { if (!drag) return; S.proLogo.x = Math.max(-2, Math.min(2, drag.ox + (e.clientX - drag.sx) / PRO_LOGO_FRAME_W)); S.proLogo.y = Math.max(-2, Math.min(2, drag.oy + (e.clientY - drag.sy) / PRO_LOGO_FRAME_H)); applyImg(); });
    frame.addEventListener('pointerup', () => { if (drag) { drag = null; saveSettings(); } });
    frame.addEventListener('pointercancel', () => { if (drag) { drag = null; saveSettings(); } });
  }
}

// Date courte JJ/MM/AAAA (libellés de lignes avant/après).
const plShortDate = (d) => { if (!d) return 'Date ?'; const p = String(d).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d; };
// Lignes d'une page (générique contact / avant-après). Avant/après : page 0 = dates de comparaison, autres pages = membres ; chaque ligne éclatée en « Avant » / « Après ».
function plPageRows(pi) {
  const st = plCreate;
  if (st.type === 'avantapres') {
    const base = (pi === 0) ? (st.compar || []).map((c) => plShortDate(c.date)) : ((st.pages[pi] && st.pages[pi].membres) || []);
    const rows = [];
    base.forEach((label, ri) => ['Avant', 'Après'].forEach((ph, pj) => rows.push({ label: label + ' · ' + ph, ri, pj })));
    return rows;
  }
  const membres = (st.pages[pi] && st.pages[pi].membres) || [];
  return membres.map((label, ri) => ({ label, ri, pj: null }));
}
const plCellKey = (pi, r, ci) => plCreate.type === 'avantapres' ? (pi + '_' + r.ri + '_' + r.pj + '_' + ci) : (pi + '_' + r.ri + '_' + ci);

// Déclarer → Planche : choisir une tournée effectuée (toutes) pour préremplir. On sélectionne des clients/chevaux, puis on enchaîne UNE planche (UN PDF) par cheval.
function modalPlancheFromTour() {
  const tours = allTours().slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!tours.length) { alert('Aucune tournée enregistrée.'); return; }
  openModal(`<div class="modal-head"><b>📅 Planche depuis une tournée</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Choisissez une tournée. Vous cocherez ensuite les clients et chevaux ; l'app enchaîne une planche (un PDF) par cheval.</p>
    <div id="ptList" style="max-height:66vh;overflow:auto"></div>
    <div class="actions"><button class="btn block" id="ptClose">Fermer</button></div>`);
  $('mX').onclick = closeModal; $('ptClose').onclick = closeModal;
  const box = $('ptList');
  tours.forEach((t) => {
    const noms = (t.arrets || []).flatMap((a) => (a.clients || []).map((cl) => clientName(cl.clientId)));
    const el = document.createElement('div'); el.className = 'list-item clickable';
    el.innerHTML = `<div class="li-main"><b>${esc(fmtDateFr(t.date))}${t.nom && t.nom.trim() ? ' · ' + esc(t.nom.trim()) : ''}</b><span class="li-sub">${esc([...new Set(noms)].join(' · ') || 'aucun client')}</span></div><div class="li-act"><span class="li-chev">›</span></div>`;
    el.addEventListener('click', () => modalPlancheTourSelect(t));
    box.appendChild(el);
  });
}
function modalPlancheTourSelect(t) {
  const rows = [];
  (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => { if (chevalCancelled(cv)) return; rows.push({ clientNom: clientName(cl.clientId), cheval: cv.nom }); })));
  if (!rows.length) { alert('Aucun cheval sur cette tournée.'); return; }
  const sel = new Set(rows.map((_, i) => i));
  openModal(`<div class="modal-head"><b>📅 ${esc(fmtDateFr(t.date))} — chevaux</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Cochez les chevaux à traiter (plusieurs clients / chevaux possibles). Une planche — et un PDF — sera créée pour chaque cheval, l'un après l'autre.</p>
    <div id="ptcList" style="max-height:58vh;overflow:auto"></div>
    <div class="actions"><button class="btn primary block" id="ptcOk">Créer les planches (<span id="ptcN">${sel.size}</span>)</button><button class="btn block" id="ptcClose">Fermer</button></div>`);
  $('mX').onclick = closeModal; $('ptcClose').onclick = closeModal;
  const box = $('ptcList'); let cur = null;
  rows.forEach((r, i) => {
    if (r.clientNom !== cur) { cur = r.clientNom; const h = document.createElement('div'); h.className = 'pt-client'; h.textContent = '👤 ' + r.clientNom; box.appendChild(h); }
    const row = document.createElement('label'); row.className = 'chk'; row.style.display = 'flex'; row.style.margin = '4px 0 4px 6px';
    row.innerHTML = `<input type="checkbox" ${sel.has(i) ? 'checked' : ''}/> 🐴 ${esc(r.cheval)}`;
    row.querySelector('input').addEventListener('change', (e) => { if (e.target.checked) sel.add(i); else sel.delete(i); if ($('ptcN')) $('ptcN').textContent = sel.size; });
    box.appendChild(row);
  });
  $('ptcOk').onclick = () => {
    const items = rows.filter((_, i) => sel.has(i)).map((r) => ({ cheval: r.cheval, client: r.clientNom, date: t.date }));
    if (!items.length) { alert('Cochez au moins un cheval.'); return; }
    startPlancheQueue(items);
  };
}
function startPlancheQueue(items) {
  modalPlancheCreate('contact', { cheval: items[0].cheval, client: items[0].client, date: items[0].date, queue: items.slice(1), queueTotal: items.length, queueIdx: 1 });
}
function modalPlancheCreate(type, prefill) {
  type = (type === 'avantapres') ? 'avantapres' : 'contact';
  const P = type === 'avantapres' ? S.planche.avantapres : S.planche.contact;
  const modele = P.modeles[plancheModele] ? plancheModele : '4';
  plCreate = { type, modele, orientation: P.orientation || 'paysage', logo: !!P.logo, angles: (P.modeles[modele] || []).slice(), pages: JSON.parse(JSON.stringify(P.pages || [])), compar: type === 'avantapres' ? [{ id: uid(), date: todayStr() }] : null, cheval: (prefill && prefill.cheval) || '', client: (prefill && prefill.client) || '', date: (prefill && prefill.date) || todayStr(), note: '', photos: [], cells: {}, sel: null, todoId: (prefill && prefill.todoId) || null };
  plCreate.queue = (prefill && prefill.queue) || null; plCreate.queueTotal = (prefill && prefill.queueTotal) || 0; plCreate.queueIdx = (prefill && prefill.queueIdx) || 0; plCreate.allowTourPick = !!(prefill && prefill.allowTourPick);
  const chNames = [], clNames = [];
  clients.forEach((c) => { const n = fullName(c); if (n) clNames.push(n); (c.chevaux || []).forEach((h) => { if (h.nom) chNames.push(h.nom); }); });
  const uniq = (a) => Array.from(new Set(a));
  const titre = (type === 'avantapres' ? 'Créer une planche avant / après' : 'Créer une planche de contact') + (plCreate.queueTotal ? ' — cheval ' + plCreate.queueIdx + '/' + plCreate.queueTotal : '');
  openModal(`<div class="modal-head"><b>🖼 ${titre}</b><button class="x" id="mX">✕</button></div>
    <div style="max-height:80vh;overflow:auto" id="plCbody">
      <section class="card">
        ${plCreate.allowTourPick && !plCreate.queueTotal ? '<button class="btn small block" id="plCfromTour" style="margin-bottom:8px">📅 Créer depuis une tournée (récupérer cheval / client / date)</button>' : ''}
        <div class="seg" id="plCmod">${['3', '4', '5'].map((m) => `<button type="button" class="seg-btn${m === modele ? ' on' : ''}" data-plcm="${m}">${m} colonnes</button>`).join('')}</div>
        <div class="row"><label class="grow">Cheval<input type="text" id="plCcheval" list="plClChev" value="${esc(plCreate.cheval)}" placeholder="Nom du cheval"/></label><label class="grow">Client<input type="text" id="plCclient" list="plClCli" value="${esc(plCreate.client)}" placeholder="Nom du client"/></label></div>
        <datalist id="plClChev">${uniq(chNames).map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
        <datalist id="plClCli">${uniq(clNames).map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
        <label>Date<input type="date" id="plCdate" value="${esc(plCreate.date)}"/></label>
        <label>Note (bas de page)<textarea id="plCnote" rows="2" placeholder="Observation, remarque…"></textarea></label>
      </section>
      <section class="card">
        <div class="card-head"><h3 class="rsub" style="margin:0">Photos</h3><button class="btn small" id="plCimport">＋ Importer des photos</button></div>
        <p class="hint">Les photos restent dans la mémoire de l'app le temps de la création (jamais enregistrées). Touchez une vignette pour la <b>sélectionner</b>, puis touchez une case de la grille pour l'y <b>placer</b>. Touchez une case remplie pour la vider.</p>
        <input type="file" id="plCfiles" accept="image/*" multiple hidden/>
        <div class="pl-pot" id="plCpot"></div>
      </section>
      <section class="card">
        <h3 class="rsub">Aperçu / mise en page</h3>
        <div id="plCgrid"></div>
      </section>
      <div class="actions"><button class="btn primary block" id="plCpdf">🖨 Générer le PDF</button><button class="btn block" id="plCmail">📧 Envoyer par email</button>${plCreate.queueTotal ? '<button class="btn block primary" id="plCnext">' + (plCreate.queue && plCreate.queue.length ? '➡ Planche suivante' : '✅ Terminer') + '</button>' : ''}<button class="btn block" id="plCclose">Fermer</button></div>
    </div>`);
  const close = () => { plCreate = null; closeModal(); };
  $('mX').onclick = close; $('plCclose').onclick = close;
  if ($('plCfromTour')) $('plCfromTour').onclick = () => modalPlancheFromTour();
  if ($('plCnext')) $('plCnext').onclick = () => { const q = plCreate.queue || []; if (q.length) modalPlancheCreate('contact', { cheval: q[0].cheval, client: q[0].client, date: q[0].date, queue: q.slice(1), queueTotal: plCreate.queueTotal, queueIdx: plCreate.queueIdx + 1 }); else close(); };
  $('plCbody').querySelectorAll('#plCmod .seg-btn').forEach((b) => b.addEventListener('click', () => {
    plCreate.modele = b.dataset.plcm; plCreate.angles = (P.modeles[plCreate.modele] || []).slice(); plCreate.cells = {}; plCreate.sel = null;
    $('plCbody').querySelectorAll('#plCmod .seg-btn').forEach((x) => x.classList.toggle('on', x.dataset.plcm === plCreate.modele));
    plRenderPot(); plRenderGrid();
  }));
  $('plCcheval').addEventListener('input', (e) => { plCreate.cheval = e.target.value; });
  $('plCclient').addEventListener('input', (e) => { plCreate.client = e.target.value; });
  $('plCdate').addEventListener('change', (e) => { plCreate.date = e.target.value; });
  $('plCnote').addEventListener('input', (e) => { plCreate.note = e.target.value; });
  $('plCimport').onclick = () => $('plCfiles').click();
  $('plCfiles').addEventListener('change', plHandleFiles);
  $('plCpdf').onclick = planchePrint;
  $('plCmail').onclick = async () => {
    if (!Object.keys(plCreate.cells).length && !confirm('Aucune photo placée. Envoyer quand même la planche (vide) ?')) return;
    const btn = $('plCmail'); const old = btn.textContent; btn.disabled = true; btn.textContent = '⏳ Préparation…';
    try {
      const blob = await planchePdfBlob();
      const cli = clients.find((c) => plCreate.client && norm(fullName(c)) === norm(plCreate.client));
      const ok = await shareDoc(blob, 'planche-' + (norm(plCreate.cheval || 'cheval').replace(/\s+/g, '-')) + '.pdf', 'Planche — ' + (plCreate.cheval || 'cheval'), mailBodyFor(cli, 'la planche de ' + (plCreate.cheval || 'votre cheval')));
      if (ok) plancheTodoDone(plCreate);
    } catch (e) { alert('Impossible de générer la planche.'); }
    if ($('plCmail')) { btn.disabled = false; btn.textContent = old; }
  };
  plRenderPot(); plRenderGrid();
}

function plHandleFiles(e) {
  const files = Array.from(e.target.files || []); e.target.value = '';
  files.forEach((f) => {
    if (!/^image\//.test(f.type || '')) return;
    const rec = { id: uid(), name: f.name || 'photo', url: '', date: '', jour: false };
    plCreate.photos.push(rec);
    plExifDate(f, (d) => { if (plCreate) { rec.date = d || ''; plRenderPot(); } });
    plResizeImage(f, 1000, (url) => { if (plCreate) { rec.url = url; plRenderPot(); plRenderGrid(); } });
  });
  plRenderPot();
}

function plRenderPot() {
  const box = $('plCpot'); if (!box || !plCreate) return;
  box.innerHTML = '';
  if (!plCreate.photos.length) { box.innerHTML = '<p class="hint" style="margin:0">Aucune photo importée.</p>'; return; }
  const placed = new Set(Object.values(plCreate.cells));
  plCreate.photos.forEach((ph) => {
    const t = document.createElement('div');
    t.className = 'pl-thumb' + (plCreate.sel === ph.id ? ' sel' : '') + (placed.has(ph.id) ? ' placed' : '');
    t.setAttribute('draggable', 'true');
    t.innerHTML = `${ph.url ? `<img src="${ph.url}" alt=""/>` : '<div class="pl-th-load">…</div>'}<button class="pl-th-x" title="Retirer">✕</button>`
      + `<div class="pl-th-meta"><input type="date" value="${esc(ph.date)}" class="pl-th-date" title="Date de la photo"/><label class="pl-th-jour"><input type="checkbox" ${ph.jour ? 'checked' : ''}/> jour</label></div>`;
    t.addEventListener('dragstart', () => { plCreate.sel = ph.id; });
    t.addEventListener('click', (ev) => { if (ev.target.closest('.pl-th-x') || ev.target.closest('.pl-th-meta')) return; plCreate.sel = plCreate.sel === ph.id ? null : ph.id; plRenderPot(); plRenderGrid(); });
    t.querySelector('.pl-th-x').addEventListener('click', () => { plCreate.photos = plCreate.photos.filter((p) => p.id !== ph.id); Object.keys(plCreate.cells).forEach((k) => { if (plCreate.cells[k] === ph.id) delete plCreate.cells[k]; }); if (plCreate.sel === ph.id) plCreate.sel = null; plRenderPot(); plRenderGrid(); });
    t.querySelector('.pl-th-date').addEventListener('change', (ev) => { ph.date = ev.target.value; ph.jour = false; plRenderPot(); });
    t.querySelector('.pl-th-jour input').addEventListener('change', (ev) => { ph.jour = ev.target.checked; if (ph.jour) ph.date = todayStr(); plRenderPot(); });
    box.appendChild(t);
  });
}

function plPlace(key) {
  if (!plCreate.sel) return;
  Object.keys(plCreate.cells).forEach((k) => { if (plCreate.cells[k] === plCreate.sel) delete plCreate.cells[k]; }); // une photo = une seule case
  plCreate.cells[key] = plCreate.sel; plCreate.sel = null; plRenderPot(); plRenderGrid();
}

function plRenderGrid() {
  const box = $('plCgrid'); if (!box || !plCreate) return;
  box.innerHTML = '';
  const st = plCreate, pages = st.pages || [], angles = st.angles || [];
  if (!pages.length) { box.innerHTML = '<p class="hint">Aucune page configurée. Configurez la planche dans Gestion → Planche.</p>'; return; }
  pages.forEach((pg, pi) => {
    const wrap = document.createElement('div'); wrap.className = 'pl-grid-wrap';
    wrap.innerHTML = `<div class="pl-page-lbl">Page ${pi + 1}${st.type === 'avantapres' && pi === 0 ? ' — comparaison (dates)' : ''}</div>`;
    // Avant/après, page 0 : barre de gestion des dates de comparaison (chaque date = une paire Avant/Après de lignes)
    if (st.type === 'avantapres' && pi === 0) {
      const bar = document.createElement('div'); bar.className = 'pl-datebar';
      (st.compar || []).forEach((c, ci2) => {
        const chip = document.createElement('span'); chip.className = 'pl-datechip';
        chip.innerHTML = `<input type="date" value="${esc(c.date)}"/>${st.compar.length > 1 ? '<button class="pl-date-x" title="Retirer">✕</button>' : ''}`;
        chip.querySelector('input').addEventListener('change', (e) => { c.date = e.target.value; plRenderGrid(); });
        const x = chip.querySelector('.pl-date-x');
        if (x) x.addEventListener('click', () => {
          st.compar.splice(ci2, 1);
          const nc = {}; // ré-indexe les cellules de la page 0 (les lignes après celle retirée se décalent)
          Object.keys(st.cells).forEach((k) => { const pp = k.split('_'); if (pp[0] !== '0') { nc[k] = st.cells[k]; return; } const ri = parseInt(pp[1], 10); if (ri === ci2) return; nc['0_' + (ri > ci2 ? ri - 1 : ri) + '_' + pp[2] + '_' + pp[3]] = st.cells[k]; });
          st.cells = nc; plRenderPot(); plRenderGrid();
        });
        bar.appendChild(chip);
      });
      const add = document.createElement('button'); add.className = 'btn small'; add.textContent = '＋ Ajouter une date'; add.addEventListener('click', () => { st.compar.push({ id: uid(), date: todayStr() }); plRenderGrid(); });
      bar.appendChild(add); wrap.appendChild(bar);
    }
    const rows = plPageRows(pi);
    const tbl = document.createElement('table'); tbl.className = 'pl-egrid';
    let html = `<thead><tr><th></th>${angles.map((a) => `<th>${esc(a)}</th>`).join('')}</tr></thead><tbody>`;
    if (!rows.length) html += `<tr><td colspan="${angles.length + 1}" class="hint" style="text-align:center;padding:8px">${st.type === 'avantapres' && pi === 0 ? 'Ajoutez au moins une date de comparaison.' : 'Page sans ligne (configurez les lignes dans Gestion → Planche).'}</td></tr>`;
    rows.forEach((r) => {
      html += `<tr><th class="pl-mem${r.pj === 1 ? ' pl-after' : ''}">${esc(r.label)}</th>` + angles.map((a, ci) => {
        const key = plCellKey(pi, r, ci), pid = st.cells[key], ph = pid && st.photos.find((p) => p.id === pid);
        return `<td class="pl-cell${st.sel && !ph ? ' sel-target' : ''}" data-key="${key}">${ph && ph.url ? `<img src="${ph.url}" alt=""/>` : '<span class="pl-cell-ph">+</span>'}</td>`;
      }).join('') + '</tr>';
    });
    html += '</tbody>';
    tbl.innerHTML = html;
    tbl.querySelectorAll('.pl-cell').forEach((td) => {
      const key = td.dataset.key;
      td.addEventListener('click', () => { if (st.cells[key]) { delete st.cells[key]; plRenderPot(); plRenderGrid(); } else { plPlace(key); } });
      td.addEventListener('dragover', (e) => e.preventDefault());
      td.addEventListener('drop', (e) => { e.preventDefault(); plPlace(key); });
    });
    wrap.appendChild(tbl); box.appendChild(wrap);
  });
}

// Génère le PDF de la planche via l'impression navigateur (l'OS choisit « Enregistrer en PDF »). Rien n'est stocké.
function planchePrint() {
  if (!plCreate) return;
  const st = plCreate;
  if (!Object.keys(st.cells).length && !confirm('Aucune photo n\'est placée dans la grille. Générer quand même la planche (vide) ?')) return;
  const ori = st.orientation === 'portrait' ? 'portrait' : 'landscape';
  const logoHtml = st.logo ? proLogoBox(150, 58) : '';
  const titre = st.type === 'avantapres' ? 'Avant / après (parage)' : 'Planche de contact';
  let body = `<style>
    @page{size:${ori};margin:8mm;}
    #printArea .pl-page{page-break-after:always;}
    #printArea .pl-page:last-child{page-break-after:auto;}
    #printArea .pl-head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:8px;}
    #printArea .pl-hl{display:flex;align-items:center;gap:8px;}
    #printArea .pl-htitle{font-size:15px;font-weight:700;color:#111;}
    #printArea .pl-hinfo{font-size:12px;color:#111;text-align:right;}
    #printArea table.pl-ptable{width:100%;border-collapse:collapse;table-layout:fixed;}
    #printArea table.pl-ptable th,#printArea table.pl-ptable td{border:1px solid #444;padding:2px;text-align:center;vertical-align:middle;}
    #printArea table.pl-ptable thead th{background:#eee;font-size:11px;}
    #printArea table.pl-ptable th.pl-mem{width:82px;font-size:10px;font-weight:700;background:#f5f5f5;text-align:left;}
    #printArea table.pl-ptable th.pl-mem.pl-after{background:#e7eef7;}
    #printArea table.pl-ptable td img{width:100%;height:auto;max-height:158px;object-fit:contain;display:block;margin:0 auto;}
    #printArea .pl-note{margin-top:8px;font-size:11px;color:#111;border-top:1px solid #999;padding-top:4px;white-space:pre-wrap;}
  </style>`;
  (st.pages || []).forEach((pg, pi) => {
    const rows = plPageRows(pi);
    body += `<div class="pl-page"><div class="pl-head"><div class="pl-hl">${logoHtml}<span class="pl-htitle">${titre}</span></div>`
      + `<div class="pl-hinfo"><b>${esc(st.cheval) || '—'}</b><br>${esc(st.client) || '—'} · ${esc(fmtDateFr(st.date))}</div></div>`;
    body += `<table class="pl-ptable"><thead><tr><th class="pl-mem"></th>${st.angles.map((a) => `<th>${esc(a)}</th>`).join('')}</tr></thead><tbody>`;
    rows.forEach((r) => {
      body += `<tr><th class="pl-mem${r.pj === 1 ? ' pl-after' : ''}">${esc(r.label)}</th>` + st.angles.map((a, ci) => {
        const pid = st.cells[plCellKey(pi, r, ci)], ph = pid && st.photos.find((p) => p.id === pid);
        return `<td>${ph && ph.url ? `<img src="${ph.url}" alt=""/>` : ''}</td>`;
      }).join('') + '</tr>';
    });
    body += '</tbody></table>';
    if (st.note) body += `<div class="pl-note">${esc(st.note)}</div>`;
    body += '</div>';
  });
  printHtml('Planche — ' + (st.cheval || 'cheval'), body);
  plancheTodoDone(st); // planche générée → le cheval quitte le « Compte rendu photo »
}
// Retire le cheval du « Compte rendu photo » (une planche a été produite pour lui).
function plancheTodoDone(st) { if (st && st.todoId) { S.plancheTodo = (S.plancheTodo || []).filter((y) => y.id !== st.todoId); st.todoId = null; saveSettings(); renderComptePhoto(); } }

// ================= Comparaison de documents (Phase 4) =================
// Importe 2 images (planches déjà enregistrées, captures…) et les met côte à côte en PDF. Rien n'est stocké (décision : pas de rendu PDF ré-importé, on compare des images).
let plCompare = null;
function modalPlancheCompare() {
  plCompare = { orientation: 'paysage', layout: 'side', title: 'Comparaison', a: '', b: '', la: 'Document 1', lb: 'Document 2' };
  openModal(`<div class="modal-head"><b>🔎 Comparaison de documents</b><button class="x" id="mX">✕</button></div>
    <div style="max-height:80vh;overflow:auto">
      <p class="hint">Importez deux images (planches déjà enregistrées en PDF/PNG, captures d'écran…). Choisissez la disposition (côte à côte ou l'une au-dessus de l'autre), puis générez le PDF. Rien n'est stocké dans l'app.</p>
      <div class="row"><label class="grow">Titre<input type="text" id="plCmpTitle" value="Comparaison"/></label><label class="grow">Orientation<select id="plCmpOri"><option value="paysage">Paysage</option><option value="portrait">Portrait</option></select></label></div>
      <label>Disposition<select id="plCmpLayout"><option value="side">Côte à côte</option><option value="stack">L'une au-dessus de l'autre</option></select></label>
      <div class="pl-cmp-2">
        <div class="pl-cmp-col"><label>Légende gauche<input type="text" id="plCmpLa" value="Document 1"/></label><button class="btn small block" id="plCmpImpA">＋ Importer l'image de gauche</button><input type="file" id="plCmpFileA" accept="image/*" hidden/><div class="pl-cmp-prev" id="plCmpPrevA"></div></div>
        <div class="pl-cmp-col"><label>Légende droite<input type="text" id="plCmpLb" value="Document 2"/></label><button class="btn small block" id="plCmpImpB">＋ Importer l'image de droite</button><input type="file" id="plCmpFileB" accept="image/*" hidden/><div class="pl-cmp-prev" id="plCmpPrevB"></div></div>
      </div>
      <div class="actions"><button class="btn primary block" id="plCmpPdf">🖨 Générer le PDF</button><button class="btn block" id="plCmpClose">Fermer</button></div>
    </div>`);
  const close = () => { plCompare = null; closeModal(); };
  $('mX').onclick = close; $('plCmpClose').onclick = close;
  $('plCmpTitle').addEventListener('input', (e) => { plCompare.title = e.target.value; });
  $('plCmpOri').addEventListener('change', (e) => { plCompare.orientation = e.target.value; });
  $('plCmpLayout').addEventListener('change', (e) => { plCompare.layout = e.target.value; });
  $('plCmpLa').addEventListener('input', (e) => { plCompare.la = e.target.value; });
  $('plCmpLb').addEventListener('input', (e) => { plCompare.lb = e.target.value; });
  const wire = (side, up) => {
    $('plCmpImp' + up).onclick = () => $('plCmpFile' + up).click();
    $('plCmpFile' + up).addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; plResizeImage(f, 1400, (url) => { if (!plCompare) return; plCompare[side] = url; const p = $('plCmpPrev' + up); if (p) p.innerHTML = url ? `<img src="${url}" alt=""/>` : ''; }, 'image/png'); });
  };
  wire('a', 'A'); wire('b', 'B');
  $('plCmpPdf').onclick = plancheComparePrint;
}
function plancheComparePrint() {
  if (!plCompare) return;
  const c = plCompare;
  if (!c.a && !c.b) { alert('Importez au moins une image.'); return; }
  const ori = c.orientation === 'portrait' ? 'portrait' : 'landscape';
  const stack = c.layout === 'stack';
  const cell = (url, lbl) => `<div class="pl-cmp-cell"><div class="pl-cmp-lbl">${esc(lbl)}</div>${url ? `<img src="${url}" alt=""/>` : '<div class="pl-cmp-empty">—</div>'}</div>`;
  // Hauteur d'image selon disposition/orientation : empilé → 2 images sur la hauteur ; côte à côte → pleine hauteur.
  const maxH = stack ? (ori === 'portrait' ? 350 : 230) : (ori === 'portrait' ? 340 : 470);
  const body = `<style>
    @page{size:${ori};margin:8mm;}
    #printArea .pl-cmp-title{font-size:15px;font-weight:700;color:#111;text-align:center;margin-bottom:8px;}
    #printArea .pl-cmp-row{display:flex;gap:8px;align-items:flex-start;flex-direction:${stack ? 'column' : 'row'};}
    #printArea .pl-cmp-cell{${stack ? 'width:100%;' : 'flex:1;'}text-align:center;border:1px solid #999;padding:4px;box-sizing:border-box;}
    #printArea .pl-cmp-lbl{font-size:12px;font-weight:700;color:#111;margin-bottom:4px;}
    #printArea .pl-cmp-cell img{width:100%;height:auto;max-height:${maxH}px;object-fit:contain;display:block;margin:0 auto;}
    #printArea .pl-cmp-empty{color:#999;padding:40px 0;}
  </style>
  <div class="pl-cmp-title">${esc(c.title || 'Comparaison')}</div>
  <div class="pl-cmp-row">${cell(c.a, c.la || 'Document 1')}${cell(c.b, c.lb || 'Document 2')}</div>`;
  printHtml('Comparaison — ' + (c.title || 'documents'), body);
}

// ================= SMS (modèle) =================
const SMS_FIELDS = [
  { k: '{civilite}', label: 'Civilité (Mr/Mme)' },
  { k: '{prenom}', label: 'Prénom' },
  { k: '{nom}', label: 'Nom' },
  { k: '{client}', label: 'Client (prénom nom)' },
  { k: '{societe}', label: 'Société' },
  { k: '{cheval}', label: 'Cheval(aux)' },
  { k: '{trajet}', label: 'Temps de trajet' },
  { k: '{adresse}', label: 'Adresse' },
];
// Remplace {champ} par les valeurs fournies (jeton connu mais vide → supprimé ; jeton inconnu → laissé tel quel) puis nettoie les espaces.
function fillSms(tpl, data) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in data ? (data[k] == null ? '' : String(data[k])) : m)).replace(/ {2,}/g, ' ').replace(/ ([,.!?])/g, '$1').trim(); }
// Données de fusion SMS pour un client (toutes les clés, pour que les 2 modèles marchent).
function smsDataFor(c, extra) { return Object.assign({ civilite: (c && c.civilite) || '', prenom: (c && c.prenom) || '', nom: (c && c.nom) || '', client: fullName(c || {}), societe: (c && c.societe) || '' }, extra || {}); }
// Choix du modèle SMS (politesse / standard) AVANT copie. Pré-sélectionne le réglage du client (défaut : politesse),
// fige le choix dans la fiche client (pour les prochaines fois), puis copie le message avec le bon modèle.
function modalSmsChoice(c, data) {
  let politesse = !c || c.politesse !== false; // défaut : politesse
  const build = () => fillSms(politesse ? (S.smsTemplatePolitesse || S.smsTemplate) : S.smsTemplate, data);
  openModal(`<div class="modal-head"><b>✉️ SMS — ${esc(fullName(c || {}) || 'client')}</b><button class="x" id="mX">✕</button></div>
    <label>Formule du message</label>
    <div class="seg" id="smsSeg"><button type="button" class="seg-btn${politesse ? ' on' : ''}" data-p="1">Politesse (Mr/Mme + nom)</button><button type="button" class="seg-btn${politesse ? '' : ' on'}" data-p="0">Standard (prénom)</button></div>
    <p class="hint" id="smsPrev"></p>
    <div class="actions"><button class="btn primary block" id="smsGo">📋 Copier &amp; envoyer</button></div>`);
  const prev = $('smsPrev'); const refresh = () => { if (prev) prev.innerHTML = '<b>Aperçu :</b> ' + esc(build()); };
  refresh();
  $('mX').addEventListener('click', closeModal);
  document.querySelectorAll('#smsSeg .seg-btn').forEach((b) => b.addEventListener('click', () => { politesse = b.dataset.p === '1'; document.querySelectorAll('#smsSeg .seg-btn').forEach((x) => x.classList.toggle('on', x === b)); refresh(); }));
  $('smsGo').addEventListener('click', async () => {
    if (c && c.id != null) { c.politesse = politesse; saveClients(); } // fige le choix pour la prochaine fois
    const msg = build();
    try { await navigator.clipboard.writeText(msg); const btn = $('smsGo'); if (btn) { btn.textContent = 'Copié ✔'; setTimeout(closeModal, 700); } else closeModal(); }
    catch { closeModal(); alert(msg); }
  });
}
function insertAtCursor(ta, text) {
  const s = ta.selectionStart != null ? ta.selectionStart : ta.value.length, e = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length; ta.focus();
  // La sauvegarde (dans le bon modèle) est faite par l'appelant.
}
const SMS_SAMPLE = { civilite: 'Mme', prenom: 'Jean', nom: 'Dupont', client: 'Jean Dupont', societe: 'Écurie du Nord', cheval: 'Indianna', trajet: '15 min', adresse: 'Rue de l\'Exemple 1, 5000 Namur' };
function updateSmsPreview() {
  if ($('smsPreview')) $('smsPreview').innerHTML = '<b>Aperçu :</b> ' + esc(fillSms(S.smsTemplate, SMS_SAMPLE));
  if ($('smsPreviewPol')) $('smsPreviewPol').innerHTML = '<b>Aperçu :</b> ' + esc(fillSms(S.smsTemplatePolitesse, SMS_SAMPLE));
}
function renderSMS() {
  const wire = (taId, key, fieldsId) => {
    const ta = $(taId); if (!ta) return;
    ta.value = S[key] || '';
    ta.oninput = () => { S[key] = ta.value; saveSettings(); updateSmsPreview(); };
    const box = $(fieldsId); if (box) { box.innerHTML = ''; SMS_FIELDS.forEach((f) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = '+ ' + f.label; b.addEventListener('click', () => { insertAtCursor(ta, f.k); S[key] = ta.value; saveSettings(); updateSmsPreview(); }); box.appendChild(b); }); }
  };
  wire('smsTemplate', 'smsTemplate', 'smsFields');
  wire('smsTemplatePol', 'smsTemplatePolitesse', 'smsFieldsPol');
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
// Heure de RDV d'un arrêt : 1 par arrêt (a.heure) ; repli sur la plus tôt des heures par cheval (ancien modèle).
function arretHeure(a) {
  if (a && a.heure) return a.heure;
  let best = ''; (a && a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => { if (cv.heure && (!best || cv.heure < best)) best = cv.heure; }));
  return best;
}
// Heure de départ estimée de la tournée = heure de RDV du 1er arrêt − temps de trajet (réel si encodé, sinon estimé) jusqu'à lui.
function estimatedDepartureHM(t) {
  const a0 = (t.arrets || [])[0]; if (!a0) return '';
  const heure0 = arretHeure(a0); if (!heure0) return '';
  const [h, mn] = heure0.split(':').map(Number); if (isNaN(h)) return '';
  const R = t.result; let travel = 0;
  if (typeof a0.realMin === 'number') travel = a0.realMin;
  else if (R && R.rows && R.rows[0]) { const mpk = (R.totalKm > 0 && R.totalMin) ? R.totalMin / R.totalKm : 60 / (S.vitesseKmh || 50); travel = (R.rows[0].segKm || 0) * mpk; }
  let dep = h * 60 + mn - Math.round(travel); if (dep < 0) dep = 0;
  return String(Math.floor(dep / 60)).padStart(2, '0') + ':' + String(dep % 60).padStart(2, '0');
}
// Heure locale HH:MM et durée « X h Y min » (temps de travail).
const hm = (ts) => ts ? new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
// Durée à partir de MINUTES : < 1h → « 45 min » ; ≥ 1h → « 1h30 » / « 2h ». Format unique partout.
function durMin(min) { if (min == null || isNaN(min) || min < 0) return '—'; min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; if (!h) return m + ' min'; return m ? `${h}h${m < 10 ? '0' + m : m}` : `${h}h`; }
function durHm(ms) { return (ms == null || ms < 0) ? '—' : durMin(ms / 60000); }
// Une tournée est « dépassée » = son JOUR est passé sans qu'elle soit clôturée (débordée d'un jour). Les tournées du jour restent gérées dans Trajet du jour.
function isOverdue(t) { return !!(t && !t.closed && !t.endedAt && (t.date || '') && t.date < todayStr()); }
// Tournée entièrement annulée/reportée : chaque client a des chevaux et tous sont annulés → plus rien à finaliser (gérée via Annulations/Replacer).
function tourAllCancelled(t) {
  const cls = []; (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => cls.push(cl)));
  return cls.length > 0 && cls.every((cl) => { const ch = cl.chevaux || []; return ch.length > 0 && ch.every(chevalCancelled); });
}
// Tournées DÉPASSÉES non clôturées (démarrées inachevées OU jamais démarrées). Exclut celles entièrement reportées/annulées.
function blockingTours() {
  return (tournees || []).filter((t) => isOverdue(t) && tourFinalizeBlock(t).length > 0 && !tourAllCancelled(t));
}
// Persiste une tournée dans le bon store (actif/archive) sans doublon.
function persistTourAnywhere(t) {
  const i = tournees.findIndex((x) => x.id === t.id); if (i >= 0) { tournees[i] = t; saveTournees(); return; }
  const ai = archive.findIndex((x) => x.id === t.id); if (ai >= 0) { archive[ai] = t; saveArchive(); return; }
  tournees.push(t); saveTournees();
}
// « Récupérer » une ancienne tournée (encodée + clôturée AVANT le suivi démarrage/finalisation) : elle apparaît en
// « dépassée non démarrée » faute de finalisation au sens neuf. On la fige à sa date (closed + recovered) → elle sort
// des dépassées et devient une tournée clôturée normale ; l'utilisateur complète ensuite ses données manquantes (stats).
function recoverTour(t) {
  if (!confirm('Récupérer l\'ancienne tournée du ' + fmtDateFr(t.date) + ' ? Elle est figée à sa date (arrêts non modifiables). Vous pourrez compléter ses données manquantes (heures de RDV, temps de route, durées de consultation) pour des statistiques complètes.')) return;
  t.recovered = true; t.closed = true;
  persistTourAnywhere(t);
  renderHome();
  modalRecoverStats(t);
}
// Panneau de complétion d'une tournée récupérée : heure de RDV + temps de route réel par arrêt,
// durée de consultation par cheval, temps de retour. Ces données alimentent le Temps de travail et le Temps de trajet.
function modalRecoverStats(t) {
  openModal(`<div class="modal-head"><b>📊 Compléter — ${esc(fmtDateFr(t.date))}${t.nom && t.nom.trim() ? ' : ' + esc(t.nom.trim()) : ''}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Renseignez les données manquantes de cette ancienne tournée pour des statistiques complètes : l'heure de RDV et le temps de route réel de chaque arrêt, la durée de consultation de chaque cheval/visite, et le temps de retour. Le départ se calcule depuis le 1ᵉʳ RDV moins la route.</p>
    <div id="recBody"></div>
    <label>Temps de retour réel (min)<input type="number" min="0" step="1" id="recReturn" value="${typeof t.returnRealMin === 'number' ? t.returnRealMin : ''}" placeholder="retour → domicile"/></label>
    <div class="actions"><button class="btn primary block" id="recSave">Enregistrer</button></div>`);
  const body = $('recBody');
  (t.arrets || []).forEach((a, i) => {
    const wrap = document.createElement('div'); wrap.className = 'inv-client';
    let h = `<div class="inv-head"><span>${i + 1}. ${esc(labelFor(a)) || 'arrêt'}</span></div>
      <label>Heure de RDV<input type="time" data-heure="${i}" value="${a.heure || ''}"/></label>
      <label>Temps de route réel (min)<input type="number" min="0" step="1" data-route="${i}" value="${typeof a.realMin === 'number' ? a.realMin : ''}" placeholder="depuis l'arrêt précédent (ou le domicile)"/></label>`;
    (a.clients || []).forEach((cl, j) => (cl.chevaux || []).forEach((cv, k) => { if (!chevalFait(cv)) return; h += `<label>🐴 ${esc(cv.nom)} — consultation (min)<input type="number" min="0" step="1" data-consult="${i}.${j}.${k}" value="${typeof cv.consultMin === 'number' ? cv.consultMin : ''}"/></label>`; }));
    wrap.innerHTML = h; body.appendChild(wrap);
  });
  $('mX').addEventListener('click', closeModal);
  $('recSave').addEventListener('click', () => {
    const numOrNull = (v) => { v = (v || '').toString().trim(); return v === '' ? null : Math.max(0, Math.round(parseNum(v))); };
    body.querySelectorAll('[data-heure]').forEach((inp) => { t.arrets[+inp.dataset.heure].heure = inp.value || ''; });
    body.querySelectorAll('[data-route]').forEach((inp) => { const a = t.arrets[+inp.dataset.route]; const v = numOrNull(inp.value); if (v == null) delete a.realMin; else a.realMin = v; });
    body.querySelectorAll('[data-consult]').forEach((inp) => { const [i, j, k] = inp.dataset.consult.split('.').map(Number); const cv = t.arrets[i] && t.arrets[i].clients[j] && t.arrets[i].clients[j].chevaux[k]; if (!cv) return; const v = numOrNull(inp.value); if (v == null) delete cv.consultMin; else cv.consultMin = v; });
    const rr = numOrNull($('recReturn').value); if (rr == null) delete t.returnRealMin; else t.returnRealMin = rr;
    persistTourAnywhere(t);
    closeModal(); renderHome();
    if (currentTour && currentTour.id === t.id) { currentTour = JSON.parse(JSON.stringify(t)); }
  });
}
// Reporte TOUS les chevaux (non déjà annulés) d'une tournée → ils rejoignent « Replacer un RDV ».
function reportAllTour(t) {
  (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => { if (!chevalCancelled(cv)) cv.cancel = { status: 'reporte', reason: 'pro', note: '', at: new Date().toISOString(), replacedTourId: null }; })));
  const i = tournees.findIndex((x) => x.id === t.id); if (i >= 0) { tournees[i] = t; saveTournees(); } else { const ai = archive.findIndex((x) => x.id === t.id); if (ai >= 0) { archive[ai] = t; saveArchive(); } }
  renderHome();
}
// Un cheval a-t-il un RDV à venir (tournée non clôturée : aujourd'hui ou plus tard) ?
function chevalHasUpcomingRdv(clientId, chevalId) {
  return tournees.some((t) => statusOf(t) !== 'cloturee' && (t.arrets || []).some((a) => (a.clients || []).some((cl) => cl.clientId === clientId && (cl.chevaux || []).some((cv) => cv.id === chevalId))));
}
// « Rendez-vous à prendre » (fusion « Replacer un RDV » + « Chevaux sans prochain RDV ») : chevaux ACTIFS (clients actifs, hors liste noire)
// sans aucun RDV à venir. Chaque cheval apparaît UNE seule fois. `reported` = les enregistrements d'annulation « reporté » (non replacés)
// qui portent sur ce cheval (par nom) → à la prise de RDV, on les marque « replacés » pour les sortir de la file « Replacer ».
function rdvAPrendre() {
  const reportedMap = {}; // clientId -> { normNom -> [items d'annulation reportée] }
  reportedByClient().forEach((g) => { const m = {}; g.items.forEach((it) => { const k = norm(it.cheval); (m[k] = m[k] || []).push(it); }); reportedMap[g.clientId] = m; });
  const out = [];
  clients.forEach((c) => {
    if (c.actif === false) return;
    const rm = reportedMap[c.id] || {};
    activeChevaux(c).forEach((h) => {
      if (chevalHasUpcomingRdv(c.id, h.id)) return;
      out.push({ client: c, cheval: h, reported: rm[norm(h.nom)] || [] });
    });
  });
  return out;
}
// Section Accueil « Rendez-vous à prendre » : liste SEULEMENT les noms (cheval — client), cliquables. Les actions sont dans la modale (au clic).
function renderRdvAPrendre() {
  const card = $('homeRdvAPrendre'), list = $('homeRdvAPrendreList'); if (!card || !list) return;
  const items = rdvAPrendre();
  card.classList.toggle('hidden', !items.length);
  list.innerHTML = '';
  items.slice(0, 1).forEach(({ client, cheval, reported }) => { // n'afficher que le 1er (liste complète dans la modale)
    const el = document.createElement('div'); el.className = 'list-item clickable';
    const badge = reported.length ? ' <span class="badge">↩ reporté</span>' : '';
    el.innerHTML = `<div class="li-main"><b>🐴 ${esc(cheval.nom)}${badge}</b><span class="li-sub">${esc(fullName(client))}${client.societe ? ' — ' + esc(client.societe) : ''}</span></div><div class="li-act"><span class="li-chev">›</span></div>`;
    el.addEventListener('click', () => modalRdvAPrendre());
    list.appendChild(el);
  });
  if (items.length > 1) {
    const more = document.createElement('div'); more.className = 'list-item clickable';
    more.innerHTML = `<div class="li-main"><b>+ ${items.length - 1} autre(s)</b><span class="li-sub">Voir la liste complète</span></div><div class="li-act"><span class="li-chev">›</span></div>`;
    more.addEventListener('click', () => modalRdvAPrendre());
    list.appendChild(more);
  }
}
// Modale « Rendez-vous à prendre » : liste complète avec, pour chaque cheval, les boutons Prendre un RDV / Inactif / Liste noire.
function modalRdvAPrendre() {
  const render = () => {
    const items = rdvAPrendre();
    if (!items.length) { closeModal(); renderHome(); return; }
    openModal(`<div class="modal-head"><b>📅 Rendez-vous à prendre</b><button class="x" id="mX">✕</button></div>
      <p class="hint">Chevaux actifs sans rendez-vous à venir. Pour chacun : prenez un RDV, ou passez-le en inactif / liste noire.</p>
      <div id="rapList" style="max-height:66vh;overflow:auto"></div>
      <div class="actions"><button class="btn block" id="rapClose">Fermer</button></div>`);
    $('mX').addEventListener('click', closeModal); $('rapClose').addEventListener('click', closeModal);
    const box = $('rapList');
    items.forEach(({ client, cheval, reported }) => {
      const el = document.createElement('div'); el.className = 'list-item stack-act';
      const badge = reported.length ? ' <span class="badge">↩ reporté</span>' : '';
      el.innerHTML = `<div class="li-main"><b>🐴 ${esc(cheval.nom)}${badge}</b><span class="li-sub">${esc(fullName(client))}${client.societe ? ' — ' + esc(client.societe) : ''}</span></div><div class="li-act li-act-col"><button class="btn small primary" data-rdv>📅 Prendre un RDV</button><button class="btn small" data-inact>💤 Inactif</button><button class="btn small danger" data-bl>⛔ Liste noire</button></div>`;
      el.querySelector('[data-rdv]').addEventListener('click', () => modalAssignRdvCheval(client, cheval, reported));
      el.querySelector('[data-inact]').addEventListener('click', () => { if (!confirm('Passer le cheval « ' + cheval.nom + ' » en inactif ? Il ne sera plus proposé pour les RDV.')) return; cheval.actif = false; saveClients(); renderHome(); render(); });
      el.querySelector('[data-bl]').addEventListener('click', () => { if (!confirm('Mettre le cheval « ' + cheval.nom + ' » en liste noire ? Il devient inactif et n\'est plus proposé pour les RDV (réversible dans la fiche client).')) return; cheval.blacklist = true; cheval.actif = false; saveClients(); renderHome(); render(); });
      box.appendChild(el);
    });
  };
  render();
}
// Prendre un RDV pour UN cheval précis (Accueil « Rendez-vous à prendre »). Si le cheval provient d'un RDV reporté, on marque ces reports comme « replacés ».
function modalAssignRdvCheval(client, cheval, reportedItems) {
  const proposed = proposedRdvDate(todayStr());
  openModal(`<div class="modal-head"><b>📅 RDV — 🐴 ${esc(cheval.nom)}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Client : <b>${esc(fullName(client))}</b>. Choisissez la date du prochain RDV pour ce cheval.</p>
    <label>Date du RDV<input type="date" id="arCvDate" value="${proposed}"/></label>
    <p class="hint" id="arCvPrev"></p>
    <div class="actions"><button class="btn primary block" id="arCvOk">Enregistrer le RDV</button></div>`);
  $('mX').addEventListener('click', closeModal);
  const prev = () => { const d = $('arCvDate').value; const pv = rdvDayPreview(d); $('arCvPrev').innerHTML = d ? `<b>${fmtDateFr(d)}</b> — arrêts déjà prévus : ${pv.arrets.length ? esc(pv.arrets.join(' · ')) : 'aucune tournée'}${pv.priv.length ? '<br>📅 Agenda privé : ' + pv.priv.map((p) => esc((eventHeure(p) ? eventHeure(p) + ' ' : '') + p.title)).join(' · ') : ''}` : ''; };
  $('arCvDate').addEventListener('change', prev); prev();
  $('arCvOk').addEventListener('click', () => {
    const d = $('arCvDate').value; if (!d) { closeModal(); return; }
    const res = scheduleClientOnDate(d, client, [cheval]);
    if (reportedItems && reportedItems.length && res && res.tour) { reportedItems.forEach((it) => { if (it.cv && it.cv.cancel) it.cv.cancel.replacedTourId = res.tour.id; }); saveTournees(); saveArchive(); } // sort ces reports de la file « Replacer » (Annulations : marqués « replacé »)
    closeModal(); renderHome();
  });
}
// ===== Compte rendu photo (planches à faire) =====
function addPlancheTodo(x) {
  if (!Array.isArray(S.plancheTodo)) S.plancheTodo = [];
  const key = (y) => y.clientId + '|' + norm(y.chevalNom || '') + '|' + (y.date || '');
  if (S.plancheTodo.some((y) => key(y) === key(x))) return false;
  S.plancheTodo.push(Object.assign({ id: uid() }, x)); saveSettings(); return true;
}
// Depuis un arrêt (tournée ouverte OU clôturée) : créer une planche préremplie pour un cheval, ou l'ajouter au « Compte rendu photo ».
function modalArretPlanche(t, a) {
  const rows = [];
  (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => { if (chevalCancelled(cv)) return; rows.push({ cl, cv }); }));
  if (!rows.length) { alert('Aucun cheval sur cet arrêt.'); return; }
  openModal(`<div class="modal-head"><b>📷 Planche / compte rendu photo</b><button class="x" id="mX">✕</button></div>
    <p class="hint">RDV du ${esc(fmtDateFr(t.date))}. Créez une planche de contact préremplie (nom du cheval, client et date repris automatiquement), ou ajoutez le cheval au « Compte rendu photo » de l'Accueil pour le faire plus tard.</p>
    <div id="apList"></div>
    <div class="actions"><button class="btn block" id="apClose">Fermer</button></div>`);
  $('mX').onclick = closeModal; $('apClose').onclick = closeModal;
  const box = $('apList');
  rows.forEach(({ cl, cv }) => {
    const el = document.createElement('div'); el.className = 'list-item stack-act';
    el.innerHTML = `<div class="li-main"><b>🐴 ${esc(cv.nom)}</b><span class="li-sub">${esc(clientName(cl.clientId))}</span></div><div class="li-act li-act-col"><button class="btn small primary" data-make>🖼 Créer la planche</button><button class="btn small" data-todo>➕ Compte rendu photo</button></div>`;
    el.querySelector('[data-make]').addEventListener('click', () => { closeModal(); modalPlancheCreate('contact', { cheval: cv.nom, client: clientName(cl.clientId), date: t.date }); });
    const tb = el.querySelector('[data-todo]');
    tb.addEventListener('click', () => { const added = addPlancheTodo({ clientId: cl.clientId, chevalId: cv.id, chevalNom: cv.nom, date: t.date, tourId: t.id }); tb.textContent = added ? '✓ Ajouté' : 'Déjà dans la liste'; tb.disabled = true; renderHome(); });
    box.appendChild(el);
  });
}
// Section Accueil « Compte rendu photo » : chevaux dont une planche est à faire → créer la planche préremplie (disparaît quand la planche est générée).
function renderComptePhoto() {
  const card = $('homeComptePhoto'), list = $('homeComptePhotoList'); if (!card || !list) return;
  const items = S.plancheTodo || [];
  card.classList.toggle('hidden', !items.length);
  list.innerHTML = '';
  items.forEach((x) => {
    const el = document.createElement('div'); el.className = 'list-item stack-act';
    el.innerHTML = `<div class="li-main"><b>🐴 ${esc(x.chevalNom)}</b><span class="li-sub">${esc(clientName(x.clientId))} · RDV du ${esc(fmtDateFr(x.date))}</span></div><div class="li-act li-act-col"><button class="btn small primary" data-make>🖼 Créer la planche</button><button class="btn small" data-rm>Retirer</button></div>`;
    el.querySelector('[data-make]').addEventListener('click', () => modalPlancheCreate('contact', { cheval: x.chevalNom, client: clientName(x.clientId), date: x.date, todoId: x.id }));
    el.querySelector('[data-rm]').addEventListener('click', () => { if (!confirm('Retirer ce cheval du compte rendu photo ?')) return; S.plancheTodo = (S.plancheTodo || []).filter((y) => y.id !== x.id); saveSettings(); renderComptePhoto(); });
    list.appendChild(el);
  });
}
function deleteTourById(id) { purgeTourData(id); tournees = tournees.filter((t) => t.id !== id); archive = archive.filter((t) => t.id !== id); saveTournees(); saveArchive(); }
// Section dédiée (au-dessus du Trajet du jour) : tournées dépassées non clôturées.
// Démarrée inachevée → « Finaliser » (arrêts restants) ; jamais démarrée → « Reporter » (client par client) ou « Supprimer ».
function renderBlockingArrets() {
  const card = $('homeBlocking'), list = $('homeBlockingList'); if (!card || !list) return;
  const stuck = blockingTours();
  card.classList.toggle('hidden', !stuck.length);
  list.innerHTML = '';
  stuck.forEach((t) => {
    const started = !!t.startedAt;
    const blk = tourFinalizeBlock(t);
    const el = document.createElement('div'); el.className = 'list-item stack-act';
    const acts = started
      ? '<button class="btn small primary" data-fin>💶 Finaliser</button>'
      : '<button class="btn small primary" data-recover>♻ Récupérer</button><button class="btn small" data-report>📅 Reporter</button><button class="btn small danger" data-del>🗑 Supprimer</button>';
    const sub = started ? blk.map(esc).join('<br>') : 'Jamais démarrée — <b>Récupérer</b> (ancienne tournée : la figer en l\'état et compléter ses stats), ou reporter / supprimer.';
    el.innerHTML = `<div class="li-main"><b>🚩 ${esc(fmtDateFr(t.date))}${t.nom && t.nom.trim() ? ' : ' + esc(t.nom.trim()) : ''}${started ? '' : ' · <span class="badge">non démarrée</span>'}</b><span class="li-sub">${sub}</span></div><div class="li-act li-act-col">${acts}</div>`;
    if (started) el.querySelector('[data-fin]').addEventListener('click', () => {
      const a = (t.arrets || [])[firstOpenArret(t)]; if (!a) { renderHome(); return; }
      if (!arretActeOK(a)) { currentTour = JSON.parse(JSON.stringify(t)); openEditor(); return; } // aucun cheval coché → ouvrir la tournée pour cocher Parage/Visite
      modalPayment(t, a, renderHome, () => { if (typeof a.validatedAt !== 'number') a.validatedAt = Date.now(); const i = tournees.findIndex((x) => x.id === t.id); if (i >= 0) { tournees[i] = t; saveTournees(); } });
    });
    else {
      el.querySelector('[data-recover]').addEventListener('click', () => recoverTour(t));
      el.querySelector('[data-report]').addEventListener('click', () => { if (confirm('Reporter tous les RDV de cette tournée ? Les clients rejoindront « Replacer un RDV » pour fixer une nouvelle date.')) reportAllTour(t); });
      el.querySelector('[data-del]').addEventListener('click', () => { if (confirm('Supprimer définitivement cette tournée non démarrée du ' + fmtDateFr(t.date) + ' ?')) { deleteTourById(t.id); renderHome(); } });
    }
    list.appendChild(el);
  });
}
function renderHomeTrajet() {
  const box = $('homeTrajet'); if (!box) return; box.innerHTML = '';
  const todays = [...tournees].filter((t) => statusOf(t) === 'active' && !isOverdue(t)).sort((a, b) => (a.date || '').localeCompare(b.date || '')); // du jour ; les dépassées (jour passé) vont dans la section dédiée
  const card = $('homeTrajetCard'); if (card) card.classList.toggle('min', todays.length === 0); // minimisé s'il n'y a pas de tournée du jour
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
    const depEst = estimatedDepartureHM(t);
    if (!t.startedAt) ctrl.innerHTML = '<button class="btn small primary" data-start>▶ Démarrer la tournée</button>' + (depEst ? `<span class="tt-info">🚕 Départ estimé : <b>${depEst}</b></span>` : '');
    else if (!t.endedAt) ctrl.innerHTML = `<span class="tt-info">⏱ Démarrée à ${hm(t.startedAt)}</span><span class="li-sub">Validez chaque arrêt, puis « Clôturer » au retour.</span>`;
    else ctrl.innerHTML = `<span class="tt-info">✅ ${hm(t.startedAt)} → ${hm(t.endedAt)} · ${durHm(t.endedAt - t.startedAt)}</span>`;
    box.appendChild(ctrl);
    const sb = ctrl.querySelector('[data-start]'); if (sb) sb.addEventListener('click', () => { t.startedAt = Date.now(); persistTour(); renderHomeTrajet(); });
    const mins = legMinutesFor(t);
    const firstOpen = firstOpenArret(t); // ordre imposé : on n'agit sur un arrêt que si tous les précédents sont finalisés
    (t.arrets || []).forEach((a, i) => {
      const seqLocked = !!t.startedAt && i > firstOpen; // arrêt suivant verrouillé tant que l'arrêt courant n'est pas finalisé
      const adresse = addrStr(a.addr);
      const chNames = (a.clients || []).flatMap((cl) => (cl.chevaux || []).filter(chevalPresent).map((c) => c.nom)).filter(Boolean).join(', ');
      const hhArr = arretHeure(a); // heure de RDV de l'arrêt (1 par arrêt)
      const cl0 = (a.clients || [])[0] || {}; const c0 = clients.find((x) => x.id === cl0.clientId) || {};
      const est = mins[i] != null ? Math.round(mins[i]) : null;                       // temps estimé (précalculé)
      const real = (typeof a.realMin === 'number') ? a.realMin : null;                 // temps réel encodé (bouton Route)
      const trajet = real != null ? durMin(real) : (est != null ? durMin(est) : '—'); // SMS : réel si encodé, sinon estimé
      const trajetLbl = (est != null ? durMin(est) + ' est.' : '—') + (real != null ? ' · <b>' + durMin(real) + ' réel</b>' : '');
      const el = document.createElement('div'); el.className = 'list-item';
      // « Paiement & clôture » : ouvre le paiement ; l'enregistrement (valide) clôture l'arrêt. Verrouillé si : non démarrée, arrêt précédent non finalisé, aucun cheval coché, ou déjà clôturé.
      const validated = typeof a.validatedAt === 'number';
      const acteOK = arretActeOK(a);
      const clotDis = !t.startedAt || seqLocked || validated || !acteOK;
      const clotTitle = !t.startedAt ? 'Démarrez d\'abord la tournée' : (seqLocked ? 'Finalisez d\'abord l\'arrêt précédent' : (!acteOK ? 'Cochez au moins un cheval (Parage ou Visite) — ouvrez la tournée' : (validated ? 'Arrêt clôturé (corrections via la tournée ou la Compta)' : 'Encaisser le paiement puis clôturer cet arrêt')));
      const clotBtn = `<button class="btn small${clotDis ? (validated ? ' done' : '') : ' primary'}" data-valid${clotDis ? ' disabled' : ''} title="${clotTitle}">${validated ? '✓ clôturé ' + hm(a.validatedAt) : '💶 Paiement & clôture'}</button>`;
      const validLbl = validated ? ' · ✅ ' + hm(a.validatedAt) : '';
      // Statut d'avancement de l'arrêt (visuel) : à faire / à finaliser / en attente (ordre) / à compléter / clôturé.
      let arState = 'à faire', arCls = '';
      if (t.startedAt) { if (validated) { arState = '✅ clôturé'; arCls = 'ok'; } else if (seqLocked) { arState = '⏳ en attente'; arCls = 'wait'; } else if (!acteOK) { arState = '⚠ cocher un cheval'; arCls = 'warn'; } else { arState = '➡ à finaliser'; arCls = 'now'; } }
      if (arCls === 'now') el.classList.add('arret-now');
      if (isAddrNoir(a.addr)) el.classList.add('arret-noir');
      el.innerHTML = `<div class="li-main"><b>${hhArr ? '🕘 ' + esc(hhArr) + ' · ' : ''}${i + 1}. ${esc(labelFor(a)) || '<i>client ?</i>'}</b> <span class="ar-state ${arCls}">${arState}</span>${isAddrNoir(a.addr) ? ' <span class="badge badge-noir">⛔ liste noire</span>' : ''}<span class="li-sub">📍 ${esc(adresse) || '<i>adresse ?</i>'}${chNames ? ' · 🐴 ' + esc(chNames) : ''} · 🕒 ${trajetLbl}${validLbl}</span></div>
        <div class="li-act"><button class="btn small" data-agir${seqLocked ? ' disabled title="Finalisez d\'abord l\'arrêt précédent"' : ''}>⚡ Agir</button> ${clotBtn}</div>`;
      // « Agir » : regroupe Waze / Route / SMS / Ticket dans une modale (évite la surcharge de boutons).
      const smsAction = () => modalSmsChoice(c0, smsDataFor(c0, { cheval: chNames, trajet, adresse }));
      const ticketAction = async (btn) => {
        const m = (t.result && t.result.parClient) ? t.result.parClient.find((x) => x.clientId === cl0.clientId) : null;
        let txt = `Trajet vers ${adresse}\n  Estimé : ${est != null ? durMin(est) : '—'} · Réel : ${real != null ? durMin(real) : 'non renseigné'}\n\n`;
        txt += recapText(t.result, t);
        txt += '\n\n————— DÉTAIL CLIENT —————\n' + (m ? invoiceTextForClient(m, (t.payments || {})[cl0.clientId]) : '(Détail indisponible — ouvrez la tournée et laissez-la se calculer.)');
        try { await navigator.clipboard.writeText(txt); btn.textContent = 'Ticket copié ✔'; setTimeout(() => { btn.textContent = 'Ticket'; }, 1500); } catch { alert(txt); }
      };
      const agirBtn = el.querySelector('[data-agir]'); if (agirBtn && !seqLocked) agirBtn.addEventListener('click', () => {
        const c0id = (a.clients && a.clients[0]) ? a.clients[0].clientId : null;
        const pretDone = (a.clients || []).some((cl) => { const cc = clients.find((x) => x.id === cl.clientId); return cc && (cc.prets || []).length; });
        modalActions('Actions — ' + (labelFor(a) || 'arrêt'), [
          { label: '🕘 Heure RDV', done: !!arretHeure(a), keepOpen: true, onClick: () => modalHeureRdv(t, a) },
          { label: navLabel(), onClick: () => openNav(a.addr) },
          { label: 'Route (temps réel)', done: typeof a.realMin === 'number', onClick: () => modalRouteTime(t, a, est, renderHomeTrajet) },
          { label: 'SMS', keepOpen: true, onClick: smsAction },
          { label: 'Ticket', keepOpen: true, onClick: ticketAction },
          { label: '＋ Prêt', done: pretDone, onClick: () => { if (a.clients.length === 1) modalPret(a.clients[0].clientId, t); else modalActions('Prêt — quel client ?', a.clients.map((cl) => ({ label: clientName(cl.clientId), onClick: () => modalPret(cl.clientId, t) }))); } },
          { label: '💶 Paiement', done: arretPaiementDone(t, a), onClick: () => modalPayment(t, a, renderHomeTrajet, () => { if (typeof a.validatedAt !== 'number') a.validatedAt = Date.now(); persistTour(); }) },
          { label: '📅 RDV', done: !!a.rdvDone, onClick: () => { if (c0id) modalRDV(t, a, c0id, renderHomeTrajet); } },
          { label: '📧 Email au client', keepOpen: true, onClick: () => { const cls = a.clients || []; if (cls.length === 1) modalEmailClient(clients.find((x) => x.id === cls[0].clientId)); else if (cls.length) modalActions('Email — quel client ?', cls.map((cl) => ({ label: clientName(cl.clientId), onClick: () => modalEmailClient(clients.find((x) => x.id === cl.clientId)) }))); } },
        ]);
      });
      const vb = el.querySelector('[data-valid]'); if (vb && !clotDis) vb.addEventListener('click', () => modalPayment(t, a, renderHomeTrajet, () => { if (typeof a.validatedAt !== 'number') a.validatedAt = Date.now(); persistTour(); })); // paiement enregistré (valide) → clôture l'arrêt (heure = 1re validation) ; verrouillé une fois clôturé
      box.appendChild(el);
    });
    // ----- Retour → domicile/arrivée : « Agir » (Waze + Route retour) + « Clôturer tournée » (inactif tant que non démarrée) -----
    {
      const started = !!t.startedAt;
      const retAddr = returnAddrOf(t);
      const R = t.result; const mpk = (R && R.totalKm > 0 && R.totalMin) ? (R.totalMin / R.totalKm) : (60 / (S.vitesseKmh || 90));
      const estRet = (R && R.kmLastHome != null) ? Math.round(R.kmLastHome * mpk) : null;
      const realRet = (typeof t.returnRealMin === 'number') ? t.returnRealMin : null;
      const retLbl = (estRet != null ? durMin(estRet) + ' est.' : '—') + (realRet != null ? ' · <b>' + durMin(realRet) + ' réel</b>' : '') + (t.endedAt ? ' · ✅ ' + hm(t.endedAt) : '');
      const rr = document.createElement('div'); rr.className = 'list-item';
      const closeBtn = t.endedAt ? '<button class="btn small done" disabled>✅ Clôturée</button>' : ` <button class="btn small${started ? ' primary' : ''}" data-close${started ? '' : ' disabled'} title="${started ? 'Clôture la tournée (figée)' : 'Démarrez d\'abord la tournée'}">Clôturer tournée</button>`;
      rr.innerHTML = `<div class="li-main"><b>🏁 Retour</b><span class="li-sub">📍 ${esc(addrStr(retAddr)) || 'domicile'} · 🕒 ${retLbl}</span></div>
        <div class="li-act"><button class="btn small" data-agir>⚡ Agir</button>${closeBtn}</div>`;
      rr.querySelector('[data-agir]').addEventListener('click', () => modalActions('Retour', [
        { label: navLabel(), onClick: () => openNav(retAddr) },
        { label: 'Route (temps réel du retour)', onClick: () => modalReturnTime(t, estRet, renderHomeTrajet) },
      ]));
      const cb = rr.querySelector('[data-close]'); if (cb && started) cb.addEventListener('click', () => { const blk = tourFinalizeBlock(t); if (blk.length) { alert('🔒 Clôture impossible — chaque arrêt doit être finalisé (💶 Paiement & clôture) :\n\n• ' + blk.join('\n• ')); return; } if (!confirm('Clôturer la tournée ? Elle sera figée (non modifiable).')) return; t.endedAt = Date.now(); t.closed = true; persistTour(); renderHome(); });
      box.appendChild(rr);
    }
  });
}
// Modale d'actions génériques (« Agir ») : liste de boutons. keepOpen = ne ferme pas la modale (feedback copie).
// Chaque action : { label, onClick, keepOpen?, done? (✓ vert = élément déjà encodé/fait), disabled? }.
function modalActions(title, actions) {
  openModal(`<div class="modal-head"><b>${esc(title)}</b><button class="x" id="mX">✕</button></div>
    <div class="actions-col">${actions.map((a, idx) => `<button class="btn block${a.done ? ' done' : ''}" data-ai="${idx}"${a.disabled ? ' disabled' : ''}>${a.label}${a.done ? ' ✓' : ''}</button>`).join('')}</div>`);
  $('mX').addEventListener('click', closeModal);
  actions.forEach((a, idx) => { const b = document.querySelector(`[data-ai="${idx}"]`); if (b && !a.disabled) b.addEventListener('click', () => { if (a.keepOpen) a.onClick(b); else { closeModal(); a.onClick(b); } }); });
}
// Heure de RDV par cheval (depuis « Agir ») : saisie individuelle de l'heure de chaque cheval de l'arrêt.
function modalHeureRdv(t, a) {
  const chs = []; (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => { if (!chevalCancelled(cv)) chs.push({ cv, cid: cl.clientId }); }));
  openModal(`<div class="modal-head"><b>🕘 Heure de RDV par cheval</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Saisissez l'heure de rendez-vous de chaque cheval de cet arrêt.</p>
    <div id="hrList"></div>
    <div class="actions"><button class="btn primary block" id="hrOk">Enregistrer</button></div>`);
  const box = $('hrList');
  chs.forEach((it, idx) => { const row = document.createElement('label'); row.innerHTML = `🐴 ${esc(it.cv.nom)} <span class="li-sub">— ${esc(clientName(it.cid))}</span><input type="time" data-h="${idx}" value="${it.cv.heure || ''}"/>`; box.appendChild(row); });
  if (!chs.length) box.innerHTML = '<p class="hint">Aucun cheval à cet arrêt.</p>';
  $('mX').addEventListener('click', closeModal);
  $('hrOk').addEventListener('click', () => {
    box.querySelectorAll('[data-h]').forEach((inp) => { chs[+inp.dataset.h].cv.heure = inp.value || ''; });
    const i = tournees.findIndex((x) => x.id === t.id); if (i >= 0) { tournees[i] = t; saveTournees(); } else { const ai = archive.findIndex((x) => x.id === t.id); if (ai >= 0) { archive[ai] = t; saveArchive(); } }
    scheduleCalPush(t); closeModal(); renderHomeTrajet();
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
// Prêt d'un objet à un client (mémoire par client, rappelée aux tournées suivantes jusqu'à récupération).
function modalPret(clientId, tour) {
  const c = clients.find((x) => x.id === clientId); if (!c) return;
  openModal(`<div class="modal-head"><b>🎁 Prêt à ${esc(fullName(c))}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Notez l'objet prêté au client. Il sera rappelé à ses prochaines tournées, sous les articles de l'arrêt (hors facture), jusqu'à ce que vous le marquiez « Récupéré ».</p>
    <label>Objet prêté<input type="text" id="pretText" placeholder="ex. cloche, chaussure de marche, tapis…" /></label>
    <div class="actions"><button class="btn primary block" id="pretOk">Enregistrer le prêt</button></div>`);
  $('mX').addEventListener('click', closeModal);
  const inp = $('pretText'); if (inp) inp.focus();
  $('pretOk').addEventListener('click', () => { const txt = $('pretText').value.trim(); if (!txt) { closeModal(); return; } if (!Array.isArray(c.prets)) c.prets = []; c.prets.push({ id: uid(), text: txt, date: (tour && tour.date) || todayStr(), sourceTourId: tour ? tour.id : null }); saveClients(); closeModal(); renderEditorArrets(); });
}
// Choix de la prestation « Visite » d'un cheval (modale) → onPick(id | undefined si annulé).
function modalVisitePick(nom, currentId, visArts, onPick) {
  openModal(`<div class="modal-head"><b>Prestation « Visite » — ${esc(nom)}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Choisissez la prestation dans le catalogue (Gestion → Articles, case « Visite »). Elle s'ajoute à la facture de ce cheval.</p>
    <div class="actions-col">${visArts.map((x) => `<button class="btn block${x.id === currentId ? ' primary' : ''}" data-vid="${x.id}">${esc(x.libelle)} · ${eur(x.prixHT)}</button>`).join('')}</div>`);
  $('mX').addEventListener('click', () => { closeModal(); onPick(undefined); });
  document.querySelectorAll('[data-vid]').forEach((b) => b.addEventListener('click', () => { closeModal(); onPick(b.dataset.vid); }));
}
// Verrou compta : annulation impossible si la démarche du couple tour-client est validée, ou le liquide du mois encodé.
function comptaLocked(tour, clientId) {
  if (!tour) return false;
  if (S.comptaDemarche && S.comptaDemarche[tour.id + ':' + clientId]) return true;
  const ym = (tour.date || '').slice(0, 7); const st = S.comptaStatus && S.comptaStatus[ym];
  return !!(st && st.liquide === 'encode');
}
// Montant RÉELLEMENT facturé (post-réduction, tarif figé) d'un cheval : lu dans le résultat figé de la tournée
// (part du cheval dans les lignes d'articles + son matériel), hors déplacement. Repli tarif plein si résultat absent.
function chevalInvoicedTTC(tour, clientId, cv) {
  const R = tour && tour.result;
  const m = R && R.parClient && R.parClient.find((x) => x.clientId === clientId);
  if (!m) return chevalWouldBeTTC(cv);
  const nn = norm(cv.nom); let ttc = 0;
  (m.articles || []).forEach((a) => {
    if (a.impaye) return;
    const names = (a.chevaux || []).map(norm); const idx = names.indexOf(nn);
    if (idx < 0) return;
    const share = a.qtesByNom ? ((a.qtesByNom[a.chevaux[idx]] || 1) / (a.qte || 1)) : (1 / ((a.chevaux || []).length || 1));
    ttc += (a.ttc || 0) * share; // a.ttc est déjà net de réduction (parage/visite remisés)
  });
  (m.materiel || []).forEach((mt) => { if (norm(mt.nom) === nn) ttc += (mt.ttc || 0); });
  return ttc;
}
// Crée une note de crédit (RDV payé annulé) : montant = ce que le cheval a réellement été facturé (post-réduction). Retourne l'id.
function createCreditNote(clientId, tour, cv, motif, note) {
  const id = uid();
  S.notesCredit.push({ id, clientId, clientNom: clientName(clientId), tourId: tour.id, tourDate: tour.date, chevalNom: cv.nom, montantTTC: chevalInvoicedTTC(tour, clientId, cv), motif: motif || 'client', note: note || '', date: todayStr(), rembourse: false, rembourseAt: null });
  saveSettings();
  return id;
}
// Annuler / reporter le RDV d'un cheval. opts : { cv, clientId, tour, paid, locked, onDone }.
// RDV payé → une note de crédit (à rembourser par virement) est créée en plus. Période compta validée → bloqué.
function modalCancelRdv(nom, opts) {
  const cv = opts.cv;
  if (opts.locked) {
    openModal(`<div class="modal-head"><b>Période verrouillée — ${esc(nom)}</b><button class="x" id="mX">✕</button></div>
      <p class="hint">La démarche comptable de cette période est déjà validée : l'annulation n'est plus possible (règle immuable). Corrigez avant la clôture de la démarche du mois/trimestre.</p>
      <div class="actions"><button class="btn block" id="cxClose">Fermer</button></div>`);
    $('mX').addEventListener('click', closeModal); $('cxClose').addEventListener('click', closeModal);
    return;
  }
  if (chevalCancelled(cv)) {
    const lbl = cv.cancel.status === 'reporte' ? 'reporté' : 'annulé';
    if (cv.cancel.credited) { // RDV PAYÉ annulé (note de crédit émise) : rétablissement IMPOSSIBLE — on ne touche jamais à une NC. Refacturation éventuelle = à la main.
      openModal(`<div class="modal-head"><b>RDV payé ${lbl} — ${esc(nom)}</b><button class="x" id="mX">✕</button></div>
        <p class="hint">Motif : <b>${cv.cancel.reason === 'pro' ? 'professionnel' : 'client'}</b>${cv.cancel.note ? ' · ' + esc(cv.cancel.note) : ''}. Une <b>note de crédit</b> a été émise pour ce RDV (Compta → Notes de crédit).</p>
        <p class="hint">Ce RDV ne peut pas être rétabli automatiquement : on ne modifie jamais une facture encaissée ni sa note de crédit. Si vous devez refacturer ce cheval, <b>ajoutez-le manuellement à un arrêt d'une tournée</b> — la comptabilité repart alors proprement.</p>
        <div class="actions"><button class="btn block" id="cxClose">Fermer</button></div>`);
      $('mX').addEventListener('click', closeModal); $('cxClose').addEventListener('click', closeModal);
      return;
    }
    openModal(`<div class="modal-head"><b>RDV ${lbl} — ${esc(nom)}</b><button class="x" id="mX">✕</button></div>
      <p class="hint">Motif : <b>${cv.cancel.reason === 'pro' ? 'professionnel' : 'client'}</b>${cv.cancel.note ? ' · ' + esc(cv.cancel.note) : ''}.</p>
      <div class="actions"><button class="btn primary block" id="cxRestore">↩ Rétablir ce RDV</button></div>`);
    $('mX').addEventListener('click', closeModal);
    $('cxRestore').addEventListener('click', () => { cv.cancel = null; closeModal(); opts.onDone(); });
    return;
  }
  let status = 'annule', reason = 'client';
  openModal(`<div class="modal-head"><b>Annuler / reporter — ${esc(nom)}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Le RDV de ce cheval est retiré de la facture et des stats. Les autres clients et le calcul de la tournée ne changent pas.${opts.paid ? ' <b>Ce RDV a été payé → une note de crédit (à rembourser par virement) sera créée.</b>' : ''}</p>
    <label>Type</label><div class="seg" id="cxStatus"><button type="button" class="seg-btn on" data-st="annule">Annulé</button><button type="button" class="seg-btn" data-st="reporte">Reporté</button></div>
    <label>Motif</label><div class="seg" id="cxReason"><button type="button" class="seg-btn on" data-rs="client">Client</button><button type="button" class="seg-btn" data-rs="pro">Professionnel</button></div>
    <label>Note (facultatif)<input type="text" id="cxNote" placeholder="ex. absent, cheval malade…" /></label>
    <div class="actions"><button class="btn primary block" id="cxOk">Confirmer</button></div>`);
  $('mX').addEventListener('click', closeModal);
  document.querySelectorAll('#cxStatus .seg-btn').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('#cxStatus .seg-btn').forEach((x) => x.classList.toggle('on', x === b)); status = b.dataset.st; }));
  document.querySelectorAll('#cxReason .seg-btn').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('#cxReason .seg-btn').forEach((x) => x.classList.toggle('on', x === b)); reason = b.dataset.rs; }));
  $('cxOk').addEventListener('click', () => {
    const note = $('cxNote').value.trim();
    cv.cancel = { status, reason, note, at: new Date().toISOString(), replacedTourId: null, credited: false };
    if (opts.paid) { cv.cancel.creditNoteId = createCreditNote(opts.clientId, opts.tour, cv, reason, note); cv.cancel.credited = true; } // RDV payé : facture figée conservée + note de crédit ; le cheval reste facturé (chevalBilled) pour éviter la double réduction du CA
    closeModal(); opts.onDone();
  });
}
// Corriger les prestations d'une tournée CLÔTURÉE : réactive un cheval « présent » mais sans acte coché (ancien modèle « présent »
// → migré vers parage/visite : ces chevaux étaient devenus INACTIFS = ni déplacement ni matériel facturés, stats vides).
function modalEditPrestations(t) {
  const visArts = (S.articlesCatalogue || []).filter((x) => x.visite);
  const rows = [];
  (t.arrets || []).forEach((a, ai) => (a.clients || []).forEach((cl) => (cl.chevaux || []).forEach((cv) => {
    if (chevalCancelled(cv)) return; // les annulés se gèrent via « Annuler une facturation »
    rows.push({ cv, nom: cv.nom, clientNom: clientName(cl.clientId), legacy: !cv.parage && !cv.visite && !cv.fourbure && !cv.npas && !cv.infection });
  })));
  if (!rows.length) { alert('Aucun cheval à corriger sur cette tournée.'); return; }
  let html = `<div class="modal-head"><b>✏️ Corriger les prestations — ${esc(fmtDateFr(t.date))}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Cochez les prestations réellement effectuées. Un cheval sans aucune prestation cochée n'est <b>pas facturé</b> (ni déplacement, ni matériel) et n'apparaît pas dans les statistiques. Les lignes en <b>orange</b> sont d'anciennes tournées où aucune prestation n'a jamais été cochée.</p>
    <table class="patho-tbl"><thead><tr><th>Cheval</th><th>Parage</th>${S.fourbureHT > 0 ? '<th>Fourbure</th>' : ''}${S.npasHT > 0 ? '<th>NPAS</th>' : ''}${S.infectionHT > 0 ? '<th>Infection</th>' : ''}${visArts.length ? '<th>Visite</th>' : ''}</tr></thead><tbody>`;
  rows.forEach((r, i) => {
    const cv = r.cv;
    html += `<tr${r.legacy ? ' style="background:#fff3e0"' : ''}><td>🐴 ${esc(r.nom)} <span class="li-sub">— ${esc(r.clientNom)}</span></td>`;
    html += `<td><input type="checkbox" data-p="${i}" data-k="parage" ${cv.parage ? 'checked' : ''}/></td>`;
    if (S.fourbureHT > 0) html += `<td><input type="checkbox" data-p="${i}" data-k="fourbure" ${cv.fourbure ? 'checked' : ''}/></td>`;
    if (S.npasHT > 0) html += `<td><input type="checkbox" data-p="${i}" data-k="npas" ${cv.npas ? 'checked' : ''}/></td>`;
    if (S.infectionHT > 0) html += `<td><input type="checkbox" data-p="${i}" data-k="infection" ${cv.infection ? 'checked' : ''}/></td>`;
    if (visArts.length) html += `<td><input type="checkbox" data-p="${i}" data-k="visite" ${cv.visite ? 'checked' : ''}/></td>`;
    html += `</tr>`;
  });
  html += `</tbody></table>${visArts.length ? '<p class="hint">« Visite » cochée sans prestation choisie → la 1ʳᵉ prestation « Visite » du catalogue est utilisée (modifiable en rouvrant la tournée si besoin).</p>' : ''}
    <div class="actions"><button class="btn primary block" id="epOk">Enregistrer et recalculer</button></div>`;
  openModal(html);
  $('mX').addEventListener('click', closeModal);
  $('epOk').addEventListener('click', async () => {
    $('modalBox').querySelectorAll('[data-p]').forEach((inp) => { rows[+inp.dataset.p].cv[inp.dataset.k] = inp.checked; });
    rows.forEach((r) => { const cv = r.cv; if (cv.visite && !cv.visiteArtId && visArts.length) cv.visiteArtId = visArts[0].id; if (!cv.visite) cv.visiteArtId = null; if (!cv.parage && !cv.visite) { cv.fourbure = false; cv.npas = false; cv.infection = false; } });
    currentTour = t; closeModal();
    // Recalcul argent : réutilise la géométrie figée si elle est cohérente ; sinon recalcul COMPLET depuis les adresses (garantit la reprise du déplacement/matériel).
    if (recomputeTourLocal(t)) persistCurrentTour();
    else await calcTour(false);
    const R = currentTour && currentTour.result;
    const recap = 'Prestations mises à jour.\n\n• déplacement HT : ' + eur((R && R.htDeplacement) || 0) + '\n• matériel HT : ' + eur((R && R.materielHT) || 0) + '\n• total TTC : ' + eur((R && R.totalTTC) || 0) + (R && R.htDeplacement > 0 ? '' : '\n\n⚠ Déplacement toujours à 0 : ' + ((R && R.totalKm) ? 'tarif/km à 0 (Réglages → Véhicule).' : 'aucun km (adresses à re-géolocaliser).'));
    // Paiement liquide : le total a changé → l'arrondi caisse (montant encaissé) doit être ressaisi, sinon la facture reste bloquée à l'ancien montant encaissé.
    const adj = cashClientsNeedingArrondi(currentTour);
    if (adj.length) { modalAdjustArrondi(currentTour, adj, recap); return; }
    refreshEverywhere(); openEditor();
    alert(recap);
  });
}
// Clients payés en LIQUIDE dont l'arrondi caisse est périmé (montant encaissé ≠ total facturé recalculé) → l'arrondi doit être ressaisi (obligatoire, avec ou sans facture).
function cashClientsNeedingArrondi(t) {
  const out = []; const R = t && t.result; if (!R || !R.parClient) return out;
  R.parClient.forEach((m) => {
    const p = (t.payments || {})[m.clientId];
    if (!p || p.method !== 'liquide' || (m.totalTTC || 0) <= 0.005) return;
    const rect = (p.rectifie != null) ? p.rectifie : (p.montantPaye != null && !p.partiel ? p.montantPaye : null);
    if (rect == null || Math.abs(rect - m.totalTTC) > 1.5) out.push({ clientId: m.clientId, nom: clientName(m.clientId), total: m.totalTTC });
  });
  return out;
}
// Annuler une facturation sur une tournée CLÔTURÉE (figée) : choisir tournée entière / arrêt / client / cheval.
// Retire SEULEMENT la part de facture (géométrie, km, temps, route, autres clients : inchangés → recalcul LOCAL qui réutilise la géométrie figée) et met à jour les stats (tournée + globales).
// Règles note de crédit : virement + facture → NC obligatoire ; liquide, liquide+facture, virement sans facture → suppression de la répartition SANS NC.
function modalCancelBilling(t) {
  const groups = [];
  (t.arrets || []).forEach((a, ai) => {
    const clientsG = [];
    (a.clients || []).forEach((cl) => {
      const chs = (cl.chevaux || []).filter((cv) => chevalFait(cv)); // annulables = acte fait, pas déjà annulé
      if (!chs.length) return;
      const p = (t.payments || {})[cl.clientId] || {};
      clientsG.push({ clientId: cl.clientId, nom: clientName(cl.clientId), chevaux: chs, method: p.method || null, fac: !!p.facture, nc: p.method === 'virement', locked: comptaLocked(t, cl.clientId) }); // virement → NC obligatoire (avec OU sans facture)
    });
    if (clientsG.length) groups.push({ ai, label: labelFor(a) || ('Arrêt ' + (ai + 1)), clients: clientsG });
  });
  if (!groups.length) { alert('Aucune facturation annulable sur cette tournée (déjà annulée, ou rien de facturé).'); return; }
  let reason = 'client';
  let html = `<div class="modal-head"><b>🚫 Annuler une facturation — ${esc(fmtDateFr(t.date))}</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Cochez ce que vous voulez retirer de la facture : la tournée entière, un arrêt, un client ou un cheval. Le trajet, les kilomètres, le temps et les autres clients ne changent pas — seule la part facturée est retirée, et les statistiques sont mises à jour.</p>
    <label class="chk2"><input type="checkbox" id="cbAll"/> <b>Toute la tournée</b></label>
    <div id="cbTree" style="margin:6px 0 4px 0">`;
  groups.forEach((g) => {
    html += `<div class="cb-arret" style="margin:8px 0 2px 0"><label class="chk2"><input type="checkbox" data-arret="${g.ai}"/> <b>${esc(g.label)}</b></label>`;
    g.clients.forEach((c) => {
      const key = g.ai + ':' + c.clientId;
      const tag = c.locked ? ' <span class="li-sub">🔒 période comptable verrouillée</span>' : (c.nc ? ' <span class="li-sub">→ note de crédit (virement)</span>' : (c.method === 'liquide' ? ' <span class="li-sub">→ suppression liquide, pas de NC</span>' : ' <span class="li-sub">non payé → suppression</span>'));
      html += `<div style="padding-left:14px"><label class="chk2"><input type="checkbox" data-client="${key}"${c.locked ? ' disabled' : ''}/> <b>${esc(c.nom)}</b>${tag}</label>`;
      c.chevaux.forEach((cv) => { html += `<div style="padding-left:16px"><label class="chk2"><input type="checkbox" data-cv="${key}:${cv.id != null ? cv.id : ''}" data-nom="${esc(cv.nom)}"${c.locked ? ' disabled' : ''}/> 🐴 ${esc(cv.nom)}</label></div>`; });
      html += `</div>`;
    });
    html += `</div>`;
  });
  html += `</div>
    <label>Motif</label><div class="seg" id="cbReason"><button type="button" class="seg-btn on" data-rs="client">Client</button><button type="button" class="seg-btn" data-rs="pro">Professionnel</button></div>
    <label>Note (facultatif)<input type="text" id="cbNote" placeholder="ex. erreur de facturation, geste commercial…"/></label>
    <div class="actions"><button class="btn danger block" id="cbOk">Annuler les facturations cochées</button></div>`;
  openModal(html);
  $('mX').addEventListener('click', closeModal);
  const box = $('cbTree');
  $('cbAll').addEventListener('change', (e) => box.querySelectorAll('input[type=checkbox]:not(:disabled)').forEach((c) => (c.checked = e.target.checked)));
  box.querySelectorAll('[data-arret]').forEach((ac) => ac.addEventListener('change', (e) => box.querySelectorAll(`[data-client^="${ac.dataset.arret}:"]:not(:disabled),[data-cv^="${ac.dataset.arret}:"]:not(:disabled)`).forEach((c) => (c.checked = e.target.checked))));
  box.querySelectorAll('[data-client]').forEach((cc) => cc.addEventListener('change', (e) => box.querySelectorAll(`[data-cv^="${cc.dataset.client}:"]:not(:disabled)`).forEach((c) => (c.checked = e.target.checked))));
  document.querySelectorAll('#cbReason .seg-btn').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('#cbReason .seg-btn').forEach((x) => x.classList.toggle('on', x === b)); reason = b.dataset.rs; }));
  $('cbOk').addEventListener('click', () => {
    const note = $('cbNote').value.trim();
    const checked = Array.from(box.querySelectorAll('[data-cv]:checked'));
    if (!checked.length) { alert('Cochez au moins un cheval, client ou arrêt à annuler.'); return; }
    let nNC = 0, nDel = 0;
    checked.forEach((cb) => {
      const parts = cb.dataset.cv.split(':'); const ai = +parts[0], clientId = parts[1], chId = parts[2];
      const a = t.arrets[ai]; if (!a) return;
      const cl = (a.clients || []).find((x) => x.clientId === clientId); if (!cl) return;
      const cv = (cl.chevaux || []).find((x) => (chId && x.id != null && String(x.id) === chId) || norm(x.nom) === norm(cb.dataset.nom));
      if (!cv || chevalCancelled(cv)) return;
      const p = (t.payments || {})[clientId] || {};
      const nc = p.method === 'virement'; // virement → NC obligatoire (avec ou sans facture) ; liquide → jamais de NC
      cv.cancel = { status: 'annule', reason, note, at: new Date().toISOString(), replacedTourId: null, credited: false };
      if (nc) { cv.cancel.creditNoteId = createCreditNote(clientId, t, cv, reason, note); cv.cancel.credited = true; nNC++; } // NC lit le montant dans le résultat ENCORE figé (avant recalcul)
      else nDel++;
    });
    recomputeTourLocal(t); // recalcul argent uniquement : réutilise la géométrie figée → km/temps/route/autres clients identiques
    currentTour = t; persistCurrentTour(); // conserve t.closed (reste figée)
    // Arrondi caisse : pour les clients LIQUIDE SANS facture partiellement annulés, l'utilisateur rend l'espèce et ré-arrondit le reste.
    // (Facture pro liquide/virement = montants exacts, pas d'arrondi ; virement = NC.)
    const affected = new Set(checked.map((cb) => cb.dataset.cv.split(':')[1]));
    const toAdjust = [];
    affected.forEach((clientId) => {
      const p = (t.payments || {})[clientId];
      if (!p || p.method !== 'liquide') return; // liquide → arrondi obligatoire (avec OU sans facture) ; virement = montants exacts
      const m = t.result && t.result.parClient && t.result.parClient.find((x) => x.clientId === clientId);
      if (!m || (m.totalTTC || 0) <= 0.005) { p.rectifie = null; p.montantPaye = null; return; } // entièrement annulé → plus rien à encaisser
      toAdjust.push({ clientId, nom: clientName(clientId), total: m.totalTTC });
    });
    persistCurrentTour();
    closeModal();
    const msg = `Annulation effectuée : ${nDel} facturation(s) retirée(s)${nNC ? `, ${nNC} note(s) de crédit créée(s)` : ''}.`;
    if (toAdjust.length) modalAdjustArrondi(t, toAdjust, msg);
    else { refreshEverywhere(); openEditor(); alert(msg + ' Stats mises à jour.'); }
  });
}
// Après une annulation partielle, saisie du montant liquide arrondi réellement encaissé (reste) pour les clients liquide SANS facture.
function modalAdjustArrondi(t, list, msg) {
  const stdRate = rate();
  let html = `<div class="modal-head"><b>💶 Arrondi de l'encaissement liquide</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Le total a changé : indiquez le montant liquide réellement <b>encaissé</b> (arrondi à l'euro) pour chaque client payé en espèces. La différence avec le total facturé passe en « arrondi caisse ». Obligatoire pour le liquide (avec ou sans facture).</p><div id="ajList">`;
  list.forEach((c, i) => {
    const m = (t.result && t.result.parClient || []).find((x) => x.clientId === c.clientId);
    const dep = m ? m.htDep * (1 + stdRate) : 0, mat = m ? m.htMat * (1 + stdRate) : 0, art = m ? Math.max(0, m.totalTTC - (m.htDep + m.htMat) * (1 + stdRate)) : 0;
    const p = (t.payments || {})[c.clientId] || {}; const oldEnc = (p.rectifie != null) ? p.rectifie : (p.montantPaye != null ? p.montantPaye : null);
    html += `<div class="pay-block"><h3 style="font-size:.95rem;margin:.3rem 0">${esc(c.nom)}</h3>
      <p class="hint" style="margin:.2rem 0"><b>Total recalculé : ${eur(c.total)}</b><br><span class="li-sub">déplacement ${eur(dep)} · matériel ${eur(mat)} · articles ${eur(art)}${oldEnc != null ? ' · ancien encaissé ' + eur(oldEnc) : ''}</span></p>
      <label>Montant liquide encaissé (arrondi à l'euro)<input type="number" step="1" min="0" inputmode="numeric" data-aj="${i}" value="${Math.round(c.total)}"/></label></div>`;
  });
  html += `</div><div class="actions"><button class="btn primary block" id="ajOk">Enregistrer</button></div>`;
  openModal(html);
  const done = () => { closeModal(); refreshEverywhere(); openEditor(); };
  $('mX').addEventListener('click', done);
  $('ajOk').addEventListener('click', () => {
    $('ajList').querySelectorAll('[data-aj]').forEach((inp) => { const c = list[+inp.dataset.aj]; const p = (t.payments || {})[c.clientId]; if (p) { const v = parseFloat(inp.value); p.rectifie = isFinite(v) ? v : Math.round(c.total); p.montantPaye = null; } });
    currentTour = t; persistCurrentTour();
    done(); if (msg) alert(msg + ' Stats mises à jour.');
  });
}
// Paiement d'un arrêt (par client) : liquide / virement + facture ? + (si liquide) montant réel payé (arrondi caisse).
// onCommit (optionnel) : appelé UNIQUEMENT quand le paiement est enregistré et valide (sert à clôturer l'arrêt).
function modalPayment(t, arret, after, onCommit) {
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
  html += `<p class="status" id="payWarn"></p><div class="actions"><button class="btn primary block" id="payOk">${onCommit ? 'Enregistrer &amp; clôturer l\'arrêt' : 'Enregistrer'}</button></div>`;
  openModal(html);
  $('mX').addEventListener('click', () => { t.payments = paySnapshot; recomputeTourLocal(t); closeModal(); if (after) after(); }); // annulation → restaure les méthodes/montants d'origine
  // Blocage : tant qu'un champ conditionnel manque (mode non choisi, montant liquide vide, ou impayé sans montant), « Enregistrer » est désactivé.
  const blockIssue = (block) => {
    const on = block.querySelector('.pay-method .seg-btn.on'); const method = on ? on.dataset.m : null;
    if (method !== 'liquide' && method !== 'virement') return 'mode de paiement non choisi';
    if (method === 'liquide') {
      if (block.querySelector('[data-rectifie]').value === '') return 'montant liquide non renseigné';
      if (block.querySelector('[data-partiel]').checked) { const iv = block.querySelector('[data-impaye]').value; if (iv === '' || Math.round(parseNum(iv)) <= 0) return 'montant impayé non renseigné'; }
    }
    return null;
  };
  const refreshValidity = () => {
    let issue = null;
    document.querySelectorAll('.pay-block').forEach((block) => { if (issue) return; const iss = blockIssue(block); if (iss) issue = { cid: block.dataset.cid, iss }; });
    const ok = $('payOk'), warn = $('payWarn');
    if (issue) { if (ok) ok.disabled = true; if (warn) warn.textContent = '⚠ ' + clientName(issue.cid) + ' : ' + issue.iss + ' — à compléter pour enregistrer.'; }
    else { if (ok) ok.disabled = false; if (warn) warn.textContent = ''; }
  };
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
      refreshValidity();
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
  refreshValidity();
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
  document.querySelectorAll('[data-rdv]').forEach((b) => b.addEventListener('click', () => { commitPayments(); modalRDV(t, arret, b.dataset.rdv, () => modalPayment(t, arret, after, onCommit)); }));
  $('payOk').addEventListener('click', () => { if ($('payOk').disabled) return; commitPayments(); if (onCommit) onCommit(); closeModal(); if (after) after(); }); // payOk désactivé si incomplet → pas de validation possible
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
  const removed = new Set(); // ids d'impayés supprimés → retirer aussi les articles d'impayé qui les référencent dans d'AUTRES tournées
  clients.forEach((c) => {
    if (!Array.isArray(c.impayes)) return;
    c.impayes.forEach((im) => { if (im.sourceTourId === id) removed.add(im.id); });
    c.impayes = c.impayes.filter((im) => im.sourceTourId !== id);                    // créance NÉE de cette tournée → disparaît avec elle
    c.impayes.forEach((im) => { if (im.collectedTourId === id) { im.collected = false; im.collectedTourId = null; } }); // impayé PERÇU par cette tournée → redevient « à percevoir »
  });
  if (removed.size) { allTours().forEach((t) => { if (t.id !== id && Array.isArray(t.articles)) t.articles = t.articles.filter((a) => !(a.impaye && a.impayeId && removed.has(a.impayeId))); }); saveTournees(); saveArchive(); } // article d'impayé orphelin (référence un impayé supprimé) → retiré
  saveClients();
  // Clés de suivi Compta orphelines (« tourId:clientId » et « …:reste »).
  [S.comptaRecu, S.comptaDemarche].forEach((map) => { if (map) Object.keys(map).forEach((k) => { if (k.split(':')[0] === id) delete map[k]; }); });
  // Événement d'agenda récupéré vers cette tournée → il redevient disponible dans « Items ».
  Object.keys(S.agendaImported || {}).forEach((eid) => { if (S.agendaImported[eid] && S.agendaImported[eid].tourId === id) delete S.agendaImported[eid]; });
  deleteTourCalendar(id); // retire de Google Agenda les RDV poussés pour cette tournée (best-effort)
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
// Applique une heure de RDV à un client dans une tournée : heure de l'ARRÊT (1 par arrêt) + chevaux (legacy) pour compat agenda.
function setChevalHeure(t, clientId, chevalObjs, heure) {
  const ids = new Set((chevalObjs || []).map((h) => h.id));
  (t.arrets || []).forEach((a) => (a.clients || []).forEach((cl) => { if (cl.clientId !== clientId) return; a.heure = heure; (cl.chevaux || []).forEach((cv) => { if (ids.has(cv.id)) cv.heure = heure; }); }));
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
// Modale « RDV » (depuis le paiement) : replacer les chevaux du client. Par défaut tous sur le MÊME RDV (date commune) ;
// chaque cheval peut être placé à une DATE DIFFÉRENTE (case) ou IGNORÉ (non replacé). Les tournées sont créées si besoin.
function modalRDV(t, arret, cid, onDone) {
  const client = clients.find((x) => x.id === cid);
  if (!client) { if (onDone) onDone(); return; }
  const arrCl = (arret.clients || []).find((x) => x.clientId === cid);
  const poolIds = ((arrCl && arrCl.chevaux) || []).map((c) => c.id).filter(Boolean);
  const chevalPool = activeChevaux(client).filter((h) => !poolIds.length || poolIds.includes(h.id));
  const pool = chevalPool.length ? chevalPool : activeChevaux(client);
  const proposed = proposedRdvDate(t.date || todayStr());
  if (!pool.length) { alert('Aucun cheval à replacer pour ce client.'); if (onDone) onDone(); return; }
  const common = { date: proposed }; // date du RDV commun (chevaux « même RDV »)
  const entries = pool.map((h) => ({ id: h.id, nom: h.nom, ignore: false, sep: false, date: proposed }));
  const previewHtml = (d) => { const pv = rdvDayPreview(d); return `<b>${d ? fmtDateFr(d) : '—'}</b> — Arrêts déjà prévus : ${pv.arrets.length ? esc(pv.arrets.join(' · ')) : 'aucune tournée'}${pv.priv.length ? '<br>📅 Agenda privé : ' + pv.priv.map((p) => esc((eventHeure(p) ? eventHeure(p) + ' ' : '') + p.title)).join(' · ') : ''}`; };
  const render = () => {
    openModal(`<div class="modal-head"><b>📅 Programmer le suivi (RDV)</b><button class="x" id="mX">✕</button></div>
      <p class="hint">Client : <b>${esc(fullName(client))}</b>. Par défaut, tous les chevaux sont replacés sur le <b>même RDV</b>. Cochez « date différente » pour placer un cheval un autre jour, ou « ne pas replacer » pour l'ignorer.</p>
      <div class="card" style="margin-bottom:8px"><label>Date du RDV commun<input type="date" id="rdvCommon" value="${common.date}"/></label><p class="hint" id="rdvCommonPrev"></p></div>
      <div id="rdvChevaux"></div>
      <div class="actions"><button class="btn primary block" id="rdvOk">Enregistrer les RDV</button></div>`);
    $('mX').addEventListener('click', () => { closeModal(); if (onDone) onDone(); });
    const cp = $('rdvCommonPrev'); const upCommon = () => { if (cp) cp.innerHTML = previewHtml(common.date); };
    $('rdvCommon').addEventListener('change', (e) => { common.date = e.target.value; upCommon(); });
    upCommon();
    const box = $('rdvChevaux');
    entries.forEach((en) => {
      const wrap = document.createElement('div'); wrap.className = 'card rdv-cheval' + (en.ignore ? ' rdv-ignored' : ''); wrap.style.marginBottom = '8px';
      let inner = `<div class="rdv-ch-head"><b>🐴 ${esc(en.nom)}</b><label class="rdv-ch-opt"><input type="checkbox" data-ign ${en.ignore ? 'checked' : ''}/> ne pas replacer</label></div>`;
      if (!en.ignore) {
        inner += `<label class="rdv-ch-opt"><input type="checkbox" data-sep ${en.sep ? 'checked' : ''}/> date différente</label>`;
        if (en.sep) inner += `<label>Date du RDV<input type="date" data-date value="${en.date}"/></label><p class="hint" data-prev></p>`;
        else inner += `<p class="hint">→ sur le RDV commun</p>`;
      }
      wrap.innerHTML = inner;
      wrap.querySelector('[data-ign]').addEventListener('change', (e) => { en.ignore = e.target.checked; render(); });
      const sep = wrap.querySelector('[data-sep]'); if (sep) sep.addEventListener('change', (e) => { en.sep = e.target.checked; render(); });
      const dt = wrap.querySelector('[data-date]'), prev = wrap.querySelector('[data-prev]');
      if (dt) { const up = () => { if (prev) prev.innerHTML = previewHtml(dt.value); }; dt.addEventListener('change', (e) => { en.date = e.target.value; up(); }); up(); }
      box.appendChild(wrap);
    });
    $('rdvOk').addEventListener('click', () => {
      const byDate = {};
      entries.forEach((en) => { if (en.ignore) return; const d = en.sep ? en.date : common.date; if (!d) return; (byDate[d] = byDate[d] || []).push(en.id); });
      let scheduled = false;
      Object.keys(byDate).forEach((d) => {
        const chevalObjs = (client.chevaux || []).filter((h) => byDate[d].includes(h.id));
        if (chevalObjs.length) { scheduleClientOnDate(d, client, chevalObjs); scheduled = true; }
      });
      if (scheduled && arret) { arret.rdvDone = true; saveTournees(); } // marque l'arrêt : RDV suivant programmé
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
  renderVehiculeStatut();
  renderBlockingArrets();
  renderHomeTrajet();
  renderRdvAPrendre();
  renderComptePhoto();
  fill('homeUpcoming', 'homeUpcomingEmpty', upcoming);
}
function renewFrais(f) { f.date = todayStr(); f.kmDebut = odometer(); saveSettings(); } // nouveau cycle : repart du km actuel
// Section Accueil « Statut véhicule » : visible si relevé du mois dû (rappel mensuel) OU frais à renouveler.
function renderVehiculeStatut() {
  const card = $('homeVehicule'); if (!card) return;
  const due = odoDeclarationDue(), echus = fraisEchus();
  card.classList.toggle('hidden', !due && !echus.length);
  const hint = $('homeVehiculeHint');
  if (hint) { const last = lastOdoReleve();
    if (due) hint.innerHTML = last ? `Nouveau mois : relevez le km réel au compteur (dernier relevé ${km(last.km)} le ${esc(fmtDateFr(last.date))}).` : 'Premier lancement : déclarez le km actuel du compteur pour démarrer le suivi du véhicule.';
    else hint.innerHTML = echus.length ? `${echus.length} frais véhicule à renouveler ci-dessous.` : `Relevé du mois enregistré ✔ — estimé actuel ${km(odometer())}.`;
  }
  const btn = $('homeVehiculeBtn'); if (btn) { btn.style.display = due ? '' : 'none'; btn.onclick = () => modalStatutVehicule(); }
  const box = $('homeFraisEchus'); if (box) { box.innerHTML = '';
    echus.slice(0, 1).forEach((f) => { // 1 seul item ; le reste via la ligne « + N » → page complète
      const el = document.createElement('div'); el.className = 'list-item stack-act';
      const parcouru = odometer() - (f.kmDebut || 0);
      el.innerHTML = `<div class="li-main"><b>🧾 ${esc(f.poste || 'Frais')}</b><span class="li-sub">${f.nature === 'exceptionnel' ? 'exceptionnel épuisé' : 'récurrent à renouveler'} · ${km(Math.max(0, parcouru))} / ${km(f.kmPrevus)}</span></div><div class="li-act"><button class="btn small primary" data-done>✅ Fait</button></div>`;
      el.querySelector('[data-done]').addEventListener('click', () => modalFraisDone(f));
      box.appendChild(el);
    });
    if (echus.length > 1) {
      const more = document.createElement('div'); more.className = 'list-item clickable';
      more.innerHTML = `<div class="li-main"><b>+ ${echus.length - 1} autre(s) à renouveler</b><span class="li-sub">Voir la liste complète (Gestion → Statut véhicule)</span></div><div class="li-act"><span class="li-chev">›</span></div>`;
      more.addEventListener('click', () => { showTab('gestion'); showGestion('statut'); });
      box.appendChild(more);
    }
  }
}
// Stats d'amortissement (Réglages → Configuration) : progression km, montant amorti, âge, km/an, usage privé.
function renderAmortStats() {
  if ($('setVehAchat')) { $('setVehAchat').value = S.vehicule.dateAchat || ''; $('setVehAchat').onchange = (e) => { S.vehicule.dateAchat = e.target.value || ''; saveSettings(); renderAmortStats(); }; }
  if ($('setVehCirc')) { $('setVehCirc').value = S.vehicule.dateMiseEnCirculation || ''; $('setVehCirc').onchange = (e) => { S.vehicule.dateMiseEnCirculation = e.target.value || ''; saveSettings(); renderAmortStats(); }; }
  const box = $('amortStats'); if (!box) return;
  const dv = S.amortissement.dureeVieKm || 0, achat = S.amortissement.achatHT || 0, odo = odometer();
  if (!(dv > 0) || !(achat > 0)) { box.innerHTML = '<p class="hint">Renseignez le prix d\'achat et la durée de vie (km) ci-dessus pour voir l\'amortissement.</p>'; return; }
  const ratio = Math.min(1, odo / dv), pct = ratio * 100;
  const amorti = achat * ratio, reste = Math.max(0, achat - amorti);
  const ageM = S.vehicule.dateMiseEnCirculation ? monthsBetween(S.vehicule.dateMiseEnCirculation) : (S.vehicule.dateAchat ? monthsBetween(S.vehicule.dateAchat) : null);
  const kmAn = (ageM && ageM >= 1) ? Math.round(odo / (ageM / 12)) : null;
  const priv = usagePriveTotal();
  let h = `<div class="inv-line"><span>Odomètre estimé</span><span><b>${km(odo)}</b> / ${km(dv)} (${pct.toFixed(0)} %)</span></div>`;
  h += `<div class="inv-line"><span>Amorti</span><span>${eur(amorti)} sur ${eur(achat)}</span></div>`;
  h += `<div class="inv-line"><span>Reste à amortir</span><span><b>${eur(reste)}</b></span></div>`;
  if (ageM != null) h += `<div class="inv-line"><span>Âge du véhicule</span><span>${durMonthsLabel(ageM)}</span></div>`;
  if (kmAn != null) h += `<div class="inv-line"><span>Km/an (estimé)</span><span>${km(kmAn)}</span></div>`;
  if (Math.abs(priv) >= 1) h += `<div class="inv-line"><span>Usage privé cumulé (hors tournées)</span><span>${priv < 0 ? '−' : ''}${km(Math.abs(priv))}</span></div>`;
  box.innerHTML = h;
}
// Page Gestion « Statut véhicule » : historique mensuel des relevés réels + usage privé.
function renderStatutVehiculePage() {
  const resume = $('statutResume');
  if (resume) { const last = lastOdoReleve(), priv = usagePriveTotal(); resume.innerHTML = `Odomètre estimé : <b>${km(odometer())}</b>${last ? ' · dernier relevé réel ' + km(last.km) + ' le ' + esc(fmtDateFr(last.date)) : ' (aucun relevé)'}${Math.abs(priv) >= 1 ? ' · usage privé cumulé ' + (priv < 0 ? '−' : '') + km(Math.abs(priv)) : ''}.`; }
  const btn = $('btnStatutDeclare'); if (btn) btn.onclick = () => modalStatutVehicule();
  const bmig = $('btnFraisMigration'); if (bmig) bmig.onclick = () => modalFraisMigration();
  const box = $('statutList'); if (!box) return; box.innerHTML = '';
  const list = (S.odoReleves || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if ($('statutEmpty')) $('statutEmpty').style.display = list.length ? 'none' : 'block';
  list.forEach((r) => {
    const el = document.createElement('div'); el.className = 'inv-client';
    let h = `<div class="inv-head"><span>${esc(monthLabel(r.ym || (r.date || '').slice(0, 7)))}</span><span>${km(r.km)}</span></div>`;
    h += `<div class="inv-line"><span>Relevé le</span><span>${esc(fmtDateFr(r.date))}</span></div>`;
    if (typeof r.ecart === 'number') h += `<div class="inv-line"><span>Usage privé (hors tournées)</span><span>${r.ecart < 0 ? '−' : ''}${km(Math.abs(r.ecart))}</span></div>`;
    el.innerHTML = h; box.appendChild(el);
  });
  // Frais à renouveler (échus) : listés ici aussi, même après avoir quitté l'Accueil.
  const fbox = $('statutFraisEchus'); if (fbox) {
    fbox.innerHTML = ''; const echus = fraisEchus();
    if ($('statutFraisEchusEmpty')) $('statutFraisEchusEmpty').style.display = echus.length ? 'none' : 'block';
    echus.forEach((f) => {
      const parcouru = odometer() - (f.kmDebut || 0);
      const el = document.createElement('div'); el.className = 'list-item';
      el.className = 'list-item stack-act';
      el.innerHTML = `<div class="li-main"><b>🧾 ${esc(f.poste || 'Frais')}</b><span class="li-sub">${f.nature === 'exceptionnel' ? 'exceptionnel épuisé' : 'récurrent à renouveler'} · ${km(Math.max(0, parcouru))} / ${km(f.kmPrevus)}${f.date ? ' · dernier entretien le ' + esc(fmtDateFr(f.date)) : ''}</span></div><div class="li-act"><button class="btn small primary" data-done>✅ Entretien fait</button></div>`;
      el.querySelector('[data-done]').addEventListener('click', () => modalFraisDone(f));
      fbox.appendChild(el);
    });
  }
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
  card.innerHTML = `<div class="cl-msg"><div class="li-main"><b>📣 Nouveautés — version ${esc(e.version)}${unread.length > 1 ? ' (+' + (unread.length - 1) + ')' : ''}</b><span class="li-sub">Appuyez pour découvrir les nouveautés et corrections.</span></div><div style="display:flex;gap:8px;align-items:center"><button class="btn small" id="clMarkAll" title="Tout marquer comme lu">✓ Tout lu</button><span class="li-chev">›</span></div></div>`;
  card.onclick = () => openChangelogEntry(e);
  const mb = $('clMarkAll'); if (mb) mb.addEventListener('click', (ev) => { ev.stopPropagation(); markAllChangelogRead(); renderHomeChangelog(); });
}
function markAllChangelogRead() { if (!Array.isArray(S.changelogRead)) S.changelogRead = []; CHANGELOG.forEach((e) => { if (!S.changelogRead.includes(e.version)) S.changelogRead.push(e.version); }); saveSettings(); }
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
// Frais « échus » (à renouveler) : exceptionnel épuisé, ou récurrent dont le cycle km est atteint.
function fraisEchus() {
  const odo = odometer();
  return (S.frais || []).filter((f) => { if (f.parentId) return false; if (!(f.kmPrevus > 0)) return false; const parcouru = odo - (f.kmDebut || 0); return f.nature === 'exceptionnel' ? !fraisActif(f) : (parcouru >= f.kmPrevus); }); // les frais liés suivent l'entretien parent (jamais listés seuls)
}
// Relevé du compteur RÉEL (statut véhicule) : compare à l'estimé, enregistre, calcule l'usage privé.
function modalStatutVehicule() {
  const today = todayStr(); const last = lastOdoReleve();
  openModal(`<div class="modal-head"><b>🚗 Statut véhicule — relevé compteur</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Saisissez le <b>kilométrage réel</b> affiché au compteur, et la <b>date</b> du relevé. ${last ? 'Dernier relevé : <b>' + km(last.km) + '</b> le ' + esc(fmtDateFr(last.date)) + '.' : ''}</p>
    <label>Date du relevé<input type="date" id="svDate" value="${today}" max="${today}"/></label>
    <label>Kilométrage réel (compteur)<input type="number" id="svKm" step="1" min="0" inputmode="numeric"/></label>
    <p class="hint" id="svEcart"></p>
    <p class="hint">Astuce : choisissez une <b>date passée</b> pour ajouter un relevé <b>antérieur</b> (rétroactif) — utile au démarrage pour renseigner un km/date d'avant.</p>
    <div class="actions"><button class="btn primary block" id="svOk">Enregistrer le relevé</button></div>`);
  $('mX').addEventListener('click', closeModal);
  const upd = () => { const v = parseNum($('svKm').value); const date = $('svDate').value || today; const e = $('svEcart'); if (!e) return; if (!(v > 0)) { e.textContent = ''; return; }
    const hasPrev = (S.odoReleves || []).some((r) => r && (r.date || '') < date);
    if (!hasPrev) { e.innerHTML = 'Aucun relevé antérieur : ce sera le <b>point de départ</b> du véhicule à cette date.'; return; }
    const est = estOdoAt(date); const d = v - est;
    e.innerHTML = `Estimé à cette date : <b>${km(est)}</b> · écart <b>${d >= 0 ? '+' : '−'}${km(Math.abs(d))}</b>${Math.abs(d) >= 1 ? ' → usage privé (hors tournées) depuis le relevé précédent' : ''}.`; };
  $('svKm').addEventListener('input', upd); $('svDate').addEventListener('change', upd);
  $('svOk').addEventListener('click', () => { const v = Math.round(parseNum($('svKm').value)); const date = $('svDate').value || today; if (!(v > 0)) { alert('Saisissez le kilométrage réel du compteur.'); return; } if (date > today) { alert('La date ne peut pas être dans le futur.'); return; } declareOdo(v, date); closeModal(); renderHome(); });
}
function modalVehicule() {
  openModal(`<div class="modal-head"><b>📋 Déclarer un événement</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Que voulez-vous faire ?</p>
    <div class="actions"><button class="btn primary block" id="vClient">👤 Créer un client</button></div>
    <div class="actions"><button class="btn block" id="vPlanche">🖼 Planche de contact (photos)</button></div>
    <div class="actions"><button class="btn block" id="vPlein">⛽ Valider un plein (prix du carburant)</button></div>
    <div class="actions"><button class="btn block" id="vConso">🚗 Corriger la consommation</button></div>
    <div class="actions"><button class="btn block" id="vMat">🧰 Frais de matériel</button></div>
    <div class="actions"><button class="btn block" id="vFrais">🧾 Frais véhicule (entretien, achat…)</button></div>
    <div class="actions"><button class="btn block" id="vStatut">🚗 Statut véhicule (relevé compteur)</button></div>
    <div class="actions"><button class="btn block" id="vSync">🔄 Synchroniser (Google Drive)</button></div>
    <p class="status" id="vSyncStatus"></p>
    <div class="actions"><button class="btn block" id="vUpdate">⬇️ Mettre à jour l'application (v${APP_VERSION})</button></div>
    <p class="hint">Cherche une version plus récente publiée et met l'app à jour. Vos données sont conservées.</p>
    <p class="status" id="vUpdateStatus"></p>`);
  $('mX').addEventListener('click', closeModal);
  $('vClient').addEventListener('click', () => { closeModal(); editClient(null); });
  $('vPlanche').addEventListener('click', () => { closeModal(); if (typeof modalPlancheCreate === 'function') modalPlancheCreate('contact', { allowTourPick: true }); else { showTab('gestion'); showGestion('planche'); } });
  $('vStatut').addEventListener('click', () => { closeModal(); modalStatutVehicule(); });
  $('vPlein').addEventListener('click', modalPlein);
  $('vConso').addEventListener('click', modalConso);
  $('vFrais').addEventListener('click', () => { closeModal(); showTab('gestion'); showGestion('vehicule'); });
  $('vMat').addEventListener('click', () => { closeModal(); showTab('gestion'); showGestion('materiel'); });
  // Synchro manuelle immédiate (interactive : peut demander la connexion Google si besoin), puis recharge l'app à jour.
  $('vSync').addEventListener('click', () => { const s = $('vSyncStatus'); if (S.syncMode !== 'drive') { s.className = 'status err'; s.textContent = 'Activez « Synchro Drive » dans Réglages → Synchro (le mode fichier est actif).'; return; } if (!S.googleClientId) { s.className = 'status err'; s.textContent = 'Renseignez d\'abord votre ID client Google dans Réglages → Synchro.'; return; } googleSync(true, s, true); });
  $('vUpdate').addEventListener('click', () => manualCheckForUpdate($('vUpdateStatus')));
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
  if ($('setCalPush')) {
    $('setCalPush').checked = !!S.calPush;
    if ($('calPushWrap')) $('calPushWrap').style.display = S.calPush ? '' : 'none';
    $('setCalPush').addEventListener('change', (e) => { S.calPush = e.target.checked; saveSettings(); if ($('calPushWrap')) $('calPushWrap').style.display = S.calPush ? '' : 'none'; });
  }
  if ($('calPushNow')) $('calPushNow').addEventListener('click', async () => {
    const h = $('calPushStatus');
    if (!S.calPush) { if (h) { h.className = 'status err'; h.textContent = 'Activez d\'abord l\'option ci-dessus.'; } return; }
    if (!S.googleClientId) { if (h) { h.className = 'status err'; h.textContent = 'Renseignez d\'abord votre ID client Google.'; } return; }
    if (h) { h.className = 'status'; h.textContent = 'Envoi vers Google Agenda…'; }
    const ts = allTours().filter((t) => { const s = statusOf(t); return s === 'active' || s === 'avenir' || s === 'cloturee'; }); // RDV du jour + à venir + clôturées récentes (pas les archives)
    let n = 0;
    for (const t of ts) { await pushTourToCalendar(t, { interactive: true, statusEl: h }); n++; }
    if (h) { h.className = 'status ok'; h.textContent = n + ' tournée(s) synchronisée(s) avec Google Agenda.'; }
  });
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
// Marque les tournées importées « à revalider » (_review) → éditables même clôturées jusqu'à re-validation.
function markToursReview(tours) { (tours || []).forEach((t) => { t._review = true; }); return tours; }
function factoryReset() {
  if (!confirm('RETOUR RÉGLAGES D\'USINE : efface TOUTES vos données et réglages de cet appareil et repart à zéro. Faites d\'abord un export/sauvegarde ! Continuer ?')) return;
  if (!confirm('Êtes-vous vraiment sûr ? Cette action est irréversible.')) return;
  try { localStorage.clear(); } catch { /* ignore */ }
  location.reload();
}
function modalBackup() {
  const dump = JSON.stringify(exportSnapshot(), null, 2);
  openModal(`<div class="modal-head"><b>💾 Sauvegarde / transfert</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Sauvegardez (fichier ou copie), transférez, ou repartez sur une base saine. La sauvegarde contient <b>tout</b> : réglages, Gestion, clients, tournées, annulations et notes de crédit.</p>
    <textarea id="bkText" class="bk-area" spellcheck="false">${esc(dump)}</textarea>
    <div class="actions two"><button class="btn" id="bkDl">⬇️ Télécharger</button><button class="btn" id="bkCopy">📋 Copier</button></div>
    <h3 class="rsub">Importer</h3>
    <div class="actions two"><button class="btn primary" id="bkMerge">🔀 Fusion</button><button class="btn" id="bkDataOnly">📥 Données seules</button></div>
    <div class="actions"><button class="btn danger block" id="bkImport">⚠ Remplace tout</button></div>
    <p class="hint">« Fusion » = synchroniser 2 appareils (le plus récent gagne, sans écraser). « Données seules » = importe tournées + clients + annulations + notes de crédit en <b>gardant vos réglages actuels</b> (idéal après un retour usine). « Remplace tout » = restauration complète. Les tournées importées sont <b>« à revalider »</b> (ouvrez-les une par une pour vérifier chaque arrêt, même clôturées).</p>
    <h3 class="rsub">Base saine</h3>
    <div class="actions"><button class="btn danger block" id="bkFactory">🏭 Retour réglages d'usine</button></div>
    <p class="hint">Efface tout et repart des réglages d'usine. Faites un export avant !</p>
    <p class="status" id="bkStatus"></p>`);
  $('mX').addEventListener('click', closeModal);
  $('bkDl').addEventListener('click', () => downloadSnapshot());
  $('bkFactory').addEventListener('click', factoryReset);
  $('bkDataOnly').addEventListener('click', () => {
    if (!confirm('Importer les tournées + clients + annulations + notes de crédit, en GARDANT vos réglages actuels ? Les tournées seront « à revalider ».')) return;
    try {
      const o = JSON.parse($('bkText').value);
      if (!o.tours && Array.isArray(o.tournees)) o.tours = o.tournees;
      if (!Array.isArray(o.clients) || !Array.isArray(o.tours)) { $('bkStatus').className = 'status err'; $('bkStatus').textContent = 'Format non reconnu (clients/tours attendus).'; return; }
      LS.set('ftr.clients', o.clients);
      if (o.settings) { // récupère les données FINANCIÈRES liées aux tournées (garde le reste des réglages locaux) : notes de crédit + verrou/statut compta + paiements reçus, sinon les périodes verrouillées redeviendraient modifiables après un retour usine
        const os = o.settings;
        if (Array.isArray(os.notesCredit)) S.notesCredit = os.notesCredit;
        if (os.comptaRecu && typeof os.comptaRecu === 'object') S.comptaRecu = Object.assign({}, S.comptaRecu, os.comptaRecu);
        if (os.comptaDemarche && typeof os.comptaDemarche === 'object') S.comptaDemarche = Object.assign({}, S.comptaDemarche, os.comptaDemarche);
        if (os.comptaStatus && typeof os.comptaStatus === 'object') S.comptaStatus = Object.assign({}, S.comptaStatus, os.comptaStatus);
        LS.set('ftr.settings', S);
      }
      const d = new Date(); d.setDate(d.getDate() - 28); const cutoff = d.toISOString().slice(0, 10);
      const isArch = (t) => (t.closed || (t.date || '') < todayStr()) && (t.date || '') < cutoff;
      const tours = markToursReview(o.tours);
      LS.set('ftr.tournees', tours.filter((t) => !isArch(t))); LS.set('ftr.archive', tours.filter(isArch));
      $('bkStatus').className = 'status ok'; $('bkStatus').textContent = 'Données importées ✔ (réglages conservés) — Rechargement…';
      setTimeout(() => location.reload(), 800);
    } catch (e) { $('bkStatus').className = 'status err'; $('bkStatus').textContent = 'JSON invalide : ' + e.message; }
  });
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
      const tours0 = Array.isArray(o.tours) ? o.tours : (Array.isArray(o.tournees) ? o.tournees : null);
      if (tours0) {
        const tours = markToursReview(tours0);
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
const chipHtml = (ico, val) => '<span class="chip-ico">' + ico + '</span><span class="chip-val">' + esc(val) + '</span>';
function refreshEverywhere() {
  $('fuelChip').innerHTML = chipHtml('⛽', eur(S.prixPleinL) + '/L');
  $('consoChip').innerHTML = chipHtml('🚗', (S.consoL100 || 0) + ' L/100');
  if ($('kmMonthChip')) $('kmMonthChip').innerHTML = chipHtml('🗓', km(kmStats().mois));
  const actifs = clients.filter(isClientActif);
  const nCh = actifs.reduce((s, c) => s + activeChevaux(c).length, 0);
  const ym = todayStr().slice(0, 7); const nT = allTours().filter((t) => (t.date || '').startsWith(ym)).length;
  if ($('clientsChip')) $('clientsChip').innerHTML = chipHtml('👤', actifs.length + ' Clients');
  if ($('chevauxChip')) $('chevauxChip').innerHTML = chipHtml('🐴', nCh + ' Chevaux');
  if ($('toursMonthChip')) $('toursMonthChip').innerHTML = chipHtml('🗺', nT + ' Tournées');
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
  // « Comment ça marche » : visible une seule fois — au 1er clic, on va sur Calcul et le bouton disparaît définitivement.
  { const bh = $('btnHelp'); if (bh) { const hideHelp = () => { bh.style.display = 'none'; const dec = $('btnVehicule'); if (dec) dec.classList.add('block'); const wrap = bh.parentElement; if (wrap) wrap.classList.remove('two'); }; if (S.helpSeen) hideHelp(); else bh.addEventListener('click', () => { S.helpSeen = true; saveSettings(); hideHelp(); }); } }
  document.querySelectorAll('#gestionSub .subtab').forEach((b) => b.addEventListener('click', () => showGestion(b.dataset.gsub)));
  document.querySelectorAll('#reglagesSub .subtab').forEach((b) => b.addEventListener('click', () => showReglages(b.dataset.rsub)));
  document.querySelectorAll('#comptaSub .subtab').forEach((b) => b.addEventListener('click', () => showCompta(b.dataset.csub)));
  document.querySelectorAll('#statsSub .subtab').forEach((b) => b.addEventListener('click', () => showStats(b.dataset.ssub)));
  document.querySelectorAll('#tournSub .subtab').forEach((b) => b.addEventListener('click', () => showTournees(b.dataset.tsub)));
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
  sanitizeAllTourStats(); // retire les chevaux non faits des résultats déjà calculés (stats sans « cheval fantôme »)
  migrateCreditedCancellations(); // 1.1.57 : marque « credited » les chevaux annulés portant une note de crédit (évite la double réduction du CA)
  bindSettings(); refreshEverywhere(); renderHome();

  if ($('appTopbar')) $('appTopbar').addEventListener('click', (e) => { if (!e.target.closest('button,a,input,select')) showTab('accueil'); });
  if ($('btnRefreshTours')) $('btnRefreshTours').addEventListener('click', refreshActiveTours);
  $('btnVehicule').addEventListener('click', modalVehicule);
  $('btnAddFrais').addEventListener('click', () => { S.frais.push({ id: uid(), poste: '', nature: 'recurrent', montantHT: 0, kmPrevus: 0, kmDebut: odometer(), date: todayStr() }); saveSettings(); renderFraisVehicule(); });
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
  if ($('btnRecalcAll')) $('btnRecalcAll').addEventListener('click', () => { if (!confirm('Recalculer toutes les tournées (même clôturées) avec les tarifs/logique actuels, et réparer les impayés orphelins ?')) return; const r = recalcAllTours(); const h = $('recalcAllHint'); if (h) { h.className = 'status ok'; h.textContent = `✔ Stats rafraîchies (${r.n} tournée(s)) · les FACTURES ne sont pas modifiées (pour recalculer une facture, ouvrez la tournée) · impayés orphelins & arrondis aberrants réparés.`; } refreshEverywhere(); });
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
  if ($('edRevalider')) $('edRevalider').addEventListener('click', () => {
    if (!currentTour || !currentTour._review) return;
    delete currentTour._review; // fin de la révision : la tournée reprend son statut normal (figée si clôturée)
    persistCurrentTour();
    if (currentTour.arrets && currentTour.arrets.length) calcTour(true); // recalcul complet avec les réglages actuels
    openEditor();
  });
  if ($('edClose')) $('edClose').addEventListener('click', () => {
    if (!currentTour || currentTour.closed) return;
    const blk = tourFinalizeBlock(currentTour);
    if (blk.length) { alert('🔒 Clôture bloquée — finalisez chaque arrêt dans « Trajet du jour » (💶 Paiement & clôture) :\n\n• ' + blk.join('\n• ')); return; }
    if (S.calPush) { const miss = calMissingHeure(currentTour); if (miss.length) { alert('🕘 Synchro Agenda Google active : l\'heure de RDV est obligatoire.\n\nRenseignez l\'heure de : ' + miss.join(', ') + '\n(dans l\'arrêt « Heure de RDV », ou Trajet du jour → ⚡ Agir → Heure RDV.)'); return; } }
    if (!confirm('Clôturer cette tournée ? Elle sera figée et ne pourra plus être modifiée.')) return;
    currentTour.closed = true;
    const i = tournees.findIndex((t) => t.id === currentTour.id); if (i >= 0) tournees[i] = currentTour; else tournees.push(currentTour);
    saveTournees(); scheduleCalPush(currentTour); openEditor();
  });
  $('edBack').addEventListener('click', () => showTab('tournees'));
  $('edAddArret').addEventListener('click', pickClientForArret);
  $('edMapBtn').addEventListener('click', showMapOnly);
  $('edReloc').addEventListener('click', forceRelocate);
  $('edDate').addEventListener('change', (e) => { currentTour.date = e.target.value; });
  $('edDate').addEventListener('click', (e) => { if (e.target.showPicker) { try { e.target.showPicker(); } catch { } } });
  $('edCalc').addEventListener('click', calcTour);
  if ($('edRecover')) $('edRecover').addEventListener('click', () => { if (currentTour) modalRecoverStats(currentTour); });
  // (« Recalculer cette tournée » retiré en 1.1.99 : le recalcul complet — fallback calcTour quand la géométrie figée est périmée — est désormais AUTOMATIQUE dans « Corriger les prestations ».)
  if ($('edActes')) $('edActes').addEventListener('click', () => { if (currentTour) modalEditPrestations(currentTour); });
  if ($('edCancelBill')) $('edCancelBill').addEventListener('click', () => { if (currentTour) modalCancelBilling(currentTour); });
  $('edDelete').addEventListener('click', () => { if (confirm('Supprimer définitivement cette tournée ? (sa facture, ses stats et ses impayés liés sont aussi retirés)')) { clearTimeout(_geoTimer); const id = currentTour.id; currentTour = null; purgeTourData(id); tournees = tournees.filter((t) => t.id !== id); archive = archive.filter((t) => t.id !== id); saveTournees(); saveArchive(); showTab('tournees'); } });
  $('copyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(recapText(currentTour.result)); $('edStatus').className = 'status ok'; $('edStatus').textContent = 'Récap copié.'; } catch { $('edStatus').textContent = 'Copie impossible.'; } });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});
