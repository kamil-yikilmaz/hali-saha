import './style.css';
import {initializeApp} from 'firebase/app';
import {getAuth,setPersistence,inMemoryPersistence,onAuthStateChanged,signInWithEmailAndPassword,signOut,sendPasswordResetEmail,sendEmailVerification,multiFactor,getMultiFactorResolver,TotpMultiFactorGenerator} from 'firebase/auth';
import {initializeAppCheck,ReCaptchaEnterpriseProvider} from 'firebase/app-check';
import {getFunctions,httpsCallable} from 'firebase/functions';
const root=document.querySelector('#app'), notice=document.querySelector('#notice');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const positions=['Kaleci','Defans','Orta Saha','Forvet'];
const message=m=>{notice.textContent=m;};
let auth,api,data=null,busy=false,resolver=null,authEpoch=0;
// Remove legacy credentials and private demo data; no auth material is persisted by this app.
try { localStorage.removeItem('pos_dbcfg_v1'); localStorage.removeItem('pos_demo_v1'); } catch {}
document.querySelector('#theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
function errorMessage(e) {
  if(e.code?.startsWith('functions/')&&e.code!=='functions/internal') return e.message;
  if(e.code==='auth/too-many-requests') return 'Çok fazla deneme. Daha sonra yeniden deneyin.';
  if(e.code==='auth/requires-recent-login') return 'Bu işlem için çıkış yapıp yeniden giriş yapın.';
  return 'İşlem tamamlanamadı. Giriş bilgilerinizi ve bağlantınızı kontrol edin.';
}
async function run(fn) {
  if(busy)return;busy=true;message('İşlem sürüyor…');
  try {await fn();} catch(e){message(errorMessage(e));} finally {busy=false;}
}
async function call(action,params={}) {
  const epoch=authEpoch, result=(await api({action,...params})).data;
  if(epoch!==authEpoch||!auth.currentUser)return;
  data=result;render();message('');
}
function bind(id,fn){const el=document.getElementById(id);if(el)el.onclick=()=>run(fn);}
function login() {
  data=null;resolver=null;
  root.innerHTML='<form class="card login" id="login"><h2>Giriş yap</h2><p class="muted">Yönetici tarafından tanımlanan e-posta hesabınızı kullanın.</p><label>E-posta<input id="email" type="email" autocomplete="username" maxlength="254" required></label><label>Şifre<input id="password" type="password" autocomplete="current-password" required></label><button class="primary">Giriş yap</button> <button id="reset" type="button">Şifremi unuttum</button></form>';
  document.getElementById('login').onsubmit=e=>{e.preventDefault();run(async()=>{
    try {await signInWithEmailAndPassword(auth,document.getElementById('email').value.trim(),document.getElementById('password').value);}
    catch(err){document.getElementById('password').value='';if(err.code==='auth/multi-factor-auth-required'){resolver=getMultiFactorResolver(auth,err);mfaLogin();message('Doğrulama uygulamasındaki kodu girin.');}else throw err;}
  });};
  bind('reset',async()=>{
    const email=document.getElementById('email').value.trim();
    if(!document.getElementById('email').checkValidity()||!email){message('Geçerli bir e-posta girin.');return;}
    try{await sendPasswordResetEmail(auth,email);}catch{}
    message('Bu adres için işlem yapılabiliyorsa şifre belirleme bağlantısı gönderildi.');
  });
}
function mfaLogin() {
  const factors=resolver.hints.filter(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID);
  root.innerHTML='<form class="card login" id="mfa"><h2>İki aşamalı doğrulama</h2><label>Doğrulayıcı<select id="factor">'+factors.map(h=>`<option value="${esc(h.uid)}">${esc(h.displayName||'Doğrulama uygulaması')}</option>`).join('')+'</select></label><label>Kod<input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label><button class="primary">Doğrula</button> <button type="button" id="cancel">Vazgeç</button></form>';
  if(!factors.length)message('Bu sürüm yalnızca TOTP doğrulamasını destekler. Hesap yöneticinizle görüşün.');
  document.getElementById('mfa').onsubmit=e=>{e.preventDefault();run(async()=>{await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(document.getElementById('factor').value,document.getElementById('code').value));resolver=null;});};
  bind('cancel',async()=>{await signOut(auth);login();message('');});
}
function accountShell(user) {
  root.innerHTML='<section class="card"><h2>Hesap erişimi</h2><p>'+esc(user.email)+'</p><p class="muted">E-posta doğrulaması, yönetici tanımı veya iki aşamalı doğrulama gerekebilir.</p><div class="row"><button id="verify">Doğrulama e-postası gönder</button><button id="enroll">Doğrulama uygulaması kur</button><button id="reload">Yeniden kontrol et</button><button id="logout">Çıkış</button></div><div id="enrollment"></div></section>';
  bind('logout',async()=>{await signOut(auth);message('Çıkış yapıldı.');});
  bind('verify',async()=>{await sendEmailVerification(user);message('Doğrulama bağlantısı gönderildi.');});
  bind('reload',async()=>{await user.reload();await user.getIdToken(true);await call('read');});
  bind('enroll',async()=>{
    await user.reload();
    if(!user.emailVerified){message('Önce e-posta adresinizi doğrulayın.');return;}
    const secret=await TotpMultiFactorGenerator.generateSecret(await multiFactor(user).getSession());
    document.getElementById('enrollment').innerHTML='<form id="enrollForm"><p>Bu anahtarı doğrulama uygulamanıza ekleyin. Kimseyle paylaşmayın.</p><p class="secret">'+esc(secret.secretKey)+'</p><label>Uygulamadaki altı haneli kod<input id="enrollCode" inputmode="numeric" pattern="[0-9]{6}" required></label><button>Kurulumu tamamla</button></form>';
    document.getElementById('enrollForm').onsubmit=e=>{e.preventDefault();run(async()=>{
      await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret,document.getElementById('enrollCode').value),'Halı Saha');
      await signOut(auth);message('Kurulum tamamlandı. Şifreniz ve doğrulama kodunuzla yeniden giriş yapın.');
    });};
  });
}
function table(rows,admin) {
  return '<div class="table"><table><thead><tr><th>Sıra</th><th>Oyuncu</th><th>Mevki</th><th>Ortalama</th><th>Oy</th><th>Toplam</th>'+(admin?'<th>Min / Maks</th>':'')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.rank??'—')+'</td><td>'+esc(r.username)+'</td><td>'+esc(r.mevki)+'</td><td>'+(r.avg===null?'—':r.avg.toFixed(2))+'</td><td>'+r.count+'/'+r.expected+'</td><td>'+r.sum+'</td>'+(admin?'<td>'+esc(r.min??'—')+' / '+esc(r.max??'—')+'</td>':'')+'</tr>').join('')+'</tbody></table></div>';
}
function render() {
  const d=data,admin=d.me.role==='admin',others=d.players.filter(p=>p.uid!==d.me.uid),given=others.filter(p=>d.myVotes[p.uid]).length;
  root.innerHTML='<section class="card"><div class="row"><h2>'+esc(d.me.username)+'</h2><button id="refresh">Yenile</button><button id="passwordReset">Şifre değiştir</button><button id="account">Hesap güvenliği</button><button id="logout">Çıkış</button></div><p>'+ (d.open?'Oylama açık':'Oylama kapalı')+' · '+d.progress.done+' / '+d.progress.expected+' oy</p></section><div id="content"></div>';
  bind('logout',async()=>{await signOut(auth);message('Çıkış yapıldı.');});bind('refresh',()=>call('read'));
  bind('account',async()=>{accountShell(auth.currentUser);message('');});
  bind('passwordReset',async()=>{await sendPasswordResetEmail(auth,auth.currentUser.email);message('Şifre değiştirme bağlantısı gönderildi.');});
  const content=document.getElementById('content');
  if(d.me.player&&!d.me.locked&&d.open) {
    content.innerHTML='<section class="card"><h2>Değerlendirmeleriniz</h2><p>'+given+' / '+others.length+' oyuncu değerlendirildi. Her kartı ayrı kaydedin.</p><label>Mevkiniz<select id="position">'+positions.map(p=>'<option '+(p===d.me.mevki?'selected':'')+'>'+esc(p)+'</option>').join('')+'</select></label><button id="positionSave">Mevkiyi güncelle</button> <button id="finalize" class="primary" '+(given!==others.length||!others.length?'disabled':'')+'>Kesinleştir ve sonuçları gör</button></section><div class="grid">'+others.map(p=>{
      const v=d.myVotes[p.uid]||{};return '<form class="card vote" data-id="'+esc(p.uid)+'"><h3>'+esc(p.username)+' · '+esc(p.mevki)+'</h3><label>Puan<select name="puan" required><option value="">Seçin</option>'+Array.from({length:10},(_,i)=>'<option '+(v.puan===i+1?'selected':'')+'>'+(i+1)+'</option>').join('')+'</select></label><label>Açıklama<textarea name="aciklama" maxlength="500" rows="3">'+esc(v.aciklama||'')+'</textarea></label><button class="primary">Kaydet</button> <small>'+ (v.puan?'Kaydedilmiş puan: '+v.puan:'Henüz kaydedilmedi')+'</small></form>';
    }).join('')+'</div>';
    document.querySelectorAll('.vote').forEach(form=>form.onsubmit=e=>{e.preventDefault();const values=new FormData(form);run(async()=>{
      // Keep other cards' unsaved text during an individual save.
      const drafts=[...document.querySelectorAll('.vote')].filter(f=>f!==form).map(f=>[f.dataset.id,f.elements.puan.value,f.elements.aciklama.value]);
      await call('vote',{target:form.dataset.id,puan:Number(values.get('puan')),aciklama:values.get('aciklama')});
      for(const [id,puan,aciklama] of drafts){const f=[...document.querySelectorAll('.vote')].find(x=>x.dataset.id===id);if(f){f.elements.puan.value=puan;f.elements.aciklama.value=aciklama;}}
      message('Değerlendirme kaydedildi.');
    });});
    bind('positionSave',()=>call('position',{mevki:document.getElementById('position').value}));
    bind('finalize',async()=>{if(confirm('Kaydedilmiş oylarınız kesinleşecek ve değiştirilemeyecek. Kaydetmediğiniz değişiklikler dahil edilmez. Devam edilsin mi?'))await call('finalize');});
  }
  if(d.results){
    content.insertAdjacentHTML('beforeend','<section class="card"><h2>Sonuçlar</h2>'+table(d.results,admin)+(d.open?'<p class="muted">Oylama sürüyor; sonuçlar değişebilir.</p>':'')+'</section>'+positions.map(p=>'<section class="card"><h3>'+esc(p)+'</h3>'+table(d.results.filter(r=>r.mevki===p),false)+'</section>').join('')+(d.comments.length?'<section class="card"><h2>Size yazılan açıklamalar</h2>'+d.comments.map(c=>'<p class="quote"><b>'+c.puan+'/10</b> '+esc(c.aciklama)+'</p>').join('')+'</section>':''));
  }
  if(admin) adminPanel(content,d);
}
function download(name,value,type='application/json'){const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function adminPanel(content,d) {
  content.insertAdjacentHTML('beforeend','<section class="card"><h2>Yönetim</h2><div class="row"><button id="toggle">Oylamayı '+(d.open?'kapat':'aç')+'</button><button id="json">Oyları JSON indir</button><button id="csv">Sonuçları CSV indir</button><button id="resetAll">Tüm oyları sıfırla</button></div><p class="muted">Kadro ve mevki değişiklikleri ilk oy verilene kadar yapılabilir. Yönetici işlemleri için son 10 dakika içinde giriş yapılmış olmalıdır.</p><form id="member"><h3>Oyuncu ekle / güncelle</h3><label>Firebase Authentication UID<input name="target" required maxlength="128" pattern="[a-zA-Z0-9_-]+"></label><label>Oyuncu adı<input name="username" maxlength="60" required></label><label>Mevki<select name="mevki">'+positions.map(p=>'<option>'+esc(p)+'</option>').join('')+'</select></label><button>Kaydet</button></form><div class="table"><table><thead><tr><th>Oyuncu</th><th>Durum</th><th>İşlemler</th></tr></thead><tbody>'+d.members.map(m=>'<tr><td>'+esc(m.username)+'</td><td>'+esc(m.active?(m.locked?'Kesinleşti':'Aktif'):'Pasif')+'</td><td>'+(m.role==='player'?'<button data-action="unlock" data-id="'+esc(m.uid)+'">Kilidi aç</button> <button data-action="resetOne" data-id="'+esc(m.uid)+'">Oylarını sıfırla</button> <button data-action="deactivate" data-id="'+esc(m.uid)+'">Pasifleştir</button>':'Yönetici')+'</td></tr>').join('')+'</tbody></table></div></section><section class="card"><h2>Oy dökümü</h2><div class="table"><table><thead><tr><th>Veren</th><th>Alan</th><th>Puan</th><th>Açıklama</th></tr></thead><tbody>'+Object.entries(d.votes).flatMap(([from,row])=>Object.entries(row).map(([to,v])=>'<tr><td>'+esc(d.members.find(m=>m.uid===from)?.username||from)+'</td><td>'+esc(d.members.find(m=>m.uid===to)?.username||to)+'</td><td>'+v.puan+'</td><td>'+esc(v.aciklama)+'</td></tr>')).join('')+'</tbody></table></div></section><section class="card"><h2>Son işlemler</h2>'+d.audit.slice(0,30).map(a=>'<p>'+esc(new Date(a.at).toLocaleString('tr-TR'))+' · '+esc(a.action)+' · '+esc(d.members.find(m=>m.uid===a.actor)?.username||a.actor)+'</p>').join('')+'</section>');
  bind('toggle',()=>call('toggle',{open:!d.open}));
  bind('json',async()=>download('oylama-yedegi.json',JSON.stringify({exportedAt:new Date().toISOString(),members:d.members,votes:d.votes,results:d.results},null,2)));
  bind('csv',async()=>download('sonuclar.csv','\uFEFF'+[['Sıra','Oyuncu','Mevki','Ortalama','Oy sayısı','Toplam'],...d.results.map(r=>[r.rank,r.username,r.mevki,r.avg===null?'':r.avg.toFixed(2),r.count,r.sum])].map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8'));
  bind('resetAll',async()=>{if(prompt('Önce JSON yedeğini indirin. Tüm oylar silinecek. Onay için YENI OYLAMA yazın:')==='YENI OYLAMA')await call('resetAll',{confirm:'YENI OYLAMA'});});
  document.getElementById('member').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(()=>call('member',Object.fromEntries(f)));};
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>run(async()=>{if(confirm('Seçilen oyuncu için bu işlem uygulansın mı?'))await call(b.dataset.action,{target:b.dataset.id});}));
}
async function boot() {
  const e=import.meta.env,config={apiKey:e.VITE_FIREBASE_API_KEY,authDomain:e.VITE_FIREBASE_AUTH_DOMAIN,projectId:e.VITE_FIREBASE_PROJECT_ID,appId:e.VITE_FIREBASE_APP_ID};
  if(Object.values(config).some(v=>!v)||!e.VITE_APP_CHECK_SITE_KEY){root.textContent='Uygulamanın güvenli bağlantı kurulumu henüz tamamlanmadı. Yöneticiyle iletişime geçin.';return;}
  const app=initializeApp(config);
  initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(e.VITE_APP_CHECK_SITE_KEY),isTokenAutoRefreshEnabled:true});
  auth=getAuth(app);await setPersistence(auth,inMemoryPersistence);api=httpsCallable(getFunctions(app,'europe-west1'),'secureApi');
  onAuthStateChanged(auth,async user=>{
    const epoch=++authEpoch;data=null;message('');
    if(!user){login();return;}
    accountShell(user);
    try{const response=(await api({action:'read'})).data;if(epoch===authEpoch&&auth.currentUser){data=response;render();}}
    catch(err){if(epoch===authEpoch)message(errorMessage(err));}
  });
}
boot().catch(()=>{root.textContent='Güvenli bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.';});
