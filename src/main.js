import { createClient } from '@supabase/supabase-js';
import { balancedTeams, positionRanks } from './teams.js';
import './style.css';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const root = document.querySelector('#app');
const notice = document.querySelector('#notice');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 2) => (n === null || n === undefined ? '—' : Number(n).toFixed(d));
const positions = ['Kaleci', 'Defans', 'Orta Saha', 'Forvet'];
const posClasses = { 'Kaleci': 'pos-k', 'Defans': 'pos-d', 'Orta Saha': 'pos-o', 'Forvet': 'pos-f' };

function mevkiChip(m) {
  const c = posClasses[m] || '';
  return `<span class="chip pos ${c}">${esc(m || '—')}</span>`;
}

function mevkiSira(m) {
  const i = positions.indexOf(m);
  return i < 0 ? 99 : i;
}

function message(m) {
  if (notice) notice.textContent = m;
}

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  if (kind === 'bad') {
    t.style.background = 'var(--bad)';
    t.style.color = '#fff';
  }
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function download(name, value, type = 'application/json') {
  try {
    const blob = new Blob([value], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 600);
  } catch {
    toast('İndirme başarısız oldu.', 'bad');
  }
}

function csvCell(val) {
  let s = String(val ?? '');
  if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

// Access and refresh tokens stay in memory; refreshing the page requires a new login.
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
});

let session = null;
let data = null;
let busy = false;
let authEpoch = 0;
let adminTab = 'users';
let loginTab = 'user';

try {
  for (const key of ['pos_dbcfg_v1', 'pos_demo_v1']) localStorage.removeItem(key);
} catch {}

// Theme management
const themeBtn = document.querySelector('#theme');
if (themeBtn) {
  themeBtn.onclick = () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pos_theme', next); } catch {}
  };
}
try {
  const savedTheme = localStorage.getItem('pos_theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
} catch {}

const errors = {
  UNAUTHENTICATED: 'Oturum geçersiz veya süresi doldu. Lütfen yeniden giriş yapın.',
  MEMBERSHIP_REQUIRED: 'Hesabınız henüz bir oyuncuyla eşleştirilmedi. Yöneticiyle iletişime geçin.',
  MFA_REQUIRED: 'Yönetici erişimi için güncel iki aşamalı doğrulama (TOTP) gereklidir.',
  FORBIDDEN: 'Bu işlem için yetkiniz yok.',
  VOTING_LOCKED: 'Oylama kapalı veya oyunuz kesinleşmiş.',
  INVALID_INPUT: 'Gönderilen bilgileri kontrol edin.',
  INCOMPLETE_BALLOT: 'Önce tüm oyunculara oy vermelisiniz.',
  ROSTER_FROZEN: 'İlk oy sonrası kadro ve mevki değişmez. Yeni dönem başlatın.',
  DUPLICATE_MEMBER: 'Bu oyuncu adı zaten kullanılıyor.',
  MEMBER_LIMIT: 'En fazla 100 üye desteklenir.',
  CONFIRM_REQUIRED: 'Önce oylamayı kapatın ve onay metnini girin.',
  ACCOUNT_NOT_VERIFIED: 'Bu adresle doğrulanmış bir hesap bulunamadı.',
  RATE_LIMITED: 'Çok fazla istek. Bir dakika sonra tekrar deneyin.'
};

function errorMessage(e) {
  if (e && e.code && errors[e.code]) return errors[e.code];
  if (e && e.message) return e.message;
  return 'İşlem tamamlanamadı. Bilgilerinizi ve bağlantınızı kontrol edin.';
}

async function run(fn) {
  if (busy) return;
  busy = true;
  message('İşlem sürüyor…');
  try {
    await fn();
  } catch (e) {
    const msg = errorMessage(e);
    message(msg);
    toast(msg, 'bad');
  } finally {
    busy = false;
  }
}

function checked(r) {
  if (r.error) throw r.error;
  return r.data;
}

async function call(action, params = {}) {
  const epoch = authEpoch;
  const r = checked(await sb.rpc('secure_api', { payload: { action, ...params } }));
  if (epoch !== authEpoch || !session) return;
  if (r.error) {
    if (r.error === 'UNAUTHENTICATED') {
      await logout();
    }
    throw { code: r.error };
  }
  data = r;
  render();
  message('');
  return r;
}

function bind(id, fn) {
  const el = document.getElementById(id);
  if (el) el.onclick = () => run(fn);
}

async function logout() {
  ++authEpoch;
  session = null;
  data = null;
  root.replaceChildren();
  try { await sb.auth.signOut({ scope: 'global' }); } catch {}
  login();
  message('');
  toast('Çıkış yapıldı.');
}

// -----------------------------------------------------------------------------
// Giriş ve MFA Akışı
// -----------------------------------------------------------------------------
function login() {
  const isAdmin = (loginTab === 'admin');
  root.innerHTML = `
    <div class="login">
      <div class="card">
        <div class="tabs">
          <button class="tab ${loginTab === 'user' ? 'on' : ''}" id="tabUser">Kullanıcı Girişi</button>
          <button class="tab ${loginTab === 'admin' ? 'on' : ''}" id="tabAdmin">Yönetici Girişi</button>
        </div>
        <form id="loginForm" class="grid" autocomplete="off">
          <h2>${isAdmin ? 'Yönetici Girişi' : 'Kullanıcı Girişi'}</h2>
          <p class="small muted">${isAdmin
            ? 'Yönetici hesabı Supabase Auth ve Google Authenticator (TOTP) ile korunmaktadır.'
            : 'Yönetici tarafından eşleştirilen doğrulanmış e-posta hesabınızla giriş yapın.'}</p>
          <label class="f">E-posta
            <input id="loginEmail" type="email" autocomplete="username" required maxlength="254" placeholder="${isAdmin ? 'admin@example.com' : 'oyuncu@example.com'}">
          </label>
          <label class="f">Şifre
            <input id="loginPassword" type="password" autocomplete="current-password" required>
          </label>
          <button class="btn primary" type="submit">${isAdmin ? 'Yönetici Olarak Gir' : 'Giriş Yap'}</button>
        </form>
        <div class="sep"></div>
        <div class="note" style="font-size:12.5px">
          ${isAdmin
            ? 'Yönetici işlemleri son 10 dakika içinde doğrulanmış <b>AAL2 (TOTP)</b> oturumu gerektirir.'
            : 'Sayfayı yenilediğinizde güvenlik gereği yeniden giriş yapmanız gerekir.'}
        </div>
      </div>
    </div>
  `;

  document.getElementById('tabUser').onclick = () => { loginTab = 'user'; login(); };
  document.getElementById('tabAdmin').onclick = () => { loginTab = 'admin'; login(); };

  document.getElementById('loginForm').onsubmit = e => {
    e.preventDefault();
    run(async () => {
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      document.getElementById('loginPassword').value = '';

      const r = checked(await sb.auth.signInWithPassword({ email, password }));
      session = r.session;
      ++authEpoch;

      if (loginTab === 'admin') {
        const factors = checked(await sb.auth.mfa.listFactors());
        const verified = (factors.totp || []).find(f => f.status === 'verified');
        if (verified) {
          renderMfaChallenge(verified.id, email);
          return;
        } else {
          // Temizle ve yeni TOTP kur
          for (const f of (factors.all || []).filter(f => f.status === 'unverified')) {
            await sb.auth.mfa.unenroll({ factorId: f.id });
          }
          const enroll = checked(await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Halı Saha' }));
          renderMfaEnroll(enroll.id, enroll.totp.secret, enroll.totp.uri, email);
          return;
        }
      }

      // Standart oyuncu girişi
      try {
        await call('read');
        toast('Giriş başarılı.');
      } catch (err) {
        if (err && err.code === 'MFA_REQUIRED') {
          // Admin kullanıcısı kullanıcı sekmesinden girdiyse MFA'ya yönlendir
          const factors = checked(await sb.auth.mfa.listFactors());
          const verified = (factors.totp || []).find(f => f.status === 'verified');
          if (verified) {
            renderMfaChallenge(verified.id, email);
          } else {
            const enroll = checked(await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Halı Saha' }));
            renderMfaEnroll(enroll.id, enroll.totp.secret, enroll.totp.uri, email);
          }
          return;
        }
        throw err;
      }
    });
  };
}

function renderMfaChallenge(factorId, email) {
  root.innerHTML = `
    <div class="login">
      <div class="card">
        <div class="mfa-box">
          <div style="width:48px;height:48px;border-radius:12px;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:22px">🔐</div>
          <h2>İki Aşamalı Doğrulama (MFA)</h2>
          <p class="small muted">Yönetici erişimi için Google Authenticator veya doğrulama uygulamanızdaki 6 haneli kodu girin.<br><b>${esc(email)}</b></p>
          <form id="mfaChallengeForm" style="width:100%">
            <div style="margin:16px 0">
              <input type="text" id="mfaCode" class="mfa-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" autofocus required>
            </div>
            <div class="row" style="gap:8px;justify-content:center">
              <button class="btn primary" type="submit">Doğrula ve Giriş Yap</button>
              <button class="btn" type="button" id="mfaBack">Geri Dön</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('mfaBack').onclick = () => logout();

  document.getElementById('mfaChallengeForm').onsubmit = e => {
    e.preventDefault();
    run(async () => {
      const code = document.getElementById('mfaCode').value.trim();
      checked(await sb.auth.mfa.challengeAndVerify({ factorId, code }));
      session = checked(await sb.auth.getSession()).session;
      await call('read');
      toast('Yönetici girişi ve iki aşamalı doğrulama başarılı.');
    });
  };
}

function renderMfaEnroll(factorId, secret, uri, email) {
  root.innerHTML = `
    <div class="login" style="max-width:480px">
      <div class="card">
        <div class="mfa-box">
          <div style="width:48px;height:48px;border-radius:12px;background:var(--good);color:#fff;display:grid;place-items:center;font-size:22px">📱</div>
          <h2>Yönetici MFA Kurulumu</h2>
          <p class="small muted">Yönetici hesabı için iki aşamalı doğrulama (TOTP) zorunludur. Aşağıdaki QR kodu telefonunuzdaki kimlik doğrulama uygulamasıyla (Google Authenticator, Microsoft Authenticator vb.) tarayın:<br><b>${esc(email)}</b></p>
          <div class="qr-frame">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(uri)}" width="180" height="180" alt="MFA QR">
          </div>
          <div style="width:100%;text-align:left">
            <label class="f">Veya gizli anahtarı elle ekleyin:</label>
            <div class="secret-box">
              <span>${esc(secret)}</span>
              <button class="btn sm" type="button" id="copySecret">Kopyala</button>
            </div>
          </div>
          <form id="mfaEnrollForm" style="width:100%;margin-top:14px">
            <label class="f" style="text-align:center">Uygulamanın ürettiği 6 haneli kod</label>
            <div style="margin:8px 0 16px">
              <input type="text" id="mfaEnrollCode" class="mfa-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" autofocus required>
            </div>
            <div class="row" style="gap:8px;justify-content:center">
              <button class="btn primary" type="submit">Doğrula ve Etkinleştir</button>
              <button class="btn" type="button" id="mfaEnrollCancel">Vazgeç</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('copySecret').onclick = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast('Gizli anahtar kopyalandı.');
    } catch {
      toast('Kopyalanamadı: ' + secret);
    }
  };

  document.getElementById('mfaEnrollCancel').onclick = () => logout();

  document.getElementById('mfaEnrollForm').onsubmit = e => {
    e.preventDefault();
    run(async () => {
      const code = document.getElementById('mfaEnrollCode').value.trim();
      checked(await sb.auth.mfa.challengeAndVerify({ factorId, code }));
      session = checked(await sb.auth.getSession()).session;
      await call('read');
      toast('MFA kurulumu tamamlandı ve doğrulandı.');
    });
  };
}

function passwordModal() {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `
    <div class="card" style="max-width:440px">
      <h2>Şifre Değiştir</h2>
      <p class="small muted" style="margin-top:4px">En az 8 karakterlik benzersiz bir parola belirleyin.</p>
      <div class="sep"></div>
      <form id="pwChangeForm" class="grid" autocomplete="off">
        <div>
          <label class="f">Mevcut şifre</label>
          <input type="password" id="oldPw" autocomplete="current-password" required>
        </div>
        <div>
          <label class="f">Yeni şifre (en az 8 karakter)</label>
          <input type="password" id="newPw" autocomplete="new-password" minlength="8" maxlength="128" required>
        </div>
        <div>
          <label class="f">Yeni şifre tekrar</label>
          <input type="password" id="againPw" autocomplete="new-password" minlength="8" maxlength="128" required>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:10px">
          <button class="btn" type="button" id="pwCancel">Vazgeç</button>
          <button class="btn primary" type="submit">Değiştir</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(m);
  m.onclick = e => { if (e.target === m) m.remove(); };
  m.querySelector('#pwCancel').onclick = () => m.remove();

  m.querySelector('#pwChangeForm').onsubmit = e => {
    e.preventDefault();
    run(async () => {
      const oldPw = m.querySelector('#oldPw').value;
      const newPw = m.querySelector('#newPw').value;
      const againPw = m.querySelector('#againPw').value;
      if (newPw !== againPw) {
        toast('Yeni şifreler birbirini tutmuyor.', 'bad');
        return;
      }
      checked(await sb.auth.signInWithPassword({ email: session.user.email, password: oldPw }));
      checked(await sb.auth.updateUser({ password: newPw, current_password: oldPw }));
      m.remove();
      toast('Şifreniz başarıyla değiştirildi.');
    });
  };
}

// -----------------------------------------------------------------------------
// Ana Render
// -----------------------------------------------------------------------------
function render() {
  if (!data || !session) {
    login();
    return;
  }
  const d = data;
  const admin = d.me && d.me.role === 'admin';
  if (admin) {
    renderAdmin();
  } else {
    renderPlayer();
  }
}

// -----------------------------------------------------------------------------
// Yönetici Paneli (7 Sekme)
// -----------------------------------------------------------------------------
function renderAdmin() {
  const d = data;
  const tabs = [
    ['users', 'Kullanıcılar'],
    ['votes', 'Oylama Takibi'],
    ['results', 'Sonuçlar'],
    ['teams', 'Dengeli Kadro'],
    ['comments', 'Açıklamalar'],
    ['data', 'Veritabanı (JSON)'],
    ['settings', 'Ayarlar']
  ];

  root.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <h2>Yönetici: ${esc(d.me.username || session.user.email)}</h2>
          <p class="small muted" style="margin-top:4px">
            <span class="chip ${d.open ? 'good' : 'bad'}"><span class="dot"></span>${d.open ? 'Oylama açık' : 'Oylama kapalı'}</span>
            · ${d.progress.done} / ${d.progress.total || d.progress.expected} oy
          </p>
        </div>
        <div class="row">
          <button class="btn sm" id="btnRefresh">Yenile</button>
          <button class="btn sm" id="btnPw">Şifre değiştir</button>
          <button class="btn sm danger" id="btnLogout">Çıkış</button>
        </div>
      </div>
    </div>
    <div class="tabs" style="margin-top:16px">
      ${tabs.map(([key, label]) => `<button class="tab ${adminTab === key ? 'on' : ''}" data-tab="${key}">${label}</button>`).join('')}
    </div>
    <div id="tabContent"></div>
  `;

  bind('btnRefresh', () => call('read'));
  bind('btnPw', async () => passwordModal());
  bind('btnLogout', logout);

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = () => {
      adminTab = btn.getAttribute('data-tab');
      renderAdmin();
    };
  });

  const tabContainer = document.getElementById('tabContent');
  if (adminTab === 'users') adminUsersTab(tabContainer, d);
  else if (adminTab === 'votes') adminVotesTab(tabContainer, d);
  else if (adminTab === 'results') adminResultsTab(tabContainer, d);
  else if (adminTab === 'teams') adminTeamsTab(tabContainer, d);
  else if (adminTab === 'comments') adminCommentsTab(tabContainer, d);
  else if (adminTab === 'data') adminDataTab(tabContainer, d);
  else adminSettingsTab(tabContainer, d);
}

// 1. Kullanıcılar Sekmesi
function adminUsersTab(el, d) {
  const members = d.members || [];
  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2>Kayıtlı Oyuncular <span class="chip">${members.length}</span></h2>
      </div>
      <div class="sep"></div>
      <div class="tblwrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Oyuncu</th>
              <th>Mevki</th>
              <th>Durum</th>
              <th style="text-align:right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            ${members.map((m, i) => `
              <tr>
                <td class="muted">${i + 1}</td>
                <td>
                  <b>${esc(m.username)}</b><br>
                  <small class="mono muted">${esc(m.uid)}</small>
                </td>
                <td>
                  <select class="mini" data-change-mevki="${esc(m.uid)}">
                    ${positions.map(p => `<option value="${p}" ${p === m.mevki ? 'selected' : ''}>${p}</option>`).join('')}
                  </select>
                </td>
                <td>
                  <span class="chip ${m.active ? (m.locked ? 'good' : '') : 'bad'}">
                    <span class="dot"></span>${m.active ? (m.locked ? 'Kesinleşti' : 'Aktif') : 'Pasif'}
                  </span>
                </td>
                <td style="text-align:right">
                  ${m.role === 'player' ? `
                    ${m.locked ? `<button class="btn sm" data-action="unlock" data-id="${esc(m.uid)}">Kilidi aç</button> ` : ''}
                    <button class="btn sm" data-action="resetOne" data-id="${esc(m.uid)}">Oylarını sıfırla</button>
                    <button class="btn sm" data-action="rename" data-id="${esc(m.uid)}" data-name="${esc(m.username)}" data-mevki="${esc(m.mevki)}">Adı değiştir</button>
                    <button class="btn sm" data-action="linkAccount" data-id="${esc(m.uid)}">Hesap bağla</button>
                    <button class="btn sm danger" data-action="deactivate" data-id="${esc(m.uid)}">Pasifleştir</button>
                  ` : '<span class="chip good">Yönetici</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Oyuncu Ekle / Güncelle</h2>
      <p class="small muted" style="margin-top:4px">Kadro ve mevki değişiklikleri ilk oy verilene kadar yapılabilir.</p>
      <div class="sep"></div>
      <form id="memberForm" class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));align-items:end">
        <div>
          <label class="f">Oyuncu Kimliği (Yeni oyuncuda boş bırakın)</label>
          <input name="target" maxlength="128" pattern="[a-zA-Z0-9_-]+" placeholder="Otomatik üretilir">
        </div>
        <div>
          <label class="f">Oyuncu Adı</label>
          <input name="username" maxlength="60" required placeholder="ör. ahmet.yilmaz">
        </div>
        <div>
          <label class="f">Mevki</label>
          <select name="mevki">
            ${positions.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <button class="btn primary" type="submit">Kaydet</button>
      </form>
    </div>

    <div class="card">
      <h2>Doğrulanmış Hesabı Oyuncuya Bağla</h2>
      <p class="small muted" style="margin-top:4px">Oyuncunun Supabase Auth üzerinden oluşturduğu e-posta hesabını oyuncu kimliğiyle eşleştirin.</p>
      <div class="sep"></div>
      <form id="linkAccountForm" class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:end">
        <div>
          <label class="f">Oyuncu Kimliği (UID)</label>
          <input name="target" required placeholder="ör. u_xxxx veya UUID">
        </div>
        <div>
          <label class="f">Doğrulanmış E-posta</label>
          <input name="email" type="email" required placeholder="oyuncu@example.com">
        </div>
        <button class="btn primary" type="submit">Hesabı Bağla</button>
      </form>
    </div>
  `;

  document.getElementById('memberForm').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(async () => {
      await call('member', Object.fromEntries(f));
      toast('Oyuncu kaydedildi.');
    });
  };

  document.getElementById('linkAccountForm').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(async () => {
      await call('linkAccount', Object.fromEntries(f));
      toast('Hesap başarıyla bağlandı.');
    });
  };

  el.querySelectorAll('[data-change-mevki]').forEach(sel => {
    sel.onchange = () => run(async () => {
      const target = sel.getAttribute('data-change-mevki');
      const mem = members.find(m => m.uid === target);
      await call('member', { target, username: mem ? mem.username : '', mevki: sel.value });
      toast('Mevki güncellendi.');
    });
  });

  el.querySelectorAll('[data-action="unlock"]').forEach(b => {
    b.onclick = () => run(async () => {
      if (confirm('Bu oyuncunun oylama kilidi kaldırılsın mı? Tekrar oy verebilir.')) {
        await call('unlock', { target: b.dataset.id });
        toast('Kilit açıldı.');
      }
    });
  });

  el.querySelectorAll('[data-action="resetOne"]').forEach(b => {
    b.onclick = () => run(async () => {
      if (confirm('Bu oyuncunun verdiği tüm oylar silinecek ve oylaması yeniden açılacak. Devam edilsin mi?')) {
        await call('resetOne', { target: b.dataset.id });
        toast('Oylar sıfırlandı.');
      }
    });
  });

  el.querySelectorAll('[data-action="deactivate"]').forEach(b => {
    b.onclick = () => run(async () => {
      if (confirm('Bu oyuncu pasife alınsın mı?')) {
        await call('deactivate', { target: b.dataset.id });
        toast('Oyuncu pasife alındı.');
      }
    });
  });

  el.querySelectorAll('[data-action="rename"]').forEach(b => {
    b.onclick = () => run(async () => {
      const current = b.dataset.name;
      const target = b.dataset.id;
      const mevki = b.dataset.mevki;
      const yeni = prompt('Yeni oyuncu adı:', current);
      if (!yeni || !yeni.trim() || yeni === current) return;
      await call('member', { target, username: yeni.trim(), mevki });
      toast('İsim güncellendi.');
    });
  });

  el.querySelectorAll('[data-action="linkAccount"]').forEach(b => {
    b.onclick = () => run(async () => {
      const target = b.dataset.id;
      const email = prompt('Bu oyuncu için bağlanacak doğrulanmış e-posta adresi:');
      if (!email || !email.trim()) return;
      await call('linkAccount', { target, email: email.trim() });
      toast('Hesap başarıyla bağlandı.');
    });
  });
}

// 2. Oylama Takibi Sekmesi
function adminVotesTab(el, d) {
  const members = (d.members || []).filter(m => m.role === 'player' && m.active);
  const vMap = d.votes || {};
  const progressPct = d.progress ? Math.round((d.progress.done / (d.progress.total || 1)) * 100) : 0;

  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <h2>Oylama Durumu</h2>
          <p class="small muted" style="margin-top:4px">Oylama kapatıldığında oylar kilitlenir ve sonuçlar oyunculara görünür hâle gelir.</p>
        </div>
        <div class="row">
          <span class="chip ${d.open ? 'good' : 'bad'}"><span class="dot"></span>${d.open ? 'Oylama açık' : 'Oylama kapalı'}</span>
          <button class="btn ${d.open ? 'danger' : 'primary'}" id="btnToggleVoting">${d.open ? 'Oylamayı Kapat' : 'Oylamayı Aç'}</button>
          <button class="btn danger" id="btnResetAll">Yeni Oylama Başlat</button>
        </div>
      </div>
      <div class="sep"></div>
      <div class="row" style="gap:16px">
        <div style="flex:1;min-width:200px">
          <div class="bar"><i style="width:${progressPct}%"></i></div>
        </div>
        <span class="small muted">${d.progress.done} / ${d.progress.total || d.progress.expected} oy (%${progressPct})</span>
      </div>
    </div>

    <div class="card">
      <h2>Oy Matrisi</h2>
      <p class="small muted" style="margin-top:4px">Satır = oyu veren, sütun = oyu alan. Nokta işareti açıklamayı belirtir, üzerine gelince okunur.</p>
      <div class="sep"></div>
      <div class="tblwrap">
        <table>
          <thead>
            <tr>
              <th>Veren \\ Alan</th>
              ${members.map(m => `<th class="num">${esc(m.username.split('.')[0])}</th>`).join('')}
              <th class="num">Girilen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${members.map(v => {
              const row = vMap[v.uid] || {};
              let filled = 0;
              return `
                <tr>
                  <td><b>${esc(v.username)}</b></td>
                  ${members.map(t => {
                    if (t.uid === v.uid) return '<td class="num muted">—</td>';
                    const o = row[t.uid];
                    const val = o ? o.puan : 0;
                    if (val >= 1) {
                      filled++;
                      return `<td class="num" ${o.aciklama ? `title="${esc(o.aciklama)}"` : ''}>${val}${o.aciklama ? '<span class="cmark">•</span>' : ''}</td>`;
                    }
                    return '<td class="num muted">·</td>';
                  }).join('')}
                  <td class="num"><b>${filled}</b></td>
                  <td style="text-align:right">
                    <button class="btn sm" data-reset-voter="${esc(v.uid)}" ${filled === 0 ? 'disabled' : ''}>Sıfırla</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Oy Dökümü</h2>
      <div class="sep"></div>
      <div class="tblwrap">
        <table>
          <thead>
            <tr>
              <th>Veren</th>
              <th>Alan</th>
              <th>Puan</th>
              <th>Açıklama</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(vMap).flatMap(([from, row]) =>
              Object.entries(row).map(([to, v]) => `
                <tr>
                  <td><b>${esc((d.members.find(m => m.uid === from) || {}).username || from)}</b></td>
                  <td>${esc((d.members.find(m => m.uid === to) || {}).username || to)}</td>
                  <td><span class="qbadge">${v.puan}</span></td>
                  <td>${esc(v.aciklama || '—')}</td>
                </tr>
              `)
            ).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  bind('btnToggleVoting', () => call('toggle', { open: !d.open }));

  bind('btnResetAll', async () => {
    const confirmation = prompt('Mevcut dönem arşivlenecek ve yeni oylama başlatılacak. Onaylamak için "YENI OYLAMA" yazın:');
    if (confirmation === 'YENI OYLAMA') {
      await call('resetAll', { confirm: 'YENI OYLAMA' });
      toast('Yeni oylama başlatıldı.');
    }
  });

  el.querySelectorAll('[data-reset-voter]').forEach(b => {
    b.onclick = () => run(async () => {
      const uid = b.dataset.resetVoter;
      if (confirm('Bu oyuncunun tüm oyları silinsin mi?')) {
        await call('resetOne', { target: uid });
        toast('Oylar sıfırlandı.');
      }
    });
  });
}

// 3. Sonuçlar Sekmesi
function adminResultsTab(el, d) {
  const R = d.results || [];
  const avgAll = R.filter(r => r.avg !== null);
  const genel = avgAll.length ? avgAll.reduce((a, b) => a + b.avg, 0) / avgAll.length : null;

  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <h2>Genel Sonuç Listesi</h2>
          <p class="small muted" style="margin-top:4px">Yüksekten düşüğe sıralı genel ortalamalar.</p>
        </div>
        <div class="row">
          <button class="btn sm" id="btnExportJson">JSON İndir</button>
          <button class="btn sm" id="btnExportCsv">CSV İndir</button>
        </div>
      </div>
      <div class="sep"></div>
      <div class="row" style="gap:16px;margin-bottom:14px">
        <span class="chip">Oyuncu: ${R.length}</span>
        <span class="chip">Genel Ortalama: ${fmt(genel)}</span>
        <span class="chip ${d.open ? 'warn' : 'good'}"><span class="dot"></span>${d.open ? 'Oylama sürüyor' : 'Oylama kapalı'}</span>
      </div>
      <div class="tblwrap">
        <table>
          <thead>
            <tr>
              <th class="num">Sıra</th>
              <th>Oyuncu</th>
              <th>Mevki</th>
              <th class="num">Ortalama</th>
              <th class="num">Oy Sayısı</th>
              <th class="num">Toplam</th>
              <th class="num">Min / Maks</th>
              <th style="width:120px">Dağılım</th>
            </tr>
          </thead>
          <tbody>
            ${R.map(r => {
              const pct = r.avg === null ? 0 : Math.round((r.avg / 10) * 100);
              return `
                <tr>
                  <td class="num">${r.rank ? `<span class="rank ${r.rank <= 3 ? 'r' + r.rank : ''}">${r.rank}</span>` : '<span class="muted">—</span>'}</td>
                  <td><b>${esc(r.username)}</b></td>
                  <td>${mevkiChip(r.mevki)}</td>
                  <td class="num"><b>${fmt(r.avg)}</b></td>
                  <td class="num ${r.count < r.expected ? 'muted' : ''}">${r.count} / ${r.expected}</td>
                  <td class="num">${r.sum}</td>
                  <td class="num">${esc(r.min ?? '—')} / ${esc(r.max ?? '—')}</td>
                  <td><div class="bar"><i style="width:${pct}%"></i></div></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Mevkiye Göre Sıralama</h2>
      <p class="small muted" style="margin-top:4px">Her mevkinin kendi içindeki sıralaması.</p>
      <div class="sep"></div>
      <div class="mgrid">
        ${positions.map(p => {
          const list = positionRanks(R.filter(r => r.mevki === p));
          const ort = list.filter(x => x.avg !== null);
          const pAvg = ort.length ? ort.reduce((a, b) => a + b.avg, 0) / ort.length : null;
          return `
            <div class="mcard">
              <div class="row" style="justify-content:space-between;margin-bottom:10px">
                ${mevkiChip(p)}
                <span class="tiny muted">${list.length} oyuncu · ort ${fmt(pAvg)}</span>
              </div>
              <table class="mtbl">
                <tbody>
                  ${list.map(r => `
                    <tr>
                      <td style="width:28px">${r.rank ? `<span class="rank ${r.rank <= 3 ? 'r' + r.rank : ''}">${r.rank}</span>` : '<span class="muted">—</span>'}</td>
                      <td><b>${esc(r.username)}</b></td>
                      <td class="num"><b>${fmt(r.avg)}</b></td>
                      <td class="num muted tiny">${r.count}/${r.expected}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById('btnExportJson').onclick = () => {
    download('oylama-sonuclari.json', JSON.stringify({
      tarih: new Date().toISOString(),
      sonuclar: R
    }, null, 2));
  };

  document.getElementById('btnExportCsv').onclick = () => {
    const rows = [['Sıra', 'Oyuncu', 'Mevki', 'Ortalama', 'Oy Sayısı', 'Toplam', 'Min', 'Maks']];
    R.forEach(r => {
      rows.push([r.rank || '', r.username, r.mevki, r.avg === null ? '' : r.avg.toFixed(2), r.count, r.sum, r.min ?? '', r.max ?? '']);
    });
    download('oylama-sonuclari.csv', '\uFEFF' + rows.map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  };
}

// 4. Dengeli Kadro Sekmesi
function adminTeamsTab(el, d) {
  const rows = d.results || [];
  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <h2>Dengeli Takım Kurucu</h2>
          <p class="small muted" style="margin-top:4px">Maça katılacak oyuncuları seçin; sistem mevki ve puan ortalamalarına göre iki denk takım kursun.</p>
        </div>
        <div class="row">
          <button class="btn sm" id="btnSelectAllTeams">Tümünü Seç / Temizle</button>
          <button class="btn sm primary" id="btnBuildTeams">Takımları Oluştur</button>
        </div>
      </div>
      <div class="sep"></div>
      <div class="row" style="gap:8px" id="teamCheckboxes">
        ${rows.map(r => `
          <label class="chip" style="cursor:pointer;user-select:none;padding:6px 12px">
            <input class="teamPlayer" type="checkbox" value="${esc(r.uid)}" checked style="margin-right:6px">
            <b>${esc(r.username)}</b> ${mevkiChip(r.mevki)}
            <span class="tiny muted" style="margin-left:4px">★ ${fmt(r.avg)}</span>
          </label>
        `).join('')}
      </div>
    </div>
    <div id="teamsOutput"></div>
  `;

  bind('btnSelectAllTeams', async () => {
    const boxes = [...document.querySelectorAll('.teamPlayer')];
    const nextState = !boxes.every(b => b.checked);
    boxes.forEach(b => b.checked = nextState);
  });

  bind('btnBuildTeams', async () => {
    const ids = new Set([...document.querySelectorAll('.teamPlayer:checked')].map(b => b.value));
    if (ids.size < 2) {
      toast('Takım kurmak için en az iki oyuncu seçmelisiniz.', 'bad');
      return;
    }
    const selected = rows.filter(r => ids.has(r.uid));
    const { teams, averages } = balancedTeams(selected);
    const names = ['⚪ Beyaz Takım', '🔴 Kırmızı Takım'];
    const diff = Math.abs(averages[0] - averages[1]);

    const out = document.getElementById('teamsOutput');
    out.innerHTML = `
      <div class="card" style="background:var(--panel-2);margin-top:16px">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div class="row" style="gap:12px">
            <span class="chip">Seçilen: ${selected.length} Oyuncu</span>
            <span class="chip ${diff <= 0.3 ? 'good' : (diff <= 0.7 ? 'warn' : 'bad')}">Ortalama Farkı: ${fmt(diff)}</span>
          </div>
          <button class="btn sm" id="btnCopyTeams">📋 Kadroyu Kopyala (WhatsApp)</button>
        </div>
      </div>
      <div class="row" style="gap:16px;margin-top:14px;align-items:flex-start">
        ${teams.map((t, i) => `
          <div class="card" style="flex:1;min-width:280px;border-top:4px solid ${i === 0 ? '#5a8dff' : '#f07171'}">
            <div class="row" style="justify-content:space-between;margin-bottom:12px">
              <div>
                <h2>${names[i]}</h2>
                <span class="small muted">${t.length} Oyuncu</span>
              </div>
              <span class="chip good" style="font-weight:700">Ort: ${fmt(averages[i])}</span>
            </div>
            <div class="tblwrap">
              <table>
                <thead>
                  <tr>
                    <th>Oyuncu</th>
                    <th>Mevki</th>
                    <th class="num">Puan</th>
                  </tr>
                </thead>
                <tbody>
                  ${t.map(p => `
                    <tr>
                      <td><b>${esc(p.username)}</b></td>
                      <td>${mevkiChip(p.mevki)}</td>
                      <td class="num"><b>${fmt(p.avg)}</b></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('btnCopyTeams').onclick = async () => {
      const text = '⚽ *HALI SAHA DENGELİ MAÇ KADROSU* ⚽\n\n' +
        teams.map((t, i) =>
          `${names[i]} (Ort: ${fmt(averages[i])})\n` +
          t.map((p, idx) => `${idx + 1}. ${p.username} (${p.mevki || '—'}) - ${fmt(p.avg)}`).join('\n')
        ).join('\n\n') +
        `\n\n📊 *Denge Güç Farkı:* ${fmt(diff)}`;

      try {
        await navigator.clipboard.writeText(text);
        toast('Kadro WhatsApp formatında panoya kopyalandı!');
      } catch {
        toast('Panoya kopyalanamadı.', 'bad');
      }
    };
  });

  if (rows.length >= 2) {
    document.getElementById('btnBuildTeams').click();
  }
}

// 5. Açıklamalar Sekmesi
function adminCommentsTab(el, d) {
  const members = d.members || [];
  const vMap = d.votes || {};
  const commentsByTarget = {};

  Object.entries(vMap).forEach(([from, row]) => {
    Object.entries(row).forEach(([to, v]) => {
      if (v && v.aciklama && v.aciklama.trim()) {
        if (!commentsByTarget[to]) commentsByTarget[to] = [];
        commentsByTarget[to].push({
          from: (members.find(m => m.uid === from) || {}).username || from,
          puan: v.puan,
          aciklama: v.aciklama
        });
      }
    });
  });

  const totalComments = Object.values(commentsByTarget).reduce((acc, cur) => acc + cur.length, 0);

  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <h2>Oy Açıklamaları</h2>
          <p class="small muted" style="margin-top:4px">Oyuncuların değerlendirme yaparken yazdığı açıklamalar.</p>
        </div>
        ${totalComments ? '<button class="btn sm" id="btnExpComments">JSON İndir</button>' : ''}
      </div>
      <div class="sep"></div>
      ${totalComments ? Object.entries(commentsByTarget).map(([targetId, cList]) => {
        const targetMember = members.find(m => m.uid === targetId);
        return `
          <div style="margin-bottom:20px">
            <div class="row" style="gap:8px;align-items:center">
              <b>${esc(targetMember ? targetMember.username : targetId)}</b>
              ${mevkiChip(targetMember ? targetMember.mevki : '')}
              <span class="tiny muted">${cList.length} açıklama</span>
            </div>
            ${cList.map(c => `
              <div class="qt">
                <div class="row" style="gap:8px;margin-bottom:4px">
                  <span class="qbadge">${c.puan}</span>
                  <span class="tiny muted">${esc(c.from)}</span>
                </div>
                <p>${esc(c.aciklama)}</p>
              </div>
            `).join('')}
          </div>
        `;
      }).join('') : '<div class="empty">Henüz hiç açıklama yazılmamış.</div>'}
    </div>
  `;

  const btnExp = document.getElementById('btnExpComments');
  if (btnExp) {
    btnExp.onclick = () => {
      download('oy-aciklamalari.json', JSON.stringify(commentsByTarget, null, 2));
    };
  }
}

// 6. Veritabanı (JSON) Sekmesi
function adminDataTab(el, d) {
  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <h2>Veritabanı Ağacı</h2>
          <p class="small muted" style="margin-top:4px">Supabase üzerinde saklanan anlık JSON verisi.</p>
        </div>
        <div class="row">
          <button class="btn sm" id="btnReloadData">Yenile</button>
          <button class="btn sm" id="btnDlData">JSON İndir</button>
          <button class="btn sm" id="btnCpData">Kopyala</button>
        </div>
      </div>
      <div class="sep"></div>
      <textarea id="jsonView" rows="18" spellcheck="false" readonly>${esc(JSON.stringify(d, null, 2))}</textarea>
    </div>

    <div class="card">
      <h2>Son İşlemler (Denetim Kayıtları)</h2>
      <div class="sep"></div>
      ${(d.audit || []).slice(0, 30).map(a => `
        <p class="tiny" style="padding:4px 0;border-bottom:1px solid var(--line-2)">
          <b>${esc(new Date(a.at).toLocaleTimeString('tr-TR'))}</b> ·
          <span class="chip">${esc(a.action)}</span> ·
          ${esc((d.members.find(m => m.uid === a.actor) || {}).username || a.actor)}
        </p>
      `).join('')}
    </div>
  `;

  bind('btnReloadData', () => call('read'));
  document.getElementById('btnDlData').onclick = () => download('supabase-yedek.json', JSON.stringify(d, null, 2));
  document.getElementById('btnCpData').onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(d, null, 2));
      toast('Kopyalandı.');
    } catch {
      toast('Kopyalanamadı.', 'bad');
    }
  };
}

// 7. Ayarlar Sekmesi
function adminSettingsTab(el, d) {
  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <h2>İki Aşamalı Doğrulama (MFA / TOTP)</h2>
          <p class="small muted" style="margin-top:4px">Yönetici hesabınız RFC 6238 TOTP (Google Authenticator) ile korunmaktadır.</p>
        </div>
        <span class="chip good"><span class="dot"></span>Aktif (AAL2)</span>
      </div>
      <div class="sep"></div>
      <div class="kv">
        <b>Yönetici Hesabı</b><span>${esc(session.user.email)}</span>
        <b>Güvenlik Seviyesi</b><span>AAL2 (TOTP İki Aşamalı Doğrulama)</span>
        <b>Oturum Zamanı</b><span>${new Date().toLocaleTimeString('tr-TR')}</span>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn sm" id="btnReEnroll">Doğrulama Uygulamasını Yeniden Kur (Re-enroll)</button>
        <button class="btn sm" id="btnCheckMfa">MFA Durumunu Kontrol Et</button>
      </div>
    </div>

    <div class="card">
      <h2>Sistem ve Güvenlik Bilgisi</h2>
      <div class="sep"></div>
      <div class="kv">
        <b>Depolama</b><span>Supabase (PostgreSQL + PostgREST + RPC)</span>
        <b>Erişim Kontrolü</b><span>Row Level Security (RLS) + secure_api()</span>
        <b>Mevkiler</b><span>${positions.join(' · ')}</span>
        <b>Puan Skalası</b><span>1 – 10 (Tam Sayı)</span>
        <b>MFA Kuralı</b><span>Okuma için 60 dk, değişiklikler için 10 dk TOTP tazeliği şarttır</span>
      </div>
    </div>
  `;

  document.getElementById('btnReEnroll').onclick = () => run(async () => {
    if (!confirm('Yeni bir kimlik doğrulama uygulaması kurmak istiyor musunuz?')) return;
    const factors = checked(await sb.auth.mfa.listFactors());
    for (const f of (factors.all || []).filter(f => f.status === 'unverified')) {
      await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const enroll = checked(await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Halı Saha' }));
    openEnrollModal(enroll.id, enroll.totp.secret, enroll.totp.uri);
  });

  document.getElementById('btnCheckMfa').onclick = () => run(async () => {
    const fRes = checked(await sb.auth.mfa.listFactors());
    const count = (fRes.totp || []).filter(x => x.status === 'verified').length;
    toast(`Doğrulanmış MFA Faktörü: ${count} adet TOTP.`);
  });
}

function openEnrollModal(factorId, secret, uri) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `
    <div class="card" style="max-width:440px">
      <div class="mfa-box">
        <h2>Yeni MFA Kurulumu</h2>
        <p class="small muted">Aşağıdaki QR kodu kimlik doğrulama uygulamanızla tarayın:</p>
        <div class="qr-frame">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(uri)}" width="180" height="180" alt="MFA QR">
        </div>
        <div class="secret-box">
          <span>${esc(secret)}</span>
          <button class="btn sm" type="button" id="copyModalSecret">Kopyala</button>
        </div>
        <form id="modalEnrollForm" style="width:100%;margin-top:12px">
          <input type="text" id="mCode" class="mfa-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" autofocus required>
          <div class="row" style="margin-top:14px;justify-content:center;gap:8px">
            <button class="btn primary" type="submit">Doğrula ve Kaydet</button>
            <button class="btn" type="button" id="closeEnrollModal">Kapat</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  m.querySelector('#copyModalSecret').onclick = async () => {
    try { await navigator.clipboard.writeText(secret); toast('Kopyalandı.'); } catch {}
  };
  m.querySelector('#closeEnrollModal').onclick = () => m.remove();

  m.querySelector('#modalEnrollForm').onsubmit = e => {
    e.preventDefault();
    run(async () => {
      const code = m.querySelector('#mCode').value.trim();
      checked(await sb.auth.mfa.challengeAndVerify({ factorId, code }));
      m.remove();
      toast('Yeni MFA başarıyla kuruldu ve doğrulandı.');
      render();
    });
  };
}

// -----------------------------------------------------------------------------
// Oyuncu Paneli
// -----------------------------------------------------------------------------
function renderPlayer() {
  const d = data;
  const me = d.me;
  const isLocked = !!me.locked;
  const isOpen = !!d.open;
  const others = (d.players || []).filter(p => p.uid !== me.uid).sort((a, b) =>
    mevkiSira(a.mevki) - mevkiSira(b.mevki) || a.username.localeCompare(b.username, 'tr')
  );
  const myVotes = d.myVotes || {};
  const givenCount = others.filter(p => myVotes[p.uid] && myVotes[p.uid].puan >= 1).length;
  const allVoted = others.length > 0 && givenCount === others.length;

  root.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div>
          <h2>Merhaba, ${esc(me.username)}</h2>
          <p class="small muted" style="margin-top:4px">
            ${isLocked
              ? 'Oylamanızı tamamladınız. Aşağıda güncel sonuç ve istatistikleri görebilirsiniz.'
              : `Kendiniz dışındaki ${others.length} oyuncuyu mevkilerine göre 1–10 arasında puanlayın.`}
          </p>
          <div class="row" style="margin-top:10px;gap:8px;align-items:center">
            <span class="small" style="font-weight:600;color:var(--ink-2)">Mevkiniz:</span>
            ${isLocked ? mevkiChip(me.mevki) : `
              <select id="playerMevki" class="mini" style="font-weight:600;padding:5px 10px;border-radius:8px">
                ${positions.map(p => `<option value="${p}" ${p === me.mevki ? 'selected' : ''}>${p}</option>`).join('')}
              </select>
              ${mevkiChip(me.mevki)}
            `}
          </div>
        </div>
        <div class="row">
          <span class="chip ${isLocked || !isOpen ? 'bad' : 'good'}">
            <span class="dot"></span>${isLocked ? 'Oyunuz kesinleşti' : (isOpen ? 'Oylama açık' : 'Oylama kapalı')}
          </span>
          <button class="btn sm" id="btnPlayerRefresh">Yenile</button>
          <button class="btn sm" id="btnPlayerPw">Şifre değiştir</button>
          <button class="btn sm danger" id="btnPlayerLogout">Çıkış</button>
        </div>
      </div>
      <div class="sep"></div>
      <div class="row" style="gap:14px">
        <div style="flex:1;min-width:180px">
          <div class="bar"><i style="width:${others.length ? Math.round((givenCount / others.length) * 100) : 0}%"></i></div>
        </div>
        <span class="small muted">${givenCount} / ${others.length} oy verildi</span>
      </div>
      ${(!isLocked && isOpen && others.length) ? `
        <div class="sep"></div>
        <div class="row" style="justify-content:space-between;align-items:center">
          <span class="small muted">${allVoted ? 'Tüm oylarınızı verdiniz. Kesinleştirerek sonuçları görebilirsiniz.' : 'Sonuçları görebilmek için tüm oyuncuları oylamalısınız.'}</span>
          <button class="btn primary" id="btnFinalize" ${allVoted ? '' : 'disabled'}>Kesinleştir ve Sonuçları Gör</button>
        </div>
      ` : ''}
    </div>
    <div id="playerBody"></div>
  `;

  bind('btnPlayerRefresh', () => call('read'));
  bind('btnPlayerPw', async () => passwordModal());
  bind('btnPlayerLogout', logout);

  const selMevki = document.getElementById('playerMevki');
  if (selMevki) {
    selMevki.onchange = () => run(async () => {
      await call('position', { mevki: selMevki.value });
      toast('Mevkiniz güncellendi.');
    });
  }

  const btnFin = document.getElementById('btnFinalize');
  if (btnFin) {
    btnFin.onclick = () => run(async () => {
      if (confirm('Kaydedilmiş oylarınız kesinleşecek ve bir daha değiştirilemeyecektir. Devam edilsin mi?')) {
        await call('finalize');
        toast('Oylarınız kesinleşti!');
      }
    });
  }

  const pBody = document.getElementById('playerBody');

  // Sonuç ekranı (Kilitli veya oylama kapalı ise)
  if (isLocked || !isOpen) {
    renderPlayerResults(pBody, d);
    return;
  }

  // Aktif Oylama Kartları
  pBody.innerHTML = `
    <div class="card">
      <h2>Oylama Rehberi</h2>
      <div class="note" style="margin-top:8px">
        <b>📌 Puanlama Rehberi:</b>
        <div class="row" style="gap:14px;margin-top:6px;font-size:12.5px;color:var(--ink-2)">
          <span><b>1–3:</b> Gelişmeli / Yetersiz</span>
          <span><b>4–6:</b> Ortalama / Standart</span>
          <span><b>7–8:</b> Başarılı / İyi Katkı</span>
          <span><b>9–10:</b> Maçın Yıldızı / Çok İyi</span>
        </div>
      </div>
    </div>
    ${positions.map(pos => {
      const posPlayers = others.filter(p => p.mevki === pos);
      if (!posPlayers.length) return '';
      return `
        <div style="margin-top:20px">
          <div class="row" style="gap:8px;align-items:center;margin-bottom:10px">
            ${mevkiChip(pos)}
            <h3 style="margin:0;font-size:14px;color:var(--ink)">${esc(pos)} Oyuncuları <span class="muted tiny">(${posPlayers.length})</span></h3>
          </div>
          <div class="vlist">
            ${posPlayers.map(p => {
              const v = myVotes[p.uid] || {};
              const cur = v.puan || 0;
              const not = v.aciklama || '';
              return `
                <div class="vcard" data-card="${esc(p.uid)}">
                  <div class="vhead">
                    <div>
                      <b>${esc(p.username)}</b>
                      <div style="margin-top:4px">${mevkiChip(p.mevki)}</div>
                    </div>
                    <span class="chip vchip ${cur ? 'good' : ''}">${cur ? 'Oyunuz: ' + cur : 'Oy yok'}</span>
                  </div>
                  <div class="scale">
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `
                      <button type="button" class="sc ${cur === n ? 'on' : ''}" data-target="${esc(p.uid)}" data-val="${n}">${n}</button>
                    `).join('')}
                  </div>
                  <textarea class="cmt" data-cmt="${esc(p.uid)}" rows="2" maxlength="500" placeholder="${esc(p.mevki || 'Oyuncu')} performansı hakkında açıklama (en fazla 500 karakter)">${esc(not)}</textarea>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `;

  // Puan butonlarına basıldığında
  pBody.querySelectorAll('.sc').forEach(b => {
    b.onclick = () => run(async () => {
      const target = b.dataset.target;
      const puan = Number(b.dataset.val);
      const card = pBody.querySelector(`[data-card="${target}"]`);
      const ta = card ? card.querySelector('.cmt') : null;
      const aciklama = ta ? ta.value.trim() : '';

      await call('vote', { target, puan, aciklama });
      toast('Değerlendirme kaydedildi.');
    });
  });

  // Açıklama değiştiğinde
  pBody.querySelectorAll('.cmt').forEach(ta => {
    ta.setAttribute('data-orig', ta.value);
    ta.onblur = () => {
      const target = ta.dataset.cmt;
      const yeni = ta.value.trim();
      if (yeni === (ta.getAttribute('data-orig') || '').trim()) return;
      const v = myVotes[target] || {};
      if (!v.puan) return; // Önce puan verilmeli
      run(async () => {
        await call('vote', { target, puan: v.puan, aciklama: yeni });
        ta.setAttribute('data-orig', yeni);
        toast('Açıklama kaydedildi.');
      });
    };
  });
}

function renderPlayerResults(el, d) {
  const R = d.results || [];
  const comments = d.comments || [];
  const avgAll = R.filter(r => r.avg !== null);
  const genel = avgAll.length ? avgAll.reduce((a, b) => a + b.avg, 0) / avgAll.length : null;

  el.innerHTML = `
    <div class="card">
      <div class="note" style="margin:0">
        ${d.me.locked
          ? '<b>Oylamanız kesinleşti.</b> İstatistikleri görüntülediğiniz için oylarınız kilitlenmiştir.'
          : '<b>Oylama kapatıldı.</b> Aşağıda kesinleşmiş maç sonuçlarını görebilirsiniz.'}
      </div>
    </div>

    <div class="card">
      <h2>İstatistikler ve Sıralama</h2>
      <div class="sep"></div>
      <div class="row" style="gap:14px;margin-bottom:14px">
        <span class="chip">Oyuncu: ${R.length}</span>
        <span class="chip">Genel Ortalama: ${fmt(genel)}</span>
      </div>
      <div class="tblwrap">
        <table>
          <thead>
            <tr>
              <th class="num">Sıra</th>
              <th>Oyuncu</th>
              <th>Mevki</th>
              <th class="num">Ortalama</th>
              <th class="num">Oy Sayısı</th>
              <th class="num">Toplam</th>
              <th style="width:120px">Dağılım</th>
            </tr>
          </thead>
          <tbody>
            ${R.map(r => {
              const pct = r.avg === null ? 0 : Math.round((r.avg / 10) * 100);
              return `
                <tr>
                  <td class="num">${r.rank ? `<span class="rank ${r.rank <= 3 ? 'r' + r.rank : ''}">${r.rank}</span>` : '<span class="muted">—</span>'}</td>
                  <td><b>${esc(r.username)}</b></td>
                  <td>${mevkiChip(r.mevki)}</td>
                  <td class="num"><b>${fmt(r.avg)}</b></td>
                  <td class="num ${r.count < r.expected ? 'muted' : ''}">${r.count} / ${r.expected}</td>
                  <td class="num">${r.sum}</td>
                  <td><div class="bar"><i style="width:${pct}%"></i></div></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Mevkiye Göre Sıralama</h2>
      <div class="sep"></div>
      <div class="mgrid">
        ${positions.map(p => {
          const list = positionRanks(R.filter(r => r.mevki === p));
          const ort = list.filter(x => x.avg !== null);
          const pAvg = ort.length ? ort.reduce((a, b) => a + b.avg, 0) / ort.length : null;
          return `
            <div class="mcard">
              <div class="row" style="justify-content:space-between;margin-bottom:10px">
                ${mevkiChip(p)}
                <span class="tiny muted">${list.length} oyuncu · ort ${fmt(pAvg)}</span>
              </div>
              <table class="mtbl">
                <tbody>
                  ${list.map(r => `
                    <tr>
                      <td style="width:28px">${r.rank ? `<span class="rank ${r.rank <= 3 ? 'r' + r.rank : ''}">${r.rank}</span>` : '<span class="muted">—</span>'}</td>
                      <td><b>${esc(r.username)}</b></td>
                      <td class="num"><b>${fmt(r.avg)}</b></td>
                      <td class="num muted tiny">${r.count}/${r.expected}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    ${comments.length ? `
      <div class="card">
        <h2>Size Yazılan Açıklamalar</h2>
        <p class="small muted" style="margin-top:4px">Diğer oyuncuların size verdiği değerlendirme notları (anonimdir).</p>
        <div class="sep"></div>
        ${comments.map(c => `
          <div class="qt">
            <div class="row" style="gap:8px;margin-bottom:4px">
              <span class="qbadge">${c.puan}</span>
            </div>
            <p>${esc(c.aciklama)}</p>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

// -----------------------------------------------------------------------------
// Başlatma
// -----------------------------------------------------------------------------
sb.auth.onAuthStateChange((event, newSession) => {
  session = newSession;
  if (event === 'SIGNED_OUT') {
    ++authEpoch;
    data = null;
    login();
  }
});

login();
