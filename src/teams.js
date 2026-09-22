export function positionRanks(rows){let last,rank=0;return rows.map((r,i)=>{if(r.avg!==last)rank=i+1;last=r.avg;return {...r,rank:r.avg===null?null:rank};});}
// Preserve main's deterministic heuristic: position order, descending score,
// then prefer the smaller team or the lower total. This is not an optimality guarantee.
export function balancedTeams(players){
  const positions=['Kaleci','Defans','Orta Saha','Forvet'];
  const sorted=[...players].sort((a,b)=>positions.indexOf(a.mevki)-positions.indexOf(b.mevki)||(b.avg??5)-(a.avg??5));
  const teams=[[],[]],sums=[0,0];
  for(const p of sorted){const t=teams[0].length!==teams[1].length?(teams[0].length<teams[1].length?0:1):(sums[0]<=sums[1]?0:1);teams[t].push(p);sums[t]+=p.avg??5;}
  return {teams,averages:teams.map((t,i)=>t.length?sums[i]/t.length:0)};
}
