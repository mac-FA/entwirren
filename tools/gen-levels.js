// Erzeugt js/levels.js — 60 Level mit steigender Schwierigkeit und solverberechnetem Optimum.
// Aufruf: node tools/gen-levels.js
const fs = require('fs'), path = require('path');
const T = require('../js/logic.js');
// [Spalten, Zeilen, Schläuche, parMin, parMax, Säulen, Sperren, Trick]
// Trick = Optimum muss um so viel über der offensichtlichen Untergrenze liegen
const plan = [
  [3,3,2,1,1,0,0,0],[3,3,2,1,1,0,0,0],[3,4,3,1,2,0,0,0],[3,4,3,2,2,0,0,0],[4,4,3,2,2,0,0,0],
  [4,4,4,2,3,0,0,0],[4,4,4,3,3,0,0,0],[4,4,4,3,3,0,0,0],[4,5,5,3,3,0,0,0],[4,5,5,3,4,0,0,1],
  [4,5,5,4,4,0,0,0],[4,5,6,4,4,0,0,0],[4,5,6,4,4,0,0,0],[4,5,6,4,5,0,0,1],[5,5,6,5,5,0,0,0],
  // Säulen
  [4,4,4,2,3,1,0,0],[4,5,5,3,4,1,0,0],[4,5,5,4,4,2,0,0],[5,5,6,4,5,2,0,0],[5,5,6,5,5,2,0,1],
  [5,5,7,5,5,1,0,0],[5,5,7,5,6,2,0,0],[5,5,7,5,6,3,0,1],[5,5,7,6,6,2,0,0],[5,6,8,6,6,2,0,0],
  // gesperrte Stecker
  [4,4,4,3,3,0,1,0],[4,5,5,3,4,0,2,0],[4,5,6,4,5,0,2,0],[5,5,6,4,5,1,2,0],[5,5,7,5,5,1,2,1],
  [5,5,7,5,6,2,2,0],[5,5,7,5,6,2,3,0],[5,6,8,5,6,1,3,0],[5,6,8,6,6,2,3,0],[5,6,8,6,7,2,3,1],
  // knapper Platz
  [4,4,5,3,4,0,0,0],[4,5,6,4,5,0,1,1],[4,5,7,4,5,0,1,0],[5,5,8,5,6,0,2,0],[5,5,9,5,6,0,2,1],
  [5,5,8,5,6,2,2,0],[5,6,9,6,6,1,2,0],[5,6,9,6,7,2,3,0],[5,6,10,6,7,1,3,0],[5,6,10,6,7,2,3,1],
  // Meister
  [6,6,9,6,7,2,2,0],[6,6,10,6,7,2,3,0],[6,6,10,7,7,3,3,0],[6,6,11,7,7,2,3,0],[6,6,11,7,8,3,3,1],
  [6,6,12,7,8,2,4,0],[6,6,12,7,8,3,4,1],[6,7,12,8,8,3,3,0],[6,7,13,8,8,3,4,0],[6,7,13,8,9,3,4,1],
  [6,7,14,8,9,2,4,0],[6,7,14,8,9,3,4,1],[7,7,14,9,9,3,4,0],[7,7,15,9,10,3,5,0],[7,7,15,9,10,4,5,1],
];
const levels = [];
const t0 = Date.now();
function write() {
  const out = '/* Automatisch erzeugt von tools/gen-levels.js — nicht von Hand bearbeiten. */\n' +
    'window.TANGLE_LEVELS = [\n' + levels.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n];\n';
  fs.writeFileSync(path.join(__dirname, '../js/levels.js'), out);
}
plan.forEach(([c, r, n, parMin, parMax, pillars, locks, extra], i) => {
  let lv = null;
  // Bei Bedarf schrittweise lockern: erst Trick-Bedingung, dann Mindest-Optimum
  const tries = [[parMin, extra], [parMin, 0], [parMin - 1, 0], [parMin - 2, 0]];
  for (const [pm, ex] of tries) {
    for (let seed = 1000 * (i + 1); !lv && seed < 1000 * (i + 1) + 40; seed++)
      lv = T.generate({ c, r, n, parMin: pm, parMax, pillars, locks, extra: ex, attempts: 25, budget: 6e5 }, seed);
    if (lv) break;
  }
  if (!lv) { console.error('Level', i + 1, 'FEHLGESCHLAGEN', c, r, n); process.exit(1); }
  delete lv.sol;
  levels.push(lv);
  console.log(`L${i + 1}: ${c}x${r} ${n} Schläuche  par ${lv.par}  (${Date.now() - t0} ms)`);
  write();
});
