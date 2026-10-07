// Ergänzt js/levels.js: handgebautes Level 1 + fehlende Schlusslevel (gelockerte Vorgaben).
// Aufruf: node tools/gen-tail.js
const fs = require('fs'), path = require('path');
const T = require('../js/logic.js');
const file = path.join(__dirname, '../js/levels.js');
const window = {};
eval(fs.readFileSync(file, 'utf8'));
let levels = window.TANGLE_LEVELS;

// Level 1: ein einfaches X auf 3x3
if (!levels[0].hand) {
  const intro = { c: 3, r: 3, p: [0, 8, 2, 6], k: [], f: [], l: [0, 1], hand: 1 };
  intro.par = T.solve(T.makeBoard(intro), intro.p).moves.length;
  levels = [intro, levels[0], ...levels.slice(2)];
}

const tail = [
  [6, 7, 14, 8, 9, 3, 4], [7, 7, 14, 8, 9, 3, 4], [7, 7, 15, 8, 9, 3, 5], [7, 7, 15, 9, 9, 4, 5],
];
const want = 60;
let k = levels.length - (want - tail.length);
while (levels.length < want) {
  const [c, r, n, parMin, parMax, pillars, locks] = tail[Math.max(0, k++)];
  let lv = null;
  const t0 = Date.now();
  for (let seed = 77000 + levels.length * 100; !lv; seed++)
    lv = T.generate({ c, r, n, parMin, parMax, pillars, locks, attempts: 10, budget: 4e5 }, seed);
  delete lv.sol;
  levels.push(lv);
  console.log(`L${levels.length}: ${c}x${r} ${n} Schläuche  par ${lv.par}  (${Date.now() - t0} ms)`);
  write();
}
write();
function write() {
  fs.writeFileSync(file, '/* Automatisch erzeugt von tools/gen-levels.js + gen-tail.js — nicht von Hand bearbeiten. */\n' +
    'window.TANGLE_LEVELS = [\n' + levels.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n];\n');
}
console.log('Level gesamt:', levels.length, '· L1 par', levels[0].par);
