// Hintergrund-Rechner: optimaler Tipp und Zufallsrätsel, ohne die Darstellung zu blockieren.
importScripts('logic.js');

onmessage = (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'solve') {
      const b = Tangle.makeBoard(e.data.level);
      const res = Tangle.solve(b, e.data.pos, { maxDepth: 18, budget: 2.5e6 });
      if (res) postMessage({ id, ok: true, moves: res.moves, optimal: true });
      else postMessage({ id, ok: true, moves: [Tangle.greedyMove(b, e.data.pos)], optimal: false });
    } else if (type === 'gen') {
      let lv = null;
      for (let k = 0; !lv && k < 60; k++) {
        lv = Tangle.generate(Object.assign({}, e.data.params, { attempts: 25, budget: 5e5 }), e.data.seed + k * 7919);
      }
      postMessage({ id, ok: !!lv, level: lv });
    }
  } catch (err) {
    postMessage({ id, ok: false, error: String(err) });
  }
};
