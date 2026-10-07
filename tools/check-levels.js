// Prüft js/levels.js: jedes Level verheddert, Optimum stimmt mit dem Solver überein.
const fs = require('fs'), path = require('path');
const T = require('../js/logic.js');
const window = {};
eval(fs.readFileSync(path.join(__dirname, '../js/levels.js'), 'utf8'));
let bad = 0;
window.TANGLE_LEVELS.forEach((lv, i) => {
  const b = T.makeBoard(lv);
  const a = T.analyze(b, lv.p);
  const sol = T.solve(b, lv.p, { maxDepth: lv.par, budget: 5e6 });
  const ok = !a.solved && sol && sol.moves.length === lv.par && new Set(lv.p).size === lv.p.length;
  if (!ok) { bad++; console.log('FEHLER Level', i + 1, { solved: a.solved, sol: sol && sol.moves.length, par: lv.par }); }
});
console.log(window.TANGLE_LEVELS.length, 'Level geprüft,', bad, 'Fehler');
