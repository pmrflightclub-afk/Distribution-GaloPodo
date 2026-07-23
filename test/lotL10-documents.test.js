// Harness L10 — documents indépendants : création + attachement (impayé/avoir) + blocage de clôture.
// Exécution : node test/lotL10-documents.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };
const grabFn = (sig) => { const s0 = at(sig); const e0 = LINES.findIndex((l, k) => k > s0 && l === '}'); return LINES.slice(s0, e0 + 1).join('\n'); };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

console.log('\n── L10 : documents indépendants ──');

const S = { documents: [], documentSeq: 0, deviceId: 'devABC' };
const clients = [{ id: 'c1', nom: 'Dupont', impayes: [], avoirs: [] }];
const src = grabFn('function nextDocumentNumero(type)') + '\n' + grabFn('function createIndepDoc(clientId, type, montantTTC, opts)') + '\n' + grabFn('function clientPendingDocs(clientId)');
const api = new Function('S', 'clients', 'uid', 'todayStr', 'clientName', 'saveSettings', 'saveClients', 'logWrite', 'setClientAvoir', 'ncDevicePfx',
  src + '\n; return { nextDocumentNumero, createIndepDoc, clientPendingDocs };')(
  S, clients, (() => { let n = 0; return () => 'id' + (++n); })(), () => '2026-08-05', (id) => 'Dupont', () => {}, () => {}, () => {},
  (t, cid, ttc, o) => { const c = clients.find((x) => x.id === cid); c.avoirs.push({ id: 'av', ttc, motif: o && o.motif }); }, () => 'BC');

// 1. Facture de vente LIQUIDE → impayé (CA neuf, reporte:true) + document
{
  const doc = api.createIndepDoc('c1', 'facture', 80, { method: 'liquide', motif: 'fers' });
  ok('1. document facture créé (numéro V…)', doc && /^VBC-\d+$/.test(doc.numero), doc && doc.numero);
  ok('1b. impayé attaché (reporte:true = CA neuf), sourceTourId null', clients[0].impayes.length === 1 && clients[0].impayes[0].reporte === true && clients[0].impayes[0].sourceTourId === null && clients[0].impayes[0].docId === doc.id, JSON.stringify(clients[0].impayes[0]));
  ok('1c. document enregistré, statut à régler', S.documents.length === 1 && S.documents[0].statut === 'a-regler');
}

// 2. NC indépendante LIQUIDE → avoir (déduit prochaine visite)
{
  const doc = api.createIndepDoc('c1', 'nc', 25, { method: 'liquide', motif: 'geste' });
  ok('2. document NC créé (numéro N…)', /^NBC-\d+$/.test(doc.numero), doc.numero);
  ok('2b. avoir attaché', clients[0].avoirs.length === 1 && clients[0].avoirs[0].ttc === 25);
}

// 3. Document VIREMENT → PAS d'impayé, mais bloque la clôture (clientPendingDocs)
{
  const nBefore = clients[0].impayes.length;
  const doc = api.createIndepDoc('c1', 'facture', 120, { method: 'virement', facture: true, motif: 'facture pro' });
  ok('3. virement → aucun impayé ajouté (paiement porté par le document)', clients[0].impayes.length === nBefore);
  ok('3b. clientPendingDocs le signale (bloque la clôture)', api.clientPendingDocs('c1').some((d) => d.id === doc.id), JSON.stringify(api.clientPendingDocs('c1').map((d) => d.numero)));
}

// 4. Un document réglé ne bloque plus
{
  S.documents.filter((d) => d.method === 'virement').forEach((d) => (d.statut = 'regle'));
  ok('4. document virement réglé → ne bloque plus', api.clientPendingDocs('c1').length === 0);
}

// 5. Numéros monotones (persistés) et distincts par type
{
  ok('5. compteur documentSeq persisté et croissant', S.documentSeq >= 3, String(S.documentSeq));
  const nums = S.documents.map((d) => d.numero);
  ok('5b. aucun numéro réemployé', new Set(nums).size === nums.length, nums.join(','));
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
