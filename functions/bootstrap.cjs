// Run from a trusted operator environment with Application Default Credentials.
// Does not create accounts, send email, or overwrite existing state.
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getDatabase}=require('firebase-admin/database');
const {validId}=require('./core');
async function main(){
  const [projectId,databaseURL,uid,name]=process.argv.slice(2);
  if(!projectId||!/^https:\/\/[a-z0-9.-]+\.(firebasedatabase\.app|firebaseio\.com)\/?$/.test(databaseURL||'')||!validId(uid)||!name||name.length>60)throw new Error('Usage: node bootstrap.cjs PROJECT_ID DATABASE_URL AUTH_UID DISPLAY_NAME');
  initializeApp({credential:applicationDefault(),projectId,databaseURL});
  const account=await getAuth().getUser(uid);
  if(account.disabled||!account.emailVerified)throw new Error('Administrator must have a verified, active Auth account.');
  const r=await getDatabase().ref('secureV2').transaction(s=>{
    if(s!==null)return;
    return {config:{votingOpen:false,started:false},members:{[uid]:{username:name,role:'admin',player:false,active:true,mevki:''}}};
  });
  if(!r.committed)throw new Error('secureV2 already exists; no data changed. Use trusted console for role administration.');
  console.log('Administrator initialized. TOTP enrollment and a fresh MFA sign-in are required.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
