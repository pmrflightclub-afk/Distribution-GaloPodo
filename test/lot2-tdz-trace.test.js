// Harness LOT 2 — zone morte temporelle de rebuildSyncHashes + traces (quota, reconstruction, versions).
// Exécution : node test/lot2-tdz-trace.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n, from = 0) => { const i = LINES.findIndex((l, k) => k >= from && l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

function makeLS(quotaOn) {
  const store = {};
  return { store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { if (quotaOn && quotaOn(k)) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } store[k] = String(v); },
    removeItem: (k) => { delete store[k]; } };
}

// ================================================================ 1. TDZ
console.log('\n── rebuildSyncHashes : robustesse à la zone morte temporelle ──');
{
  const bloc = LINES.slice(at('const _HASH_SKIP ='), at('function saveClients()')).join('\n');

  // Reproduit la condition réelle : `clients` / `allTours` / SETTINGS_COLLECTIONS en ZONE MORTE
  // (déclarés en `let`/`const` APRÈS le point d'appel), exactement comme au chargement du module.
  const run = (tdz) => {
    const localStorage = makeLS();
    const ctx = { localStorage, hashStr: (s) => String(s.length), uid: () => 'u1',
      LS: { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) },
      APP_VERSION: '1.0-test' };
    const keys = Object.keys(ctx);
    const prologue = tdz
      ? 'let __res = rebuildSyncHashes();\nlet clients = [{id:"c1"}]; let tournees = [{id:"t1"}]; let archive = [];\nfunction allTours(){ return tournees.concat(archive); }\nconst SETTINGS_COLLECTIONS = ["frais"]; let S = { frais: [] };'
      : 'let clients = [{id:"c1"}]; let tournees = [{id:"t1"}]; let archive = [];\nfunction allTours(){ return tournees.concat(archive); }\nconst SETTINGS_COLLECTIONS = ["frais"]; let S = { frais: [] };\nlet __res = rebuildSyncHashes();';
    const code = bloc + '\n' + prologue + '\n; return { res: __res, meta: JSON.parse(localStorage.getItem("ftr.syncmeta") || "null"), fail: JSON.parse(localStorage.getItem("ftr.rebuildFail") || "null") };';
    return new Function(...keys, code)(...keys.map((k) => ctx[k]));
  };

  // AVANT le correctif, cet appel levait une ReferenceError (typeof sur un `let` en zone morte).
  let leve = false, out = null;
  try { out = run(true); } catch (e) { leve = true; out = e; }
  ok('1.1 appel en zone morte : ne lève PLUS', !leve, leve ? String(out && out.message) : '');
  ok('1.2 reconstruction signalée comme PARTIELLE', out && out.res === false, JSON.stringify(out && out.res));
  ok('1.3 échec TRACÉ dans ftr.rebuildFail', !!(out && Array.isArray(out.fail) && out.fail.length === 1), JSON.stringify(out && out.fail));
  ok('1.4 métadonnées tout de même écrites (pas de corruption)', !!(out && out.meta && out.meta.hash));

  const out2 = run(false);
  ok('1.5 appel NORMAL : reconstruction complète', out2.res === true);
  ok('1.6 aucune trace d’échec quand tout va bien', out2.fail === null);
  ok('1.7 empreintes réellement reconstruites', !!(out2.meta.hash.clients && out2.meta.hash.clients.c1 && out2.meta.hash.tournees.t1));
}

// ================================================================ 2. purge quota tracée
console.log('\n── LS.set : la purge quota et son issue sont consignées ──');
{
  const bloc = LINES.slice(at('const LS = {'), at('const uid = ()')).join('\n');
  const mkLS = (quotaOn) => {
    const localStorage = makeLS(quotaOn);
    const ctx = { localStorage, rebuildSyncHashes: () => true };
    const keys = Object.keys(ctx);
    const { LS } = new Function(...keys, bloc + '\n; return { LS };')(...keys.map((k) => ctx[k]));
    return { LS, localStorage };
  };

  // CAS A — stockage TOUJOURS plein : la ré-écriture échoue, l'erreur remonte… mais la purge doit laisser une trace.
  {
    const { LS, localStorage } = mkLS((k) => k === 'ftr.clients');
    let leve = false;
    try { LS.set('ftr.clients', [{ id: 'c1' }]); } catch (e) { leve = true; }
    const q = JSON.parse(localStorage.getItem('ftr.quotaLog') || 'null');
    ok('2.1 erreur bien propagée quand le stockage reste plein', leve);
    ok('2.2 purge tout de même consignée (cas le plus grave)', Array.isArray(q) && q.length === 1, JSON.stringify(q));
    ok('2.3 la clé en cause est enregistrée', q && q[0].cle === 'ftr.clients');
    ok('2.4 reconstruction marquée NON faite', q && q[0].rebuilt === false && !q[0].ecrit);
    ok('2.5 les tombstones sont préservés', localStorage.getItem('ftr.tomb') !== null);
  }

  // CAS B — quota une seule fois : la purge libère la place, la ré-écriture et la reconstruction aboutissent.
  {
    let n = 0;
    const { LS, localStorage } = mkLS(() => (++n === 1));
    let leve = false;
    try { LS.set('ftr.clients', [{ id: 'c1' }]); } catch (e) { leve = true; }
    const q = JSON.parse(localStorage.getItem('ftr.quotaLog') || 'null');
    ok('2.6 purge réussie : aucune erreur propagée', !leve);
    ok('2.7 issue complétée (écrit + reconstruit)', q && q.length === 1 && q[0].rebuilt === true && q[0].ecrit === true, JSON.stringify(q));
    ok('2.8 la valeur cible est bien enregistrée', JSON.parse(localStorage.getItem('ftr.clients'))[0].id === 'c1');
  }
}

// ================================================================ 3. journal des versions
console.log('\n── recordAppRun : attribuer une passe de masse à une version ──');
{
  const bloc = LINES.slice(at('function _entityCounts()'), at('// LOT 2 — `typeof x` NE PROTÈGE PAS')).join('\n');
  const mk = (tours, cli, version, localStorage) => {
    const ctx = { localStorage, APP_VERSION: version, clients: cli, allTours: () => tours };
    const keys = Object.keys(ctx);
    return new Function(...keys, bloc + '\n; return { recordAppRun, _entityCounts };')(...keys.map((k) => ctx[k]));
  };
  const T1 = [{ id: 't1', closed: true, arrets: [{ clients: [{ chevaux: [{ nom: 'a' }, { nom: 'b' }] }] }], articles: [{ id: 'a1' }], payments: { c1: {} }, result: { parClient: [{ clientId: 'c1' }] } }];
  const C1 = [{ id: 'c1', chevaux: [{ nom: 'a' }, { nom: 'b' }] }];

  const ls = makeLS();
  mk(T1, C1, '1.7.97', ls).recordAppRun();
  const r1 = JSON.parse(ls.getItem('ftr.lastRun'));
  ok('3.1 démarrage enregistré (version + compteurs)', r1.v === '1.7.97' && r1.counts.chevaux === 2 && r1.counts.paiements === 1, JSON.stringify(r1.counts));
  ok('3.2 pas d’entrée d’historique au 1ᵉʳ démarrage', ls.getItem('ftr.migHist') === null);

  // même version → pas un événement
  mk(T1, C1, '1.7.97', ls).recordAppRun();
  ok('3.3 même version → aucun événement de migration', ls.getItem('ftr.migHist') === null);

  // montée de version SANS perte
  mk(T1, C1, '1.8.0', ls).recordAppRun();
  let h = JSON.parse(ls.getItem('ftr.migHist'));
  ok('3.4 montée de version enregistrée', h.length === 1 && h[0].de === '1.7.97' && h[0].vers === '1.8.0');
  ok('3.5 aucune baisse signalée', h[0].baisse === false, JSON.stringify(h[0].delta));

  // montée de version AVEC perte (le scénario à détecter)
  const T2 = JSON.parse(JSON.stringify(T1));
  T2[0].arrets[0].clients[0].chevaux = [{ nom: 'a' }];  // un cheval disparu
  T2[0].payments = {};                                   // paiement effacé
  mk(T2, C1, '1.8.1', ls).recordAppRun();
  h = JSON.parse(ls.getItem('ftr.migHist'));
  const last = h[h.length - 1];
  ok('3.6 BAISSE d’entités actées détectée', last.baisse === true, JSON.stringify(last.delta));
  ok('3.7 delta chiffré (cheval + paiement)', last.delta.chevaux === -1 && last.delta.paiements === -1, JSON.stringify(last.delta));
  ok('3.8 état avant/après conservé pour l’enquête', !!(last.avant && last.apres));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
