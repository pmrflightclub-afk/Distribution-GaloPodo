// Harness L6 — gel par client (module C, D1) : le bloc d'un client figé ne bouge plus.
// Exécution : node test/lotL6-gel-client.test.js
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LINES = SRC.split('\n');
const at = (n) => { const i = LINES.findIndex((l) => l.includes(n)); if (i < 0) throw new Error('introuvable: ' + n); return i; };
const grabFn = (sig) => { const s0 = at(sig); const e0 = LINES.findIndex((l, k) => k > s0 && l === '}'); return LINES.slice(s0, e0 + 1).join('\n'); };

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); } };

const api = new Function('S', 'logWrite',
  grabFn('function freezeClientBlock(t, cid)') + '\n' + grabFn('function applyFrozenClients(t, R)') +
  '\n; return { freezeClientBlock, applyFrozenClients };')({ deviceId: 'devX' }, () => {});

console.log('\n── L6 : gel par client (D1) ──');

// 1. freezeClientBlock photographie le bloc du client
{
  const t = { id: 't1', result: { parClient: [{ clientId: 'c1', totalTTC: 150, totalHT: 124, totalTVA: 26, deplacement: [{ partHT: 50 }] }, { clientId: 'c2', totalTTC: 100 }] } };
  api.freezeClientBlock(t, 'c1');
  ok('1. bloc c1 figé (snapshot profond)', t.frozenClients && t.frozenClients.c1 && t.frozenClients.c1.m.totalTTC === 150, JSON.stringify(t.frozenClients && t.frozenClients.c1 && t.frozenClients.c1.m && t.frozenClients.c1.m.totalTTC));
  ok('1b. frozenAt + deviceId posés', typeof t.frozenClients.c1.frozenAt === 'number' && t.frozenClients.c1.deviceId === 'devX');
  // mutation du snapshot d'origine ne doit pas affecter le gel (copie profonde)
  t.result.parClient[0].totalTTC = 999;
  ok('1c. copie PROFONDE (le gel ne suit pas une mutation ultérieure)', t.frozenClients.c1.m.totalTTC === 150);
  // 2e appel : jamais ré-écrit
  const before = t.frozenClients.c1.frozenAt;
  api.freezeClientBlock(t, 'c1');
  ok('1d. gel monotone (jamais ré-écrit)', t.frozenClients.c1.frozenAt === before && t.frozenClients.c1.m.totalTTC === 150);
}

// 2. applyFrozenClients : D1 — le client figé retrouve son bloc APRÈS un recalcul qui l'aurait changé
{
  const t = { id: 't1', frozenClients: { c1: { frozenAt: 1, m: { clientId: 'c1', totalTTC: 150, totalHT: 124, totalTVA: 26 } } } };
  // recalcul « frais » : c1 aurait chuté à 90 (arrêt ajouté), c2 = 60
  const R = { parClient: [{ clientId: 'c1', totalTTC: 90, totalHT: 74, totalTVA: 16 }, { clientId: 'c2', totalTTC: 60, totalHT: 50, totalTVA: 10 }], totalTTC: 150, totalHT: 124, totalTVA: 26 };
  api.applyFrozenClients(t, R);
  const c1 = R.parClient.find((m) => m.clientId === 'c1');
  ok('2. client FIGÉ retrouve 150 (ne chute pas à 90) — D1', c1.totalTTC === 150, String(c1.totalTTC));
  const c2 = R.parClient.find((m) => m.clientId === 'c2');
  ok('2b. client NON figé garde sa part courante (60)', c2.totalTTC === 60);
  ok('2c. total tournée re-dérivé = Σ des parts (150 + 60 = 210)', R.totalTTC === 210, String(R.totalTTC));
}

// 3. Pas de frozenClients → applyFrozenClients ne touche à rien
{
  const R = { parClient: [{ clientId: 'c1', totalTTC: 90 }], totalTTC: 90 };
  api.applyFrozenClients({ id: 't1' }, R);
  ok('3. aucun gel → result inchangé', R.parClient[0].totalTTC === 90 && R.totalTTC === 90);
}

// 4. graftClosure : union par client, le gel le PLUS ANCIEN gagne
{
  const code = LINES[at('L6 : frozenClients (blocs de répartition figés par client)') + 1].trim();
  const run = (to, from) => { new Function('to', 'from', code)(to, from); return to; };
  const r = run({ frozenClients: { c1: { frozenAt: 200, m: { totalTTC: 90 } } } }, { frozenClients: { c1: { frozenAt: 100, m: { totalTTC: 150 } }, c2: { frozenAt: 50, m: { totalTTC: 30 } } } });
  ok('4. conflit c1 → gel le plus ancien (frozenAt 100) gagne', r.frozenClients.c1.m.totalTTC === 150, JSON.stringify(r.frozenClients.c1));
  ok('4b. c2 absent côté « to » → greffé', r.frozenClients.c2 && r.frozenClients.c2.m.totalTTC === 30);
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' réussis, ' + fail + ' échoués\n');
process.exit(fail === 0 ? 0 : 1);
