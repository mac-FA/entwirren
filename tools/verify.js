const T = require('../js/logic.js');
// BFS-Gegenprobe auf kleinen Brettern
function bfs(b, pos0, maxD){
  const key = p=>p.join(',');
  let frontier=[Array.from(pos0)], seen=new Set([key(pos0)]);
  for(let d=0; d<=maxD; d++){
    const next=[];
    for(const p of frontier){
      if(T.analyze(b,p).solved) return d;
      const occ=new Set(p);
      for(let i=0;i<p.length;i++){ if(b.locked[i]) continue;
        for(let s=0;s<b.S;s++){ if(occ.has(s)) continue; const q=p.slice(); q[i]=s; const k=key(q); if(!seen.has(k)){seen.add(k); next.push(q);} } }
    }
    frontier=next;
  }
  return -1;
}
let bad=0;
for(let seed=1; seed<=60; seed++){
  const cfg = seed%2 ? {c:3,r:4,n:3,parMin:1,parMax:4,minTangled:2} : {c:4,r:4,n:4,parMin:1,parMax:4,pillars:1,locks:1,minTangled:2};
  const lv=T.generate(cfg, seed); if(!lv) continue;
  const b=T.makeBoard(lv); const d=bfs(b, lv.p, 4);
  if(d!==lv.par){bad++; console.log('MISMATCH seed',seed,'ida',lv.par,'bfs',d);}
}
console.log('mismatches:',bad);
// Verteilung par vs h0
const stats={};
for(let seed=1; seed<=200; seed++){
  const lv=T.generate({c:5,r:5,n:7,parMin:3,parMax:8,pillars:1}, seed*7); if(!lv) continue;
  const b=T.makeBoard(lv); const a=T.analyze(b,lv.p);
  // h0
  const N=b.N, adj=new Int32Array(N); let forced=0;
  for(const c of a.conflicts){ if(c.type==='pillar') forced|=1<<c.a; else {adj[c.a]|=1<<c.b; adj[c.b]|=1<<c.a;} }
  const h=T.minCover(adj,N,forced);
  const k=`par${lv.par}-h${h}`; stats[k]=(stats[k]||0)+1;
}
console.log(stats);
