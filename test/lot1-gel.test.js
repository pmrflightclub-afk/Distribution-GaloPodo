// Harness Lot 1 — gardes de gel + garde anti re-horodatage de masse.
// Exécution : node test/lot1-gel.test.js   (aucune dépendance)
//
// Le fichier app.js est un mono-bloc navigateur : on en EXTRAIT les fonctions par bornes de lignes
// et on les instancie dans un contexte stubé. Aucun DOM, aucun réseau.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (needle, from = 0) => { const i = LINES.findIndex((l, k) => k >= from && l.includes(needle)); if (i < 0) throw new Error('introuvable: ' + needle); return i; };


let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

// ---------------------------------------------------------------- localStorage stub
function makeLS(quotaOn = null) {
  const store = {};
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { if (quotaOn && quotaOn(k)) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

// ---------------------------------------------------------------- contexte commun
function buildCtx(code, over = {}) {
  const localStorage = over.localStorage || makeLS();
  const ctx = {
    localStorage,
    APP_VERSION: '1.7.97-test',
    LS: {
      get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
      set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
    },
    uid: (() => { let n = 0; return () => 'uid' + (++n); })(),
    hashStr: (s) => { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return String(h); },
    norm: (s) => String(s == null ? '' : s).trim().toLowerCase(),
    statusOf: (t) => (t && t.closed ? 'cloturee' : 'avenir'),
    markSyncDirty: () => {},
    bgSaveFlash: () => {},
    chevalCancelled: (c) => !!(c && c.cancel),
    chevalCredited: (c) => !!(c && c.cancel && c.cancel.credited),
    chevalFait: (c) => !(c && c.cancel) && !!(c && (c.parage || c.fourbure || c.npas || c.infection || c.visite)),
    photoHasBillableStades: (p) => !!(p && p.billable),
    clients: [], tournees: [], archive: [], S: {},
    saves: { tournees: 0, archive: 0 },
  };
  ctx.allTours = () => ctx.tournees.concat(ctx.archive);
  ctx.saveTournees = () => { ctx.saves.tournees++; };
  ctx.saveArchive = () => { ctx.saves.archive++; };
  ctx.chevalBilled = (c) => ctx.chevalFait(c) || ctx.chevalCredited(c);
  Object.assign(ctx, over.vars || {});
  const keys = Object.keys(ctx);
  const fn = new Function(...keys, code + '\n; return { ' + (over.exports || []).join(', ') + ' };');
  const api = fn(...keys.map((k) => ctx[k]));
  return { ctx, api };
}

// ================================================================ 1. syncStamp
console.log('\n── syncStamp : garde anti re-horodatage de masse ──');
{
  // on prend le bloc _HASH_SKIP -> juste avant rebuildSyncHashes (contient hashRec, syncMeta, saveSyncMeta, syncStamp)
  const a = at('const _HASH_SKIP =');
  const b = at('function rebuildSyncHashes()');
  const block = LINES.slice(a, b).join('\n');

  const run = (seedHash, arr) => {
    const localStorage = makeLS();
    if (seedHash !== null) localStorage.setItem('ftr.syncmeta', JSON.stringify({ hash: { tournees: seedHash }, upd: {} }));
    const { api } = buildCtx(block, { localStorage, exports: ['syncStamp', 'hashRec'] });
    api.syncStamp('tournees', arr);
    return { arr, meta: JSON.parse(localStorage.getItem('ftr.syncmeta')), guard: JSON.parse(localStorage.getItem('ftr.stampGuard') || 'null') };
  };

  // T1.1 — référence PERDUE (hash vide) sur un parc existant : aucun updatedAt ne doit être rajeuni
  {
    const arr = [
      { id: 'a', closed: true, updatedAt: 1000, x: 1 },
      { id: 'b', closed: true, updatedAt: 2000, x: 1 },
      { id: 'c', closed: true, updatedAt: 3000, x: 1 },
      { id: 'd', updatedAt: 4000, x: 1 },
      { id: 'e', updatedAt: 5000, x: 1 },
    ];
    const r = run({}, arr);
    const inchanges = arr.map((t) => t.updatedAt).join(',') === '1000,2000,3000,4000,5000';
    ok('T1.1 référence perdue → aucun updatedAt rajeuni', inchanges, 'obtenu: ' + arr.map((t) => t.updatedAt).join(','));
    ok('T1.1b aucune milliseconde commune (pas de mass-stamp)', new Set(arr.map((t) => t.updatedAt)).size === 5);
    ok('T1.1c empreintes ré-adoptées (parc recalé)', Object.keys(r.meta.hash.tournees).length === 5);
    ok('T1.1d épisode TRACÉ dans ftr.stampGuard', Array.isArray(r.guard) && r.guard.length === 1 && r.guard[0].kind === 'tournees');
  }

  // T1.2 — comportement NORMAL préservé : référence connue + une vraie édition → bump de CE record seul
  {
    const arr = [
      { id: 'a', updatedAt: 1000, x: 1 },
      { id: 'b', updatedAt: 2000, x: 1 },
      { id: 'c', updatedAt: 3000, x: 1 },
    ];
    const localStorage = makeLS();
    const aIdx = at('const _HASH_SKIP ='); const bIdx = at('function rebuildSyncHashes()');
    const block2 = LINES.slice(aIdx, bIdx).join('\n');
    const { api } = buildCtx(block2, { localStorage, exports: ['syncStamp', 'hashRec'] });
    api.syncStamp('tournees', arr);          // 1er passage : pose la référence (baselineLost, pas de bump)
    const before = arr.map((t) => t.updatedAt).join(',');
    arr[1].x = 42;                            // édition RÉELLE
    api.syncStamp('tournees', arr);
    ok('T1.2 édition réelle → le record édité EST bumpé', arr[1].updatedAt > 2000, 'b=' + arr[1].updatedAt);
    ok('T1.2b les autres records ne bougent pas', arr[0].updatedAt === 1000 && arr[2].updatedAt === 3000, before + ' -> ' + arr.map((t) => t.updatedAt).join(','));
  }

  // T1.3 — création légitime : petit lot sans référence → doit recevoir un updatedAt
  {
    const arr = [{ id: 'n1', x: 1 }, { id: 'n2', x: 1 }];
    run({}, arr);
    ok('T1.3 petit lot neuf → updatedAt posé (pas de blocage)', arr.every((t) => typeof t.updatedAt === 'number' && t.updatedAt > 0));
  }
}

// ================================================================ 2. sanitizeTourStats
console.log('\n── sanitizeTourStats : garde de gel + prédicat de facture ──');
{
  const a = at('function chevalKeptInResult(c)');
  const b = at('function migrateCreditedCancellations()');
  const block = LINES.slice(a, b).join('\n');

  const mk = (closed) => ({
    id: 't1', closed,
    result: {
      rows: [{ clients: [{ clientId: 'c1', chevaux: [
        { nom: 'Guiness', parage: true },                    // acte → gardé partout
        { nom: 'Planche', photo: { billable: true } },        // facturé par PLANCHE seule → gardé par keep(), PERDU par chevalFait
        { nom: 'Fantome' },                                   // rien → à retirer
      ] }] }],
      parClient: [{ clientId: 'c1', deplacement: [{ chevaux: ['Guiness', 'Planche', 'Fantome'], partTTC: 30 }] }],
    },
  });

  const ctxVars = { tournees: [], archive: [] };
  const { api, ctx } = buildCtx(block, { exports: ['sanitizeTourStats', 'sanitizeAllTourStats', 'chevalKeptInResult'], vars: ctxVars });

  // T2.1 — le cheval facturé par planche seule SURVIT (c'est le bug « 0 ligne, TTC 114,29 »)
  {
    const t = mk(false);
    api.sanitizeTourStats(t);
    const noms = t.result.rows[0].clients[0].chevaux.map((c) => c.nom);
    ok('T2.1 cheval facturé par PLANCHE conservé', noms.includes('Planche'), 'restants: ' + noms.join(','));
    ok('T2.1b cheval avec acte conservé', noms.includes('Guiness'));
    ok('T2.1c cheval sans rien retiré', !noms.includes('Fantome'));
    ok('T2.1d diviseur d’imputation cohérent', t.result.parClient[0].deplacement[0].chevaux.length === 2, JSON.stringify(t.result.parClient[0].deplacement[0].chevaux));
  }

  // T2.2 — une tournée CLÔTURÉE n'est plus jamais touchée
  {
    const t = mk(true);
    const avant = JSON.stringify(t.result);
    ctx.tournees.length = 0; ctx.tournees.push(t);
    ctx.archive.length = 0;
    api.sanitizeAllTourStats();
    ok('T2.2 tournée CLÔTURÉE inchangée', JSON.stringify(t.result) === avant, 'result modifié !');
  }

  // T2.3 — l'archive n'est plus itérée du tout
  {
    const t = mk(true);
    const avant = JSON.stringify(t.result);
    ctx.tournees.length = 0;
    ctx.archive.length = 0; ctx.archive.push(t);
    api.sanitizeAllTourStats();
    ok('T2.3 ARCHIVE jamais touchée', JSON.stringify(t.result) === avant);
  }

  // T2.4 — une tournée non clôturée reste nettoyée (la fonction sert encore à quelque chose)
  {
    const t = mk(false);
    ctx.tournees.length = 0; ctx.tournees.push(t);
    ctx.archive.length = 0;

    api.sanitizeAllTourStats();
    ok('T2.4 tournée NON clôturée toujours nettoyée', t.result.rows[0].clients[0].chevaux.length === 2);
  }
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
