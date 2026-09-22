// Offline conversion only. Never accepts or carries forward legacy credentials.
const fs=require('node:fs');const {validId,POSITIONS}=require('../functions/core');
function migrate(old,mapping) {
  const members={},votes={},locked={},ids=Object.keys(old.users||{}),seen=new Set();
  if(!ids.length)throw new Error('No legacy players.');
  for(const id of ids){
    const target=mapping[id],u=old.users[id];
    if(!validId(target)||seen.has(target))throw new Error('Every legacy player needs a unique valid Auth UID.');
    if(typeof u.username!=='string'||!u.username.trim()||u.username.length>60||!POSITIONS.includes(u.mevki))throw new Error('Invalid legacy profile; correct before migration.');
    seen.add(target);members[target]={username:u.username.trim(),mevki:u.mevki,role:'player',player:true,active:true};
  }
  let count=0;
  for(const [from,row] of Object.entries(old.votes||{})){
    if(!mapping[from])throw new Error('Vote from an unmapped user.');
    for(const [to,raw] of Object.entries(row||{})){
      if(!mapping[to]||from===to)throw new Error('Invalid vote target.');
      const puan=typeof raw==='number'?raw:raw?.puan,aciklama=typeof raw==='number'?'':raw?.aciklama||'';
      // Legacy UI saved comments before a score using puan=0. Do not silently discard them.
      if(!Number.isInteger(puan)||puan<1||puan>10||typeof aciklama!=='string'||aciklama.length>500)throw new Error('Invalid or unscored legacy vote; resolve explicitly before migration.');
      votes[mapping[from]] ||= {};votes[mapping[from]][mapping[to]]={puan,aciklama,ts:Number.isFinite(raw?.ts)?raw.ts:0};count++;
    }
  }
  for(const id of ids)if(old.users[id].oylamaKilidi){
    if(ids.some(t=>t!==id&&!votes[mapping[id]]?.[mapping[t]]))throw new Error('Locked player has incomplete votes.');
    locked[mapping[id]]=Number(old.users[id].oylamaKilidi)||1;
  }
  return {config:{votingOpen:false,started:count>0},members,votes,locked};
}
if(require.main===module){
  try {const [source,map,out]=process.argv.slice(2);if(!source||!map||!out)throw new Error('Usage: node scripts/migrate-legacy.cjs PRIVATE_BACKUP PRIVATE_UID_MAP PRIVATE_OUTPUT');const result=migrate(JSON.parse(fs.readFileSync(source,'utf8')),JSON.parse(fs.readFileSync(map,'utf8')));fs.writeFileSync(out,JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});console.log('Offline migration created. No live database changes; no password hashes copied.');}
  catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={migrate};
