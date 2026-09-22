'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getDatabase}=require('firebase-admin/database');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineString}=require('firebase-functions/params');
const {randomUUID}=require('node:crypto');
const {PolicyError,authorize,snapshot,apply,validId}=require('./core');
initializeApp();
const allowedOrigin=defineString('ALLOWED_ORIGIN',{default:'https://kamil-yikilmaz.github.io'});
exports.secureApi=onCall({region:'europe-west1',enforceAppCheck:true,cors:allowedOrigin,maxInstances:3,concurrency:20,timeoutSeconds:30,memory:'256MiB'},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Giriş gerekli.');
  let token;
  try { token=await getAuth().verifyIdToken((request.rawRequest.headers.authorization||'').replace(/^Bearer /,''),true); }
  catch { throw new HttpsError('unauthenticated','Oturum geçersiz. Yeniden giriş yapın.'); }
  const identity={uid:token.uid,emailVerified:token.email_verified===true,authTime:token.auth_time,secondFactor:token.firebase?.sign_in_second_factor};
  const now=Date.now(), db=getDatabase(), ref=db.ref('secureV2');
  try {
    const state=(await ref.get()).val()||{};
    authorize(state,identity,now);
    if(!request.data||Buffer.byteLength(JSON.stringify(request.data))>4096) throw new PolicyError('invalid-argument','İstek boyutu veya biçimi geçersiz.');
    // Distributed counter: rejected requests also consume budget. Only approved members create counters.
    const limit=await db.ref('secureRate/'+identity.uid).transaction(current=>{
      if(!current||now-current.start>=60000) return {start:now,count:1};
      if(current.count>=60) return; return {...current,count:current.count+1};
    });
    if(!limit.committed) throw new PolicyError('resource-exhausted','Çok fazla işlem. Bir dakika sonra deneyin.');
    if(request.data.action==='read') return snapshot(state,identity,now);
    if(request.data.action==='member') {
      if(state.members?.[identity.uid]?.role!=='admin') throw new PolicyError('permission-denied','Yönetici yetkisi gerekli.');
      if(!validId(request.data.target)) throw new PolicyError('invalid-argument','Geçersiz kimlik.');
      const account=await getAuth().getUser(request.data.target);
      if(account.disabled) throw new PolicyError('failed-precondition','Hesap devre dışı.');
    }
    const eventId=randomUUID();
    // All votes, locks, roster, roles and closing state share this transaction boundary.
    const committed=await ref.transaction(current=>current===null?null:apply(current,identity,request.data,Date.now(),eventId));
    if(!committed.committed || !committed.snapshot.exists()) throw new PolicyError('aborted','İşlem tamamlanmadı; tekrar deneyin.');
    return snapshot(committed.snapshot.val(),identity,Date.now());
  } catch(error) {
    if(error instanceof PolicyError) throw new HttpsError(error.code,error.message);
    if(error.code==='auth/user-not-found') throw new HttpsError('invalid-argument','Authentication hesabı bulunamadı.');
    throw new HttpsError('internal','İşlem tamamlanamadı. Daha sonra tekrar deneyin.');
  }
});
