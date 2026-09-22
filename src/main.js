import {createClient} from '@supabase/supabase-js';
import {balancedTeams,positionRanks} from './teams.js';
import './style.css';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const root=document.querySelector('#app'), notice=document.querySelector('#notice');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const positions=['Kaleci','Defans','Orta Saha','Forvet'];
const message=m=>{notice.textContent=m;};
// Access and refresh tokens stay in memory; refreshing the page requires a new login.
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
let session=null,data=null,busy=false,authEpoch=0;
try{for(const key of ['pos_dbcfg_v1','pos_demo_v1'])localStorage.removeItem(key);}catch{}
document.querySelector('#theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
const errors={UNAUTHENTICATED:'Oturum geçersiz. Yeniden giriş yapın.',MEMBERSHIP_REQUIRED:'Hesabınız henüz bir oyuncuyla eşleştirilmedi. Yöneticiyle iletişime geçin.',MFA_REQUIRED:'Yönetici erişimi için güncel iki aşamalı doğrulama gerekli. Hesap güvenliği ekranından kodu doğrulayın.',FORBIDDEN:'Bu işlem için yetkiniz yok.',VOTING_LOCKED:'Oylama kapalı veya oyunuz kesinleşmiş.',INVALID_INPUT:'Gönderilen bilgileri kontrol edin.',INCOMPLETE_BALLOT:'Önce tüm oyunculara oy verin.',ROSTER_FROZEN:'İlk oy sonrası kadro ve mevki değişmez. Yeni dönem başlatın.',DUPLICATE_MEMBER:'Bu oyuncu adı kullanılıyor.',MEMBER_LIMIT:'En fazla 100 üye desteklenir.',CONFIRM_REQUIRED:'Önce oylamayı kapatın ve işlemi onaylayın.',ACCOUNT_NOT_VERIFIED:'Bu adresle doğrulanmış bir hesap bulunamadı.',RATE_LIMITED:'Çok fazla istek. Bir dakika sonra deneyin.'};
function errorMessage(e){return errors[e.code]||'İşlem tamamlanamadı. Bilgilerinizi ve bağlantınızı kontrol edin.';}
async function run(fn){if(busy)return;busy=true;message('İşlem sürüyor…');try{await fn();}catch(e){message(errorMessage(e));}finally{busy=false;}}
function checked(r){if(r.error)throw r.error;return r.data;}
async function call(action,params={}){
 const epoch=authEpoch;const r=checked(await sb.rpc('secure_api',{payload:{action,...params}}));
 if(epoch!==authEpoch||!session)return;
 if(r.error){if(r.error==='UNAUTHENTICATED'){await logout();}throw {code:r.error};}
 data=r;render();message('');
}
function bind(id,fn){const el=document.getElementById(id);if(el)el.onclick=()=>run(fn);}
async function logout(){++authEpoch;session=null;data=null;root.replaceChildren();const r=await sb.auth.signOut({scope:'global'});login();if(r.error)message('Yerel oturum temizlendi; sunucu çıkışı doğrulanamadı.');}
function login(){
 root.innerHTML='<form class="card login" id="login"><h2>Güvenli giriş</h2><p>Eski kullanıcı adı ve şifre girişi kapatıldı. Yönetici tarafından eşleştirilen doğrulanmış e-posta hesabınızı kullanın.</p><label>E-posta<input id="email" type="email" autocomplete="username" required maxlength="254"></label><label>Şifre<input id="password" type="password" autocomplete="current-password" required></label><button class="primary">Giriş yap</button><p class="muted">Hesap oluşturma veya kurtarma için yöneticinizle iletişime geçin. Sayfayı yenilediğinizde yeniden giriş gerekir.</p></form>';
 document.getElementById('login').onsubmit=e=>{e.preventDefault();run(async()=>{const email=document.getElementById('email').value.trim(),password=document.getElementById('password').value;document.getElementById('password').value='';const r=checked(await sb.auth.signInWithPassword({email,password}));session=r.session;++authEpoch;accountShell(session.user);await call('read');});};
}
function passwordForm(){
 root.innerHTML='<form class="card" id="passwordForm"><h2>Şifre değiştir</h2><p>En az 8 karakterlik benzersiz bir parola kullanın.</p><label>Mevcut şifre<input id="oldPassword" type="password" autocomplete="current-password" required></label><label>Yeni şifre<input id="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>Yeni şifre tekrar<input id="againPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button>Değiştir</button><button type="button" id="back">Geri</button></form>';
 bind('back',()=>call('read'));
 document.getElementById('passwordForm').onsubmit=e=>{e.preventDefault();run(async()=>{const password=document.getElementById('newPassword').value;if(password!==document.getElementById('againPassword').value){message('Yeni şifreler aynı olmalı.');return;}checked(await sb.auth.signInWithPassword({email:session.user.email,password:document.getElementById('oldPassword').value}));checked(await sb.auth.updateUser({password,current_password:document.getElementById('oldPassword').value}));await logout();message('Şifre değiştirildi. Yeniden giriş yapın.');});};
}
function accountShell(user){
 root.innerHTML='<section class="card"><h2>Hesap erişimi</h2><p>'+esc(user.email)+'</p><p>Hesap eşleştirmesi veya iki aşamalı doğrulama gerekebilir. Yönetici erişimi için doğrulama uygulaması zorunludur.</p><button id="enroll">Doğrulama uygulaması kur</button> <button id="challenge">Doğrulama kodu gir</button> <button id="reload">Yeniden kontrol et</button> <button id="logout">Çıkış</button><div id="enrollment"></div></section>';
 bind('logout',logout);bind('reload',()=>call('read'));
 bind('enroll',async()=>{const factors=checked(await sb.auth.mfa.listFactors());if(factors.totp.some(f=>f.status==='verified')){message('Zaten kurulu. Doğrulama kodu gir seçeneğini kullanın.');return;}for(const f of factors.all.filter(f=>f.status==='unverified'))checked(await sb.auth.mfa.unenroll({factorId:f.id}));const f=checked(await sb.auth.mfa.enroll({factorType:'totp',friendlyName:'Halı Saha'}));mfaForm(f.id,f.totp.secret);});
 bind('challenge',async()=>{const factors=checked(await sb.auth.mfa.listFactors());const f=factors.totp.find(f=>f.status==='verified');if(!f){message('Önce doğrulama uygulamasını kurun.');return;}mfaForm(f.id);});
}
function mfaForm(factorId,secret){
 document.getElementById('enrollment').innerHTML='<form id="mfaForm">'+(secret?'<p>Bu anahtarı doğrulama uygulamanıza ekleyin. Kimseyle paylaşmayın.</p><p class="secret">'+esc(secret)+'</p>':'')+'<label>Altı haneli kod<input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label><button>Doğrula</button></form>';
 document.getElementById('mfaForm').onsubmit=e=>{e.preventDefault();run(async()=>{checked(await sb.auth.mfa.challengeAndVerify({factorId,code:document.getElementById('code').value}));session=checked(await sb.auth.getSession()).session;document.getElementById('enrollment').replaceChildren();await call('read');});};
}
sb.auth.onAuthStateChange((event,newSession)=>{session=newSession;if(event==='SIGNED_OUT'){++authEpoch;data=null;login();}});
login();
function table(rows,admin) {
  return '<div class="table"><table><thead><tr><th>Sıra</th><th>Oyuncu</th><th>Mevki</th><th>Ortalama</th><th>Oy</th><th>Toplam</th>'+(admin?'<th>Min / Maks</th>':'')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.rank??'—')+'</td><td>'+esc(r.username)+'</td><td>'+esc(r.mevki)+'</td><td>'+(r.avg===null?'—':r.avg.toFixed(2))+'</td><td>'+r.count+'/'+r.expected+'</td><td>'+r.sum+'</td>'+(admin?'<td>'+esc(r.min??'—')+' / '+esc(r.max??'—')+'</td>':'')+'</tr>').join('')+'</tbody></table></div>';
}
function render() {
  const d=data,admin=d.me.role==='admin',others=d.players.filter(p=>p.uid!==d.me.uid).sort((a,b)=>positions.indexOf(a.mevki)-positions.indexOf(b.mevki)||a.username.localeCompare(b.username,'tr')),given=others.filter(p=>d.myVotes[p.uid]).length;
  root.innerHTML='<section class="card"><div class="row"><h2>'+esc(d.me.username)+'</h2><button id="refresh">Yenile</button><button id="passwordReset">Şifre değiştir</button><button id="account">Hesap güvenliği</button><button id="logout">Çıkış</button></div><p>'+ (d.open?'Oylama açık':'Oylama kapalı')+' · '+d.progress.done+' / '+d.progress.expected+' oy</p></section><div id="content"></div>';
  bind('logout',async()=>{await logout();message('Çıkış yapıldı.');});bind('refresh',()=>call('read'));
  bind('account',async()=>{accountShell(session.user);message('');});
  bind('passwordReset',async()=>{passwordForm();});
  const content=document.getElementById('content');
  if(d.me.player&&!d.me.locked&&d.open) {
    content.innerHTML='<section class="card"><h2>Değerlendirmeleriniz</h2><p class="muted">Puan rehberi: 1–3 Gelişmeli · 4–6 Ortalama · 7–8 Başarılı · 9–10 Çok iyi</p><p>'+given+' / '+others.length+' oyuncu değerlendirildi. Her kartı ayrı kaydedin.</p><label>Mevkiniz<select id="position">'+positions.map(p=>'<option '+(p===d.me.mevki?'selected':'')+'>'+esc(p)+'</option>').join('')+'</select></label><button id="positionSave">Mevkiyi güncelle</button> <button id="finalize" class="primary" '+(given!==others.length||!others.length?'disabled':'')+'>Kesinleştir ve sonuçları gör</button></section><div class="grid">'+others.map((p,index)=>{
      const v=d.myVotes[p.uid]||{};return (index===0||others[index-1].mevki!==p.mevki?'<h3 class="group">'+esc(p.mevki)+'</h3>':'')+'<form class="card vote" data-id="'+esc(p.uid)+'"><h3>'+esc(p.username)+' · '+esc(p.mevki)+'</h3><label>Puan<select name="puan" required><option value="">Seçin</option>'+Array.from({length:10},(_,i)=>'<option '+(v.puan===i+1?'selected':'')+'>'+(i+1)+'</option>').join('')+'</select></label><label>Açıklama<textarea name="aciklama" maxlength="500" rows="3">'+esc(v.aciklama||'')+'</textarea></label><button class="primary">Kaydet</button> <small>'+ (v.puan?'Kaydedilmiş puan: '+v.puan:'Henüz kaydedilmedi')+'</small></form>';
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
    content.insertAdjacentHTML('beforeend','<section class="card"><h2>Sonuçlar</h2>'+table(d.results,admin)+(d.open?'<p class="muted">Oylama sürüyor; sonuçlar değişebilir.</p>':'')+'</section>'+positions.map(p=>'<section class="card"><h3>'+esc(p)+'</h3>'+table(positionRanks(d.results.filter(r=>r.mevki===p)),false)+'</section>').join('')+(d.comments.length?'<section class="card"><h2>Size yazılan açıklamalar</h2>'+d.comments.map(c=>'<p class="quote"><b>'+c.puan+'/10</b> '+esc(c.aciklama)+'</p>').join('')+'</section>':''));
  }
  if(admin) {adminPanel(content,d);teamPanel(content,d.results);}
}
function download(name,value,type='application/json'){const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function adminPanel(content,d) {
  content.insertAdjacentHTML('beforeend','<section class="card"><h2>Yönetim</h2><form id="linkAccount"><h3>Doğrulanmış hesabı oyuncuya bağla</h3><label>Oyuncu kimliği<input name="target" required></label><label>Doğrulanmış e-posta<input name="email" type="email" required></label><button>Hesabı bağla</button></form><div class="row"><button id="toggle">Oylamayı '+(d.open?'kapat':'aç')+'</button><button id="json">Oyları JSON indir</button><button id="csv">Sonuçları CSV indir</button><button id="resetAll">Yeni oylama başlat</button></div><p class="muted">Kadro ve mevki değişiklikleri ilk oy verilene kadar yapılabilir. Yönetici işlemleri için son 10 dakika içinde TOTP doğrulaması yapılmış olmalıdır.</p><form id="member"><h3>Oyuncu ekle / güncelle</h3><label>Oyuncu kimliği (yeni oyuncuda boş bırakın)<input name="target" maxlength="128" pattern="[a-zA-Z0-9_-]+"></label><label>Oyuncu adı<input name="username" maxlength="60" required></label><label>Mevki<select name="mevki">'+positions.map(p=>'<option>'+esc(p)+'</option>').join('')+'</select></label><button>Kaydet</button></form><div class="table"><table><thead><tr><th>Oyuncu</th><th>Durum</th><th>İşlemler</th></tr></thead><tbody>'+d.members.map(m=>'<tr><td>'+esc(m.username)+'<br><small>'+esc(m.uid)+'</small></td><td>'+esc(m.active?(m.locked?'Kesinleşti':'Aktif'):'Pasif')+'</td><td>'+(m.role==='player'?'<button data-action="unlock" data-id="'+esc(m.uid)+'">Kilidi aç</button> <button data-action="resetOne" data-id="'+esc(m.uid)+'">Oylarını sıfırla</button> <button data-action="deactivate" data-id="'+esc(m.uid)+'">Pasifleştir</button>':'Yönetici')+'</td></tr>').join('')+'</tbody></table></div></section><section class="card"><h2>Oy dökümü</h2><div class="table"><table><thead><tr><th>Veren</th><th>Alan</th><th>Puan</th><th>Açıklama</th></tr></thead><tbody>'+Object.entries(d.votes).flatMap(([from,row])=>Object.entries(row).map(([to,v])=>'<tr><td>'+esc(d.members.find(m=>m.uid===from)?.username||from)+'</td><td>'+esc(d.members.find(m=>m.uid===to)?.username||to)+'</td><td>'+v.puan+'</td><td>'+esc(v.aciklama)+'</td></tr>')).join('')+'</tbody></table></div></section><section class="card"><h2>Son işlemler</h2>'+d.audit.slice(0,30).map(a=>'<p>'+esc(new Date(a.at).toLocaleString('tr-TR'))+' · '+esc(a.action)+' · '+esc(d.members.find(m=>m.uid===a.actor)?.username||a.actor)+'</p>').join('')+'</section>');
  document.getElementById('linkAccount').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(()=>call('linkAccount',Object.fromEntries(f)));};
  bind('toggle',()=>call('toggle',{open:!d.open}));
  bind('json',async()=>download('oylama-yedegi.json',JSON.stringify({exportedAt:new Date().toISOString(),members:d.members,votes:d.votes,results:d.results},null,2)));
  bind('csv',async()=>download('sonuclar.csv','\uFEFF'+[['Sıra','Oyuncu','Mevki','Ortalama','Oy sayısı','Toplam'],...d.results.map(r=>[r.rank,r.username,r.mevki,r.avg===null?'':r.avg.toFixed(2),r.count,r.sum])].map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8'));
  bind('resetAll',async()=>{if(prompt('Mevcut dönem arşivlenecek ve yeni oylama hazırlanacak. Onay için YENI OYLAMA yazın:')==='YENI OYLAMA')await call('resetAll',{confirm:'YENI OYLAMA'});});
  document.getElementById('member').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(()=>call('member',Object.fromEntries(f)));};
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>run(async()=>{if(confirm('Seçilen oyuncu için bu işlem uygulansın mı?'))await call(b.dataset.action,{target:b.dataset.id});}));
}
function teamPanel(content,rows){
  content.insertAdjacentHTML('beforeend','<section class="card"><h2>Dengeli Takım Kurucu</h2><p class="muted">Puanı olmayan oyuncular dengelemede 5 kabul edilir. Öneri, en iyi dengeyi garanti etmez.</p><div class="row">'+rows.map(r=>'<label><input class="teamPlayer" type="checkbox" value="'+esc(r.uid)+'" checked>'+esc(r.username)+' · '+esc(r.mevki)+'</label>').join('')+'</div><button id="selectTeams">Tümünü seç / temizle</button> <button id="buildTeams">Takımları oluştur</button><div id="teams"></div></section>');
  bind('selectTeams',async()=>{const boxes=[...document.querySelectorAll('.teamPlayer')],next=!boxes.every(b=>b.checked);boxes.forEach(b=>b.checked=next);});
  bind('buildTeams',async()=>{
    const ids=new Set([...document.querySelectorAll('.teamPlayer:checked')].map(b=>b.value));
    if(ids.size<2){message('En az iki oyuncu seçin.');return;}
    const {teams,averages}=balancedTeams(rows.filter(r=>ids.has(r.uid))),names=['Beyaz Takım','Kırmızı Takım'];
    document.getElementById('teams').innerHTML='<p>Ortalama farkı: '+Math.abs(averages[0]-averages[1]).toFixed(2)+'</p><div class="grid">'+teams.map((t,i)=>'<section><h3>'+names[i]+' · '+t.length+' oyuncu · '+averages[i].toFixed(2)+'</h3><ul>'+t.map(p=>'<li>'+esc(p.username)+' · '+esc(p.mevki)+' · '+(p.avg===null?'—':p.avg.toFixed(2))+'</li>').join('')+'</ul></section>').join('')+'</div><button id="copyTeams">Kadroyu kopyala</button>';
    bind('copyTeams',async()=>{await navigator.clipboard.writeText(teams.map((t,i)=>names[i]+' (Ort: '+averages[i].toFixed(2)+')\n'+t.map(p=>p.username+' ('+p.mevki+')').join('\n')).join('\n\n'));message('Kadro panoya kopyalandı.');});message('');
  });
}
