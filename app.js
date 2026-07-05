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
const APP_VERSION = '1.1.6';
const UPDATE_REPO = 'pmrflightclub-afk/Distribution-GaloPodo'; // dépôt GitHub des releases (vérif MAJ au lancement)
// Journal des versions (message de passage de version). Concis : quelques puces max par version.
const CHANGELOG = [
  {
    version: '1.1.6', date: '2026-07-05',
    ajouts: [
      'Sous-onglets « Sauvegarde » et « Changelog » dans Réglages.',
      'Bouton « Clôturer la tournée » (fige la tournée), en plus de la clôture auto par date.',
      'Nom de tournée + date en toutes lettres dans les listes (ex. « jeudi 6 novembre : Mons »).',
      'Bouton « Changer l\'arrivée » (adresse d\'arrivée distincte du départ).',
      'Bouton « Article » dans chaque arrêt (déjà couplé au client de l\'arrêt) ; modale « article connu / nouvel article ».',
      'Case « Infection » (comme Fourbure/NPAS) + tarif dédié dans les forfaits pathologiques.',
      'Numéro de version affiché dans le bandeau.',
      'Bouton pour activer/désactiver le réordonnancement des cases (fini les déplacements involontaires au défilement).',
    ],
    corrections: [
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
S.parage = Object.assign({ prixHT: 0, tvaPct: 21 }, S.parage || {});
if (!S.pays) S.pays = 'be';
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
function saveSettings() { LS.set('ftr.settings', S); refreshEverywhere(); recomputeMoney(); }

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
function saveClients() { LS.set('ftr.clients', clients); }
function saveTournees() { LS.set('ftr.tournees', tournees); }

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
    c.societeAddr = toAddr(c.societeAddr);
    (c.chevaux || []).forEach((h) => { if (!h.id) h.id = uid(); if (h.adresse !== undefined) { h.addr = toAddr(h.adresse); delete h.adresse; } h.addr = toAddr(h.addr); if (!h.addrSource) h.addrSource = (h.memeAdresse === false) ? 'specifique' : 'client'; });
  });
  tournees.forEach((t) => {
    if (!Array.isArray(t.articles)) t.articles = [];
    if (!t.reductions) t.reductions = {};
    if (t.nom === undefined) t.nom = '';           // nom / identification de la tournée
    if (t.closed === undefined) t.closed = false;  // clôture manuelle (fige la tournée)
    if (t.arrivee === undefined) t.arrivee = null; // adresse d'arrivée distincte (null = retour au départ)
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
const odometer = () => tournees.reduce((s, t) => s + (t.result ? t.result.totalKm : 0), 0);
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
  if (name === 'gestion') showGestion(currentGsub);
  if (name === 'stats') renderStats();
  if (name === 'reglages') showReglages(currentRsub);
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

// ================= CLIENTS =================
function renderClients() {
  const list = $('clientsList'); list.innerHTML = '';
  $('clientsEmpty').style.display = clients.length ? 'none' : 'block';
  clients.forEach((c) => {
    const nAdr = new Set((c.chevaux || []).map((h) => norm(addrStr(chevalAddr(c, h))))).size || 1;
    const soc = c.societe ? ' — ' + esc(c.societe) : '';
    const el = document.createElement('div'); el.className = 'list-item clickable';
    el.innerHTML = `<div class="li-main"><b>${esc(fullName(c)) || '<i>sans nom</i>'}${soc}</b><span class="li-sub">${esc(addrStr(c.addr)) || '<i>adresse ?</i>'} · ${(c.chevaux || []).length} cheval(aux)${nAdr > 1 ? ' · ' + nAdr + ' adresses' : ''}</span></div><div class="li-act"><span class="li-chev">›</span></div>`;
    el.addEventListener('click', () => editClient(c));
    list.appendChild(el);
  });
}
function editClient(existing, onSaved) {
  const key = 'client:' + (existing ? existing.id : 'new');
  const draft = DRAFTS.get(key);
  const w = draft ? draft : (existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), prenom: '', nom: '', societe: '', assujettiTva: false, tvaNum: '', entrepriseNum: '', societeMemeAdresse: true, addr: emptyAddr(), societeAddr: emptyAddr(), chevaux: [] });
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
      row.innerHTML = `<div class="a-top"><input type="text" class="grow" placeholder="Nom du cheval" value="${esc(h.nom)}" data-nom /><button class="a-del" data-del>✕</button></div>
        <label>Adresse du cheval<select data-src>
          <option value="client">Même adresse que le client</option>
          <option value="societe">Adresse de la société</option>
          <option value="specifique">Adresse spécifique</option>
        </select></label>
        <div data-addrmount ${h.addrSource === 'specifique' ? '' : 'style="display:none"'}></div>`;
      row.querySelector('[data-src]').value = h.addrSource;
      row.querySelector('[data-nom]').addEventListener('input', (e) => { h.nom = e.target.value; saveDraft(); });
      row.querySelector('[data-del]').addEventListener('click', () => { w.chevaux.splice(i, 1); renderCh(); saveDraft(); });
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
    DRAFTS.clear(key); saveClients(); closeModal();
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
  el.innerHTML = `<div class="li-main"><b>${titre}${showBadge ? ' · ' + STATUS_LBL[st] : ''}</b><span class="li-sub">${t.arrets.length} arrêt(s) · ${t.result ? km(t.result.totalKm) + ' · ' + eur(t.result.totalTTC) + ' TTC' : 'non calculée'}</span></div><div class="li-act"><span class="li-chev">›</span></div>`;
  el.addEventListener('click', () => openTour(t));
  return el;
}
function renderTours() {
  const d = new Date(); d.setDate(d.getDate() - 28); const fourWeeksAgo = d.toISOString().slice(0, 10);
  const asc = (a, b) => (a.date || '').localeCompare(b.date || ''), desc = (a, b) => (b.date || '').localeCompare(a.date || '');
  const t = [...tournees];
  const closed = t.filter((x) => statusOf(x) === 'cloturee');
  const fill = (listId, emptyId, items) => { const box = $(listId); if (!box) return; box.innerHTML = ''; $(emptyId).style.display = items.length ? 'none' : 'block'; items.forEach((x) => box.appendChild(tourListItem(x, true))); };
  // « À venir » regroupe désormais aujourd'hui (non clôturée) + les tournées futures.
  fill('trUpcoming', 'trUpcomingEmpty', t.filter((x) => { const s = statusOf(x); return s === 'active' || s === 'avenir'; }).sort(asc));
  fill('trClosed', 'trClosedEmpty', closed.filter((x) => (x.date || '') >= fourWeeksAgo).sort(desc));
  fill('trArchive', 'trArchiveEmpty', closed.filter((x) => (x.date || '') < fourWeeksAgo).sort(desc));
}
function newTour() { currentTour = { id: uid(), date: todayStr(), nom: '', closed: false, arrivee: null, arrets: [], articles: [], reductions: {}, result: null, createdAt: Date.now() }; openEditor(); }
function openTour(t) { currentTour = JSON.parse(JSON.stringify(t)); openEditor(); }

// Synchronise une tournée non clôturée avec les données client actuelles (chevaux ajoutés/supprimés/renommés).
function reconcileTour(tour) {
  if (statusOf(tour) === 'cloturee') return false;
  let changed = false;
  (tour.arrets || []).forEach((a) => {
    const before = JSON.stringify(a.clients);
    a.clients = (a.clients || []).map((cl) => {
      const c = clients.find((x) => x.id === cl.clientId);
      if (!c) return null;                                   // client supprimé → retirer
      if (!(c.chevaux || []).length) return { clientId: cl.clientId, chevaux: [] }; // client sans cheval : déplacement seul
      const atAddr = c.chevaux.filter((h) => norm(addrStr(chevalAddr(c, h))) === norm(addrStr(a.addr)));
      const chevaux = atAddr.map((h) => { const old = (cl.chevaux || []).find((x) => (x.id && x.id === h.id) || norm(x.nom) === norm(h.nom)); return { id: h.id, nom: h.nom, fourbure: !!(old && old.fourbure), npas: !!(old && old.npas), infection: !!(old && old.infection), parage: !!(old && old.parage) }; });
      return chevaux.length ? { clientId: cl.clientId, chevaux } : null; // plus aucun cheval de ce client ici → retirer
    }).filter(Boolean);
    if (JSON.stringify(a.clients) !== before) changed = true;
  });
  const n0 = tour.arrets.length;
  tour.arrets = (tour.arrets || []).filter((a) => (a.clients || []).length);
  if (tour.arrets.length !== n0) changed = true;
  // Articles : resync par id (renommage / suppression de cheval)
  (tour.articles || []).forEach((art) => {
    const c = clients.find((x) => x.id === art.clientId); if (!c) return;
    if (!art.chevalIds) art.chevalIds = (art.chevalNoms || []).map((n) => { const h = (c.chevaux || []).find((x) => norm(x.nom) === norm(n)); return h ? h.id : null; }).filter(Boolean);
    const kept = (art.chevalIds || []).filter((id) => (c.chevaux || []).some((h) => h.id === id));
    if (JSON.stringify(kept) !== JSON.stringify(art.chevalIds || [])) changed = true;
    art.chevalIds = kept;
    art.chevalNoms = kept.map((id) => { const h = c.chevaux.find((x) => x.id === id); return h ? h.nom : ''; }).filter(Boolean);
  });
  const na = (tour.articles || []).length;
  tour.articles = (tour.articles || []).filter((art) => (art.chevalIds || art.chevalNoms || []).length);
  if ((tour.articles || []).length !== na) changed = true;
  if (changed) saveTournees();
  return changed;
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
  $('edLockBanner').classList.toggle('hidden', !locked);
  $('edAddArret').style.display = locked ? 'none' : '';
  $('edCalc').style.display = 'none'; // recalcul automatique — bouton masqué mais fonctionnel
  $('edDelete').style.display = '';
  renderEditorArrets(locked);
  if (currentTour.result && currentTour.result.rows && currentTour.result.rows.length === currentTour.arrets.length) recomputeMoney();
  else { renderResultUI(null); if (!locked && currentTour.arrets.length) scheduleGeoRecalc(); }
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
}

function renderEditorArrets(locked) {
  if (locked === undefined) locked = statusOf(currentTour) === 'cloturee';
  const box = $('edArrets'); box.innerHTML = '';
  $('edArretsEmpty').style.display = currentTour.arrets.length ? 'none' : 'block';
  const N = currentTour.arrets.length;
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
    if (!locked) {
      if (!currentTour.reductions) currentTour.reductions = {};
      el.querySelector('[data-type]').addEventListener('change', (e) => { a.type = e.target.value; recomputeMoney(); });
      el.querySelector('[data-del]').addEventListener('click', () => { currentTour.arrets.splice(i, 1); renderEditorArrets(locked); scheduleGeoRecalc(); });
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
        h += `<table class="patho-tbl"><thead><tr><th>Cheval</th>${cols.map((c) => '<th>' + c.label + '</th>').join('')}</tr></thead><tbody>`;
        cl.chevaux.forEach((cv, ci) => {
          h += `<tr><td>🐴 ${esc(cv.nom)}</td>${cols.map((c) => {
            const dis = c.key !== 'parage' && !cv.parage ? ' disabled' : '';
            return `<td><input type="checkbox" data-key="${c.key}" data-ci="${ci}" ${cv[c.key] ? 'checked' : ''}${dis}/></td>`;
          }).join('')}</tr>`;
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
        el.appendChild(wrap);
      });
    }
    // ----- Articles de cet arrêt (couplés au client de l'arrêt) -----
    const artWrap = document.createElement('div'); artWrap.className = 'a-articles';
    const arts = articlesForArret(a);
    artWrap.innerHTML = `<div class="a-art-head"><span>🧾 Articles</span>${locked ? '' : '<button class="btn small" data-add-art>+ Article</button>'}</div>`;
    const alist = document.createElement('div'); alist.className = 'list';
    if (!arts.length) alist.innerHTML = '<p class="hint">Aucun article pour cet arrêt.</p>';
    arts.forEach((art) => {
      const rr = (art.tvaPct || 0) / 100, qte = Math.max(1, (art.chevalNoms || []).length || 1), ttcv = (art.prixHT || 0) * qte * (1 + rr);
      const row = document.createElement('div'); row.className = 'list-item';
      const chn = (art.chevalNoms || []).join(', ');
      row.innerHTML = `<div class="li-main"><b>${esc(art.libelle)}</b><span class="li-sub">${esc(clientName(art.clientId))} · ×${qte}${chn ? ' · 🐴 ' + esc(chn) : ''} · ${eur(ttcv)} TTC</span></div>${locked ? '' : '<div class="li-act"><button class="btn small" data-e>Éditer</button> <button class="btn small danger" data-d>✕</button></div>'}`;
      if (!locked) {
        row.querySelector('[data-e]').addEventListener('click', () => modalTourArticle(art, { arret: a }));
        row.querySelector('[data-d]').addEventListener('click', () => { currentTour.articles = (currentTour.articles || []).filter((x) => x.id !== art.id); saveTournees(); renderEditorArrets(locked); recomputeMoney(); });
      }
      alist.appendChild(row);
    });
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
function computeResultMoney(rows, geom, articles, reducs) {
  articles = articles || (currentTour && currentTour.articles) || [];
  reducs = reducs || (currentTour && currentTour.reductions) || {};
  const useSeuil = S.repartition === 'parclient'; // seuil/forfait « client proche » actifs seulement dans ce mode
  rows.forEach((r) => (r.proche = useSeuil && r.directKm < S.seuilKm));
  const loin = rows.filter((r) => !r.proche);
  // Clients au seuil : on retire leur distance ALLER SIMPLE domicile→client (sommée si plusieurs) du km total.
  const kmProches = rows.filter((r) => r.proche).reduce((s, r) => s + r.directKm, 0);
  const kmRestant = Math.max(0, geom.totalKm - kmProches);
  const sumSegLoin = loin.reduce((s, r) => s + r.segKm, 0);
  const totClientsLoin = loin.reduce((s, r) => s + r.nbClients, 0);
  rows.forEach((r) => {
    if (r.proche) { r.kmAttribue = 0; r.tarifHT = 0; r.montantHT = S.forfait; }
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
    const noms = a.chevalNoms || []; if (!noms.length) return; const qte = noms.length; // article obligatoirement lié à ≥1 cheval
    const lineHT = (a.prixHT || 0) * qte, rr = (a.tvaPct || 0) / 100;
    const m = getC(a.clientId, clientName(a.clientId));
    m.articles.push({ libelle: a.libelle, chevaux: noms, qte, prixHT: a.prixHT || 0, tvaPct: a.tvaPct || 0, ht: lineHT, tva: lineHT * rr, ttc: lineHT * (1 + rr) });
    m.htArt += lineHT; m.tvaArt += lineHT * rr;
  });
  // Parage & équilibrage auto (cheval coché) → ligne d'article
  if (S.parage && S.parage.prixHT > 0) {
    const pa = {};
    rows.forEach((r) => r.clients.forEach((cl) => cl.chevaux.forEach((c) => { if (c.parage) (pa[cl.clientId] = pa[cl.clientId] || []).push(c.nom); })));
    Object.keys(pa).forEach((cid) => {
      const noms = pa[cid], qte = noms.length, rr = (S.parage.tvaPct || 0) / 100, lineHT = S.parage.prixHT * qte;
      const m = getC(cid, clientName(cid));
      m.articles.push({ libelle: 'Parage et équilibrage', chevaux: noms, qte, prixHT: S.parage.prixHT, tvaPct: S.parage.tvaPct || 0, ht: lineHT, tva: lineHT * rr, ttc: lineHT * (1 + rr) });
      m.htArt += lineHT; m.tvaArt += lineHT * rr;
    });
  }
  const parClient = Object.values(cmap).map((m) => {
    const rpct = reducs[m.clientId] || 0, rf = rpct / 100;
    // Totaux « tarif plein » (avant toute remise) — capturés AVANT de réduire les lignes.
    const htArtBrut = m.articles.reduce((s, a) => s + a.ht, 0), tvaArtBrut = m.articles.reduce((s, a) => s + a.tva, 0);
    // Remise appliquée LIGNE PAR LIGNE : le HT de chaque article est réduit, puis TVA et TTC recalculés sur le net.
    if (rpct) m.articles.forEach((a) => { a.remisePct = rpct; a.htBrut = a.ht; a.ht = a.ht * (1 - rf); a.tva = a.tva * (1 - rf); a.ttc = a.ttc * (1 - rf); });
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
  const i = tournees.findIndex((t) => t.id === currentTour.id); if (i >= 0) tournees[i] = currentTour; else tournees.push(currentTour);
  saveTournees();
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
  const res = computeResultMoney(rows, geom, t.articles, t.reductions);
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
    const i = tournees.findIndex((t) => t.id === currentTour.id); if (i >= 0) tournees[i] = currentTour; else tournees.push(currentTour);
    saveTournees();
    renderResultUI(currentTour.result);
    renderMap(rows.map((r) => ({ lat: r.lat, lon: r.lon, label: r.label })), home, currentTour.result.routeGeo, arrXY);
    st.className = 'status ok'; st.textContent = silent ? 'À jour ✔' : 'Frais calculés et enregistrés.';
  } catch (e) { st.className = 'status err'; st.textContent = 'Erreur : ' + e.message; }
}

// Rendu unique : tuiles (haut) + facture (répartition par client > cheval + HT/TVA/TTC).
function renderResultUI(R) {
  if (R) {
    $('rKm').textContent = km(R.totalKm);
    $('rMin').textContent = Math.round(R.totalMin) + ' min · ' + hrs(R.totalMin);
    $('rHT').textContent = eur(R.totalHT) + ' HT'; $('rTVA').textContent = eur(R.totalTVA);
    $('rTTC').textContent = eur(R.totalTTC) + ' TTC';
  } else { ['rKm', 'rMin', 'rHT', 'rTVA', 'rTTC'].forEach((id) => { if ($(id)) $(id).textContent = '—'; }); }
  renderAnalytique(R);
  const box = $('edInvoice'); box.innerHTML = '';
  if (!R || !R.parClient || !R.parClient.length) { $('edInvoiceEmpty').style.display = 'block'; box.style.display = 'none'; return; }
  $('edInvoiceEmpty').style.display = 'none'; box.style.display = '';
  R.parClient.forEach((m) => { box.appendChild(clientInvoiceEl(m)); });
  const f = document.createElement('div'); f.className = 'inv-footer';
  f.innerHTML = `<div class="inv-line"><span>Total HT</span><span>${eur(R.totalHT)}</span></div>
    <div class="inv-line"><span>TVA</span><span>${eur(R.totalTVA)}</span></div>
    <div class="inv-line inv-total"><span>Total TTC</span><span>${eur(R.totalTTC)}</span></div>`;
  box.appendChild(f);
}

// Un bloc facture pour un client : 3 sections (Articles · Matériel · Déplacement), par cheval.
function clientInvoiceEl(m) { const el = document.createElement('div'); el.className = 'inv-client'; el.innerHTML = clientInvoiceHtml(m); return el; }
function clientInvoiceHtml(m) {
  const stdRate = rate();
  // Colonnes : Poste | Prix unitaire | Base HT (×quantité, remise incluse) | TVA | TTC.
  const row = (label, unitStr, baseHT, tva, ttc, cls) => `<tr${cls ? ' class="' + cls + '"' : ''}><td>${label}</td><td>${unitStr}</td><td>${eur(baseHT)}</td><td>${eur(tva)}</td><td>${eur(ttc)}</td></tr>`;
  const sec = (t) => `<tr class="inv-sec-row"><td colspan="5">${t}</td></tr>`;
  let rows = '';
  if (m.articles.length) {
    rows += sec('Articles');
    m.articles.forEach((a) => { const noms = a.chevaux.length ? ' — ' + a.chevaux.map(esc).join(', ') : ''; const rem = a.remisePct ? ` <span class="rem-tag">−${a.remisePct}%</span>` : ''; rows += row(`🧾 ${esc(a.libelle)} ×${a.qte}${noms} (TVA ${a.tvaPct}%)${rem}`, eur(a.prixHT), a.ht, a.tva, a.ttc); });
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
      const mult = l.proche ? '' : ` · ${km(l.km)}`;
      rows += row(`📍 ${esc(l.adresse)} ${TYPES[l.type]}${noms}${mult}`, unitStr, l.partHT, l.partHT * stdRate, l.partTTC);
    });
  }
  return `<div class="inv-head"><span>${esc(m.nom)}</span><span class="inv-amt">${eur(m.totalTTC)} TTC</span></div>
    <div class="table-wrap"><table class="inv-tbl"><thead><tr><th>Poste</th><th>Prix unitaire</th><th>Base HT</th><th>TVA</th><th>TTC</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>${row('Sous-total', '', m.totalHT, m.totalTVA, m.totalTTC, 'inv-total-row')}${row('Tarif plein', '', (m.pleinHT != null ? m.pleinHT : m.totalHT), (m.pleinTVA != null ? m.pleinTVA : m.totalTVA), (m.pleinTTC != null ? m.pleinTTC : m.totalTTC), 'inv-brut-row')}</tfoot></table></div>`;
}

// Récap ANONYMISÉ (texte) : ni noms, ni adresses, ni chevaux — juste la répartition.
function recapText(R, tour) {
  if (!R) return '';
  tour = tour || currentTour;
  const stdRate = rate(), htDep = R.htDeplacement || 0;
  let s = `Frais de tournée — ${tour ? tour.date : ''}\n`;
  s += `Distance : ${km(R.totalKm)} · Durée : ${Math.round(R.totalMin)} min\n`;
  s += `Carburant : ${eur(S.prixPleinL)}/L (TVAC)\n`;
  s += `Frais de déplacement — HT ${eur(htDep)} · TVA ${eur(htDep * stdRate)} · TTC ${eur(htDep * (1 + stdRate))}\n\n`;
  s += `Km par client (anonymisé) :\n`;
  const kmByClient = {};
  (R.rows || []).forEach((r) => { const kmc = (r.kmAttribue || 0) / Math.max(1, r.nbClients); r.clients.forEach((cl) => { kmByClient[cl.clientId] = (kmByClient[cl.clientId] || 0) + kmc; }); });
  (R.parClient || []).forEach((m, i) => { s += `• Client ${i + 1} : ${km(kmByClient[m.clientId] || 0)}\n`; });
  return s;
}
// Détail nominatif d'UN client (toutes ses lignes de facture) — pour le « Ticket ».
function invoiceTextForClient(m) {
  const stdRate = rate();
  const L = [`Client : ${m.nom}`];
  if (m.articles.length) {
    L.push('— Articles —');
    m.articles.forEach((a) => { const ch = a.chevaux.length ? ' (' + a.chevaux.join(', ') + ')' : ''; const rem = a.remisePct ? ` −${a.remisePct}%` : ''; L.push(`  ${a.libelle} ×${a.qte}${ch}${rem} : ${eur(a.ht)} HT · ${eur(a.tva)} TVA · ${eur(a.ttc)} TTC`); });
  }
  if (m.materiel.length) {
    L.push('— Matériel —');
    m.materiel.forEach((x) => { const tags = [x.fourbure ? 'Fourbure' : '', x.npas ? 'NPAS' : '', x.infection ? 'Infection' : ''].filter(Boolean).join(', '); L.push(`  ${x.nom}${tags ? ' (' + tags + ')' : ''} : ${eur(x.ht)} HT · ${eur(x.ht * stdRate)} TVA · ${eur(x.ttc)} TTC`); });
  }
  if (m.deplacement.length) {
    L.push('— Déplacement —');
    m.deplacement.forEach((l) => { const ch = l.chevaux.length ? ' (' + l.chevaux.join(', ') + ')' : ''; const u = l.proche ? 'forfait' : `${km(l.km)} × ${eurkm(l.tarifHT)}/km`; L.push(`  ${l.adresse} ${TYPES[l.type]}${ch} — ${u} : ${eur(l.partHT)} HT · ${eur(l.partHT * stdRate)} TVA · ${eur(l.partTTC)} TTC`); });
  }
  L.push(`Sous-total (à payer) : ${eur(m.totalHT)} HT · ${eur(m.totalTVA)} TVA · ${eur(m.totalTTC)} TTC`);
  const pHT = m.pleinHT != null ? m.pleinHT : m.totalHT, pTVA = m.pleinTVA != null ? m.pleinTVA : m.totalTVA, pTTC = m.pleinTTC != null ? m.pleinTTC : m.totalTTC;
  L.push(`Tarif plein : ${eur(pHT)} HT · ${eur(pTVA)} TVA · ${eur(pTTC)} TTC`);
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
  return computeResultMoney(rows, { totalKm, kmHomeFirst: rows[0].segKm, kmLastHome, totalMin: Math.round(totalKm * 60 / (S.vitesseKmh || 50)) }, articles, { m: 10 });
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
  tournees.forEach((t) => {
    if (!t.result) return;
    if ((t.date || '').startsWith(ym)) mois += t.result.totalKm;
    if ((t.date || '').startsWith(y)) annee += t.result.totalKm;
    const mpk = t.result.totalKm > 0 ? t.result.totalMin / t.result.totalKm : 0; // minutes par km
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
      let h = `<div class="inv-head"><span>${esc(c.nom)}</span><span>${km(c.km)} · ${hrs(c.min)}</span></div>`;
      c.chevaux.forEach((cv) => { h += `<div class="fin-cheval"><span>🐴 ${esc(cv.nom)}</span><span>${km(cv.km)} · ${hrs(cv.min)}</span></div>`; });
      el.innerHTML = h; box.appendChild(el);
    });
  }
  renderFinance();
}
function financeStats() {
  const cmap = {};
  tournees.forEach((t) => {
    if (!t.result || !t.result.parClient) return;
    t.result.parClient.forEach((m) => {
      const c = cmap[m.clientId] = cmap[m.clientId] || { nom: m.nom, dep: 0, mat: 0, art: 0, chevaux: {} };
      const dep = (m.deplacement || []).reduce((s, l) => s + l.partTTC, 0);
      const mat = (m.materiel || []).reduce((s, x) => s + x.ttc, 0);
      const art = (m.articles || []).reduce((s, a) => s + a.ttc, 0); // remise déjà appliquée ligne par ligne
      c.dep += dep; c.mat += mat; c.art += art;
      (m.materiel || []).forEach((x) => { const ch = c.chevaux[x.nom] = c.chevaux[x.nom] || { nom: x.nom, dep: 0, mat: 0, art: 0 }; ch.mat += x.ttc; });
      (m.deplacement || []).forEach((l) => { const per = l.chevaux.length ? l.partTTC / l.chevaux.length : 0; l.chevaux.forEach((n) => { const ch = c.chevaux[n] = c.chevaux[n] || { nom: n, dep: 0, mat: 0, art: 0 }; ch.dep += per; }); });
      (m.articles || []).forEach((a) => { const per = a.chevaux.length ? a.ttc / a.chevaux.length : 0; a.chevaux.forEach((n) => { const ch = c.chevaux[n] = c.chevaux[n] || { nom: n, dep: 0, mat: 0, art: 0 }; ch.art += per; }); });
    });
  });
  return Object.values(cmap).map((c) => ({ ...c, total: c.dep + c.mat + c.art, chevaux: Object.values(c.chevaux) })).sort((a, b) => b.total - a.total);
}
function renderFinance() {
  const box = $('financeList'); if (!box) return; box.innerHTML = '';
  const fs = financeStats();
  $('financeEmpty').style.display = fs.length ? 'none' : 'block';
  fs.forEach((c) => {
    const el = document.createElement('div'); el.className = 'inv-client';
    let h = `<div class="inv-head"><span>${esc(c.nom)}</span><span class="inv-amt">${eur(c.total)} TTC</span></div>`;
    h += `<div class="inv-line"><span>Articles</span><span>${eur(c.art)}</span></div><div class="inv-line"><span>Matériel</span><span>${eur(c.mat)}</span></div><div class="inv-line"><span>Déplacement</span><span>${eur(c.dep)}</span></div>`;
    c.chevaux.forEach((cv) => { h += `<div class="fin-cheval"><span>🐴 ${esc(cv.nom)} · A ${eur(cv.art)} M ${eur(cv.mat)} D ${eur(cv.dep)}</span><span>${eur(cv.art + cv.mat + cv.dep)}</span></div>`; });
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
    el.querySelector('[data-del]').addEventListener('click', () => { S.frais = S.frais.filter((x) => x.id !== f.id); saveSettings(); renderFraisVehicule(); });
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
  if (existing) $('fDel').addEventListener('click', () => { S.frais = S.frais.filter((x) => x.id !== w.id); saveSettings(); closeModal(); renderFraisVehicule(); });
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
    el.querySelector('[data-del]').addEventListener('click', () => { S.materiel = S.materiel.filter((x) => x.id !== m.id); saveSettings(); renderMateriel(); });
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
  if (existing) $('mDel').addEventListener('click', () => { S.materiel = S.materiel.filter((x) => x.id !== w.id); saveSettings(); closeModal(); renderMateriel(); });
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
    el.querySelector('[data-del]').addEventListener('click', () => { S.articlesCatalogue = S.articlesCatalogue.filter((x) => x.id !== a.id); saveSettings(); renderArticlesCat(); });
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
  if (existing) $('aDel').addEventListener('click', () => { S.articlesCatalogue = S.articlesCatalogue.filter((x) => x.id !== w.id); saveSettings(); closeModal(); renderArticlesCat(); });
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
function renderHomeTrajet() {
  const box = $('homeTrajet'); if (!box) return; box.innerHTML = '';
  const todays = [...tournees].filter((t) => statusOf(t) === 'active').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  $('homeTrajetEmpty').style.display = todays.length ? 'none' : 'block';
  todays.forEach((t) => {
    // 1ʳᵉ ligne : la tournée du jour elle-même (cliquable → ouvre l'éditeur).
    box.appendChild(tourListItem(t, false));
    const mins = legMinutesFor(t);
    (t.arrets || []).forEach((a, i) => {
      const adresse = addrStr(a.addr);
      const chNames = (a.clients || []).flatMap((cl) => (cl.chevaux || []).map((c) => c.nom)).filter(Boolean).join(', ');
      const cl0 = (a.clients || [])[0] || {}; const c0 = clients.find((x) => x.id === cl0.clientId) || {};
      const trajet = mins[i] != null ? Math.round(mins[i]) + ' min' : '—';
      const el = document.createElement('div'); el.className = 'list-item';
      // Nom du client d'abord, adresse en dessous.
      el.innerHTML = `<div class="li-main"><b>${i + 1}. ${esc(labelFor(a)) || '<i>client ?</i>'}</b><span class="li-sub">📍 ${esc(adresse) || '<i>adresse ?</i>'}${chNames ? ' · 🐴 ' + esc(chNames) : ''} · 🕒 ${trajet}</span></div>
        <div class="li-act"><button class="btn small" data-waze>Waze</button> <button class="btn small" data-sms>SMS</button> <button class="btn small" data-ticket>Ticket</button></div>`;
      el.querySelector('[data-waze]').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(adresse); } catch { /* ignore */ }
        const url = (a.addr.lat && a.addr.lon) ? `https://waze.com/ul?ll=${a.addr.lat},${a.addr.lon}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(adresse)}&navigate=yes`;
        window.open(url, '_blank');
      });
      el.querySelector('[data-sms]').addEventListener('click', async () => {
        const msg = fillSms(S.smsTemplate, { prenom: c0.prenom || '', nom: c0.nom || '', client: fullName(c0), societe: c0.societe || '', cheval: chNames, trajet, adresse });
        const btn = el.querySelector('[data-sms]');
        try { await navigator.clipboard.writeText(msg); btn.textContent = 'Copié ✔'; setTimeout(() => { btn.textContent = 'SMS'; }, 1500); }
        catch { alert(msg); }
      });
      // Ticket = récap de la tournée + détail complet de la facture de CE client.
      el.querySelector('[data-ticket]').addEventListener('click', async () => {
        const btn = el.querySelector('[data-ticket]');
        const m = (t.result && t.result.parClient) ? t.result.parClient.find((x) => x.clientId === cl0.clientId) : null;
        let txt = recapText(t.result, t);
        txt += '\n\n————— DÉTAIL CLIENT —————\n' + (m ? invoiceTextForClient(m) : '(Détail indisponible — ouvrez la tournée et laissez-la se calculer.)');
        try { await navigator.clipboard.writeText(txt); btn.textContent = 'Copié ✔'; setTimeout(() => { btn.textContent = 'Ticket'; }, 1500); }
        catch { alert(txt); }
      });
      box.appendChild(el);
    });
  });
}
function renderHome() {
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
    <div class="actions"><button class="btn block" id="vMat">🧰 Frais de matériel</button></div>`);
  $('mX').addEventListener('click', closeModal);
  $('vClient').addEventListener('click', () => { closeModal(); editClient(null); });
  $('vPlein').addEventListener('click', modalPlein);
  $('vConso').addEventListener('click', modalConso);
  $('vFrais').addEventListener('click', () => { closeModal(); showTab('gestion'); showGestion('vehicule'); });
  $('vMat').addEventListener('click', () => { closeModal(); showTab('gestion'); showGestion('materiel'); });
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
  if ($('setAccent')) { $('setAccent').value = S.accentColor; $('setAccent').addEventListener('input', (e) => { S.accentColor = e.target.value; saveSettings(); applyTheme(); refreshSwatches(); }); }
  if ($('setTopbar')) { $('setTopbar').value = S.topbarColor || S.accentColor; $('setTopbar').addEventListener('input', (e) => { S.topbarColor = e.target.value; saveSettings(); applyTheme(); refreshSwatches(); }); }
  if ($('setNavbar')) { $('setNavbar').value = S.navBarColor || (lum(S.appBg) < 0.45 ? '#1d1d1d' : '#ffffff'); $('setNavbar').addEventListener('input', (e) => { S.navBarColor = e.target.value; saveSettings(); applyTheme(); refreshSwatches(); }); }
  if ($('setAppBg')) { $('setAppBg').value = S.appBg; $('setAppBg').addEventListener('input', (e) => { S.appBg = e.target.value; saveSettings(); applyTheme(); refreshSwatches(); }); }
  if ($('setLogoBg')) { if (S.logoBg && S.logoBg !== 'transparent') $('setLogoBg').value = S.logoBg; $('setLogoBg').addEventListener('input', (e) => { S.logoBg = e.target.value; saveSettings(); applyTheme(); refreshSwatches(); }); }
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
  _settingsPaints = paints;
  // Champs calculés (lecture seule) : unité affichée dans le champ.
  [['setPrixPleinHT', '€/L HT'], ['setAchatTTC', '€ TTC'], ['setAmortHT', '€/km HT'], ['setAmortTTC', '€/km TTC'], ['setForfaitTTC', '€ TTC'], ['setSeuilTarif', '€/km HT'], ['setSeuilDepHT', '€ HT'], ['setSeuilDepTTC', '€ TTC'], ['setFourbureTtc', '€ TTC'], ['setNpasTtc', '€ TTC'], ['setInfectionTtc', '€ TTC'], ['setParageTtc', '€ TTC'], ['setPrixHeureTtc', '€ TTC'], ['setTempsKmRo', '€/km']].forEach(([id, u]) => makeReadout($(id), u));
  if ($('setSeuilType')) { $('setSeuilType').value = S.seuilTarifType; $('setSeuilType').addEventListener('change', (e) => { S.seuilTarifType = e.target.value; saveSettings(); }); }
  updateReadouts();
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
  const dump = JSON.stringify({ app: 'GaloPodo', version: APP_VERSION, settings: S, clients, tournees }, null, 2);
  openModal(`<div class="modal-head"><b>💾 Sauvegarde / restauration</b><button class="x" id="mX">✕</button></div>
    <p class="hint">Copiez ce texte pour sauvegarder. Pour restaurer/transférer : collez une sauvegarde puis « Importer ».</p>
    <textarea id="bkText" class="bk-area" spellcheck="false">${esc(dump)}</textarea>
    <div class="actions two"><button class="btn" id="bkCopy">📋 Copier</button><button class="btn primary" id="bkImport">⬇ Importer (remplace tout)</button></div>
    <p class="status" id="bkStatus"></p>`);
  $('mX').addEventListener('click', closeModal);
  $('bkCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('bkText').value); $('bkStatus').className = 'status ok'; $('bkStatus').textContent = 'Copié dans le presse-papier.'; } catch { $('bkText').select(); document.execCommand && document.execCommand('copy'); $('bkStatus').textContent = 'Sélectionné — Ctrl+C pour copier.'; } });
  $('bkImport').addEventListener('click', () => {
    if (!confirm('Remplacer TOUS vos réglages et données par cette sauvegarde ?')) return;
    try {
      const o = JSON.parse($('bkText').value);
      if (o.settings && typeof o.settings === 'object') LS.set('ftr.settings', o.settings);
      if (Array.isArray(o.clients)) LS.set('ftr.clients', o.clients);
      if (Array.isArray(o.tournees)) LS.set('ftr.tournees', o.tournees);
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
  if ($('navToggle')) $('navToggle').addEventListener('click', (e) => { e.stopPropagation(); $('mainTabs').classList.toggle('open'); });
  document.querySelectorAll('.subnav-current').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const n = b.closest('.subtabs'); if (n) n.classList.toggle('open'); }));
  document.addEventListener('click', (e) => {
    const t = $('mainTabs'); if (t && t.classList.contains('open') && !t.contains(e.target)) t.classList.remove('open');
    document.querySelectorAll('.subtabs.open').forEach((n) => { if (!n.contains(e.target)) n.classList.remove('open'); });
  });
  window.addEventListener('resize', updateStickyOffsets);
  updateStickyOffsets(); setTimeout(updateStickyOffsets, 300);
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

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
  if ($('btnAddAdresse')) $('btnAddAdresse').addEventListener('click', () => modalAdresse(null));
  if ($('edChangeHome')) $('edChangeHome').addEventListener('click', modalTourHome);
  if ($('edChangeArrivee')) $('edChangeArrivee').addEventListener('click', modalTourArrivee);
  if ($('edNom')) $('edNom').addEventListener('input', (e) => { if (currentTour) { currentTour.nom = e.target.value; saveTournees(); } });
  if ($('edClose')) $('edClose').addEventListener('click', () => {
    if (!currentTour || currentTour.closed) return;
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
  $('edDelete').addEventListener('click', () => { if (confirm('Supprimer définitivement cette tournée ?')) { clearTimeout(_geoTimer); const id = currentTour.id; currentTour = null; tournees = tournees.filter((t) => t.id !== id); saveTournees(); showTab('tournees'); } });
  $('copyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(recapText(currentTour.result)); $('edStatus').className = 'status ok'; $('edStatus').textContent = 'Récap copié.'; } catch { $('edStatus').textContent = 'Copie impossible.'; } });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});
