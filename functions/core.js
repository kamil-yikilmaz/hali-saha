'use strict';
const POSITIONS = ['Kaleci', 'Defans', 'Orta Saha', 'Forvet'];
class PolicyError extends Error { constructor(code, message) { super(message); this.code = code; } }
function requireThat(ok, code, message) { if (!ok) throw new PolicyError(code, message); }
function validId(id) { return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id) && !['__proto__','constructor','prototype'].includes(id); }
function text(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function participants(s) { return Object.entries(s.members || {}).filter(([,m]) => m.active === true && m.player === true); }
function authorize(s, identity, now, mutation = false) {
  requireThat(identity && identity.emailVerified === true && validId(identity.uid), 'unauthenticated', 'Doğrulanmış hesapla giriş yapın.');
  const me = s.members?.[identity.uid];
  requireThat(me?.active === true, 'permission-denied', 'Hesabınız için erişim tanımlanmamış.');
  if (me.role === 'admin') {
    requireThat(identity.secondFactor === 'totp', 'failed-precondition', 'Yönetici için doğrulama uygulamasıyla iki aşamalı giriş gerekli.');
    requireThat(Number.isFinite(identity.authTime) && now / 1000 - identity.authTime <= (mutation ? 600 : 3600), 'unauthenticated', 'Yönetici oturumunu yenilemek için yeniden giriş yapın.');
  }
  return me;
}
function results(s) {
  const players = participants(s), ids = new Set(players.map(([id])=>id));
  const rows = players.map(([uid,m]) => {
    const scores = players.filter(([id])=>id !== uid).map(([id])=>s.votes?.[id]?.[uid]?.puan).filter(n=>Number.isInteger(n) && n>=1 && n<=10);
    const sum = scores.reduce((a,b)=>a+b,0);
    return {uid, username:m.username, mevki:m.mevki, count:scores.length, expected:ids.size-1, sum, avg:scores.length?sum/scores.length:null, min:scores.length?Math.min(...scores):null, max:scores.length?Math.max(...scores):null};
  }).sort((a,b)=>(b.avg ?? -1)-(a.avg ?? -1)||a.username.localeCompare(b.username,'tr'));
  let last, rank=0;
  return rows.map((r,i)=> { if(r.avg !== last) rank=i+1; last=r.avg; return {...r,rank:r.avg===null?null:rank}; });
}
function snapshot(s, identity, now) {
  const me = authorize(s, identity, now), admin = me.role === 'admin';
  const players=participants(s), expected=players.length*Math.max(players.length-1,0);
  const done=players.reduce((n,[id])=>n+players.filter(([t])=>t!==id && s.votes?.[id]?.[t]).length,0);
  const visible=admin || s.locked?.[identity.uid] || s.config?.votingOpen===false;
  const out={me:{uid:identity.uid,username:me.username,mevki:me.mevki,role:me.role,player:me.player,locked:!!s.locked?.[identity.uid]},open:s.config?.votingOpen===true,
    players:players.map(([uid,m])=>({uid,username:m.username,mevki:m.mevki})),myVotes:s.votes?.[identity.uid]||{},progress:{done,expected},results:visible?results(s):null,
    comments:visible?players.flatMap(([id])=>{const v=s.votes?.[id]?.[identity.uid];return v?.aciklama?[{puan:v.puan,aciklama:v.aciklama}]:[]}).sort((a,b)=>b.puan-a.puan):[]};
  if(admin) { out.members=Object.entries(s.members||{}).map(([uid,m])=>({uid,username:m.username,mevki:m.mevki,role:m.role,player:m.player,active:m.active,locked:!!s.locked?.[uid]})); out.votes=s.votes||{}; out.audit=Object.values(s.audit||{}).sort((a,b)=>b.at-a.at); }
  return out;
}
function apply(s, identity, input, now, eventId) {
  requireThat(input && typeof input==='object' && !Array.isArray(input), 'invalid-argument', 'Geçersiz işlem.');
  const {action}=input, me=authorize(s,identity,now,true), uid=identity.uid;
  s.votes ||= {}; s.locked ||= {}; s.config ||= {votingOpen:false};
  const adminActions=['member','deactivate','toggle','unlock','resetOne','resetAll'];
  if(adminActions.includes(action)) requireThat(me.role==='admin','permission-denied','Yönetici yetkisi gerekli.');
  switch(action) {
    case 'vote': {
      const {target,puan,aciklama}=input;
      requireThat(me.player===true && validId(target) && target!==uid && s.members?.[target]?.active===true && s.members[target].player===true,'permission-denied','Bu oyuncuya oy veremezsiniz.');
      requireThat(s.config.votingOpen===true && !s.locked[uid],'failed-precondition','Oylama kapalı veya oyunuz kesinleşmiş.');
      requireThat(Number.isInteger(puan)&&puan>=1&&puan<=10&&typeof aciklama==='string'&&aciklama.length<=500,'invalid-argument','Puan 1–10 tam sayı, açıklama en fazla 500 karakter olmalı.');
      s.votes[uid] ||= {}; s.votes[uid][target]={puan,aciklama:aciklama.trim(),ts:now}; s.config.started=true; break;
    }
    case 'finalize':
      requireThat(me.player===true&&s.config.votingOpen===true&&!s.locked[uid],'failed-precondition','Oylama kesinleştirilemiyor.');
      requireThat(participants(s).length>1&&participants(s).every(([id])=>id===uid||s.votes[uid]?.[id]),'failed-precondition','Önce tüm oyuncuları değerlendirin.');
      s.locked[uid]=now; break;
    case 'position':
      requireThat(me.player===true&&!s.config.started&&!s.locked[uid],'failed-precondition','Oy verilmeye başlandıktan sonra mevki değişmez.');
      requireThat(POSITIONS.includes(input.mevki),'invalid-argument','Geçersiz mevki.'); me.mevki=input.mevki; break;
    case 'member': {
      const {target,username,mevki}=input;
      requireThat(!s.config.started,'failed-precondition','Kadro değişikliği için yeni oylama başlatın.');
      requireThat(validId(target)&&text(username,60)&&POSITIONS.includes(mevki),'invalid-argument','Kimlik, ad veya mevki geçersiz.');
      requireThat(!Object.entries(s.members).some(([id,m])=>id!==target&&m.username.toLocaleLowerCase('tr')===username.trim().toLocaleLowerCase('tr')),'already-exists','Bu oyuncu adı kullanılıyor.');
      requireThat(s.members[target]||Object.keys(s.members).length<100,'resource-exhausted','En fazla 100 üye desteklenir.');
      requireThat(!s.members[target]||s.members[target].role!=='admin','failed-precondition','Yönetici hesabı bu ekrandan değiştirilemez.');
      s.members[target]={username:username.trim(),mevki,role:'player',player:true,active:true}; break;
    }
    case 'deactivate':
      requireThat(!s.config.started,'failed-precondition','Kadro değişikliği için yeni oylama başlatın.');
      requireThat(validId(input.target)&&s.members[input.target]?.role==='player','invalid-argument','Oyuncu bulunamadı.');
      s.members[input.target].active=false; break;
    case 'toggle': requireThat(typeof input.open==='boolean','invalid-argument','Durum geçersiz.'); s.config.votingOpen=input.open; break;
    case 'unlock': case 'resetOne':
      requireThat(validId(input.target)&&s.members[input.target]?.player===true,'invalid-argument','Oyuncu bulunamadı.');
      delete s.locked[input.target]; if(action==='resetOne') delete s.votes[input.target]; break;
    case 'resetAll':
      requireThat(s.config.votingOpen===false&&input.confirm==='YENI OYLAMA','failed-precondition','Önce oylamayı kapatıp yeni oylamayı onaylayın.');
      s.votes={}; s.locked={}; s.config.started=false; break;
    default: throw new PolicyError('invalid-argument','Desteklenmeyen işlem.');
  }
  // One atomic transaction stores state and audit; never record password, token or comment body.
  s.audit ||= {}; s.audit[eventId]={actor:uid,action,target:validId(input.target)?input.target:null,at:now};
  const keys=Object.keys(s.audit).sort((a,b)=>s.audit[a].at-s.audit[b].at);
  keys.slice(0,Math.max(keys.length-500,0)).forEach(k=>delete s.audit[k]);
  return s;
}
module.exports={POSITIONS,PolicyError,validId,authorize,snapshot,apply,results};
