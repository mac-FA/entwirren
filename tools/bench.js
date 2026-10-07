const T = require('../js/logic.js');
const cfgs = [
  {c:3,r:3,n:2,parMin:1,parMax:1},
  {c:4,r:4,n:4,parMin:3,parMax:3},
  {c:4,r:5,n:6,parMin:4,parMax:5},
  {c:5,r:5,n:7,parMin:5,parMax:5,pillars:2},
  {c:5,r:6,n:8,parMin:6,parMax:6,pillars:2,locks:2},
  {c:5,r:6,n:9,parMin:6,parMax:7,pillars:1,locks:2},
  {c:6,r:6,n:10,parMin:7,parMax:7,pillars:2,locks:3},
];
for (const c of cfgs) {
  const t0 = Date.now();
  const lv = T.generate(c, 12345);
  console.log(JSON.stringify(c), lv ? 'par '+lv.par : 'FAIL', (Date.now()-t0)+'ms');
}
